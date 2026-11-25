import { isProjectLead } from '../domain/accountTypes';
import { randomBytes, randomUUID } from 'node:crypto';
import type { MembershipStatus, ProjectRole } from '../domain/accountTypes';
import type { Department } from '../domain/types';
import {
  canDecideIzinForShift,
  canDownloadWorkspaceView,
  canDrawLocally,
  canManageWorkspaceOutputGrants,
  canShareWorkspaceView,
  computeDepartmentDailyAttendance,
  computeShiftCutoffUtcMs,
  deriveEffectiveAttendanceStatus,
  evaluateCheckInAttempt,
  formatInstantInProjectZone,
  type AttendanceHistoryEntry,
  type AttendanceRecordState,
  type AttendanceShiftObligation,
  type DepartmentAttendanceDayMetric,
  type EffectiveAttendanceStatus,
  type IzinEvidencePhotoMeta,
  type IzinRequestRecord,
  type IzinRequestStatus,
} from '../domain/attendanceEngine';
import { ServiceError, type AuthenticatedActor } from './vontaService';

export interface ProjectMemberDirectoryRecord {
  membershipId: string;
  projectId: string;
  userId: string;
  displayName: string;
  email: string;
  role: ProjectRole;
  status: MembershipStatus;
  hasMandorGrant: boolean;
  hasAccountingGrant: boolean;
  canDownloadWorkspaceView: boolean;
  canShareWorkspaceView: boolean;
  division: Department;
  teamId: string;
}

export interface StoredIzinEvidenceBlob {
  meta: IzinEvidencePhotoMeta;
  buffer: Buffer;
}

export interface WorkspaceShareCameraSpec {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface WorkspaceShareLayersSpec {
  civil: boolean;
  electrical: boolean;
  plumbing: boolean;
  pins: boolean;
}

export type WorkspaceShareAccessMode = 'restricted' | 'anyone_with_link';

export interface WorkspaceViewShareRecord {
  id: string;
  projectId: string;
  modelVersionId: string;
  areaId: string;
  roomId: string | null;
  selectedPinId: string | null;
  camera: WorkspaceShareCameraSpec;
  layers: WorkspaceShareLayersSpec;
  accessMode: WorkspaceShareAccessMode;
  permission: 'viewer';
  publicToken: string | null;
  revokedAt: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface WorkspaceShareProjectContext {
  projectId: string;
  projectName: string;
  isDeleted: boolean;
  /** Optional allowlist of existing active model version IDs; if provided, missing version triggers unavailability notice */
  availableModelVersionIds?: string[];
  availableAreaIds?: string[];
}

export interface WorkspaceOutputAuditEntry {
  id: string;
  occurredAt: string;
  projectId: string;
  actorUserId: string;
  actorName: string;
  action:
    | 'workspace.download_authorized'
    | 'workspace.download_denied'
    | 'workspace.share_created'
    | 'workspace.share_denied'
    | 'workspace.share_updated'
    | 'workspace.share_revoked'
    | 'workspace.share_opened'
    | 'workspace.share_open_denied'
    | 'member.grants_updated';
  targetId: string;
  result: 'success' | 'rejected';
  summary: string;
}

export interface CutoffSweepResult {
  evaluatedAtUtcMs: number;
  markedAlfaCount: number;
  quarantinedCount: number;
  markedObligationIds: string[];
}

const ALLOWED_IZIN_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_IZIN_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

/** Keys strictly forbidden in any share payload or audit summary */
const FORBIDDEN_SHARE_PAYLOAD_KEYS = [
  'strokes',
  'drawings',
  'privateDrawings',
  'annotations',
  'localAnnotations',
  'evidencePhoto',
  'evidencePhotos',
  'izinPhoto',
  'medicalNote',
  'token',
  'accessToken',
  'inviteCode',
  'projectPassword',
];

function isFiniteVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.x === 'number' &&
    Number.isFinite(o.x) &&
    typeof o.y === 'number' &&
    Number.isFinite(o.y) &&
    typeof o.z === 'number' &&
    Number.isFinite(o.z) &&
    Math.abs(o.x) < 10_000 &&
    Math.abs(o.y) < 10_000 &&
    Math.abs(o.z) < 10_000
  );
}

/**
 * Operational backend service for the 20 November 2026 VONTA Addendum:
 * - Automatic Alfa attendance + background scheduler + read-time derivation + catch-up scan
 * - Photo-based Izin with private evidence storage & Mandor-scoped review
 * - Independent project member grants (Download view / Share view)
 * - Clean PNG download authorization & protected allowlisted Share View references
 */
export class VontaAddendumService {
  private nowFn: () => Date;
  private schedulerHandle: ReturnType<typeof setInterval> | null = null;

  private readonly projects = new Map<string, WorkspaceShareProjectContext>();
  private readonly members = new Map<string, ProjectMemberDirectoryRecord>(); // key: `${projectId}::${userId}`
  private readonly shifts = new Map<string, AttendanceShiftObligation>(); // key: obligationId
  private readonly records = new Map<string, AttendanceRecordState>(); // key: obligationId
  private readonly izinRequests = new Map<string, IzinRequestRecord>(); // key: izinId
  private readonly izinByObligation = new Map<string, string>(); // obligationId -> latest izinId
  private readonly evidenceBlobs = new Map<string, StoredIzinEvidenceBlob>(); // key: photoId
  private readonly attendanceHistory: AttendanceHistoryEntry[] = [];
  private readonly workspaceShares = new Map<string, WorkspaceViewShareRecord>(); // key: shareId
  private readonly outputAuditLog: WorkspaceOutputAuditEntry[] = [];

  constructor(nowFn: () => Date = () => new Date()) {
    this.nowFn = nowFn;
  }

  /** Test/runtime clock injection for deterministic boundary testing */
  setClock(nowFn: () => Date): void {
    this.nowFn = nowFn;
  }

  nowUtcMs(): number {
    return this.nowFn().getTime();
  }

  startCutoffScheduler(intervalMs = 30_000): void {
    if (this.schedulerHandle) return;
    // Immediate catch-up scan on server startup
    this.runAttendanceCutoffSweep();
    this.schedulerHandle = setInterval(() => {
      this.runAttendanceCutoffSweep();
    }, intervalMs);
    if (typeof this.schedulerHandle.unref === 'function') {
      this.schedulerHandle.unref();
    }
  }

  stopCutoffScheduler(): void {
    if (this.schedulerHandle) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
  }

  // --------------------------------------------------------------------------
  // Project & Membership Registration / Sync
  // --------------------------------------------------------------------------

  registerProjectContext(ctx: WorkspaceShareProjectContext): void {
    this.projects.set(ctx.projectId, {
      ...ctx,
      availableModelVersionIds: ctx.availableModelVersionIds
        ? [...ctx.availableModelVersionIds]
        : undefined,
      availableAreaIds: ctx.availableAreaIds ? [...ctx.availableAreaIds] : undefined,
    });
  }

  upsertMember(member: ProjectMemberDirectoryRecord): void {
    this.members.set(`${member.projectId}::${member.userId}`, { ...member });
  }

