import type { MembershipStatus, ProjectRole } from './accountTypes';
import type { Department, SpatialPin } from './types';

/** Exactly 1 hour = 3,600 elapsed seconds after scheduled shift start */
export const ALFA_CUTOFF_ELAPSED_MS = 3_600 * 1000;

export type EffectiveAttendanceStatus =
  | 'no_record_yet'
  | 'present'
  | 'alfa'
  | 'izin'
  | 'schedule_unavailable'
  | 'not_scheduled';

export type IzinRequestStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'awaiting_mandor_assignment'
  | 'conflict_requires_correction';

export type ShiftEligibilityState =
  | 'scheduled'
  | 'day_off'
  | 'cancelled'
  | 'attendance_disabled'
  | 'missing_schedule'
  | 'ambiguous_schedule';

export interface EffectiveMemberCapabilities {
  role: ProjectRole;
  status: MembershipStatus;
  hasMandorGrant?: boolean;
  hasAccountingGrant?: boolean;
  canDownloadWorkspaceView?: boolean;
  canShareWorkspaceView?: boolean;
}

export interface ProjectClockDisplay {
  weekday: string;
  dateLabel: string;
  timeWithSeconds: string;
  timezone: string;
  offsetLabel: string;
  valid: boolean;
}

export interface AttendanceShiftObligation {
  id: string;
  projectId: string;
  workerUserId: string;
  workerName: string;
  division: Department;
  teamId: string;
  /** Original shift work date in project IANA timezone (YYYY-MM-DD) */
  workDate: string;
  /** Project IANA timezone (e.g. Asia/Makassar) */
  timezone: string;
  eligibility: ShiftEligibilityState;
  /** Exact UTC timestamp in ms for shift start (null if unscheduled/missing/ambiguous) */
  shiftStartUtcMs: number | null;
  /** Human-readable shift label e.g. "08:00–17:00" or "23:30–07:30 (overnight)" */
  shiftLabel: string;
  /** Assigned Mandor user IDs scoped to this worker's team+division on this workDate */
  assignedMandorUserIds: string[];
}

export interface AttendanceRecordState {
  obligationId: string;
  projectId: string;
  workerUserId: string;
  workDate: string;
  division: Department;
  /** Persisted attendance status (read-time derivation upgrades overdue no_record_yet -> alfa) */
  status: EffectiveAttendanceStatus;
  checkInReceivedAtUtcMs: number | null;
  /** Effective timestamp (e.g. exact cutoff time for Alfa, receipt time for Present) */
  effectiveAtUtcMs: number | null;
  /** Actual database write timestamp when job/sweep or reconciliation recorded it */
  recordedAtUtcMs: number | null;
  markedBy: 'worker' | 'system_cutoff' | 'mandor_approval' | 'reconciliation' | 'manual_correction' | null;
  version: number;
}

export interface IzinEvidencePhotoMeta {
  id: string;
  projectId: string;
  workerUserId: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  sizeBytes: number;
  uploadedAt: string;
}

export interface IzinRequestRecord {
  id: string;
  obligationId: string;
  projectId: string;
  workerUserId: string;
  workerName: string;
  division: Department;
  teamId: string;
  workDate: string;
  reason: string;
  evidencePhotoIds: string[];
  status: IzinRequestStatus;
  submittedAtUtcMs: number;
  reviewedAtUtcMs: number | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  requiresCorrectionWorkflow: boolean;
  version: number;
}

export interface AttendanceHistoryEntry {
  id: string;
  occurredAt: string;
  projectId: string;
  obligationId: string;
  workerUserId: string;
  workDate: string;
  eventType:
    | 'checkin_accepted'
    | 'checkin_rejected_after_cutoff'
    | 'alfa_auto_marked'
    | 'alfa_reconciled_to_present'
    | 'izin_submitted'
    | 'izin_approved'
    | 'izin_rejected'
    | 'izin_conflict_routed_to_correction'
    | 'schedule_quarantined'
    | 'manual_correction';
  actorType: 'worker' | 'mandor' | 'system';
  actorUserId: string | null;
  actorName: string;
  summary: string;
  /** Strictly non-sensitive metadata (never stores private photo bytes/URLs or raw medical notes) */
  metadata: Record<string, string | number | boolean | null>;
}

export interface DepartmentAttendanceDayMetric {
  workDate: string;
  timezone: string;
  division: Department | 'All';
  presentCount: number;
  alfaCount: number;
  excusedIzinCount: number;
  pendingIzinCount: number;
  noRecordYetCount: number;
  scheduleUnavailableCount: number;
  /** Denominator = Present + Alfa (finalized non-excused outcomes) */
  rateDenominator: number;
  /** Present / (Present + Alfa) rounded to 1 decimal, or null when denominator is 0 */
  attendanceRatePercent: number | null;
  /** True when at least one eligible worker on this date is still pre-cutoff (no_record_yet) */
  isPartialCoverage: boolean;
  /** False when coverage is incomplete so comparative rankings exclude it */
  eligibleForRanking: boolean;
  /** Readable summary e.g. "6/8 present · 2 excused" */
  summaryLabel: string;
}

export interface PinColorSwatch {
  id: string;
  name: string;
  label: string;
  hex: string;
  threeHex: number;
}

export const NAMED_PIN_COLOR_SWATCHES: ReadonlyArray<PinColorSwatch> = [
  { id: 'vonta-orange', name: 'VONTA Orange', label: 'VONTA Orange', hex: '#D4652F', threeHex: 0xd4652f },
  { id: 'burnt-ochre', name: 'Burnt Ochre', label: 'Burnt Ochre', hex: '#A64011', threeHex: 0xa64011 },
  { id: 'site-navy', name: 'Site Navy', label: 'Site Navy', hex: '#1B2A4A', threeHex: 0x1b2a4a },
  { id: 'cobalt-blue', name: 'Cobalt Blue', label: 'Cobalt Blue', hex: '#0B63CE', threeHex: 0x0b63ce },
  { id: 'sage-emerald', name: 'Sage Emerald', label: 'Sage Emerald', hex: '#15803D', threeHex: 0x15803d },
  { id: 'amber-gold', name: 'Amber Gold', label: 'Amber Gold', hex: '#B45309', threeHex: 0xb45309 },
  { id: 'crimson-alert', name: 'Crimson Alert', label: 'Crimson Alert', hex: '#B42318', threeHex: 0xb42318 },
  { id: 'slate-violet', name: 'Slate Violet', label: 'Slate Violet', hex: '#6D28D9', threeHex: 0x6d28d9 },
];

export function resolvePinColorSwatch(colorHex?: string | null): PinColorSwatch {
  if (colorHex) {
    const found = NAMED_PIN_COLOR_SWATCHES.find(
      (s) => s.hex.toLowerCase() === colorHex.trim().toLowerCase() || s.id === colorHex.trim()
    );
    if (found) return found;
  }
  return NAMED_PIN_COLOR_SWATCHES[0];
}

export function resolvePinColorHex(colorHex?: string | null): string {
  if (colorHex) {
    const trimmed = colorHex.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    const found = NAMED_PIN_COLOR_SWATCHES.find(
      (s) => s.hex.toLowerCase() === trimmed.toLowerCase() || s.id === trimmed
    );
    if (found) return found.hex;
  }
  return NAMED_PIN_COLOR_SWATCHES[0].hex;
}

// ============================================================================
// 1. Role & Capability Resolution (Active Membership Only — Never Conflated)
// ============================================================================

export function isActiveMember(m: EffectiveMemberCapabilities | null | undefined): boolean {
  return Boolean(m && m.status === 'active');
}

export function isEffectiveMandor(m: EffectiveMemberCapabilities | null | undefined): boolean {
  if (!isActiveMember(m) || !m) return false;
  return Boolean(m.hasMandorGrant);
}

/**
 * Private device-local 3D drawing access:
 * ONLY active Owner, Contractor, or Mandor.
 * Download or Share grants NEVER grant drawing access.
 */
export function canDrawLocally(m: EffectiveMemberCapabilities | null | undefined): boolean {
  if (!isActiveMember(m) || !m) return false;
  if (m.role === 'owner' || m.role === 'contractor') return true;
  if (m.hasMandorGrant) return true;
  return false;
}

/**
 * Clean Workspace PNG Download access:
 * Active Owner and Contractor receive this automatically.
 * Every other active member (including Mandor, Worker, Accounting) requires explicit canDownloadWorkspaceView grant.
 */
export function canDownloadWorkspaceView(
  m: EffectiveMemberCapabilities | null | undefined
): boolean {
  if (!isActiveMember(m) || !m) return false;
  if (m.role === 'owner' || m.role === 'contractor') return true;
  return Boolean(m.canDownloadWorkspaceView);
}