  revokeMember(projectId: string, userId: string): void {
    const key = `${projectId}::${userId}`;
    const existing = this.members.get(key);
    if (existing) {
      this.members.set(key, {
        ...existing,
        status: 'revoked',
        canDownloadWorkspaceView: false,
        canShareWorkspaceView: false,
      });
    }
  }

  getMember(projectId: string, userId: string): ProjectMemberDirectoryRecord | null {
    return this.members.get(`${projectId}::${userId}`) ?? null;
  }

  listProjectMembers(actor: AuthenticatedActor, projectId: string): ProjectMemberDirectoryRecord[] {
    const caller = this.requireActiveMember(actor, projectId);
    const all = Array.from(this.members.values()).filter((m) => m.projectId === projectId);
    if (isProjectLead(caller.role) || caller.role === 'owner' || caller.hasMandorGrant) {
      return all.map((m) => ({ ...m }));
    }
    // Workers only see their own membership record
    return all.filter((m) => m.userId === actor.userId).map((m) => ({ ...m }));
  }

  updateMemberGrants(
    actor: AuthenticatedActor,
    projectId: string,
    targetUserId: string,
    patch: {
      canDownloadWorkspaceView?: boolean;
      canShareWorkspaceView?: boolean;
      hasMandorGrant?: boolean;
      division?: Department;
      teamId?: string;
    }
  ): ProjectMemberDirectoryRecord {
    const caller = this.requireActiveMember(actor, projectId);
    if (!canManageWorkspaceOutputGrants(caller)) {
      throw new ServiceError(
        403,
        'FORBIDDEN_ROLE',
        'Only an active project Contractor can update workspace output grants or Mandor assignments.'
      );
    }

    const key = `${projectId}::${targetUserId}`;
    const target = this.members.get(key);
    if (!target || target.status !== 'active') {
      throw new ServiceError(404, 'MEMBER_NOT_FOUND', 'Active project member not found.');
    }

    const updated: ProjectMemberDirectoryRecord = {
      ...target,
      canDownloadWorkspaceView:
        patch.canDownloadWorkspaceView !== undefined
          ? Boolean(patch.canDownloadWorkspaceView)
          : target.canDownloadWorkspaceView,
      canShareWorkspaceView:
        patch.canShareWorkspaceView !== undefined
          ? Boolean(patch.canShareWorkspaceView)
          : target.canShareWorkspaceView,
      hasMandorGrant:
        patch.hasMandorGrant !== undefined ? Boolean(patch.hasMandorGrant) : target.hasMandorGrant,
      division: patch.division ?? target.division,
      teamId: patch.teamId ?? target.teamId,
    };
    this.members.set(key, updated);

    this.outputAuditLog.unshift({
      id: randomUUID(),
      occurredAt: this.nowFn().toISOString(),
      projectId,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'member.grants_updated',
      targetId: targetUserId,
      result: 'success',
      summary: `Updated grants for ${updated.displayName}: download=${canDownloadWorkspaceView(updated)}, share=${canShareWorkspaceView(updated)}, mandor=${updated.hasMandorGrant}`,
    });

    return { ...updated };
  }