/**
 * Protected Workspace Share View access:
 * Active Owner and Contractor receive this automatically.
 * Every other active member (including Mandor, Worker, Accounting) requires explicit canShareWorkspaceView grant.
 * Strictly independent from canDownloadWorkspaceView.
 */
export function canShareWorkspaceView(
  m: EffectiveMemberCapabilities | null | undefined
): boolean {
  if (!isActiveMember(m) || !m) return false;
  if (m.role === 'owner' || m.role === 'contractor') return true;
  return Boolean(m.canShareWorkspaceView);
}

/** Only active Contractor manages member download/share grants and Mandor scope */
export function canManageWorkspaceOutputGrants(
  m: EffectiveMemberCapabilities | null | undefined
): boolean {
  if (!isActiveMember(m) || !m) return false;
  return m.role === 'contractor';
}

/**
 * Mandor izin approval authority:
 * Reviewer must hold active membership with Mandor authority, be assigned to the worker's
 * team+division on that shift work date, and must NOT be the worker themselves (no self-review).
 */
export function canDecideIzinForShift(options: {
  reviewerUserId: string;
  reviewerMembership: EffectiveMemberCapabilities | null | undefined;
  shift: AttendanceShiftObligation;
}): { allowed: true } | { allowed: false; code: string; reason: string } {
  const { reviewerUserId, reviewerMembership, shift } = options;

  if (!isActiveMember(reviewerMembership) || !reviewerMembership) {
    return {
      allowed: false,
      code: 'FORBIDDEN_INACTIVE',
      reason: 'Active project membership is required to review izin requests.',
    };
  }

  if (reviewerUserId === shift.workerUserId) {
    return {
      allowed: false,
      code: 'SELF_REVIEW_FORBIDDEN',
      reason: 'You cannot approve or reject your own izin request.',
    };
  }

  if (!isEffectiveMandor(reviewerMembership)) {
    return {
      allowed: false,
      code: 'MANDOR_REQUIRED',
      reason: 'Only an eligible assigned Mandor can decide izin requests.',
    };
  }

  if (!shift.assignedMandorUserIds.includes(reviewerUserId)) {
    return {
      allowed: false,
      code: 'OUT_OF_MANDOR_SCOPE',
      reason: 'This worker is outside your assigned team and division for this shift.',
    };
  }

  return { allowed: true };
}

// ============================================================================
// 2. Worldwide IANA Timezone & Live Project Clock Formatting
// ============================================================================

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats weekday, date, live time to seconds, and IANA zone for any valid worldwide zone
 * (including UTC, DST zones, and fractional offsets like Asia/Kolkata or Asia/Kathmandu).
 */
export function formatProjectClock(date: Date, timezone: string): ProjectClockDisplay {
  const tz = isValidIanaTimezone(timezone) ? timezone.trim() : 'UTC';
  const valid = isValidIanaTimezone(timezone);

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(date);

  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

  const timeWithSeconds = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  let offsetLabel = tz;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart) offsetLabel = tzPart;
  } catch {
    offsetLabel = tz;
  }

  return {
    weekday,
    dateLabel,
    timeWithSeconds,
    timezone: tz,
    offsetLabel,
    valid,
  };
}

/**
 * Formats an exact UTC ms instant into YYYY-MM-DD HH:MM:SS in the project's IANA timezone.
 */
export function formatInstantInProjectZone(utcMs: number, timezone: string): string {
  const tz = isValidIanaTimezone(timezone) ? timezone.trim() : 'UTC';
  const d = new Date(utcMs);
  const datePart = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return `${datePart} ${timePart} (${tz})`;
}

// ============================================================================
// 3. Exact 1-Hour Cutoff & Automatic Alfa Engine
// ============================================================================

/**
 * Computes exact automatic-Alfa cutoff instant: shiftStart + 3,600 elapsed seconds.
 * Naturally handles DST transitions and overnight shifts (e.g., 23:30 -> 00:30 next calendar day)
 * while preserving the obligation's original workDate.
 */
export function computeShiftCutoffUtcMs(shift: AttendanceShiftObligation): number | null {
  if (shift.eligibility !== 'scheduled' || shift.shiftStartUtcMs === null) {
    return null;
  }
  return shift.shiftStartUtcMs + ALFA_CUTOFF_ELAPSED_MS;
}

/**
 * Evaluates effective attendance status for a single shift obligation at `nowUtcMs`,
 * implementing read-time overdue derivation so even if a background job is delayed,
 * a missed cutoff NEVER reads as `no_record_yet` at or after cutoff.
 */
export function deriveEffectiveAttendanceStatus(options: {
  shift: AttendanceShiftObligation;
  record: AttendanceRecordState | null;
  izin: IzinRequestRecord | null;
  nowUtcMs: number;
}): {
  attendanceStatus: EffectiveAttendanceStatus;
  requestStatus: IzinRequestStatus;
  cutoffUtcMs: number | null;
  needsAlfaPersistence: boolean;
  canSelfCheckIn: boolean;
  remainingSecondsToCutoff: number | null;
} {
  const { shift, record, izin, nowUtcMs } = options;

  if (shift.eligibility === 'missing_schedule' || shift.eligibility === 'ambiguous_schedule') {
    return {
      attendanceStatus: 'schedule_unavailable',
      requestStatus: izin ? izin.status : 'none',
      cutoffUtcMs: null,
      needsAlfaPersistence: false,
      canSelfCheckIn: false,
      remainingSecondsToCutoff: null,
    };
  }

  if (
    shift.eligibility === 'day_off' ||
    shift.eligibility === 'cancelled' ||
    shift.eligibility === 'attendance_disabled'
  ) {
    return {
      attendanceStatus: 'not_scheduled',
      requestStatus: izin ? izin.status : 'none',
      cutoffUtcMs: null,
      needsAlfaPersistence: false,
      canSelfCheckIn: false,
      remainingSecondsToCutoff: null,
    };
  }

  const cutoffUtcMs = computeShiftCutoffUtcMs(shift);
  const requestStatus: IzinRequestStatus = izin ? izin.status : 'none';

  // Approved Izin (when not already Present) yields excused Izin attendance status
  if (record?.status === 'izin' || (izin?.status === 'approved' && record?.status !== 'present')) {
    return {
      attendanceStatus: 'izin',
      requestStatus: 'approved',
      cutoffUtcMs,
      needsAlfaPersistence: false,
      canSelfCheckIn: false,
      remainingSecondsToCutoff:
        cutoffUtcMs !== null ? Math.max(0, Math.floor((cutoffUtcMs - nowUtcMs) / 1000)) : null,
    };
  }

  // Accepted check-in before cutoff -> Present
  if (record?.status === 'present') {
    return {
      attendanceStatus: 'present',
      requestStatus,
      cutoffUtcMs,
      needsAlfaPersistence: false,
      canSelfCheckIn: false,
      remainingSecondsToCutoff:
        cutoffUtcMs !== null ? Math.max(0, Math.floor((cutoffUtcMs - nowUtcMs) / 1000)) : null,
    };
  }

  // Strict boundary check: `< cutoffUtcMs` is still within window; `>= cutoffUtcMs` is Alfa
  if (cutoffUtcMs !== null && nowUtcMs >= cutoffUtcMs) {
    const alreadyPersistedAlfa = record?.status === 'alfa';
    return {
      attendanceStatus: 'alfa',
      requestStatus,
      cutoffUtcMs,
      needsAlfaPersistence: !alreadyPersistedAlfa,
      canSelfCheckIn: false,
      remainingSecondsToCutoff: 0,
    };
  }

  // Pre-cutoff with no check-in and no approved leave -> No record yet (even if izin is Pending!)
  return {
    attendanceStatus: 'no_record_yet',
    requestStatus,
    cutoffUtcMs,
    needsAlfaPersistence: false,
    canSelfCheckIn: true,
    remainingSecondsToCutoff:
      cutoffUtcMs !== null ? Math.max(0, Math.ceil((cutoffUtcMs - nowUtcMs) / 1000)) : null,
  };
}

/**
 * Evaluates a worker check-in attempt using trusted server receipt time (ignoring client clock).
 * Strict boundary: `serverReceiptUtcMs < cutoffUtcMs` -> accepted (Present).
 * `serverReceiptUtcMs >= cutoffUtcMs` -> rejected as past cutoff (Alfa applies).
 */