  private requireActiveMember(
    actor: AuthenticatedActor,
    projectId: string
  ): ProjectMemberDirectoryRecord {
    const proj = this.projects.get(projectId);
    if (proj?.isDeleted) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'This project is no longer available.');
    }
    const member = this.getMember(projectId, actor.userId);
    if (!member || member.status !== 'active') {
      throw new ServiceError(
        403,
        'FORBIDDEN',
        'You do not have active access to this project.'
      );
    }
    return member;
  }

  // --------------------------------------------------------------------------
  // Shift Scheduling & Automatic Alfa Cutoff Sweep (Idempotent + Catch-up)
  // --------------------------------------------------------------------------

  upsertShiftObligation(shift: AttendanceShiftObligation): void {
    this.shifts.set(shift.id, {
      ...shift,
      assignedMandorUserIds: [...shift.assignedMandorUserIds],
    });
  }

  /**
   * Idempotent background & catch-up sweep:
   * - Marks Alfa for every eligible scheduled shift whose cutoffUtcMs <= nowUtcMs
   *   and that has neither an accepted check-in nor an approved leave.
   * - Uses effectiveAtUtcMs = cutoffUtcMs and recordedAtUtcMs = nowUtcMs.
   * - Quarantines missing/ambiguous schedules without marking them Alfa.
   * - Safe to re-run repeatedly (idempotent: never duplicates Alfa events).
   */
  runAttendanceCutoffSweep(overrideNowUtcMs?: number): CutoffSweepResult {
    const nowUtcMs = overrideNowUtcMs ?? this.nowUtcMs();
    const markedObligationIds: string[] = [];
    let quarantinedCount = 0;

    for (const shift of this.shifts.values()) {
      const existingRec = this.records.get(shift.id) ?? null;
      const latestIzinId = this.izinByObligation.get(shift.id);
      const existingIzin = latestIzinId ? (this.izinRequests.get(latestIzinId) ?? null) : null;

      if (shift.eligibility === 'missing_schedule' || shift.eligibility === 'ambiguous_schedule') {
        quarantinedCount += 1;
        if (!existingRec) {
          this.records.set(shift.id, {
            obligationId: shift.id,
            projectId: shift.projectId,
            workerUserId: shift.workerUserId,
            workDate: shift.workDate,
            division: shift.division,
            status: 'schedule_unavailable',
            checkInReceivedAtUtcMs: null,
            effectiveAtUtcMs: null,
            recordedAtUtcMs: nowUtcMs,
            markedBy: null,
            version: 1,
          });
          this.appendAttendanceHistory({
            projectId: shift.projectId,
            obligationId: shift.id,
            workerUserId: shift.workerUserId,
            workDate: shift.workDate,
            eventType: 'schedule_quarantined',
            actorType: 'system',
            actorUserId: null,
            actorName: 'Attendance Scheduler',
            summary: `Shift schedule ${shift.eligibility.replace('_', ' ')} — quarantined as Schedule unavailable (not marked Alfa).`,
            metadata: { eligibility: shift.eligibility },
            occurredAtMs: nowUtcMs,
          });
        }
        continue;
      }

      const derived = deriveEffectiveAttendanceStatus({
        shift,
        record: existingRec,
        izin: existingIzin,
        nowUtcMs,
      });

      if (derived.needsAlfaPersistence && derived.cutoffUtcMs !== null) {
        const nextRec: AttendanceRecordState = {
          obligationId: shift.id,
          projectId: shift.projectId,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          division: shift.division,
          status: 'alfa',
          checkInReceivedAtUtcMs: existingRec?.checkInReceivedAtUtcMs ?? null,
          effectiveAtUtcMs: derived.cutoffUtcMs,
          recordedAtUtcMs: nowUtcMs,
          markedBy: 'system_cutoff',
          version: (existingRec?.version ?? 0) + 1,
        };
        this.records.set(shift.id, nextRec);
        markedObligationIds.push(shift.id);

        this.appendAttendanceHistory({
          projectId: shift.projectId,
          obligationId: shift.id,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          eventType: 'alfa_auto_marked',
          actorType: 'system',
          actorUserId: null,
          actorName: 'Attendance Scheduler',
          summary: `Automatically marked Alfa (effective ${formatInstantInProjectZone(derived.cutoffUtcMs, shift.timezone)}; recorded ${formatInstantInProjectZone(nowUtcMs, shift.timezone)}).`,
          metadata: {
            effectiveAtUtcMs: derived.cutoffUtcMs,
            recordedAtUtcMs: nowUtcMs,
            pendingIzin: derived.requestStatus === 'pending',
          },
          occurredAtMs: nowUtcMs,
        });
      }
    }

    return {
      evaluatedAtUtcMs: nowUtcMs,
      markedAlfaCount: markedObligationIds.length,
      quarantinedCount,
      markedObligationIds,
    };
  }

  // --------------------------------------------------------------------------
  // Worker Attendance Read & Check-In
  // --------------------------------------------------------------------------

  getWorkerAttendanceOverview(
    actor: AuthenticatedActor,
    projectId: string,
    options?: { workDate?: string }
  ): {
    serverNowUtcMs: number;
    member: ProjectMemberDirectoryRecord;
    capabilities: {
      canDrawLocally: boolean;
      canDownloadWorkspaceView: boolean;
      canShareWorkspaceView: boolean;
      canManageGrants: boolean;
      isMandor: boolean;
    };
    obligations: Array<{
      shift: AttendanceShiftObligation;
      attendanceStatus: EffectiveAttendanceStatus;
      requestStatus: IzinRequestStatus;
      cutoffUtcMs: number | null;
      remainingSecondsToCutoff: number | null;
      canSelfCheckIn: boolean;
      record: AttendanceRecordState | null;
      izinRequest: IzinRequestRecord | null;
    }>;
    history: AttendanceHistoryEntry[];
  } {
    const member = this.requireActiveMember(actor, projectId);
    const nowUtcMs = this.nowUtcMs();

    const myShifts = Array.from(this.shifts.values())
      .filter(
        (s) =>
          s.projectId === projectId &&
          s.workerUserId === actor.userId &&
          (!options?.workDate || s.workDate === options.workDate)
      )
      .sort((a, b) => b.workDate.localeCompare(a.workDate));

    const obligations = myShifts.map((shift) => {
      const rec = this.records.get(shift.id) ?? null;
      const latestIzinId = this.izinByObligation.get(shift.id);
      const izin = latestIzinId ? (this.izinRequests.get(latestIzinId) ?? null) : null;
      const derived = deriveEffectiveAttendanceStatus({ shift, record: rec, izin, nowUtcMs });

      // Persist overdue read-time Alfa lazily so subsequent reads & aggregates match
      let effectiveRec = rec;
      if (derived.needsAlfaPersistence && derived.cutoffUtcMs !== null) {
        effectiveRec = {
          obligationId: shift.id,
          projectId: shift.projectId,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          division: shift.division,
          status: 'alfa',
          checkInReceivedAtUtcMs: null,
          effectiveAtUtcMs: derived.cutoffUtcMs,
          recordedAtUtcMs: nowUtcMs,
          markedBy: 'system_cutoff',
          version: (rec?.version ?? 0) + 1,
        };
        this.records.set(shift.id, effectiveRec);
        this.appendAttendanceHistory({
          projectId: shift.projectId,
          obligationId: shift.id,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          eventType: 'alfa_auto_marked',
          actorType: 'system',
          actorUserId: null,
          actorName: 'Attendance Scheduler',
          summary: `Automatically marked Alfa at cutoff ${formatInstantInProjectZone(derived.cutoffUtcMs, shift.timezone)}.`,
          metadata: {
            effectiveAtUtcMs: derived.cutoffUtcMs,
            recordedAtUtcMs: nowUtcMs,
            derivedOnRead: true,
          },
          occurredAtMs: nowUtcMs,
        });
      }

      return {
        shift,
        attendanceStatus: derived.attendanceStatus,
        requestStatus: derived.requestStatus,
        cutoffUtcMs: derived.cutoffUtcMs,
        remainingSecondsToCutoff: derived.remainingSecondsToCutoff,
        canSelfCheckIn: derived.canSelfCheckIn,
        record: effectiveRec ? { ...effectiveRec } : null,
        izinRequest: izin ? { ...izin } : null,
      };
    });

    const history = this.attendanceHistory
      .filter((h) => h.projectId === projectId && h.workerUserId === actor.userId)
      .slice(0, 50);

    return {
      serverNowUtcMs: nowUtcMs,
      member: { ...member },
      capabilities: {
        canDrawLocally: canDrawLocally(member),
        canDownloadWorkspaceView: canDownloadWorkspaceView(member),
        canShareWorkspaceView: canShareWorkspaceView(member),
        canManageGrants: canManageWorkspaceOutputGrants(member),
        isMandor: member.hasMandorGrant,
      },
      obligations,
      history,
    };
  }

  /**
   * Worker self check-in using trusted server receipt time.
   * Also supports delayed pre-cutoff receipt reconciliation (`explicitReceiptUtcMs` only for trusted server ingestion).
   */
  recordWorkerCheckIn(
    actor: AuthenticatedActor,
    projectId: string,
    obligationId: string,
    options?: { trustedReceiptUtcMs?: number }
  ): { record: AttendanceRecordState; reconciledFromAlfa: boolean } {
    this.requireActiveMember(actor, projectId);
    const shift = this.shifts.get(obligationId);
    if (!shift || shift.projectId !== projectId) {
      throw new ServiceError(404, 'SHIFT_NOT_FOUND', 'Attendance shift obligation not found.');
    }
    if (shift.workerUserId !== actor.userId) {
      throw new ServiceError(
        403,
        'FORBIDDEN',
        'You can only record check-in for your own scheduled shift.'
      );
    }

    const serverReceiptUtcMs = options?.trustedReceiptUtcMs ?? this.nowUtcMs();
    const existingRecord = this.records.get(shift.id) ?? null;
    const latestIzinId = this.izinByObligation.get(shift.id);
    const existingIzin = latestIzinId ? (this.izinRequests.get(latestIzinId) ?? null) : null;

    const evalResult = evaluateCheckInAttempt({
      shift,
      existingRecord,
      existingIzin,
      serverReceiptUtcMs,
    });

    if (!evalResult.accepted) {
      if (evalResult.code === 'PAST_CUTOFF') {
        // Ensure Alfa is persisted if not yet marked
        this.runAttendanceCutoffSweep(serverReceiptUtcMs);
        this.appendAttendanceHistory({
          projectId,
          obligationId: shift.id,
          workerUserId: actor.userId,
          workDate: shift.workDate,
          eventType: 'checkin_rejected_after_cutoff',
          actorType: 'worker',
          actorUserId: actor.userId,
          actorName: actor.displayName,
          summary: `Check-in rejected at ${formatInstantInProjectZone(serverReceiptUtcMs, shift.timezone)} — after 1-hour cutoff.`,
          metadata: {
            receiptUtcMs: serverReceiptUtcMs,
            cutoffUtcMs: computeShiftCutoffUtcMs(shift),
          },
          occurredAtMs: serverReceiptUtcMs,
        });
      }
      throw new ServiceError(
        evalResult.code === 'PAST_CUTOFF' ? 409 : 400,
        evalResult.code,
        evalResult.message
      );
    }

    this.records.set(shift.id, evalResult.nextRecord);
    this.appendAttendanceHistory({
      projectId,
      obligationId: shift.id,
      workerUserId: actor.userId,
      workDate: shift.workDate,
      eventType: evalResult.reconciledFromAlfa ? 'alfa_reconciled_to_present' : 'checkin_accepted',
      actorType: evalResult.reconciledFromAlfa ? 'system' : 'worker',
      actorUserId: actor.userId,
      actorName: actor.displayName,
      summary: evalResult.reconciledFromAlfa
        ? `Reconciled prior Alfa to Present from verified pre-cutoff check-in receipt (${formatInstantInProjectZone(serverReceiptUtcMs, shift.timezone)}).`
        : `Checked in Present at ${formatInstantInProjectZone(serverReceiptUtcMs, shift.timezone)}.`,
      metadata: {
        receiptUtcMs: serverReceiptUtcMs,
        reconciledFromAlfa: evalResult.reconciledFromAlfa,
      },
      occurredAtMs: this.nowUtcMs(),
    });

    return {
      record: { ...evalResult.nextRecord },
      reconciledFromAlfa: evalResult.reconciledFromAlfa,
    };
  }

  // --------------------------------------------------------------------------
  // Private Izin Photo Evidence Upload & Restricted Read
  // --------------------------------------------------------------------------

  uploadIzinEvidencePhoto(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      fileName: string;
      mimeType: string;
      base64Data: string;
    }
  ): IzinEvidencePhotoMeta {
    this.requireActiveMember(actor, projectId);

    const mime = (input.mimeType || '').trim().toLowerCase();
    if (!ALLOWED_IZIN_MIME_TYPES.has(mime)) {
      throw new ServiceError(
        400,
        'INVALID_PHOTO_TYPE',
        'Upload a valid JPEG, PNG, or WebP photo as izin evidence.',
        { fieldErrors: { photo: 'Only JPEG, PNG, and WebP photos are accepted.' } }
      );
    }

    const cleanBase64 = (input.base64Data || '').replace(/^data:[^;]+;base64,/, '').trim();
    const buf = cleanBase64 ? Buffer.from(cleanBase64, 'base64') : Buffer.alloc(0);
    if (buf.length === 0) {
      throw new ServiceError(
        400,
        'EMPTY_PHOTO',
        'Selected photo file is empty. Please capture or choose a clear photo.',
        { fieldErrors: { photo: 'Photo file cannot be empty.' } }
      );
    }
    if (buf.length > MAX_IZIN_PHOTO_BYTES) {
      throw new ServiceError(
        400,
        'PHOTO_TOO_LARGE',
        'Photo exceeds the 10 MB upload limit. Choose a smaller image.',
        { fieldErrors: { photo: 'Photo must be 10 MB or smaller.' } }
      );
    }

    const safeFileName = (input.fileName || 'izin-evidence.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);

    const meta: IzinEvidencePhotoMeta = {
      id: randomUUID(),
      projectId,
      workerUserId: actor.userId,
      fileName: safeFileName,
      mimeType: mime as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
      sizeBytes: buf.length,
      uploadedAt: this.nowFn().toISOString(),
    };

    this.evidenceBlobs.set(meta.id, { meta, buffer: buf });
    return { ...meta };
  }

  /**
   * Restricted private photo retrieval:
   * ONLY the worker who uploaded the photo OR an eligible assigned Mandor reviewing that worker's
   * shift (with active project membership) can read the private evidence blob.
   */
  getIzinEvidencePhotoBlob(
    actor: AuthenticatedActor,
    projectId: string,
    photoId: string
  ): StoredIzinEvidenceBlob {
    const caller = this.requireActiveMember(actor, projectId);
    const stored = this.evidenceBlobs.get(photoId);
    if (!stored || stored.meta.projectId !== projectId) {
      throw new ServiceError(404, 'EVIDENCE_NOT_FOUND', 'Private izin photo not found.');
    }

    // Worker can read own uploaded photo
    if (stored.meta.workerUserId === actor.userId) {
      return { meta: { ...stored.meta }, buffer: Buffer.from(stored.buffer) };
    }

    // Eligible assigned Mandor reviewing a shift that references this photo can read it
    const linkedRequest = Array.from(this.izinRequests.values()).find(
      (req) => req.projectId === projectId && req.evidencePhotoIds.includes(photoId)
    );
    if (linkedRequest) {
      const shift = this.shifts.get(linkedRequest.obligationId);
      if (shift) {
        const authCheck = canDecideIzinForShift({
          reviewerUserId: actor.userId,
          reviewerMembership: caller,
          shift,
        });
        if (authCheck.allowed) {
          return { meta: { ...stored.meta }, buffer: Buffer.from(stored.buffer) };
        }
      }
    }

    throw new ServiceError(
      403,
      'FORBIDDEN_EVIDENCE_ACCESS',
      'Private izin photos are restricted to the worker and their assigned Mandor.'
    );
  }

  // --------------------------------------------------------------------------
  // Photo-Based Izin Submission & Mandor Review
  // --------------------------------------------------------------------------

  submitIzinRequest(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      obligationId: string;
      reason: string;
      evidencePhotoIds: string[];
    }
  ): {
    izinRequest: IzinRequestRecord;
    attendanceStatus: EffectiveAttendanceStatus;
  } {
    this.requireActiveMember(actor, projectId);
    const shift = this.shifts.get(input.obligationId);
    if (!shift || shift.projectId !== projectId) {
      throw new ServiceError(404, 'SHIFT_NOT_FOUND', 'Attendance shift obligation not found.');
    }
    if (shift.workerUserId !== actor.userId) {
      throw new ServiceError(
        403,
        'FORBIDDEN',
        'You can only submit an izin request for your own scheduled shift.'
      );
    }

    const reason = (input.reason || '').trim();
    const fieldErrors: Record<string, string> = {};
    if (!reason) {
      fieldErrors.reason = 'Enter a short reason for your izin request.';
    }

    const photoIds = Array.isArray(input.evidencePhotoIds)
      ? input.evidencePhotoIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : [];
    if (photoIds.length === 0) {
      fieldErrors.photo = 'Attach at least one uploaded photo before submitting izin.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Reason and photo evidence are required.', {
        fieldErrors,
      });
    }

    // Verify ownership & project isolation for every referenced evidence photo
    for (const pid of photoIds) {
      const stored = this.evidenceBlobs.get(pid);
      if (!stored || stored.meta.projectId !== projectId || stored.meta.workerUserId !== actor.userId) {
        throw new ServiceError(
          400,
          'INVALID_EVIDENCE_REFERENCE',
          'Each izin photo must be uploaded by you within this project before submission.',
          { fieldErrors: { photo: 'Re-upload your photo evidence for this project.' } }
        );
      }
    }

    const nowUtcMs = this.nowUtcMs();
    const existingRec = this.records.get(shift.id) ?? null;

    // Check if an active eligible Mandor exists for this worker's team/division (excluding self)
    const eligibleMandors = shift.assignedMandorUserIds.filter((mandorId) => {
      if (mandorId === shift.workerUserId) return false;
      const m = this.getMember(projectId, mandorId);
      return Boolean(m && m.status === 'active' && m.hasMandorGrant);
    });

    const isPresentConflict = existingRec?.status === 'present';
    const initialStatus: IzinRequestStatus = isPresentConflict
      ? 'conflict_requires_correction'
      : eligibleMandors.length === 0
        ? 'awaiting_mandor_assignment'
        : 'pending';

    const izin: IzinRequestRecord = {
      id: randomUUID(),
      obligationId: shift.id,
      projectId,
      workerUserId: actor.userId,
      workerName: actor.displayName,
      division: shift.division,
      teamId: shift.teamId,
      workDate: shift.workDate,
      reason,
      evidencePhotoIds: [...photoIds],
      status: initialStatus,
      submittedAtUtcMs: nowUtcMs,
      reviewedAtUtcMs: null,
      reviewedByUserId: null,
      reviewedByName: null,
      rejectionReason: null,
      requiresCorrectionWorkflow: isPresentConflict,
      version: 1,
    };

    this.izinRequests.set(izin.id, izin);
    this.izinByObligation.set(shift.id, izin.id);

    // Effective attendance status MUST remain untouched on submission!
    // Before cutoff -> no_record_yet; at/after cutoff -> alfa; if already present -> present
    const derived = deriveEffectiveAttendanceStatus({
      shift,
      record: existingRec,
      izin,
      nowUtcMs,
    });

    this.appendAttendanceHistory({
      projectId,
      obligationId: shift.id,
      workerUserId: actor.userId,
      workDate: shift.workDate,
      eventType: isPresentConflict ? 'izin_conflict_routed_to_correction' : 'izin_submitted',
      actorType: 'worker',
      actorUserId: actor.userId,
      actorName: actor.displayName,
      summary: isPresentConflict
        ? `Izin request submitted for already-Present shift — routed to correction workflow.`
        : initialStatus === 'awaiting_mandor_assignment'
          ? `Izin request submitted with ${photoIds.length} private photo(s) — awaiting Mandor assignment.`
          : `Izin request submitted with ${photoIds.length} private photo(s) — awaiting Mandor review.`,
      metadata: {
        izinId: izin.id,
        photoCount: photoIds.length,
        requestStatus: initialStatus,
        attendanceStatusAtSubmission: derived.attendanceStatus,
      },
      occurredAtMs: nowUtcMs,
    });

    return {
      izinRequest: { ...izin },
      attendanceStatus: derived.attendanceStatus,
    };
  }

  /**
   * Lists ONLY izin requests that the calling Mandor is strictly eligible to review
   * (active project membership, Mandor authority, assigned team+division on work date, never own requests).
   */
  listMandorReviewQueue(
    actor: AuthenticatedActor,
    projectId: string
  ): Array<{
    izinRequest: IzinRequestRecord;
    shift: AttendanceShiftObligation;
    attendanceStatus: EffectiveAttendanceStatus;
    evidenceCount: number;
  }> {
    const caller = this.requireActiveMember(actor, projectId);
    const nowUtcMs = this.nowUtcMs();

    const queue: Array<{
      izinRequest: IzinRequestRecord;
      shift: AttendanceShiftObligation;
      attendanceStatus: EffectiveAttendanceStatus;
      evidenceCount: number;
    }> = [];

    for (const izin of this.izinRequests.values()) {
      if (izin.projectId !== projectId) continue;
      const shift = this.shifts.get(izin.obligationId);
      if (!shift) continue;

      const authCheck = canDecideIzinForShift({
        reviewerUserId: actor.userId,
        reviewerMembership: caller,
        shift,
      });
      if (!authCheck.allowed) continue;

      const rec = this.records.get(shift.id) ?? null;
      const derived = deriveEffectiveAttendanceStatus({ shift, record: rec, izin, nowUtcMs });

      queue.push({
        izinRequest: { ...izin },
        shift: { ...shift },
        attendanceStatus: derived.attendanceStatus,
        evidenceCount: izin.evidencePhotoIds.length,
      });
    }

    queue.sort((a, b) => b.izinRequest.submittedAtUtcMs - a.izinRequest.submittedAtUtcMs);
    return queue;
  }

  /**
   * Lists unassigned izin requests (`awaiting_mandor_assignment`) for project Contractor/coordinator visibility.
   * Deliberately omits private photo URLs and raw medical notes.
   */
  listUnassignedIzinRequests(
    actor: AuthenticatedActor,
    projectId: string
  ): Array<{
    izinId: string;
    workerName: string;
    division: Department;
    workDate: string;
    status: IzinRequestStatus;
  }> {
    const caller = this.requireActiveMember(actor, projectId);
    if (!isProjectLead(caller.role) && caller.role !== 'owner') {
      return [];
    }
    return Array.from(this.izinRequests.values())
      .filter((r) => r.projectId === projectId && r.status === 'awaiting_mandor_assignment')
      .map((r) => ({
        izinId: r.id,
        workerName: r.workerName,
        division: r.division,
        workDate: r.workDate,
        status: r.status,
      }));
  }

  /**
   * Mandor decision (Approve or Reject) with optimistic concurrency (`expectedVersion`),
   * strict scope enforcement, Present/leave conflict guard, and mandatory rejection reason.
   */
  decideIzinRequest(
    actor: AuthenticatedActor,
    projectId: string,
    izinId: string,
    input: {
      decision: 'approve' | 'reject';
      rejectionReason?: string;
      expectedVersion?: number;
    }
  ): {
    izinRequest: IzinRequestRecord;
    attendanceRecord: AttendanceRecordState | null;
    effectiveAttendanceStatus: EffectiveAttendanceStatus;
  } {
    const caller = this.requireActiveMember(actor, projectId);
    const izin = this.izinRequests.get(izinId);
    if (!izin || izin.projectId !== projectId) {
      throw new ServiceError(404, 'IZIN_NOT_FOUND', 'Izin request not found.');
    }

    const shift = this.shifts.get(izin.obligationId);
    if (!shift) {
      throw new ServiceError(404, 'SHIFT_NOT_FOUND', 'Associated shift obligation not found.');
    }

    // Strict Mandor authority + scope + non-self check
    const authCheck = canDecideIzinForShift({
      reviewerUserId: actor.userId,
      reviewerMembership: caller,
      shift,
    });
    if (!authCheck.allowed) {
      throw new ServiceError(403, authCheck.code, authCheck.reason);
    }

    // Prevent concurrent double-decision
    if (input.expectedVersion !== undefined && izin.version !== input.expectedVersion) {
      throw new ServiceError(
        409,
        'STALE_IZIN_REQUEST',
        'This izin request has already been updated. Reload the queue to see the latest decision.'
      );
    }

    if (izin.status === 'approved' || izin.status === 'rejected') {
      throw new ServiceError(
        409,
        'IZIN_ALREADY_DECIDED',
        `This izin request was already ${izin.status} by ${izin.reviewedByName ?? 'another reviewer'}.`
      );
    }

    const nowUtcMs = this.nowUtcMs();
    const existingRec = this.records.get(shift.id) ?? null;

    if (input.decision === 'reject') {
      const reason = (input.rejectionReason || '').trim();
      if (!reason) {
        throw new ServiceError(
          400,
          'REJECTION_REASON_REQUIRED',
          'Provide a clear rejection reason before rejecting an izin request.',
          { fieldErrors: { rejectionReason: 'Rejection reason is required.' } }
        );
      }

      const rejected: IzinRequestRecord = {
        ...izin,
        status: 'rejected',
        reviewedAtUtcMs: nowUtcMs,
        reviewedByUserId: actor.userId,
        reviewedByName: actor.displayName,
        rejectionReason: reason,
        version: izin.version + 1,
      };
      this.izinRequests.set(izin.id, rejected);

      const derived = deriveEffectiveAttendanceStatus({
        shift,
        record: existingRec,
        izin: rejected,
        nowUtcMs,
      });

      this.appendAttendanceHistory({
        projectId,
        obligationId: shift.id,
        workerUserId: shift.workerUserId,
        workDate: shift.workDate,
        eventType: 'izin_rejected',
        actorType: 'mandor',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        summary: `Izin rejected by Mandor (${actor.displayName}). Attendance remains ${derived.attendanceStatus}.`,
        metadata: {
          izinId: izin.id,
          effectiveAttendanceStatus: derived.attendanceStatus,
        },
        occurredAtMs: nowUtcMs,
      });

      return {
        izinRequest: { ...rejected },
        attendanceRecord: existingRec ? { ...existingRec } : null,
        effectiveAttendanceStatus: derived.attendanceStatus,
      };
    }

    // APPROVE path: check Present/leave conflict — never silently overwrite Present!
    if (existingRec?.status === 'present' || izin.status === 'conflict_requires_correction') {
      const conflicted: IzinRequestRecord = {
        ...izin,
        status: 'conflict_requires_correction',
        requiresCorrectionWorkflow: true,
        version: izin.version + 1,
      };
      this.izinRequests.set(izin.id, conflicted);
      throw new ServiceError(
        409,
        'PRESENT_LEAVE_CONFLICT',
        'Worker is already marked Present for this shift. Resolve via the attendance correction workflow instead of direct izin approval.'
      );
    }

    const approved: IzinRequestRecord = {
      ...izin,
      status: 'approved',
      reviewedAtUtcMs: nowUtcMs,
      reviewedByUserId: actor.userId,
      reviewedByName: actor.displayName,
      rejectionReason: null,
      version: izin.version + 1,
    };
    this.izinRequests.set(izin.id, approved);

    const nextRecord: AttendanceRecordState = {
      obligationId: shift.id,
      projectId,
      workerUserId: shift.workerUserId,
      workDate: shift.workDate,
      division: shift.division,
      status: 'izin',
      checkInReceivedAtUtcMs: existingRec?.checkInReceivedAtUtcMs ?? null,
      effectiveAtUtcMs: existingRec?.effectiveAtUtcMs ?? computeShiftCutoffUtcMs(shift) ?? nowUtcMs,
      recordedAtUtcMs: nowUtcMs,
      markedBy: 'mandor_approval',
      version: (existingRec?.version ?? 0) + 1,
    };
    this.records.set(shift.id, nextRecord);

    this.appendAttendanceHistory({
      projectId,
      obligationId: shift.id,
      workerUserId: shift.workerUserId,
      workDate: shift.workDate,
      eventType: 'izin_approved',
      actorType: 'mandor',
      actorUserId: actor.userId,
      actorName: actor.displayName,
      summary: `Izin approved by Mandor (${actor.displayName}). Original workday (${shift.workDate}) attendance updated to Izin.`,
      metadata: {
        izinId: izin.id,
        previousStatus: existingRec?.status ?? 'no_record_yet',
        newStatus: 'izin',
      },
      occurredAtMs: nowUtcMs,
    });

    return {
      izinRequest: { ...approved },
      attendanceRecord: { ...nextRecord },
      effectiveAttendanceStatus: 'izin',
    };
  }

  /**
   * Department daily attendance analytics (strictly aggregate — NEVER returns private izin photos or notes).
   */
  getDepartmentAttendanceAnalytics(
    actor: AuthenticatedActor,
    projectId: string,
    options: {
      timezone: string;
      division?: Department | 'All';
      workDates?: string[];
    }
  ): {
    serverNowUtcMs: number;
    days: DepartmentAttendanceDayMetric[];
  } {
    this.requireActiveMember(actor, projectId);
    const nowUtcMs = this.nowUtcMs();
    const projectShifts = Array.from(this.shifts.values()).filter((s) => s.projectId === projectId);

    const dates =
      options.workDates && options.workDates.length > 0
        ? options.workDates
        : Array.from(new Set(projectShifts.map((s) => s.workDate))).sort((a, b) =>
            b.localeCompare(a)
          );

    const izinMap = new Map<string, IzinRequestRecord>();
    for (const [obId, izinId] of this.izinByObligation.entries()) {
      const req = this.izinRequests.get(izinId);
      if (req) izinMap.set(obId, req);
    }

    const days = dates.map((workDate) =>
      computeDepartmentDailyAttendance({
        shifts: projectShifts,
        recordsByObligationId: this.records,
        izinByObligationId: izinMap,
        workDate,
        timezone: options.timezone,
        division: options.division ?? 'All',
        nowUtcMs,
      })
    );

    return { serverNowUtcMs: nowUtcMs, days };
  }

  // --------------------------------------------------------------------------
  // Separate Authorized Workspace Download & Share Actions
  // --------------------------------------------------------------------------

  /**
   * Server-verified authorization gate before client renders & downloads clean PNG.
   * Re-checks live membership and Owner/Contractor or canDownloadWorkspaceView grant every time.
   */
  authorizeWorkspaceDownload(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      modelVersionId: string;
      areaId: string;
    }
  ): {
    authorized: true;
    exportToken: string;
    projectId: string;
    modelVersionId: string;
    areaId: string;
    issuedAt: string;
    suggestedFileName: string;
  } {
    const member = this.requireActiveMember(actor, projectId);
    if (!canDownloadWorkspaceView(member)) {
      this.outputAuditLog.unshift({
        id: randomUUID(),
        occurredAt: this.nowFn().toISOString(),
        projectId,
        actorUserId: actor.userId,
        actorName: actor.displayName,
        action: 'workspace.download_denied',
        targetId: input.modelVersionId || projectId,
        result: 'rejected',
        summary: 'Download view denied: caller lacks Owner/Contractor role or explicit Download grant.',
      });
      throw new ServiceError(
        403,
        'DOWNLOAD_VIEW_FORBIDDEN',
        'You do not have permission to download a Workspace view for this project.'
      );
    }

    const proj = this.projects.get(projectId);
    const slug = (proj?.projectName || projectId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const stamp = this.nowFn().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const exportToken = randomUUID();
    this.outputAuditLog.unshift({
      id: randomUUID(),
      occurredAt: this.nowFn().toISOString(),
      projectId,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'workspace.download_authorized',
      targetId: input.modelVersionId || projectId,
      result: 'success',
      summary: `Authorized clean PNG view export for area ${input.areaId} (private drawings excluded).`,
    });

    return {
      authorized: true,
      exportToken,
      projectId,
      modelVersionId: input.modelVersionId,
      areaId: input.areaId,
      issuedAt: this.nowFn().toISOString(),
      suggestedFileName: `vonta-${slug || 'workspace'}-${stamp}.png`,
    };
  }

  /**
   * Creates an allowlisted, project-scoped Workspace shared-view reference.
   * Rejects payloads attempting to embed private drawings, photos, tokens, or invalid camera coordinates.
   */
  createWorkspaceShare(
    actor: AuthenticatedActor,
    projectId: string,
    rawPayload: Record<string, unknown>
  ): {
    share: WorkspaceViewShareRecord;
    sharePath: string;
  } {
    const member = this.requireActiveMember(actor, projectId);
    if (!canShareWorkspaceView(member)) {
      this.outputAuditLog.unshift({
        id: randomUUID(),
        occurredAt: this.nowFn().toISOString(),
        projectId,
        actorUserId: actor.userId,
        actorName: actor.displayName,
        action: 'workspace.share_denied',
        targetId: projectId,
        result: 'rejected',
        summary: 'Share view denied: caller lacks Owner/Contractor role or explicit Share grant.',
      });
      throw new ServiceError(
        403,
        'SHARE_VIEW_FORBIDDEN',
        'You do not have permission to share a Workspace view for this project.'
      );
    }

    // Defense in depth: reject payloads carrying forbidden private data keys
    for (const forbidden of FORBIDDEN_SHARE_PAYLOAD_KEYS) {
      if (forbidden in rawPayload && rawPayload[forbidden] !== undefined) {
        throw new ServiceError(
          400,
          'FORBIDDEN_SHARE_FIELD',
          `Field "${forbidden}" cannot be included in a shared Workspace view reference.`
        );
      }
    }

    const modelVersionId = String(rawPayload.modelVersionId ?? '').trim();
    const areaId = String(rawPayload.areaId ?? '').trim();
    if (!modelVersionId || !areaId) {
      throw new ServiceError(
        400,
        'INVALID_SHARE_TARGET',
        'Valid modelVersionId and areaId are required to share a Workspace view.'
      );
    }

    const proj = this.projects.get(projectId);
    if (
      proj?.availableAreaIds &&
      proj.availableAreaIds.length > 0 &&
      areaId !== 'all' &&
      !proj.availableAreaIds.includes(areaId)
    ) {
      throw new ServiceError(400, 'INVALID_AREA', 'Specified area does not belong to this project.');
    }

    const camObj = (rawPayload.camera ?? {}) as Record<string, unknown>;
    if (!isFiniteVec3(camObj.position) || !isFiniteVec3(camObj.target)) {
      throw new ServiceError(
        400,
        'INVALID_CAMERA_VALUES',
        'Camera position and target must contain finite 3D coordinates.'
      );
    }

    const layersObj = (rawPayload.layers ?? {}) as Record<string, unknown>;
    const accessMode: WorkspaceShareAccessMode =
      rawPayload.accessMode === 'anyone_with_link' ? 'anyone_with_link' : 'restricted';
    const publicToken =
      accessMode === 'anyone_with_link' ? randomBytes(24).toString('hex') : null;

    const share: WorkspaceViewShareRecord = {
      id: randomUUID(),
      projectId,
      modelVersionId,
      areaId,
      roomId: typeof rawPayload.roomId === 'string' && rawPayload.roomId.trim() ? rawPayload.roomId.trim() : null,
      selectedPinId:
        typeof rawPayload.selectedPinId === 'string' && rawPayload.selectedPinId.trim()
          ? rawPayload.selectedPinId.trim()
          : null,
      camera: {
        position: {
          x: Math.round(camObj.position.x * 1000) / 1000,
          y: Math.round(camObj.position.y * 1000) / 1000,
          z: Math.round(camObj.position.z * 1000) / 1000,
        },
        target: {
          x: Math.round(camObj.target.x * 1000) / 1000,
          y: Math.round(camObj.target.y * 1000) / 1000,
          z: Math.round(camObj.target.z * 1000) / 1000,
        },
      },
      layers: {
        civil: layersObj.civil !== false,
        electrical: Boolean(layersObj.electrical),
        plumbing: Boolean(layersObj.plumbing),
        pins: layersObj.pins !== false,
      },
      accessMode,
      permission: 'viewer',
      publicToken,
      revokedAt: null,
      createdByUserId: actor.userId,
      createdByName: actor.displayName,
      createdAt: this.nowFn().toISOString(),
    };

    this.workspaceShares.set(share.id, share);

    this.outputAuditLog.unshift({
      id: randomUUID(),
      occurredAt: share.createdAt,
      projectId,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'workspace.share_created',
      targetId: share.id,
      result: 'success',
      summary: `Created ${accessMode === 'anyone_with_link' ? 'Anyone with the link (Viewer)' : 'Restricted (Viewer)'} Workspace view share for area ${areaId} (${modelVersionId}).`,
    });

    const shareRef = accessMode === 'anyone_with_link' && publicToken ? publicToken : share.id;
    return {
      share: { ...share },
      sharePath: `/share/${encodeURIComponent(shareRef)}`,
    };
  }

  /**
   * Switches a Workspace share link between Restricted and Anyone with the link (Viewer-only).
   * Switching to Restricted immediately invalidates any prior opaque public token.
   */
  updateWorkspaceShareAccess(
    actor: AuthenticatedActor,
    projectId: string,
    shareId: string,
    nextMode: WorkspaceShareAccessMode
  ): {
    share: WorkspaceViewShareRecord;
    sharePath: string;
  } {
    const member = this.requireActiveMember(actor, projectId);
    if (!canShareWorkspaceView(member)) {
      throw new ServiceError(
        403,
        'SHARE_VIEW_FORBIDDEN',
        'You do not have permission to change share link access for this project.'
      );
    }

    const share = this.workspaceShares.get(shareId);
    if (!share || share.projectId !== projectId || share.revokedAt) {
      throw new ServiceError(404, 'SHARE_NOT_FOUND', 'Shared view link not found or already disabled.');
    }

    share.accessMode = nextMode;
    share.publicToken =
      nextMode === 'anyone_with_link' ? randomBytes(24).toString('hex') : null;

    this.outputAuditLog.unshift({
      id: randomUUID(),
      occurredAt: this.nowFn().toISOString(),
      projectId,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'workspace.share_updated',
      targetId: share.id,
      result: 'success',
      summary: `Updated Workspace share access mode to ${nextMode} (Viewer-only).`,
    });

    const shareRef = nextMode === 'anyone_with_link' && share.publicToken ? share.publicToken : share.id;
    return {
      share: { ...share },
      sharePath: `/share/${encodeURIComponent(shareRef)}`,
    };
  }

  /**
   * Immediately disables/revokes a Workspace share link for both Restricted and Public visitors.
   */
  revokeWorkspaceShare(
    actor: AuthenticatedActor,
    projectId: string,
    shareId: string
  ): { revoked: true; shareId: string } {
    const member = this.requireActiveMember(actor, projectId);
    if (!canShareWorkspaceView(member)) {
      throw new ServiceError(
        403,
        'SHARE_VIEW_FORBIDDEN',
        'You do not have permission to disable share links for this project.'
      );
    }

    const share = this.workspaceShares.get(shareId);
    if (!share || share.projectId !== projectId) {
      throw new ServiceError(404, 'SHARE_NOT_FOUND', 'Shared view link not found.');
    }

    share.revokedAt = this.nowFn().toISOString();
    share.publicToken = null;

    this.outputAuditLog.unshift({
      id: randomUUID(),
      occurredAt: share.revokedAt,
      projectId,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'workspace.share_revoked',
      targetId: share.id,
      result: 'success',
      summary: 'Disabled shared Workspace view link.',
    });

    return { revoked: true, shareId: share.id };
  }

  /**
   * Resolves a protected Workspace shared-view reference for a signed-in user.
   * Re-evaluates recipient's LIVE project membership, area, and model read access on EVERY open.
   * Returns 403 with zero private preview when non-member or revoked.
   */
  resolveWorkspaceShare(
    actor: AuthenticatedActor,
    shareIdOrToken: string
  ): {
    share: WorkspaceViewShareRecord;
    hideLocalDrawingsOnOpen: true;
    modelAvailable: boolean;
    recoveryMessage: string | null;
    fallbackWorkspacePath: string;
  } {
    const share =
      this.workspaceShares.get(shareIdOrToken) ??
      Array.from(this.workspaceShares.values()).find(
        (s) => s.publicToken && s.publicToken === shareIdOrToken
      );
    if (!share || share.revokedAt) {
      throw new ServiceError(
        404,
        'SHARE_NOT_FOUND',
        'This shared view link has been disabled or could not be found.'
      );
    }

    const proj = this.projects.get(share.projectId);
    if (proj?.isDeleted) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'You do not have access to this shared view.');
    }

    // For Restricted links, re-check LIVE membership on every open
    const recipient = this.getMember(share.projectId, actor.userId);
    if (share.accessMode === 'restricted' && (!recipient || recipient.status !== 'active')) {
      this.outputAuditLog.unshift({
        id: randomUUID(),
        occurredAt: this.nowFn().toISOString(),
        projectId: share.projectId,
        actorUserId: actor.userId,
        actorName: actor.displayName,
        action: 'workspace.share_open_denied',
        targetId: share.id,
        result: 'rejected',
        summary: 'Shared view open denied: recipient is not an active project member.',
      });
      throw new ServiceError(
        403,
        'ACCESS_DENIED',
        'Access denied. Ask the project Contractor for project access to open this shared view.'
      );
    }

    const modelAvailable =
      !proj?.availableModelVersionIds ||
      proj.availableModelVersionIds.includes(share.modelVersionId);

    this.outputAuditLog.unshift({
      id: randomUUID(),
      occurredAt: this.nowFn().toISOString(),
      projectId: share.projectId,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'workspace.share_opened',
      targetId: share.id,
      result: 'success',
      summary: `Opened shared Workspace view (${modelAvailable ? 'model active' : 'model version unavailable'}).`,
    });

    return {
      share: { ...share },
      hideLocalDrawingsOnOpen: true,
      modelAvailable,
      recoveryMessage: modelAvailable
        ? null
        : 'The model version saved in this shared view has been retired or replaced. Open the current published Workspace version instead.',
      fallbackWorkspacePath: `/projects/${encodeURIComponent(share.projectId)}/spatial`,
    };
  }

  /**
   * Resolves an anonymous viewer-only link via its opaque high-entropy public token.
   * Grants ZERO membership, ZERO project discovery, and returns ONLY allowlisted scene/camera/layer fields.
   */
  resolvePublicWorkspaceShare(publicToken: string): {
    viewerShare: {
      areaId: string;
      modelVersionId: string;
      roomId: string | null;
      selectedPinId: string | null;
      camera: WorkspaceShareCameraSpec;
      layers: WorkspaceShareLayersSpec;
      accessMode: 'anyone_with_link';
      permission: 'viewer';
      createdAt: string;
    };
    hideLocalDrawingsOnOpen: true;
    modelAvailable: boolean;
    recoveryMessage: string | null;
  } {
    const cleanToken = publicToken.trim();
    if (!cleanToken) {
      throw new ServiceError(404, 'SHARE_NOT_FOUND', 'Shared link is invalid or disabled.');
    }
    const share = Array.from(this.workspaceShares.values()).find(
      (s) => s.publicToken === cleanToken && s.accessMode === 'anyone_with_link' && !s.revokedAt
    );
    if (!share) {
      throw new ServiceError(
        403,
        'ACCESS_DENIED',
        'This view link is restricted or has been disabled by the project team.'
      );
    }

    const proj = this.projects.get(share.projectId);
    if (proj?.isDeleted) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'This shared view is no longer available.');
    }

    const modelAvailable =
      !proj?.availableModelVersionIds ||
      proj.availableModelVersionIds.includes(share.modelVersionId);

    return {
      viewerShare: {
        areaId: share.areaId,
        modelVersionId: share.modelVersionId,
        roomId: share.roomId,
        selectedPinId: share.selectedPinId,
        camera: { ...share.camera },
        layers: { ...share.layers },
        accessMode: 'anyone_with_link',
        permission: 'viewer',
        createdAt: share.createdAt,
      },
      hideLocalDrawingsOnOpen: true,
      modelAvailable,
      recoveryMessage: modelAvailable
        ? null
        : 'The published model referenced by this link is no longer active.',
    };
  }

  listOutputAuditLog(projectId: string): WorkspaceOutputAuditEntry[] {
    return this.outputAuditLog.filter((e) => e.projectId === projectId);
  }

  getAllAttendanceHistory(projectId: string): AttendanceHistoryEntry[] {
    return this.attendanceHistory.filter((h) => h.projectId === projectId);
  }

  private appendAttendanceHistory(input: {
    projectId: string;
    obligationId: string;
    workerUserId: string;
    workDate: string;
    eventType: AttendanceHistoryEntry['eventType'];
    actorType: AttendanceHistoryEntry['actorType'];
    actorUserId: string | null;
    actorName: string;
    summary: string;
    metadata: Record<string, string | number | boolean | null>;
    occurredAtMs: number;
  }): void {
    this.attendanceHistory.unshift({
      id: randomUUID(),
      occurredAt: new Date(input.occurredAtMs).toISOString(),
      projectId: input.projectId,
      obligationId: input.obligationId,
      workerUserId: input.workerUserId,
      workDate: input.workDate,
      eventType: input.eventType,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      summary: input.summary,
      metadata: { ...input.metadata },
    });
  }
}