export function evaluateCheckInAttempt(options: {
  shift: AttendanceShiftObligation;
  existingRecord: AttendanceRecordState | null;
  existingIzin: IzinRequestRecord | null;
  serverReceiptUtcMs: number;
}):
  | {
      accepted: true;
      reconciledFromAlfa: boolean;
      nextRecord: AttendanceRecordState;
    }
  | {
      accepted: false;
      code:
        | 'SCHEDULE_UNAVAILABLE'
        | 'NOT_SCHEDULED'
        | 'ALREADY_PRESENT'
        | 'APPROVED_IZIN_CONFLICT'
        | 'PAST_CUTOFF';
      message: string;
    } {
  const { shift, existingRecord, existingIzin, serverReceiptUtcMs } = options;

  if (shift.eligibility === 'missing_schedule' || shift.eligibility === 'ambiguous_schedule') {
    return {
      accepted: false,
      code: 'SCHEDULE_UNAVAILABLE',
      message: 'Schedule unavailable for this date. Contact your Mandor or Contractor.',
    };
  }

  if (shift.eligibility !== 'scheduled') {
    return {
      accepted: false,
      code: 'NOT_SCHEDULED',
      message: 'No active shift requires check-in on this date.',
    };
  }

  if (existingRecord?.status === 'present') {
    return {
      accepted: false,
      code: 'ALREADY_PRESENT',
      message: 'Check-in has already been recorded as Present for this shift.',
    };
  }

  if (existingRecord?.status === 'izin' || existingIzin?.status === 'approved') {
    return {
      accepted: false,
      code: 'APPROVED_IZIN_CONFLICT',
      message: 'An approved Izin already applies to this shift. Use the correction workflow.',
    };
  }

  const cutoffUtcMs = computeShiftCutoffUtcMs(shift);
  if (cutoffUtcMs === null) {
    return {
      accepted: false,
      code: 'SCHEDULE_UNAVAILABLE',
      message: 'Shift start time is missing.',
    };
  }

  // Exact cutoff instant (e.g. 09:00:00) is NOT accepted (< cutoffUtcMs only)
  if (serverReceiptUtcMs >= cutoffUtcMs) {
    return {
      accepted: false,
      code: 'PAST_CUTOFF',
      message: `Check-in window closed at ${formatInstantInProjectZone(cutoffUtcMs, shift.timezone)}. Attendance is marked Alfa; submit an Izin request with photo evidence if excused.`,
    };
  }

  const reconciledFromAlfa = existingRecord?.status === 'alfa';
  return {
    accepted: true,
    reconciledFromAlfa,
    nextRecord: {
      obligationId: shift.id,
      projectId: shift.projectId,
      workerUserId: shift.workerUserId,
      workDate: shift.workDate,
      division: shift.division,
      status: 'present',
      checkInReceivedAtUtcMs: serverReceiptUtcMs,
      effectiveAtUtcMs: serverReceiptUtcMs,
      recordedAtUtcMs: serverReceiptUtcMs,
      markedBy: reconciledFromAlfa ? 'reconciliation' : 'worker',
      version: (existingRecord?.version ?? 0) + 1,
    },
  };
}

// ============================================================================
// 4. Department Daily Attendance & Overview Pin Dashboard Helpers
// ============================================================================

export function computeDepartmentDailyAttendance(options: {
  shifts: AttendanceShiftObligation[];
  recordsByObligationId: Map<string, AttendanceRecordState>;
  izinByObligationId: Map<string, IzinRequestRecord>;
  workDate: string;
  timezone: string;
  division: Department | 'All';
  nowUtcMs: number;
}): DepartmentAttendanceDayMetric {
  const { shifts, recordsByObligationId, izinByObligationId, workDate, timezone, division, nowUtcMs } =
    options;

  const matchingShifts = shifts.filter(
    (s) => s.workDate === workDate && (division === 'All' || s.division === division)
  );

  let presentCount = 0;
  let alfaCount = 0;
  let excusedIzinCount = 0;
  let pendingIzinCount = 0;
  let noRecordYetCount = 0;
  let scheduleUnavailableCount = 0;

  for (const shift of matchingShifts) {
    const rec = recordsByObligationId.get(shift.id) ?? null;
    const izin = izinByObligationId.get(shift.id) ?? null;
    const derived = deriveEffectiveAttendanceStatus({ shift, record: rec, izin, nowUtcMs });

    if (
      derived.requestStatus === 'pending' ||
      derived.requestStatus === 'awaiting_mandor_assignment'
    ) {
      pendingIzinCount += 1;
    }

    switch (derived.attendanceStatus) {
      case 'present':
        presentCount += 1;
        break;
      case 'alfa':
        alfaCount += 1;
        break;
      case 'izin':
        excusedIzinCount += 1;
        break;
      case 'no_record_yet':
        noRecordYetCount += 1;
        break;
      case 'schedule_unavailable':
        scheduleUnavailableCount += 1;
        break;
      case 'not_scheduled':
        break;
    }
  }

  const rateDenominator = presentCount + alfaCount;
  const attendanceRatePercent =
    rateDenominator > 0 ? Math.round((presentCount / rateDenominator) * 1000) / 10 : null;
  const isPartialCoverage = noRecordYetCount > 0;
  const eligibleForRanking = !isPartialCoverage && rateDenominator > 0;

  const excusedSuffix = excusedIzinCount > 0 ? ` · ${excusedIzinCount} excused` : '';
  const summaryLabel =
    rateDenominator > 0
      ? `${presentCount}/${rateDenominator} present${excusedSuffix}`
      : excusedIzinCount > 0
        ? `0/0 finalized · ${excusedIzinCount} excused`
        : isPartialCoverage
          ? `${noRecordYetCount} shift${noRecordYetCount === 1 ? '' : 's'} still within check-in window`
          : 'No scheduled shifts';

  return {
    workDate,
    timezone,
    division,
    presentCount,
    alfaCount,
    excusedIzinCount,
    pendingIzinCount,
    noRecordYetCount,
    scheduleUnavailableCount,
    rateDenominator,
    attendanceRatePercent,
    isPartialCoverage,
    eligibleForRanking,
    summaryLabel,
  };
}

/**
 * Overview Department Work-Pin Dashboard helper (L04):
 * - Donut computes approved Pins / eligible Pins using FULL filtered Pin counts (never truncated).
 * - Recent Pin list is strictly capped at 7 distinct Pins across the filtered departments,
 *   sorted newest-first so creating an 8th Pin increments the total and enters the top of the list.
 */
export function computeDepartmentPinDashboard(
  pins: SpatialPin[],
  departmentFilter: Department | 'All'
): {
  totalEligiblePins: number;
  approvedPins: number;
  pendingReviewPins: number;
  inProgressPins: number;
  openPins: number;
  completionPercent: number;
  recentDistinctPins: SpatialPin[];
  totalAcrossAllDepartments: number;
} {
  const filtered =
    departmentFilter === 'All' ? pins : pins.filter((p) => p.department === departmentFilter);

  const seenIds = new Set<string>();
  const distinctFiltered: SpatialPin[] = [];
  for (const pin of filtered) {
    if (!seenIds.has(pin.id)) {
      seenIds.add(pin.id);
      distinctFiltered.push(pin);
    }
  }

  let approvedPins = 0;
  let pendingReviewPins = 0;
  let inProgressPins = 0;
  let openPins = 0;

  for (const p of distinctFiltered) {
    if (p.status === 'approved') approvedPins += 1;
    else if (p.status === 'pending_review') pendingReviewPins += 1;
    else if (p.status === 'in_progress') inProgressPins += 1;
    else openPins += 1;
  }

  const totalEligiblePins = distinctFiltered.length;
  const completionPercent =
    totalEligiblePins > 0 ? Math.round((approvedPins / totalEligiblePins) * 100) : 0;

  // Sort newest createdAt first (fallback stable reverse order for ties) and cap strictly at 7 distinct Pins
  const recentDistinctPins = [...distinctFiltered]
    .sort((a, b) => {
      const cmp = b.createdAt.localeCompare(a.createdAt);
      if (cmp !== 0) return cmp;
      return b.id.localeCompare(a.id);
    })
    .slice(0, 7);

  return {
    totalEligiblePins,
    approvedPins,
    pendingReviewPins,
    inProgressPins,
    openPins,
    completionPercent,
    recentDistinctPins,
    totalAcrossAllDepartments: pins.length,
  };
}

export function formatAttendanceStatusLabel(status: EffectiveAttendanceStatus): string {
  switch (status) {
    case 'no_record_yet':
      return 'No record yet';
    case 'present':
      return 'Present';
    case 'alfa':
      return 'Alfa';
    case 'izin':
      return 'Izin';
    case 'schedule_unavailable':
      return 'Schedule unavailable';
    case 'not_scheduled':
      return 'Not scheduled';
  }
}

export function formatIzinRequestStatusLabel(status: IzinRequestStatus): string {
  switch (status) {
    case 'none':
      return 'No request';
    case 'pending':
      return 'Awaiting Foreman review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'awaiting_mandor_assignment':
      return 'Awaiting Foreman assignment';
    case 'conflict_requires_correction':
      return 'Needs correction workflow';
  }
}
