import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canEditProjectSettings,
  canManageProjectAccess,
  canPublishModel,
  isValidTimezone,
  sanitizeAuditValues,
  validateDeleteProjectPhrase,
  validateProjectDraftInput,
  validateProjectPasswordChangeInput,
  type AuditEventRecord,
  type AuditObjectType,
  type AuditResult,
  type AuditScope,
  type AuthorizedProject,
  type BlueprintAssetRecord,
  type BlueprintCalibration,
  type BlueprintGeometryProposal,
  type BlueprintImpactSummary,
  type BlueprintStatus,
  type BuiltAreaModelSpec,
  type ModelVersionRecord,
  type ModelVersionStatus,
  type PendingInvitationRecord,
  type PinRemapDecision,
  type PlanRegionNormalized,
  type ProcessingJobRecord,
  type ProjectAreaRecord,
  type ProjectBlueprintRecord,
  type ProjectMembership,
  type ProjectPinRecord,
  type ProjectRole,
  type ProjectStatus,
  type UserProfile,
} from '../domain/accountTypes';
import {
  buildDeterministicAreaModel,
  buildRoomDefinitionFromBoundary,
  evaluatePinAnchorImpact,
  validateBlueprintUploadFile,
  validateCalibration,
  validateClosedRoomBoundary,
  validateGeometryProposal,
} from '../domain/blueprintGeometry';
import {
  AiProviderUnavailableError,
  GeminiBlueprintExtractor,
  type BlueprintAiExtractor,
} from './blueprintAiExtractor';
import { hashProjectPassword, verifyProjectPassword } from './passwordHash';
import {
  checkResendThrottle,
  createPasswordChangeChallenge,
  verifyPasswordChangeChallenge,
  type PasswordChangeChallengeRecord,
} from '../domain/passwordChangeChallenge';

export type PasswordChallengeEmailSender = (input: {
  toEmail: string;
  userId: string;
  code: string;
  expiresAtIso: string;
}) => Promise<{ delivered: boolean; error?: string }>;

export interface AuthenticatedActor {
  userId: string;
  email: string;
  displayName: string;
}

export class ServiceError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: {
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.details = options?.details;
  }
}

export interface StoredPrivateAssetBlob {
  assetId: string;
  projectId: string;
  fileName: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  buffer: Buffer;
}

export interface PrivateAssetStorage {
  put(blob: StoredPrivateAssetBlob): Promise<string>;
  get(projectId: string, assetId: string): Promise<StoredPrivateAssetBlob | null>;
  deleteAsset(projectId: string, assetId: string): Promise<void>;
}

export class InMemoryPrivateAssetStorage implements PrivateAssetStorage {
  private readonly store = new Map<string, StoredPrivateAssetBlob>();

  private key(projectId: string, assetId: string): string {
    return `${projectId}/${assetId}`;
  }

  async put(blob: StoredPrivateAssetBlob): Promise<string> {
    const k = this.key(blob.projectId, blob.assetId);
    this.store.set(k, { ...blob, buffer: Buffer.from(blob.buffer) });
    return `private://${k}`;
  }

  async get(projectId: string, assetId: string): Promise<StoredPrivateAssetBlob | null> {
    const found = this.store.get(this.key(projectId, assetId));
    return found ? { ...found, buffer: Buffer.from(found.buffer) } : null;
  }

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    this.store.delete(this.key(projectId, assetId));
  }
}

export class SupabasePrivateAssetStorage implements PrivateAssetStorage {
  private readonly client: SupabaseClient;
  private readonly bucket: string;
  private readonly memoryCache = new InMemoryPrivateAssetStorage();

  constructor(client: SupabaseClient, bucket = 'vonta-blueprints') {
    this.client = client;
    this.bucket = bucket;
  }

  private objectPath(projectId: string, assetId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${projectId}/${assetId}/${safeName}`;
  }

  async put(blob: StoredPrivateAssetBlob): Promise<string> {
    await this.memoryCache.put(blob);
    const storagePath = this.objectPath(blob.projectId, blob.assetId, blob.fileName);
    const { error } = await this.client.storage.from(this.bucket).upload(storagePath, blob.buffer, {
      contentType: blob.mimeType,
      upsert: true,
    });
    if (error) {
      throw new ServiceError(
        502,
        'STORAGE_UPLOAD_FAILED',
        `Could not store blueprint file in private storage (${error.message}).`
      );
    }
    return storagePath;
  }

  async get(projectId: string, assetId: string): Promise<StoredPrivateAssetBlob | null> {
    const cached = await this.memoryCache.get(projectId, assetId);
    if (cached) return cached;
    const { data: assetRow } = await this.client
      .from('blueprint_assets')
      .select('storage_path, file_name, mime_type')
      .eq('id', assetId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (!assetRow?.storage_path) return null;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(String(assetRow.storage_path));
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    return {
      assetId,
      projectId,
      fileName: String(assetRow.file_name),
      mimeType: assetRow.mime_type as 'application/pdf' | 'image/png' | 'image/jpeg',
      buffer: Buffer.from(ab),
    };
  }

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    await this.memoryCache.deleteAsset(projectId, assetId);
    const { data: assetRow } = await this.client
      .from('blueprint_assets')
      .select('storage_path')
      .eq('id', assetId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (assetRow?.storage_path) {
      await this.client.storage.from(this.bucket).remove([String(assetRow.storage_path)]);
    }
  }
}

export interface ProjectSecretRecord {
  projectId: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: string | null;
  updatedAt: string;
}

export interface StoredProjectRecord {
  id: string;
  name: string;
  contractorDisplayName: string;
  timezone: string;
  status: ProjectStatus;
  draftStep: 1 | 2 | 3;
  draftKey: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AppendAuditInput {
  scope: AuditScope;
  projectId: string | null;
  actorUserId: string;
  actorName: string;
  action: string;
  objectType: AuditObjectType;
  objectId: string;
  objectLabel: string;
  result: AuditResult;
  reason?: string | null;
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
}

export interface HistoryFilterInput {
  objectType?: AuditObjectType;
  objectId?: string;
}

export interface VontaStoreRepository {
  getProfile(userId: string, fallbackEmail: string, fallbackName: string): Promise<UserProfile>;
  updateProfile(
    userId: string,
    expectedVersion: number,
    patch: {
      displayName?: string;
      phoneNumber?: string;
      phoneStatus?: 'contact_only' | 'verified';
      displayTimezone?: string;
      pendingEmail?: string | null;
    }
  ): Promise<{ ok: true; profile: UserProfile } | { ok: false; code: 'STALE_RECORD' }>;

  listMembershipsForUser(userId: string, email: string): Promise<ProjectMembership[]>;
  getMembership(projectId: string, userId: string): Promise<ProjectMembership | null>;
  getProjectById(projectId: string): Promise<StoredProjectRecord | null>;
  listBlueprintsForProject(projectId: string): Promise<ProjectBlueprintRecord[]>;
  findActiveDraftByKey(userId: string, draftKey: string): Promise<StoredProjectRecord | null>;
  findLatestDraftForUser(userId: string): Promise<StoredProjectRecord | null>;

  createProjectDraftAtomic(input: {
    creatorUserId: string;
    actorName: string;
    name: string;
    contractorDisplayName: string;
    timezone: string;
    draftKey: string;
    passwordHash: string;
  }): Promise<{ project: StoredProjectRecord; resumed: boolean }>;

  updateProjectGeneral(
    projectId: string,
    expectedVersion: number,
    patch: {
      name: string;
      contractorDisplayName: string;
      timezone: string;
      draftStep?: 1 | 2 | 3;
    }
  ): Promise<{ ok: true; project: StoredProjectRecord } | { ok: false; code: 'STALE_RECORD' | 'NOT_FOUND' }>;

  updateProjectStatus(
    projectId: string,
    status: ProjectStatus,
    draftStep?: 1 | 2 | 3
  ): Promise<StoredProjectRecord | null>;

  softDeleteProject(projectId: string): Promise<StoredProjectRecord | null>;

  upsertDraftBlueprint(input: {
    id?: string;
    projectId: string;
    areaId?: string;
    areaName: string;
    sheetCode: string;
    revision: string;
    fileName: string | null;
    status: BlueprintStatus;
  }): Promise<ProjectBlueprintRecord>;

  updateBlueprintStatus(
    projectId: string,
    blueprintId: string,
    status: BlueprintStatus,
    fileName?: string | null
  ): Promise<ProjectBlueprintRecord | null>;

  // Areas
  listAreas(projectId: string): Promise<ProjectAreaRecord[]>;
  createArea(input: {
    projectId: string;
    name: string;
    sortOrder: number;
    isRegisteredInCommonFrame: boolean;
    frameOffsetXM?: number;
    frameOffsetYM?: number;
    frameOffsetZM?: number;
  }): Promise<ProjectAreaRecord>;
  updateAreaActiveModel(
    projectId: string,
    areaId: string,
    activeModelVersionId: string | null
  ): Promise<ProjectAreaRecord | null>;

  // Blueprint Assets
  listAssets(projectId: string): Promise<BlueprintAssetRecord[]>;
  getAssetById(projectId: string, assetId: string): Promise<BlueprintAssetRecord | null>;
  createAsset(input: {
    id: string;
    projectId: string;
    areaId: string;
    areaName: string;
    sheetCode: string;
    revision: string;
    fileName: string;
    mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
    sizeBytes: number;
    storagePath: string;
    planPage: number;
    planRegion: PlanRegionNormalized;
    calibration: BlueprintCalibration;
    status: BlueprintStatus;
    uploadedBy: string;
  }): Promise<BlueprintAssetRecord>;
  updateAssetStatus(
    projectId: string,
    assetId: string,
    status: BlueprintStatus
  ): Promise<BlueprintAssetRecord | null>;

  // Processing Jobs
  listJobs(projectId: string): Promise<ProcessingJobRecord[]>;
  getJobById(projectId: string, jobId: string): Promise<ProcessingJobRecord | null>;
  findJobBySubmissionKey(projectId: string, submissionKey: string): Promise<ProcessingJobRecord | null>;
  createJob(input: {
    projectId: string;
    areaId: string;
    blueprintAssetId: string;
    submissionKey: string;
    mode: 'initial' | 'replacement';
    replacesModelVersionId: string | null;
    createdBy: string;
  }): Promise<ProcessingJobRecord>;
  updateJob(job: ProcessingJobRecord): Promise<ProcessingJobRecord>;

  // Model Versions
  listModelVersions(projectId: string): Promise<ModelVersionRecord[]>;
  getModelVersionById(projectId: string, versionId: string): Promise<ModelVersionRecord | null>;
  createModelVersion(input: Omit<ModelVersionRecord, 'createdAt'>): Promise<ModelVersionRecord>;
  updateModelVersionStatus(
    projectId: string,
    versionId: string,
    status: ModelVersionStatus
  ): Promise<ModelVersionRecord | null>;
  updateModelVersionGeometry(
    projectId: string,
    versionId: string,
    geometry: BuiltAreaModelSpec
  ): Promise<ModelVersionRecord | null>;

  // Project Pins
  listPins(projectId: string): Promise<ProjectPinRecord[]>;
  createPin(projectId: string, pin: ProjectPinRecord): Promise<ProjectPinRecord>;
  updatePin(projectId: string, pin: ProjectPinRecord): Promise<ProjectPinRecord>;

  getProjectSecret(projectId: string): Promise<ProjectSecretRecord | null>;
  updateProjectSecret(secret: ProjectSecretRecord): Promise<void>;

  appendAuditEvent(event: AppendAuditInput): Promise<AuditEventRecord>;
  listAuditEvents(filter: {
    scope: AuditScope;
    projectId?: string;
    actorUserId?: string;
    objectType?: AuditObjectType;
    objectId?: string;
  }): Promise<AuditEventRecord[]>;
}

const MAX_FAILED_PASSWORD_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export class VontaDomainService {
  private readonly repo: VontaStoreRepository;
  private readonly nowFn: () => Date;
  private readonly aiExtractor: BlueprintAiExtractor;
  private readonly assetStorage: PrivateAssetStorage;
  private readonly passwordChallenges = new Map<string, PasswordChangeChallengeRecord>();
  private readonly latestChallengeIdByUser = new Map<string, string>();
  private readonly sendPasswordChallengeEmail?: PasswordChallengeEmailSender;

  constructor(
    repo: VontaStoreRepository,
    nowFn: () => Date = () => new Date(),
    deps?: {
      aiExtractor?: BlueprintAiExtractor;
      assetStorage?: PrivateAssetStorage;
      sendPasswordChallengeEmail?: PasswordChallengeEmailSender;
    }
  ) {
    this.repo = repo;
    this.nowFn = nowFn;
    this.aiExtractor = deps?.aiExtractor ?? new GeminiBlueprintExtractor();
    this.assetStorage = deps?.assetStorage ?? new InMemoryPrivateAssetStorage();
    this.sendPasswordChallengeEmail = deps?.sendPasswordChallengeEmail;
  }

  private async toAuthorizedProject(
    project: StoredProjectRecord,
    membership: ProjectMembership
  ): Promise<AuthorizedProject> {
    const [blueprints, areas, assets, jobs, modelVersions, pins] = await Promise.all([
      this.repo.listBlueprintsForProject(project.id),
      this.repo.listAreas(project.id),
      this.repo.listAssets(project.id),
      this.repo.listJobs(project.id),
      this.repo.listModelVersions(project.id),
      this.repo.listPins(project.id),
    ]);

    return {
      id: project.id,
      name: project.name,
      contractorDisplayName: project.contractorDisplayName,
      timezone: project.timezone,
      status: project.status,
      draftStep: project.draftStep,
      draftKey: project.draftKey,
      version: project.version,
      createdBy: project.createdBy,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      membership: {
        role: membership.role,
        hasMandorGrant: membership.hasMandorGrant,
        hasAccountingGrant: membership.hasAccountingGrant,
        status: membership.status,
      },
      blueprints,
      areas,
      assets,
      jobs,
      modelVersions,
      pins,
    };
  }

  private async requireActiveContractor(actor: AuthenticatedActor, projectId: string) {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(403, 'FORBIDDEN', 'You do not have active access to this project.');
    }
    if (!canEditProjectSettings(membership.role)) {
      throw new ServiceError(
        403,
        'FORBIDDEN_ROLE',
        'Only an active project Contractor can perform this operation.'
      );
    }
    const project = await this.repo.getProjectById(projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    return { membership, project };
  }

  async listAuthorizedProjects(actor: AuthenticatedActor): Promise<{
    projects: AuthorizedProject[];
    pendingInvitations: PendingInvitationRecord[];
    activeDraft: AuthorizedProject | null;
  }> {
    const memberships = await this.repo.listMembershipsForUser(actor.userId, actor.email);
    const projects: AuthorizedProject[] = [];
    const pendingInvitations: PendingInvitationRecord[] = [];
    let activeDraft: AuthorizedProject | null = null;

    for (const m of memberships) {
      const project = await this.repo.getProjectById(m.projectId);
      if (!project || project.status === 'deleted' || project.deletedAt) continue;

      if (m.status === 'active') {
        const authProj = await this.toAuthorizedProject(project, m);
        projects.push(authProj);
        if (project.status === 'draft' && project.createdBy === actor.userId && !activeDraft) {
          activeDraft = authProj;
        }
      } else if (m.status === 'invited') {
        pendingInvitations.push({
          id: m.id,
          projectId: project.id,
          projectName: project.name,
          role: m.role,
          invitedEmail: m.invitedEmail ?? actor.email,
          createdAt: project.createdAt,
        });
      }
    }

    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { projects, pendingInvitations, activeDraft };
  }

  async getProjectDetail(actor: AuthenticatedActor, projectId: string): Promise<AuthorizedProject> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(
        403,
        'FORBIDDEN',
        'You do not have active membership access to this project.'
      );
    }
    const project = await this.repo.getProjectById(projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'This project could not be found.');
    }
    return this.toAuthorizedProject(project, membership);
  }

  async getActiveDraft(actor: AuthenticatedActor): Promise<AuthorizedProject | null> {
    const draft = await this.repo.findLatestDraftForUser(actor.userId);
    if (!draft || draft.status !== 'draft' || draft.deletedAt) return null;
    const membership = await this.repo.getMembership(draft.id, actor.userId);
    if (!membership || membership.status !== 'active' || !canEditProjectSettings(membership.role)) {
      return null;
    }
    return this.toAuthorizedProject(draft, membership);
  }

  async createOrResumeProjectDraft(
    actor: AuthenticatedActor,
    input: {
      name: string;
      contractorDisplayName: string;
      projectPassword: string;
      confirmProjectPassword: string;
      timezone: string;
      draftKey?: string;
      existingDraftProjectId?: string;
    }
  ): Promise<{ project: AuthorizedProject; resumed: boolean }> {
    if (input.existingDraftProjectId) {
      const existingMembership = await this.repo.getMembership(
        input.existingDraftProjectId,
        actor.userId
      );
      if (!existingMembership || existingMembership.status !== 'active') {
        throw new ServiceError(403, 'FORBIDDEN', 'You cannot modify this project draft.');
      }
      if (!canEditProjectSettings(existingMembership.role)) {
        throw new ServiceError(
          403,
          'FORBIDDEN_ROLE',
          'Only a project Contractor can edit or promote a project draft.'
        );
      }
      const existingProject = await this.repo.getProjectById(input.existingDraftProjectId);
      if (!existingProject || existingProject.deletedAt) {
        throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Draft project not found.');
      }

      const fieldErrors = validateProjectDraftInput({
        ...input,
        requirePassword: false,
      });
      if (Object.keys(fieldErrors).length > 0) {
        throw new ServiceError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fieldErrors: { ...fieldErrors } as Record<string, string>,
        });
      }
      if (!isValidTimezone(input.timezone)) {
        throw new ServiceError(400, 'VALIDATION_ERROR', 'Invalid project timezone.', {
          fieldErrors: { timezone: 'Select a valid IANA timezone.' },
        });
      }

      const updated = await this.repo.updateProjectGeneral(
        existingProject.id,
        existingProject.version,
        {
          name: input.name.trim(),
          contractorDisplayName: input.contractorDisplayName.trim(),
          timezone: input.timezone.trim(),
          draftStep: existingProject.draftStep < 2 ? 2 : existingProject.draftStep,
        }
      );
      if (!updated.ok) {
        throw new ServiceError(
          409,
          'STALE_RECORD',
          'This draft was updated elsewhere. Reload and try again.'
        );
      }

      await this.repo.appendAuditEvent({
        scope: 'project',
        projectId: existingProject.id,
        actorUserId: actor.userId,
        actorName: actor.displayName,
        action: 'project.draft_updated',
        objectType: 'project',
        objectId: existingProject.id,
        objectLabel: updated.project.name,
        result: 'success',
        beforeSummary: {
          name: existingProject.name,
          contractorDisplayName: existingProject.contractorDisplayName,
          timezone: existingProject.timezone,
        },
        afterSummary: {
          name: updated.project.name,
          contractorDisplayName: updated.project.contractorDisplayName,
          timezone: updated.project.timezone,
        },
      });

      return {
        project: await this.toAuthorizedProject(updated.project, existingMembership),
        resumed: true,
      };
    }

    const fieldErrors = validateProjectDraftInput({
      ...input,
      requirePassword: true,
    });
    if (Object.keys(fieldErrors).length > 0) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
        fieldErrors: { ...fieldErrors } as Record<string, string>,
      });
    }
    if (!isValidTimezone(input.timezone)) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Invalid project timezone.', {
        fieldErrors: { timezone: 'Select a valid IANA timezone.' },
      });
    }

    const draftKey = (input.draftKey && input.draftKey.trim()) || `draft-${randomUUID()}`;
    const existingByKey = await this.repo.findActiveDraftByKey(actor.userId, draftKey);
    if (existingByKey) {
      const m = await this.repo.getMembership(existingByKey.id, actor.userId);
      if (m && m.status === 'active') {
        return {
          project: await this.toAuthorizedProject(existingByKey, m),
          resumed: true,
        };
      }
    }

    const passwordHash = hashProjectPassword(input.projectPassword);
    const created = await this.repo.createProjectDraftAtomic({
      creatorUserId: actor.userId,
      actorName: actor.displayName,
      name: input.name.trim(),
      contractorDisplayName: input.contractorDisplayName.trim(),
      timezone: input.timezone.trim(),
      draftKey,
      passwordHash,
    });

    const membership = await this.repo.getMembership(created.project.id, actor.userId);
    if (!membership) {
      throw new ServiceError(500, 'MEMBERSHIP_INIT_FAILED', 'Creator membership was not created.');
    }

    return {
      project: await this.toAuthorizedProject(created.project, membership),
      resumed: created.resumed,
    };
  }

  async saveDraftBlueprintStep(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      areaName: string;
      sheetCode: string;
      revision: string;
      fileName?: string | null;
    }
  ): Promise<AuthorizedProject> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);

    const fieldErrors: Record<string, string> = {};
    if (!input.areaName.trim()) fieldErrors.areaName = 'Area name is required.';
    if (!input.sheetCode.trim()) fieldErrors.sheetCode = 'Sheet code is required.';
    if (!input.revision.trim()) fieldErrors.revision = 'Revision is required.';
    if (Object.keys(fieldErrors).length > 0) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Check the blueprint details.', {
        fieldErrors,
      });
    }

    const bp = await this.repo.upsertDraftBlueprint({
      projectId: project.id,
      areaName: input.areaName.trim(),
      sheetCode: input.sheetCode.trim(),
      revision: input.revision.trim(),
      fileName: input.fileName?.trim() || null,
      status: input.fileName?.trim() ? 'uploaded' : 'pending_upload',
    });

    const updated = await this.repo.updateProjectGeneral(project.id, project.version, {
      name: project.name,
      contractorDisplayName: project.contractorDisplayName,
      timezone: project.timezone,
      draftStep: 3,
    });

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'blueprint.draft_registered',
      objectType: 'blueprint',
      objectId: bp.id,
      objectLabel: `${bp.areaName} · ${bp.sheetCode} ${bp.revision}`,
      result: 'success',
      afterSummary: {
        areaName: bp.areaName,
        sheetCode: bp.sheetCode,
        revision: bp.revision,
        status: bp.status,
      },
    });

    const finalProject = updated.ok ? updated.project : project;
    return this.toAuthorizedProject(finalProject, membership);
  }

  /**
   * Prompt 3: Add a new named area (floor, wing, or building) to an existing project.
   */
  async addProjectArea(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      name: string;
      isRegisteredInCommonFrame?: boolean;
      frameOffsetXM?: number;
      frameOffsetYM?: number;
      frameOffsetZM?: number;
    }
  ): Promise<{ area: ProjectAreaRecord; project: AuthorizedProject }> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);
    const trimmedName = (input.name ?? '').trim();
    if (!trimmedName) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Area name is required.', {
        fieldErrors: { areaName: 'Area name is required.' },
      });
    }

    const existingAreas = await this.repo.listAreas(project.id);
    if (existingAreas.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new ServiceError(
        409,
        'DUPLICATE_AREA_NAME',
        `An area named "${trimmedName}" already exists in ${project.name}.`,
        { fieldErrors: { areaName: 'Use a distinct name for each area.' } }
      );
    }

    const area = await this.repo.createArea({
      projectId: project.id,
      name: trimmedName,
      sortOrder: existingAreas.length,
      isRegisteredInCommonFrame:
        input.isRegisteredInCommonFrame !== undefined
          ? Boolean(input.isRegisteredInCommonFrame)
          : existingAreas.length === 0,
      frameOffsetXM: input.frameOffsetXM ?? 0,
      frameOffsetYM: input.frameOffsetYM ?? 0,
      frameOffsetZM: input.frameOffsetZM ?? 0,
    });

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'area.created',
      objectType: 'area',
      objectId: area.id,
      objectLabel: area.name,
      result: 'success',
      afterSummary: {
        areaId: area.id,
        areaName: area.name,
        isRegisteredInCommonFrame: area.isRegisteredInCommonFrame,
      },
    });

    return {
      area,
      project: await this.toAuthorizedProject(project, membership),
    };
  }

  /**
   * Prompt 3: Durable server-side blueprint upload + calibration validation + AI extraction job.
   * Idempotent by (projectId, submissionKey).
   * Never marks a project ready when processing fails; never fabricates geometry when AI is unavailable.
   */
  async submitBlueprintJob(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      areaId?: string;
      areaName?: string;
      isRegisteredInCommonFrame?: boolean;
      sheetCode: string;
      revision: string;
      fileName: string;
      mimeType: string;
      base64Data: string;
      planPage?: number;
      planRegion?: PlanRegionNormalized;
      calibration: BlueprintCalibration;
      submissionKey?: string;
      mode?: 'initial' | 'replacement';
      replacesModelVersionId?: string | null;
    }
  ): Promise<{
    job: ProcessingJobRecord;
    asset: BlueprintAssetRecord;
    area: ProjectAreaRecord;
    project: AuthorizedProject;
    deduplicated: boolean;
  }> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);

    const submissionKey = (input.submissionKey || '').trim() || `job-${randomUUID()}`;
    const existingJob = await this.repo.findJobBySubmissionKey(project.id, submissionKey);
    if (existingJob) {
      const existingAsset = await this.repo.getAssetById(project.id, existingJob.blueprintAssetId);
      const areas = await this.repo.listAreas(project.id);
      const existingArea = areas.find((a) => a.id === existingJob.areaId);
      if (existingAsset && existingArea) {
        return {
          job: existingJob,
          asset: existingAsset,
          area: existingArea,
          project: await this.toAuthorizedProject(project, membership),
          deduplicated: true,
        };
      }
    }

    const sheetCode = (input.sheetCode || '').trim();
    const revision = (input.revision || '').trim();
    const fieldErrors: Record<string, string> = {};
    if (!sheetCode) fieldErrors.sheetCode = 'Sheet code is required.';
    if (!revision) fieldErrors.revision = 'Revision is required.';

    const cleanBase64 = (input.base64Data || '').replace(/^data:[^;]+;base64,/, '').trim();
    const fileBuffer = cleanBase64 ? Buffer.from(cleanBase64, 'base64') : Buffer.alloc(0);

    const fileCheck = validateBlueprintUploadFile({
      fileName: input.fileName || '',
      mimeType: input.mimeType || '',
      sizeBytes: fileBuffer.length,
    });
    if (!fileCheck.valid) {
      throw new ServiceError(
        400,
        fileCheck.code ?? 'UNSUPPORTED_FILE',
        fileCheck.message ?? 'Unsupported blueprint file.',
        { fieldErrors: { file: fileCheck.message ?? 'Unsupported blueprint file.' } }
      );
    }

    const calErrors = validateCalibration(input.calibration);
    if (calErrors.length > 0) {
      throw new ServiceError(400, 'MISSING_SCALE', calErrors[0], {
        fieldErrors: { calibration: calErrors.join(' ') },
      });
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Check the blueprint metadata fields.', {
        fieldErrors,
      });
    }

    // Resolve or create target area
    const areas = await this.repo.listAreas(project.id);
    let area: ProjectAreaRecord | undefined;
    if (input.areaId) {
      area = areas.find((a) => a.id === input.areaId);
      if (!area) {
        throw new ServiceError(404, 'AREA_NOT_FOUND', 'Selected project area could not be found.');
      }
    } else {
      const requestedAreaName = (input.areaName || '').trim() || 'Ground Floor';
      area = areas.find((a) => a.name.toLowerCase() === requestedAreaName.toLowerCase());
      if (!area) {
        area = await this.repo.createArea({
          projectId: project.id,
          name: requestedAreaName,
          sortOrder: areas.length,
          isRegisteredInCommonFrame:
            input.isRegisteredInCommonFrame !== undefined
              ? Boolean(input.isRegisteredInCommonFrame)
              : areas.length === 0,
        });
      }
    }

    const planPage = Math.max(1, Math.floor(Number(input.planPage ?? 1) || 1));
    const planRegion: PlanRegionNormalized = input.planRegion ?? {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };

    const assetId = randomUUID();
    const mimeType = input.mimeType as 'application/pdf' | 'image/png' | 'image/jpeg';
    const storagePath = await this.assetStorage.put({
      assetId,
      projectId: project.id,
      fileName: input.fileName.trim(),
      mimeType,
      buffer: fileBuffer,
    });

    const asset = await this.repo.createAsset({
      id: assetId,
      projectId: project.id,
      areaId: area.id,
      areaName: area.name,
      sheetCode,
      revision,
      fileName: input.fileName.trim(),
      mimeType,
      sizeBytes: fileBuffer.length,
      storagePath,
      planPage,
      planRegion,
      calibration: input.calibration,
      status: 'processing',
      uploadedBy: actor.userId,
    });

    // Mirror into project_blueprints summary list using same assetId so legacy links/history stay unified
    await this.repo.upsertDraftBlueprint({
      id: asset.id,
      projectId: project.id,
      areaId: area.id,
      areaName: area.name,
      sheetCode,
      revision,
      fileName: asset.fileName,
      status: 'processing',
    });

    const mode: 'initial' | 'replacement' =
      input.mode === 'replacement' || Boolean(input.replacesModelVersionId)
        ? 'replacement'
        : 'initial';

    let job = await this.repo.createJob({
      projectId: project.id,
      areaId: area.id,
      blueprintAssetId: asset.id,
      submissionKey,
      mode,
      replacesModelVersionId: input.replacesModelVersionId ?? area.activeModelVersionId ?? null,
      createdBy: actor.userId,
    });

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'blueprint.uploaded',
      objectType: 'blueprint',
      objectId: asset.id,
      objectLabel: `${area.name} · ${sheetCode} ${revision}`,
      result: 'success',
      afterSummary: {
        areaId: area.id,
        areaName: area.name,
        sheetCode,
        revision,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        planPage,
        knownLengthMm: input.calibration.knownLengthMm,
        wallHeightMm: input.calibration.wallHeightMm,
        mode,
      },
    });

    // Advance draftStep to 3 (Review) while keeping project.status strictly as 'draft' until published
    if (project.status === 'draft' && project.draftStep < 3) {
      await this.repo.updateProjectStatus(project.id, 'draft', 3);
    }

    job = await this.executeAiExtractionOnJob(actor, project, area, asset, job, cleanBase64);

    const freshProject = (await this.repo.getProjectById(project.id)) ?? project;
    const freshAsset = (await this.repo.getAssetById(project.id, asset.id)) ?? asset;
    return {
      job,
      asset: freshAsset,
      area,
      project: await this.toAuthorizedProject(freshProject, membership),
      deduplicated: false,
    };
  }

  private async executeAiExtractionOnJob(
    actor: AuthenticatedActor,
    project: StoredProjectRecord,
    area: ProjectAreaRecord,
    asset: BlueprintAssetRecord,
    job: ProcessingJobRecord,
    base64Data: string
  ): Promise<ProcessingJobRecord> {
    const startedJob: ProcessingJobRecord = {
      ...job,
      status: 'processing',
      attemptCount: job.attemptCount + 1,
      errorCode: null,
      errorMessage: null,
      updatedAt: this.nowFn().toISOString(),
    };
    await this.repo.updateJob(startedJob);

    try {
      const extraction = await this.aiExtractor.extractGeometry({
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        base64Data,
        planPage: asset.planPage,
        planRegion: asset.planRegion,
        calibration: asset.calibration,
        areaName: area.name,
        sheetCode: asset.sheetCode,
      });

      const builtModel = buildDeterministicAreaModel({
        versionId: `draft-${startedJob.id.slice(0, 8)}`,
        areaId: area.id,
        blueprintAssetId: asset.id,
        sheetCode: asset.sheetCode,
        revision: asset.revision,
        calibration: asset.calibration,
        proposal: extraction.proposal,
      });

      const reviewedJob: ProcessingJobRecord = {
        ...startedJob,
        status: 'needs_review',
        aiProvider: extraction.provider,
        aiModel: extraction.model,
        proposal: extraction.proposal,
        builtModel,
        errorCode: null,
        errorMessage: null,
        updatedAt: this.nowFn().toISOString(),
      };
      await this.repo.updateJob(reviewedJob);
      await this.repo.updateAssetStatus(project.id, asset.id, 'uploaded');
      await this.repo.updateBlueprintStatus(project.id, asset.id, 'uploaded');

      await this.repo.appendAuditEvent({
        scope: 'project',
        projectId: project.id,
        actorUserId: actor.userId,
        actorName: actor.displayName,
        action: 'job.ai_extracted',
        objectType: 'model',
        objectId: reviewedJob.id,
        objectLabel: `${area.name} · ${asset.sheetCode} ${asset.revision}`,
        result: 'success',
        afterSummary: {
          jobStatus: reviewedJob.status,
          aiProvider: extraction.provider,
          aiModel: extraction.model,
          wallCount: builtModel.wallCount,
          roomCount: builtModel.rooms.length,
          footprintWidthMm: builtModel.footprintWidthMm,
          footprintDepthMm: builtModel.footprintDepthMm,
        },
      });

      return reviewedJob;
    } catch (err) {
      const errorCode =
        err instanceof AiProviderUnavailableError ? err.code : 'AI_EXTRACTION_FAILED';
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Blueprint AI extraction failed. Your draft and source file remain saved.';

      const failedJob: ProcessingJobRecord = {
        ...startedJob,
        status: 'failed',
        aiProvider: err instanceof AiProviderUnavailableError ? err.provider : 'google-genai',
        errorCode,
        errorMessage,
        updatedAt: this.nowFn().toISOString(),
      };
      await this.repo.updateJob(failedJob);
      await this.repo.updateAssetStatus(project.id, asset.id, 'uploaded');
      await this.repo.updateBlueprintStatus(project.id, asset.id, 'uploaded');

      await this.repo.appendAuditEvent({
        scope: 'project',
        projectId: project.id,
        actorUserId: actor.userId,
        actorName: actor.displayName,
        action: 'job.failed',
        objectType: 'model',
        objectId: failedJob.id,
        objectLabel: `${area.name} · ${asset.sheetCode} ${asset.revision}`,
        result: 'failed',
        reason: errorMessage,
        afterSummary: {
          jobStatus: failedJob.status,
          errorCode,
          attemptCount: failedJob.attemptCount,
          projectStatus: project.status,
        },
      });

      return failedJob;
    }
  }

  async getProcessingJob(
    actor: AuthenticatedActor,
    projectId: string,
    jobId: string
  ): Promise<ProcessingJobRecord> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(403, 'FORBIDDEN', 'You do not have access to this project.');
    }
    const project = await this.repo.getProjectById(projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    const job = await this.repo.getJobById(projectId, jobId);
    if (!job) {
      throw new ServiceError(404, 'JOB_NOT_FOUND', 'Processing job not found.');
    }
    return job;
  }

  /**
   * Retries AI extraction on the exact same durable job without duplicating project, area, or asset.
   */
  async retryProcessingJob(
    actor: AuthenticatedActor,
    projectId: string,
    jobId: string
  ): Promise<{ job: ProcessingJobRecord; project: AuthorizedProject }> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);
    const job = await this.repo.getJobById(project.id, jobId);
    if (!job) {
      throw new ServiceError(404, 'JOB_NOT_FOUND', 'Processing job not found.');
    }
    if (job.status === 'published') {
      throw new ServiceError(409, 'JOB_ALREADY_PUBLISHED', 'This job has already been published.');
    }
    const asset = await this.repo.getAssetById(project.id, job.blueprintAssetId);
    const areas = await this.repo.listAreas(project.id);
    const area = areas.find((a) => a.id === job.areaId);
    if (!asset || !area) {
      throw new ServiceError(404, 'ASSET_NOT_FOUND', 'Associated blueprint asset or area is missing.');
    }
    const blob = await this.assetStorage.get(project.id, asset.id);
    if (!blob) {
      throw new ServiceError(404, 'ASSET_FILE_MISSING', 'Private blueprint file could not be read for retry.');
    }

    const updatedJob = await this.executeAiExtractionOnJob(
      actor,
      project,
      area,
      asset,
      job,
      blob.buffer.toString('base64')
    );

    const freshProject = (await this.repo.getProjectById(project.id)) ?? project;
    return {
      job: updatedJob,
      project: await this.toAuthorizedProject(freshProject, membership),
    };
  }

  /**
   * Contractor edits/corrects proposed walls, openings, and closed room polygons in 2D/3D review.
   * Deterministically validates and rebuilds the 3D meshes without mutating published versions.
   */
  async updateJobGeometryProposal(
    actor: AuthenticatedActor,
    projectId: string,
    jobId: string,
    input: {
      proposal: BlueprintGeometryProposal;
      calibration?: BlueprintCalibration;
    }
  ): Promise<{ job: ProcessingJobRecord; project: AuthorizedProject }> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);
    const job = await this.repo.getJobById(project.id, jobId);
    if (!job) {
      throw new ServiceError(404, 'JOB_NOT_FOUND', 'Processing job not found.');
    }
    if (job.status === 'published') {
      throw new ServiceError(
        409,
        'JOB_ALREADY_PUBLISHED',
        'Published versions are immutable. Start a replacement blueprint job to publish a revision.'
      );
    }
    const asset = await this.repo.getAssetById(project.id, job.blueprintAssetId);
    if (!asset) {
      throw new ServiceError(404, 'ASSET_NOT_FOUND', 'Blueprint source not found.');
    }

    const activeCalibration = input.calibration ?? asset.calibration;
    const calErrors = validateCalibration(activeCalibration);
    if (calErrors.length > 0) {
      throw new ServiceError(400, 'INVALID_CALIBRATION', calErrors[0]);
    }

    const validation = validateGeometryProposal(input.proposal);
    if (!validation.valid) {
      throw new ServiceError(400, 'INVALID_GEOMETRY_PROPOSAL', validation.errors[0], {
        details: { errors: validation.errors },
      });
    }

    const builtModel = buildDeterministicAreaModel({
      versionId: `review-${job.id.slice(0, 8)}`,
      areaId: job.areaId,
      blueprintAssetId: asset.id,
      sheetCode: asset.sheetCode,
      revision: asset.revision,
      calibration: activeCalibration,
      proposal: input.proposal,
    });

    const updatedJob: ProcessingJobRecord = {
      ...job,
      status: 'needs_review',
      proposal: input.proposal,
      builtModel,
      errorCode: null,
      errorMessage: null,
      updatedAt: this.nowFn().toISOString(),
    };
    await this.repo.updateJob(updatedJob);

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'model.proposal_updated',
      objectType: 'model',
      objectId: updatedJob.id,
      objectLabel: `${asset.areaName} · ${asset.sheetCode} ${asset.revision}`,
      result: 'success',
      afterSummary: {
        wallCount: builtModel.wallCount,
        roomCount: builtModel.rooms.length,
        footprintWidthMm: builtModel.footprintWidthMm,
        footprintDepthMm: builtModel.footprintDepthMm,
      },
    });

    const freshProject = (await this.repo.getProjectById(project.id)) ?? project;
    return {
      job: updatedJob,
      project: await this.toAuthorizedProject(freshProject, membership),
    };
  }

  /**
   * Contractor explicitly verifies and publishes a reviewed 3D model version.
   * For blueprint replacements, evaluates existing Pin anchors and requires explicit remap/revalidation
   * without silently moving any Pin or losing Before/After evidence.
   */
  async verifyAndPublishJob(
    actor: AuthenticatedActor,
    projectId: string,
    jobId: string,
    input?: {
      verificationNotes?: string;
      pinRemapDecisions?: PinRemapDecision[];
    }
  ): Promise<{
    modelVersion: ModelVersionRecord;
    job: ProcessingJobRecord;
    project: AuthorizedProject;
  }> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);
    if (!canPublishModel(membership.role)) {
      throw new ServiceError(403, 'FORBIDDEN_ROLE', 'Only the project Contractor can publish a 3D model.');
    }

    const job = await this.repo.getJobById(project.id, jobId);
    if (!job) {
      throw new ServiceError(404, 'JOB_NOT_FOUND', 'Processing job not found.');
    }
    if (job.status === 'published') {
      throw new ServiceError(409, 'JOB_ALREADY_PUBLISHED', 'This job has already been published.');
    }
    if (!job.builtModel || !job.proposal) {
      throw new ServiceError(
        400,
        'NO_REVIEWABLE_MODEL',
        'A validated 3D model proposal is required before verification and publication.'
      );
    }

    const asset = await this.repo.getAssetById(project.id, job.blueprintAssetId);
    const areas = await this.repo.listAreas(project.id);
    const area = areas.find((a) => a.id === job.areaId);
    if (!asset || !area) {
      throw new ServiceError(404, 'AREA_OR_ASSET_MISSING', 'Area or blueprint source not found.');
    }

    const existingVersions = await this.repo.listModelVersions(project.id);
    const areaVersions = existingVersions.filter((v) => v.areaId === area.id);
    const previousActiveVersion =
      (job.replacesModelVersionId
        ? areaVersions.find((v) => v.id === job.replacesModelVersionId)
        : null) ??
      (area.activeModelVersionId
        ? areaVersions.find((v) => v.id === area.activeModelVersionId)
        : null) ??
      null;

    // Check existing work Pins in this area when replacing an active model version
    const allPins = await this.repo.listPins(project.id);
    const areaPins = allPins.filter((p) => p.areaId === area.id);
    const decisionsByPinId = new Map<string, PinRemapDecision>();
    for (const d of input?.pinRemapDecisions ?? []) {
      decisionsByPinId.set(d.pinId, d);
    }

    if (previousActiveVersion && areaPins.length > 0) {
      const affectedPins = evaluatePinAnchorImpact(areaPins, job.builtModel);
      const unresolved = affectedPins.filter((impact) => !decisionsByPinId.has(impact.pinId));
      if (unresolved.length > 0) {
        throw new ServiceError(
          409,
          'PIN_REMAP_REQUIRED',
          `${unresolved.length} existing work Pin(s) in ${area.name} must be remapped or explicitly revalidated before activating revision ${asset.revision}. The current published model remains active.`,
          { details: { affectedPins: unresolved } }
        );
      }
    }

    const nextVersionNumber =
      areaVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
    const versionId = randomUUID();
    const nowIso = this.nowFn().toISOString();

    // Mark all proposed rooms as verified on Contractor publication
    const verifiedProposal: BlueprintGeometryProposal = {
      ...job.proposal,
      rooms: job.proposal.rooms.map((r) => ({ ...r, verified: true })),
    };

    const finalGeometry = buildDeterministicAreaModel({
      versionId,
      areaId: area.id,
      blueprintAssetId: asset.id,
      sheetCode: asset.sheetCode,
      revision: asset.revision,
      calibration: asset.calibration,
      proposal: verifiedProposal,
    });

    // Supersede prior active version (preserving it in history, never deleting it)
    if (previousActiveVersion && previousActiveVersion.status === 'published') {
      await this.repo.updateModelVersionStatus(project.id, previousActiveVersion.id, 'superseded');
    }

    const modelVersion = await this.repo.createModelVersion({
      id: versionId,
      projectId: project.id,
      areaId: area.id,
      blueprintAssetId: asset.id,
      processingJobId: job.id,
      versionNumber: nextVersionNumber,
      sheetCode: asset.sheetCode,
      revision: asset.revision,
      status: 'published',
      calibrationSnapshot: asset.calibration,
      geometry: finalGeometry,
      supersedesVersionId: previousActiveVersion?.id ?? null,
      verifiedBy: actor.userId,
      verifiedAt: nowIso,
      publishedBy: actor.userId,
      publishedAt: nowIso,
    });

    await this.repo.updateAreaActiveModel(project.id, area.id, modelVersion.id);
    await this.repo.updateAssetStatus(project.id, asset.id, 'published');
    await this.repo.updateBlueprintStatus(project.id, asset.id, 'published');

    const publishedJob: ProcessingJobRecord = {
      ...job,
      status: 'published',
      proposal: verifiedProposal,
      builtModel: finalGeometry,
      updatedAt: nowIso,
    };
    await this.repo.updateJob(publishedJob);

    // Apply explicit Pin remap / revalidation decisions while preserving Before/After evidence & materials
    for (const pin of areaPins) {
      const decision = decisionsByPinId.get(pin.id);
      if (!decision) {
        // Unaffected pin stays anchored at exact coordinates, linked to active version
        await this.repo.updatePin(project.id, {
          ...pin,
          modelVersionId: modelVersion.id,
          anchorStatus: 'valid',
          updatedAt: nowIso,
        });
        continue;
      }

      if (decision.action === 'remap') {
        const targetElement = decision.targetElementId
          ? finalGeometry.elements.find((e) => e.id === decision.targetElementId)
          : null;
        if (!targetElement) {
          throw new ServiceError(
            400,
            'INVALID_REMAP_TARGET',
            `Selected remap target element for Pin "${pin.title}" does not exist in revision ${asset.revision}.`
          );
        }
        const remappedPin: ProjectPinRecord = {
          ...pin,
          elementId: targetElement.id,
          elementName: decision.targetElementName || targetElement.name,
          roomId: decision.targetRoomId || pin.roomId,
          roomName: decision.targetRoomName || pin.roomName,
          position: decision.position ?? pin.position,
          normal: decision.normal ?? pin.normal,
          modelVersionId: modelVersion.id,
          anchorStatus: 'remapped',
          remappedFromVersionId: previousActiveVersion?.id ?? pin.modelVersionId,
          updatedAt: nowIso,
        };
        await this.repo.updatePin(project.id, remappedPin);

        await this.repo.appendAuditEvent({
          scope: 'project',
          projectId: project.id,
          actorUserId: actor.userId,
          actorName: actor.displayName,
          action: 'pin.remapped',
          objectType: 'pin',
          objectId: pin.id,
          objectLabel: pin.title,
          result: 'success',
          reason: `Remapped from ${previousActiveVersion?.revision ?? 'prior version'} to ${asset.revision}`,
          beforeSummary: {
            elementId: pin.elementId,
            modelVersionId: pin.modelVersionId,
          },
          afterSummary: {
            elementId: remappedPin.elementId,
            modelVersionId: modelVersion.id,
            evidencePreserved: Boolean(pin.evidence.before || pin.evidence.after),
          },
        });
      } else {
        // Explicit revalidation keeps exact coordinates and preserves all evidence
        await this.repo.updatePin(project.id, {
          ...pin,
          modelVersionId: modelVersion.id,
          anchorStatus: 'valid',
          remappedFromVersionId: previousActiveVersion?.id ?? pin.modelVersionId,
          updatedAt: nowIso,
        });
      }
    }

    // Transition project from 'draft' -> 'ready' only after first verified model is published
    if (project.status === 'draft') {
      await this.repo.updateProjectStatus(project.id, 'ready', 3);
    }

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'model.verified',
      objectType: 'model',
      objectId: modelVersion.id,
      objectLabel: `${area.name} · v${modelVersion.versionNumber} (${asset.sheetCode} ${asset.revision})`,
      result: 'success',
      reason: input?.verificationNotes?.trim() || 'Contractor verified 2D/3D calibrated geometry',
      afterSummary: {
        areaId: area.id,
        blueprintAssetId: asset.id,
        versionNumber: modelVersion.versionNumber,
        wallCount: finalGeometry.wallCount,
        roomCount: finalGeometry.rooms.length,
      },
    });

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: previousActiveVersion ? 'blueprint.replaced' : 'model.published',
      objectType: previousActiveVersion ? 'blueprint' : 'model',
      objectId: previousActiveVersion ? asset.id : modelVersion.id,
      objectLabel: `${area.name} · ${asset.sheetCode} ${asset.revision} (v${modelVersion.versionNumber})`,
      result: 'success',
      beforeSummary: previousActiveVersion
        ? {
            previousModelVersionId: previousActiveVersion.id,
            previousBlueprintAssetId: previousActiveVersion.blueprintAssetId,
            previousSheetCode: previousActiveVersion.sheetCode,
            previousRevision: previousActiveVersion.revision,
          }
        : { projectStatus: project.status },
      afterSummary: {
        modelVersionId: modelVersion.id,
        blueprintAssetId: asset.id,
        sheetCode: asset.sheetCode,
        revision: asset.revision,
        versionNumber: modelVersion.versionNumber,
        projectStatus: project.status === 'draft' ? 'ready' : project.status,
      },
    });

    const freshProject = (await this.repo.getProjectById(project.id)) ?? project;
    return {
      modelVersion,
      job: publishedJob,
      project: await this.toAuthorizedProject(freshProject, membership),
    };
  }

  /**
   * Prompt 3: Add a room with a closed calibrated boundary on the area's active published model.
   * A room label alone cannot establish a verified boundary.
   */
  async addVerifiedRoom(
    actor: AuthenticatedActor,
    projectId: string,
    areaId: string,
    input: {
      name: string;
      polygonMm: Array<{ xMm: number; zMm: number }>;
    }
  ): Promise<{ modelVersion: ModelVersionRecord; project: AuthorizedProject }> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);

    const check = validateClosedRoomBoundary({
      name: input.name || '',
      polygonMm: input.polygonMm ?? [],
    });
    if (!check.valid) {
      throw new ServiceError(400, 'ROOM_BOUNDARY_REQUIRED', check.error, {
        fieldErrors: { polygon: check.error },
      });
    }

    const areas = await this.repo.listAreas(project.id);
    const area = areas.find((a) => a.id === areaId);
    if (!area || !area.activeModelVersionId) {
      throw new ServiceError(
        409,
        'NO_PUBLISHED_MODEL',
        'Publish a calibrated 3D model for this area before adding verified rooms.'
      );
    }

    const version = await this.repo.getModelVersionById(project.id, area.activeModelVersionId);
    if (!version) {
      throw new ServiceError(404, 'MODEL_VERSION_NOT_FOUND', 'Active model version not found.');
    }

    // Reconstruct model center from slab footprint
    const centerXMm = version.geometry.footprintWidthMm / 2;
    const centerZMm = version.geometry.footprintDepthMm / 2;
    const newRoom = buildRoomDefinitionFromBoundary(
      {
        id: `room-${randomUUID().slice(0, 8)}`,
        name: input.name.trim(),
        polygonMm: input.polygonMm,
        verified: true,
      },
      area.id,
      centerXMm,
      centerZMm
    );

    const updatedGeometry: BuiltAreaModelSpec = {
      ...version.geometry,
      rooms: [...version.geometry.rooms, newRoom],
    };

    const updatedVersion = await this.repo.updateModelVersionGeometry(
      project.id,
      version.id,
      updatedGeometry
    );
    if (!updatedVersion) {
      throw new ServiceError(500, 'MODEL_UPDATE_FAILED', 'Could not save verified room boundary.');
    }

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'room.added',
      objectType: 'area',
      objectId: newRoom.id,
      objectLabel: `${area.name} · ${newRoom.name}`,
      result: 'success',
      afterSummary: {
        areaId: area.id,
        modelVersionId: version.id,
        roomId: newRoom.id,
        roomName: newRoom.name,
        areaSqm: newRoom.areaSqm,
        vertices: input.polygonMm.length,
        verificationStatus: newRoom.verificationStatus,
      },
    });

    return {
      modelVersion: updatedVersion,
      project: await this.toAuthorizedProject(project, membership),
    };
  }

  /**
   * Prompt 3: Computes exact dependent models, rooms, Pins, and evidence before removing or retiring a blueprint.
   */
  async getBlueprintImpact(
    actor: AuthenticatedActor,
    projectId: string,
    blueprintId: string
  ): Promise<BlueprintImpactSummary> {
    const { project } = await this.requireActiveContractor(actor, projectId);
    const [assets, blueprints, versions, pins] = await Promise.all([
      this.repo.listAssets(project.id),
      this.repo.listBlueprintsForProject(project.id),
      this.repo.listModelVersions(project.id),
      this.repo.listPins(project.id),
    ]);

    const asset = assets.find((a) => a.id === blueprintId);
    const bp = blueprints.find((b) => b.id === blueprintId);
    if (!asset && !bp) {
      throw new ServiceError(404, 'BLUEPRINT_NOT_FOUND', 'Blueprint source not found.');
    }

    const areaId = asset?.areaId ?? bp?.areaId ?? '';
    const areaName = asset?.areaName ?? bp?.areaName ?? 'Area';
    const sheetCode = asset?.sheetCode ?? bp?.sheetCode ?? 'Sheet';
    const revision = asset?.revision ?? bp?.revision ?? 'R00';
    const status = asset?.status ?? bp?.status ?? 'pending_upload';

    const dependentVersions = versions.filter((v) => v.blueprintAssetId === blueprintId);
    const publishedVersions = dependentVersions.filter(
      (v) => v.status === 'published' || v.status === 'superseded'
    );
    const versionIds = new Set(dependentVersions.map((v) => v.id));
    const roomCount = dependentVersions.reduce((sum, v) => sum + v.geometry.rooms.length, 0);
    const dependentPins = pins.filter(
      (p) => versionIds.has(p.modelVersionId) || (areaId && p.areaId === areaId && publishedVersions.length > 0)
    );
    const evidenceCount = dependentPins.reduce(
      (sum, p) => sum + (p.evidence.before ? 1 : 0) + (p.evidence.after ? 1 : 0),
      0
    );

    const hasPublishedOrWork =
      status === 'published' ||
      publishedVersions.length > 0 ||
      dependentPins.length > 0 ||
      evidenceCount > 0;

    return {
      blueprintId,
      areaId,
      areaName,
      sheetCode,
      revision,
      status,
      dependentModelVersionIds: dependentVersions.map((v) => v.id),
      publishedVersionCount: publishedVersions.length,
      roomCount,
      pinCount: dependentPins.length,
      evidenceCount,
      canHardRemoveDraft: !hasPublishedOrWork,
      requiresRetireOrReplace: hasPublishedOrWork,
      historyRetentionSummary: hasPublishedOrWork
        ? `Retiring preserves ${publishedVersions.length} model version(s), ${dependentPins.length} Pin(s), ${evidenceCount} Before/After evidence record(s), and audit History while leaving all other areas intact.`
        : 'Unused draft blueprint with no published model or work Pins. Removing deletes the draft source file and records a removal event in History.',
    };
  }

  /**
   * Prompt 3: Removes an unused draft blueprint OR retires a published/referenced blueprint safely.
   */
  async removeOrRetireBlueprint(
    actor: AuthenticatedActor,
    projectId: string,
    blueprintId: string,
    input: { mode: 'remove' | 'retire'; reason?: string }
  ): Promise<{ impact: BlueprintImpactSummary; project: AuthorizedProject }> {
    const { membership, project } = await this.requireActiveContractor(actor, projectId);
    const impact = await this.getBlueprintImpact(actor, projectId, blueprintId);

    if (input.mode === 'remove' && !impact.canHardRemoveDraft) {
      throw new ServiceError(
        409,
        'DEPENDENT_WORK_EXISTS',
        `${impact.areaName} (${impact.sheetCode} ${impact.revision}) is published or referenced by ${impact.pinCount} Pin(s) and ${impact.evidenceCount} evidence record(s). Retire or replace it instead so historical work and evidence remain intact.`,
        { details: { impact } }
      );
    }

    const nextStatus: BlueprintStatus = input.mode === 'remove' ? 'removed' : 'retired';
    await this.repo.updateAssetStatus(project.id, blueprintId, nextStatus);
    await this.repo.updateBlueprintStatus(
      project.id,
      blueprintId,
      nextStatus,
      input.mode === 'remove' ? null : undefined
    );

    if (input.mode === 'remove') {
      await this.assetStorage.deleteAsset(project.id, blueprintId);
    } else {
      // Retire dependent published model versions & detach active pointer on this area ONLY
      const areas = await this.repo.listAreas(project.id);
      const area = areas.find((a) => a.id === impact.areaId);
      for (const vid of impact.dependentModelVersionIds) {
        await this.repo.updateModelVersionStatus(project.id, vid, 'retired');
        if (area && area.activeModelVersionId === vid) {
          await this.repo.updateAreaActiveModel(project.id, area.id, null);
        }
      }
    }

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: input.mode === 'remove' ? 'blueprint.removed' : 'blueprint.retired',
      objectType: 'blueprint',
      objectId: blueprintId,
      objectLabel: `${impact.areaName} · ${impact.sheetCode} ${impact.revision}`,
      result: 'success',
      reason:
        input.reason?.trim() ||
        (input.mode === 'retire'
          ? 'Published blueprint retired; historical models, Pins, and evidence preserved.'
          : 'Unused draft blueprint removed.'),
      beforeSummary: {
        status: impact.status,
        pinCount: impact.pinCount,
        evidenceCount: impact.evidenceCount,
      },
      afterSummary: {
        status: nextStatus,
        historyPreserved: true,
        otherAreasAffected: false,
      },
    });

    const freshProject = (await this.repo.getProjectById(project.id)) ?? project;
    return {
      impact: { ...impact, status: nextStatus },
      project: await this.toAuthorizedProject(freshProject, membership),
    };
  }

  /**
   * Prompt 3: Creates a real work Pin on a live project's published area model.
   */
  async createProjectPin(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      areaId: string;
      roomId: string;
      roomName: string;
      elementId: string;
      elementName: string;
      surfaceSide: string;
      title: string;
      category: string;
      assignedWorkerName: string;
      description: string;
      position: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      evidence?: ProjectPinRecord['evidence'];
      materials?: ProjectPinRecord['materials'];
    }
  ): Promise<{ pin: ProjectPinRecord; project: AuthorizedProject }> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(403, 'FORBIDDEN', 'You do not have active access to this project.');
    }
    const project = await this.repo.getProjectById(projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    const areas = await this.repo.listAreas(project.id);
    const area = areas.find((a) => a.id === input.areaId);
    if (!area || !area.activeModelVersionId) {
      throw new ServiceError(409, 'NO_PUBLISHED_MODEL', 'Select an area with a published model to anchor a Pin.');
    }
    if (!input.title.trim()) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Pin title is required.');
    }

    const nowIso = this.nowFn().toISOString();
    const pinId = `PIN-${randomUUID().slice(0, 6).toUpperCase()}`;
    const deptRaw = input.category.trim();
    const department: ProjectPinRecord['department'] =
      deptRaw === 'Civil' || deptRaw === 'Electrical' || deptRaw === 'Plumbing' || deptRaw === 'Finishing'
        ? deptRaw
        : 'Finishing';

    const pin: ProjectPinRecord = {
      id: pinId,
      slug: `${pinId.toLowerCase()}-${input.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 32)}`,
      projectId: project.id,
      areaId: area.id,
      modelVersionId: area.activeModelVersionId,
      elementId: input.elementId,
      elementName: input.elementName,
      roomId: input.roomId,
      roomName: input.roomName,
      surfaceSide: input.surfaceSide,
      title: input.title.trim(),
      department,
      status: 'open',
      assigneeName: input.assignedWorkerName.trim() || actor.displayName,
      description: input.description.trim(),
      position: input.position,
      normal: input.normal,
      cycleNumber: 1,
      materials: input.materials ?? [],
      evidence: input.evidence ?? { before: null, after: null },
      createdAt: nowIso,
      updatedAt: nowIso,
      isDemoSeed: false,
      anchorStatus: 'valid',
      remappedFromVersionId: null,
    };

    const created = await this.repo.createPin(project.id, pin);

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'pin.created',
      objectType: 'pin',
      objectId: created.id,
      objectLabel: `${area.name} · ${created.title}`,
      result: 'success',
      afterSummary: {
        areaId: area.id,
        modelVersionId: area.activeModelVersionId,
        elementId: created.elementId,
        roomName: created.roomName,
      },
    });

    return {
      pin: created,
      project: await this.toAuthorizedProject(project, membership),
    };
  }

  /**
   * Serves a private uploaded blueprint file ONLY to active members of a non-deleted project.
   * Immediately returns 403/404 after logical deletion or membership revocation.
   */
  async getPrivateAssetFile(
    actor: AuthenticatedActor,
    projectId: string,
    assetId: string
  ): Promise<StoredPrivateAssetBlob> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(403, 'FORBIDDEN', 'You do not have access to this private blueprint file.');
    }
    const project = await this.repo.getProjectById(projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found or has been deleted.');
    }
    const asset = await this.repo.getAssetById(projectId, assetId);
    if (!asset || asset.status === 'removed') {
      throw new ServiceError(404, 'ASSET_NOT_FOUND', 'Blueprint source file not found.');
    }
    const blob = await this.assetStorage.get(projectId, assetId);
    if (!blob) {
      throw new ServiceError(404, 'ASSET_FILE_MISSING', 'Private blueprint file is unavailable.');
    }
    return blob;
  }

  async updateProjectGeneral(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      name: string;
      contractorDisplayName: string;
      timezone: string;
      expectedVersion: number;
    }
  ): Promise<AuthorizedProject> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(403, 'FORBIDDEN', 'You do not have access to this project.');
    }
    if (!canEditProjectSettings(membership.role)) {
      throw new ServiceError(
        403,
        'FORBIDDEN_ROLE',
        'Only the project Contractor can edit project settings. Display names cannot grant permissions.'
      );
    }

    const fieldErrors: Record<string, string> = {};
    if (!input.name.trim()) fieldErrors.name = 'Project name is required.';
    if (!input.contractorDisplayName.trim()) {
      fieldErrors.contractorDisplayName = 'Contractor display name is required.';
    }
    if (!input.timezone.trim() || !isValidTimezone(input.timezone.trim())) {
      fieldErrors.timezone = 'Select a valid IANA project timezone.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
        fieldErrors,
      });
    }

    const before = await this.repo.getProjectById(projectId);
    if (!before || before.status === 'deleted' || before.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    const result = await this.repo.updateProjectGeneral(projectId, input.expectedVersion, {
      name: input.name.trim(),
      contractorDisplayName: input.contractorDisplayName.trim(),
      timezone: input.timezone.trim(),
    });

    if (!result.ok) {
      if (result.code === 'STALE_RECORD') {
        throw new ServiceError(
          409,
          'STALE_RECORD',
          'This project was modified by another session. Reload the latest values before saving.'
        );
      }
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: before.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'project.general_updated',
      objectType: 'project',
      objectId: before.id,
      objectLabel: result.project.name,
      result: 'success',
      beforeSummary: {
        name: before.name,
        contractorDisplayName: before.contractorDisplayName,
        timezone: before.timezone,
      },
      afterSummary: {
        name: result.project.name,
        contractorDisplayName: result.project.contractorDisplayName,
        timezone: result.project.timezone,
      },
    });

    return this.toAuthorizedProject(result.project, membership);
  }

  async changeProjectPassword(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      currentPassword: string;
      newPassword: string;
      confirmNewPassword: string;
    }
  ): Promise<{ changedAt: string }> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(403, 'FORBIDDEN', 'You do not have access to this project.');
    }
    if (!canManageProjectAccess(membership.role)) {
      throw new ServiceError(
        403,
        'FORBIDDEN_ROLE',
        'Only the project Contractor can change the project password.'
      );
    }

    const project = await this.repo.getProjectById(projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    const fieldErrors = validateProjectPasswordChangeInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Check the password fields.', {
        fieldErrors: { ...fieldErrors } as Record<string, string>,
      });
    }

    const secret = await this.repo.getProjectSecret(projectId);
    if (!secret) {
      throw new ServiceError(
        500,
        'SECRET_MISSING',
        'Project access credentials are not initialized for this project.'
      );
    }

    const now = this.nowFn();
    if (secret.lockedUntil) {
      const lockedUntilMs = Date.parse(secret.lockedUntil);
      if (Number.isFinite(lockedUntilMs) && lockedUntilMs > now.getTime()) {
        const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilMs - now.getTime()) / 1000));
        await this.repo.appendAuditEvent({
          scope: 'project',
          projectId: project.id,
          actorUserId: actor.userId,
          actorName: actor.displayName,
          action: 'project_access.password_change',
          objectType: 'project_access',
          objectId: project.id,
          objectLabel: project.name,
          result: 'rejected',
          reason: 'Rate limit active after repeated failed attempts',
        });
        throw new ServiceError(
          429,
          'RATE_LIMITED',
          `Too many incorrect project password attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
          { retryAfterSeconds }
        );
      }
    }

    const matches = verifyProjectPassword(input.currentPassword, secret.passwordHash);
    if (!matches) {
      const nextAttempts = secret.failedAttempts + 1;
      const lockedUntil =
        nextAttempts >= MAX_FAILED_PASSWORD_ATTEMPTS
          ? new Date(now.getTime() + LOCKOUT_WINDOW_MS).toISOString()
          : null;

      await this.repo.updateProjectSecret({
        ...secret,
        failedAttempts: nextAttempts,
        lockedUntil,
        updatedAt: now.toISOString(),
      });

      await this.repo.appendAuditEvent({
        scope: 'project',
        projectId: project.id,
        actorUserId: actor.userId,
        actorName: actor.displayName,
        action: 'project_access.password_change',
        objectType: 'project_access',
        objectId: project.id,
        objectLabel: project.name,
        result: 'rejected',
        reason: lockedUntil
          ? 'Current project password mismatch (rate limit triggered)'
          : 'Current project password mismatch',
      });

      if (lockedUntil) {
        throw new ServiceError(
          429,
          'RATE_LIMITED',
          'Current project password was incorrect too many times. Password changes are temporarily locked for 15 minutes.',
          {
            fieldErrors: { currentPassword: 'Current project password is incorrect.' },
            retryAfterSeconds: Math.ceil(LOCKOUT_WINDOW_MS / 1000),
          }
        );
      }

      throw new ServiceError(400, 'INVALID_CURRENT_PASSWORD', 'Current project password is incorrect.', {
        fieldErrors: { currentPassword: 'Current project password is incorrect.' },
      });
    }

    const nextHash = hashProjectPassword(input.newPassword);
    const changedAt = now.toISOString();
    await this.repo.updateProjectSecret({
      projectId: project.id,
      passwordHash: nextHash,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: changedAt,
    });

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'project_access.password_change',
      objectType: 'project_access',
      objectId: project.id,
      objectLabel: project.name,
      result: 'success',
      reason: 'Project password updated independently of account passwords',
    });

    return { changedAt };
  }

  async performBlueprintDangerAction(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      blueprintId: string;
      action: 'remove' | 'replace';
      reason?: string;
    }
  ): Promise<ProjectBlueprintRecord> {
    if (input.action === 'remove') {
      const res = await this.removeOrRetireBlueprint(actor, projectId, input.blueprintId, {
        mode: 'remove',
        reason: input.reason,
      });
      const bp = res.project.blueprints.find((b) => b.id === input.blueprintId);
      if (bp) return bp;
    }

    const { project } = await this.requireActiveContractor(actor, projectId);
    const blueprints = await this.repo.listBlueprintsForProject(project.id);
    const target = blueprints.find((b) => b.id === input.blueprintId);
    if (!target) {
      throw new ServiceError(404, 'BLUEPRINT_NOT_FOUND', 'Blueprint source not found.');
    }

    const nextStatus: BlueprintStatus = input.action === 'remove' ? 'removed' : 'pending_upload';
    const updated = await this.repo.updateBlueprintStatus(
      project.id,
      target.id,
      nextStatus,
      input.action === 'remove' ? null : target.fileName
    );
    if (!updated) {
      throw new ServiceError(404, 'BLUEPRINT_NOT_FOUND', 'Blueprint source not found.');
    }

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: input.action === 'remove' ? 'blueprint.removed' : 'blueprint.replacement_requested',
      objectType: 'blueprint',
      objectId: updated.id,
      objectLabel: `${updated.areaName} · ${updated.sheetCode} ${updated.revision}`,
      result: 'success',
      reason: input.reason?.trim() || null,
      beforeSummary: { status: target.status },
      afterSummary: { status: updated.status },
    });

    return updated;
  }

  /**
   * Prompt 3 Behavior #6: Strict exact two-field `DELETE PROJECT <name>` logical deletion.
   * - Rechecks Contractor role and immutable projectId.
   * - Checks optimistic expectedVersion so a concurrent rename invalidates stale dialogs (409 STALE_RECORD).
   * - Requires exact `DELETE` + exact current project display name (case & internal spaces sensitive).
   * - Idempotent on retry after logical deletion.
   * - Revokes ordinary route & private file access while preserving restricted deletion audit records.
   */
  async deleteProject(
    actor: AuthenticatedActor,
    projectId: string,
    input: {
      keyword: string;
      typedProjectName: string;
      expectedVersion: number;
    }
  ): Promise<{ deletedProjectId: string; alreadyDeleted: boolean; deletionMode: 'logical' }> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active' || !canEditProjectSettings(membership.role)) {
      throw new ServiceError(
        403,
        'FORBIDDEN',
        'Only the project Contractor can delete this project.'
      );
    }

    const project = await this.repo.getProjectById(projectId);
    if (!project) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    // Safe idempotent retry if already logically deleted
    if (project.status === 'deleted' || project.deletedAt) {
      return {
        deletedProjectId: project.id,
        alreadyDeleted: true,
        deletionMode: 'logical',
      };
    }

    // Concurrent rename / stale dialog protection
    if (
      typeof input.expectedVersion === 'number' &&
      Number.isFinite(input.expectedVersion) &&
      project.version !== input.expectedVersion
    ) {
      throw new ServiceError(
        409,
        'STALE_RECORD',
        `This project was modified (current name: "${project.name}") since the confirmation dialog opened. Reload and confirm with the current project name.`,
        {
          details: {
            currentName: project.name,
            currentVersion: project.version,
          },
        }
      );
    }

    const phraseCheck = validateDeleteProjectPhrase({
      keyword: input.keyword ?? '',
      typedProjectName: input.typedProjectName ?? '',
      actualProjectName: project.name,
    });

    if (!phraseCheck.valid) {
      const fieldErrors: Record<string, string> = {};
      if (phraseCheck.keywordError) fieldErrors.keyword = phraseCheck.keywordError;
      if (phraseCheck.projectNameError) fieldErrors.typedProjectName = phraseCheck.projectNameError;
      throw new ServiceError(
        400,
        'DELETE_PHRASE_MISMATCH',
        `Type "${phraseCheck.expectedPhrase}" exactly (matching case and spaces) to delete this project.`,
        { fieldErrors }
      );
    }

    await this.repo.softDeleteProject(project.id);

    await this.repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'project.deleted',
      objectType: 'project',
      objectId: project.id,
      objectLabel: project.name,
      result: 'success',
      reason: 'Logical deletion confirmed by Contractor via exact DELETE PROJECT <name> phrase',
      beforeSummary: { status: project.status, version: project.version },
      afterSummary: { status: 'deleted', deletionMode: 'logical', accessRevoked: true },
    });

    await this.repo.appendAuditEvent({
      scope: 'account',
      projectId: null,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: 'account.project_deleted',
      objectType: 'project',
      objectId: project.id,
      objectLabel: project.name,
      result: 'success',
      reason: 'Restricted deletion audit record preserved after logical deletion',
      afterSummary: { deletedProjectId: project.id, deletionMode: 'logical' },
    });

    return {
      deletedProjectId: project.id,
      alreadyDeleted: false,
      deletionMode: 'logical',
    };
  }

  async getProjectHistory(
    actor: AuthenticatedActor,
    projectId: string,
    filters?: HistoryFilterInput
  ): Promise<AuditEventRecord[]> {
    const membership = await this.repo.getMembership(projectId, actor.userId);
    if (!membership || membership.status !== 'active') {
      throw new ServiceError(
        403,
        'FORBIDDEN',
        'You do not have permission to view history for this project.'
      );
    }
    const project = await this.repo.getProjectById(projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new ServiceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    return this.repo.listAuditEvents({
      scope: 'project',
      projectId,
      objectType: filters?.objectType,
      objectId: filters?.objectId,
    });
  }

  async getOwnProfile(actor: AuthenticatedActor): Promise<UserProfile> {
    return this.repo.getProfile(actor.userId, actor.email, actor.displayName);
  }

  async updateOwnProfile(
    actor: AuthenticatedActor,
    input: {
      displayName?: string;
      phoneNumber?: string;
      displayTimezone?: string;
      expectedVersion: number;
    }
  ): Promise<UserProfile> {
    const before = await this.repo.getProfile(actor.userId, actor.email, actor.displayName);
    const fieldErrors: Record<string, string> = {};

    const nextDisplayName =
      input.displayName !== undefined ? input.displayName.trim() : before.displayName;
    const nextPhone =
      input.phoneNumber !== undefined ? input.phoneNumber.trim() : before.phoneNumber;
    const nextTimezone =
      input.displayTimezone !== undefined ? input.displayTimezone.trim() : before.displayTimezone;

    if (!nextDisplayName) {
      fieldErrors.displayName = 'Display name is required.';
    }
    if (nextPhone && !/^[+\d()\s-]{6,24}$/.test(nextPhone)) {
      fieldErrors.phoneNumber = 'Enter a valid contact phone number (digits, +, spaces, or hyphens).';
    }
    if (!nextTimezone || !isValidTimezone(nextTimezone)) {
      fieldErrors.displayTimezone = 'Select a valid IANA display timezone.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Check the highlighted profile fields.', {
        fieldErrors,
      });
    }

    const phoneChanged = nextPhone !== before.phoneNumber;
    const nextPhoneStatus = phoneChanged ? 'contact_only' : before.phoneStatus;

    const updated = await this.repo.updateProfile(actor.userId, input.expectedVersion, {
      displayName: nextDisplayName,
      phoneNumber: nextPhone,
      phoneStatus: nextPhoneStatus,
      displayTimezone: nextTimezone,
    });

    if (!updated.ok) {
      throw new ServiceError(
        409,
        'STALE_RECORD',
        'Your profile was updated in another tab. Reload before saving.'
      );
    }

    await this.repo.appendAuditEvent({
      scope: 'account',
      projectId: null,
      actorUserId: actor.userId,
      actorName: updated.profile.displayName || actor.email,
      action: 'account.profile_updated',
      objectType: 'profile',
      objectId: actor.userId,
      objectLabel: updated.profile.displayName || actor.email,
      result: 'success',
      beforeSummary: {
        displayName: before.displayName,
        phoneNumber: before.phoneNumber,
        phoneStatus: before.phoneStatus,
        displayTimezone: before.displayTimezone,
      },
      afterSummary: {
        displayName: updated.profile.displayName,
        phoneNumber: updated.profile.phoneNumber,
        phoneStatus: updated.profile.phoneStatus,
        displayTimezone: updated.profile.displayTimezone,
      },
    });

    return updated.profile;
  }

  async requestAccountPasswordChallenge(
    actor: AuthenticatedActor,
    options?: { providerReauthSent?: boolean }
  ): Promise<{
    challengeId: string;
    registeredEmail: string;
    expiresAt: string;
    resendAfterSeconds: number;
    deliveryMode: 'supabase_reauth' | 'mail_sender' | 'delivery_unavailable';
    deliveryMessage: string;
  }> {
    const nowMs = this.nowFn().getTime();
    const existingId = this.latestChallengeIdByUser.get(actor.userId);
    const existing = existingId ? this.passwordChallenges.get(existingId) : undefined;
    const throttle = checkResendThrottle(existing, nowMs);
    if (!throttle.allowed) {
      throw new ServiceError(
        429,
        'CHALLENGE_RESEND_THROTTLED',
        `Wait ${throttle.retryAfterSeconds}s before requesting another verification email.`,
        { retryAfterSeconds: throttle.retryAfterSeconds }
      );
    }

    // Cancel prior unconsumed challenge for this user so only latest code is valid
    if (existing && existing.consumedAtMs === null && existing.cancelledAtMs === null) {
      this.passwordChallenges.set(existing.id, { ...existing, cancelledAtMs: nowMs });
    }

    const { record, plainCode } = createPasswordChangeChallenge({
      userId: actor.userId,
      registeredEmail: actor.email,
      nowMs,
    });

    const expiresAt = new Date(record.expiresAtMs).toISOString();
    let deliveryMode: 'supabase_reauth' | 'mail_sender' | 'delivery_unavailable' =
      'delivery_unavailable';
    let deliveryMessage =
      'Email confirmation delivery is not configured on this server. Configure Supabase Auth SMTP or an email sender before completing account password changes.';

    if (this.sendPasswordChallengeEmail) {
      const sent = await this.sendPasswordChallengeEmail({
        toEmail: actor.email,
        userId: actor.userId,
        code: plainCode,
        expiresAtIso: expiresAt,
      });
      if (!sent.delivered) {
        await this.repo.appendAuditEvent({
          scope: 'account',
          projectId: null,
          actorUserId: actor.userId,
          actorName: actor.displayName || actor.email,
          action: 'account.password_challenge_failed',
          objectType: 'security',
          objectId: actor.userId,
          objectLabel: actor.email,
          result: 'failed',
          reason: sent.error || 'Confirmation email delivery failed',
        });
        throw new ServiceError(
          503,
          'EMAIL_DELIVERY_FAILED',
          sent.error ||
            'Could not deliver confirmation email to your registered inbox. Your current password remains unchanged.'
        );
      }
      deliveryMode = 'mail_sender';
      deliveryMessage = `Verification code sent to ${actor.email}.`;
    } else if (options?.providerReauthSent) {
      deliveryMode = 'supabase_reauth';
      deliveryMessage = `Confirmation sent to ${actor.email} via your authentication provider.`;
    } else {
      await this.repo.appendAuditEvent({
        scope: 'account',
        projectId: null,
        actorUserId: actor.userId,
        actorName: actor.displayName || actor.email,
        action: 'account.password_challenge_failed',
        objectType: 'security',
        objectId: actor.userId,
        objectLabel: actor.email,
        result: 'failed',
        reason: 'Email delivery provider is not configured',
      });
      throw new ServiceError(
        503,
        'EMAIL_DELIVERY_UNCONFIGURED',
        deliveryMessage
      );
    }

    this.passwordChallenges.set(record.id, record);
    this.latestChallengeIdByUser.set(actor.userId, record.id);

    await this.repo.appendAuditEvent({
      scope: 'account',
      projectId: null,
      actorUserId: actor.userId,
      actorName: actor.displayName || actor.email,
      action: 'account.password_challenge_requested',
      objectType: 'security',
      objectId: actor.userId,
      objectLabel: actor.email,
      result: 'pending',
      reason: 'Single-use password confirmation sent to registered email',
      afterSummary: {
        registeredEmail: actor.email,
        expiresAt,
      },
    });

    return {
      challengeId: record.id,
      registeredEmail: actor.email,
      expiresAt,
      resendAfterSeconds: Math.ceil((record.resendAvailableAtMs - nowMs) / 1000),
      deliveryMode,
      deliveryMessage,
    };
  }

  async verifyAccountPasswordChallenge(
    actor: AuthenticatedActor,
    input: { challengeId: string; code: string }
  ): Promise<{ verified: true; challengeId: string; verifiedAt: string }> {
    const nowMs = this.nowFn().getTime();
    const record = this.passwordChallenges.get(input.challengeId);
    const result = verifyPasswordChangeChallenge(record, {
      userId: actor.userId,
      registeredEmail: actor.email,
      code: input.code,
      nowMs,
    });

    if (!result.ok) {
      if (result.record) {
        this.passwordChallenges.set(result.record.id, result.record);
      }
      await this.repo.appendAuditEvent({
        scope: 'account',
        projectId: null,
        actorUserId: actor.userId,
        actorName: actor.displayName || actor.email,
        action: 'account.password_change_failed',
        objectType: 'security',
        objectId: actor.userId,
        objectLabel: actor.email,
        result: 'rejected',
        reason: result.message,
      });
      throw new ServiceError(
        result.code === 'EXPIRED' ? 410 : result.code === 'MISMATCHED_USER' ? 403 : 400,
        result.code,
        result.message
      );
    }

    this.passwordChallenges.set(result.record.id, result.record);
    return {
      verified: true,
      challengeId: result.record.id,
      verifiedAt: new Date(nowMs).toISOString(),
    };
  }

  async cancelAccountPasswordChallenge(
    actor: AuthenticatedActor,
    challengeId: string
  ): Promise<{ cancelled: true }> {
    const nowMs = this.nowFn().getTime();
    const record = this.passwordChallenges.get(challengeId);
    if (record && record.userId === actor.userId && record.consumedAtMs === null) {
      this.passwordChallenges.set(record.id, { ...record, cancelledAtMs: nowMs });
    }
    return { cancelled: true };
  }

  async recordAccountSecurityEvent(
    actor: AuthenticatedActor,
    input: {
      eventType:
        | 'email_change_requested'
        | 'email_change_confirmed'
        | 'account_password_changed'
        | 'account_password_failed';
      targetEmail?: string;
      reason?: string;
    }
  ): Promise<{ profile: UserProfile; event: AuditEventRecord }> {
    if (
      input.eventType === 'email_change_requested' ||
      input.eventType === 'email_change_confirmed'
    ) {
      throw new ServiceError(
        403,
        'EMAIL_LOCKED',
        'Registered account email addresses are locked and cannot be changed from VONTA settings.'
      );
    }

    const profile = await this.repo.getProfile(actor.userId, actor.email, actor.displayName);

    const resultMap: Record<'account_password_changed' | 'account_password_failed', AuditResult> = {
      account_password_changed: 'success',
      account_password_failed: 'failed',
    };

    const actionMap: Record<'account_password_changed' | 'account_password_failed', string> = {
      account_password_changed: 'account.password_changed',
      account_password_failed: 'account.password_change_failed',
    };

    const event = await this.repo.appendAuditEvent({
      scope: 'account',
      projectId: null,
      actorUserId: actor.userId,
      actorName: profile.displayName || actor.email,
      action: actionMap[input.eventType],
      objectType: 'security',
      objectId: actor.userId,
      objectLabel: actor.email,
      result: resultMap[input.eventType],
      reason: input.reason ?? null,
      beforeSummary: null,
      afterSummary: null,
    });

    return { profile, event };
  }

  async getOwnAccountHistory(actor: AuthenticatedActor): Promise<AuditEventRecord[]> {
    return this.repo.listAuditEvents({
      scope: 'account',
      actorUserId: actor.userId,
    });
  }
}

/**
 * Production / Staging Supabase repository using the server-only service role client.
 * Never exposed to the browser.
 */
export class SupabaseVontaRepository implements VontaStoreRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async getProfile(userId: string, fallbackEmail: string, fallbackName: string): Promise<UserProfile> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new ServiceError(500, 'DB_ERROR', error.message);
    }

    if (!data) {
      const inserted = await this.client
        .from('profiles')
        .insert({
          user_id: userId,
          display_name: fallbackName || fallbackEmail.split('@')[0] || 'User',
          phone_number: '',
          phone_status: 'contact_only',
          display_timezone: 'Asia/Jakarta',
        })
        .select('*')
        .single();

      if (inserted.error || !inserted.data) {
        throw new ServiceError(500, 'DB_ERROR', inserted.error?.message ?? 'Failed to initialize profile');
      }
      return this.mapProfileRow(inserted.data, fallbackEmail);
    }

    if (data.pending_email && data.pending_email.toLowerCase() === fallbackEmail.toLowerCase()) {
      await this.client
        .from('profiles')
        .update({ pending_email: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      data.pending_email = null;
    }

    return this.mapProfileRow(data, fallbackEmail);
  }

  private mapProfileRow(row: Record<string, unknown>, email: string): UserProfile {
    return {
      userId: String(row.user_id),
      email,
      pendingEmail: row.pending_email ? String(row.pending_email) : null,
      displayName: String(row.display_name ?? ''),
      phoneNumber: String(row.phone_number ?? ''),
      phoneStatus: row.phone_status === 'verified' ? 'verified' : 'contact_only',
      displayTimezone: String(row.display_timezone ?? 'Asia/Jakarta'),
      version: Number(row.version ?? 1),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    };
  }

  async updateProfile(
    userId: string,
    expectedVersion: number,
    patch: {
      displayName?: string;
      phoneNumber?: string;
      phoneStatus?: 'contact_only' | 'verified';
      displayTimezone?: string;
      pendingEmail?: string | null;
    }
  ): Promise<{ ok: true; profile: UserProfile } | { ok: false; code: 'STALE_RECORD' }> {
    const updatePayload: Record<string, unknown> = {
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    };
    if (patch.displayName !== undefined) updatePayload.display_name = patch.displayName;
    if (patch.phoneNumber !== undefined) updatePayload.phone_number = patch.phoneNumber;
    if (patch.phoneStatus !== undefined) updatePayload.phone_status = patch.phoneStatus;
    if (patch.displayTimezone !== undefined) updatePayload.display_timezone = patch.displayTimezone;
    if (patch.pendingEmail !== undefined) updatePayload.pending_email = patch.pendingEmail;

    const { data, error } = await this.client
      .from('profiles')
      .update(updatePayload)
      .eq('user_id', userId)
      .eq('version', expectedVersion)
      .select('*')
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    if (!data) return { ok: false, code: 'STALE_RECORD' };

    const authUser = await this.client.auth.admin.getUserById(userId);
    const email = authUser.data.user?.email ?? '';
    return { ok: true, profile: this.mapProfileRow(data, email) };
  }

  async listMembershipsForUser(userId: string, email: string): Promise<ProjectMembership[]> {
    const { data, error } = await this.client
      .from('project_memberships')
      .select('*')
      .or(`user_id.eq.${userId},invited_email.ilike.${email}`);

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return (data ?? []).map((row) => this.mapMembership(row));
  }

  async getMembership(projectId: string, userId: string): Promise<ProjectMembership | null> {
    const { data, error } = await this.client
      .from('project_memberships')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapMembership(data) : null;
  }

  private mapMembership(row: Record<string, unknown>): ProjectMembership {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      userId: row.user_id ? String(row.user_id) : null,
      invitedEmail: row.invited_email ? String(row.invited_email) : null,
      role: row.role as ProjectRole,
      hasMandorGrant: Boolean(row.has_mandor_grant),
      hasAccountingGrant: Boolean(row.has_accounting_grant),
      status: row.status as 'active' | 'invited' | 'revoked',
    };
  }

  private mapProject(row: Record<string, unknown>): StoredProjectRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      contractorDisplayName: String(row.contractor_display_name),
      timezone: String(row.timezone),
      status: row.status as ProjectStatus,
      draftStep: (Number(row.draft_step) as 1 | 2 | 3) || 1,
      draftKey: row.draft_key ? String(row.draft_key) : null,
      version: Number(row.version ?? 1),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    };
  }

  async getProjectById(projectId: string): Promise<StoredProjectRecord | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapProject(data) : null;
  }

  async listBlueprintsForProject(projectId: string): Promise<ProjectBlueprintRecord[]> {
    const { data, error } = await this.client
      .from('project_blueprints')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      areaName: String(row.area_name),
      sheetCode: String(row.sheet_code),
      revision: String(row.revision),
      status: row.status as BlueprintStatus,
      fileName: row.file_name ? String(row.file_name) : null,
      updatedAt: String(row.updated_at),
    }));
  }

  async findActiveDraftByKey(userId: string, draftKey: string): Promise<StoredProjectRecord | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('created_by', userId)
      .eq('draft_key', draftKey)
      .eq('status', 'draft')
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapProject(data) : null;
  }

  async findLatestDraftForUser(userId: string): Promise<StoredProjectRecord | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('created_by', userId)
      .eq('status', 'draft')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapProject(data) : null;
  }

  async createProjectDraftAtomic(input: {
    creatorUserId: string;
    actorName: string;
    name: string;
    contractorDisplayName: string;
    timezone: string;
    draftKey: string;
    passwordHash: string;
  }): Promise<{ project: StoredProjectRecord; resumed: boolean }> {
    const { data, error } = await this.client.rpc('create_project_draft_atomic', {
      p_creator_user_id: input.creatorUserId,
      p_actor_name: input.actorName,
      p_name: input.name,
      p_contractor_display_name: input.contractorDisplayName,
      p_timezone: input.timezone,
      p_draft_key: input.draftKey,
      p_password_hash: input.passwordHash,
    });

    if (error || !Array.isArray(data) || data.length === 0) {
      throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Atomic draft creation failed.');
    }

    const row = data[0] as { project_id: string; resumed: boolean };
    const project = await this.getProjectById(row.project_id);
    if (!project) {
      throw new ServiceError(500, 'DB_ERROR', 'Created draft project could not be loaded.');
    }
    return { project, resumed: Boolean(row.resumed) };
  }

  async updateProjectGeneral(
    projectId: string,
    expectedVersion: number,
    patch: {
      name: string;
      contractorDisplayName: string;
      timezone: string;
      draftStep?: 1 | 2 | 3;
    }
  ): Promise<
    { ok: true; project: StoredProjectRecord } | { ok: false; code: 'STALE_RECORD' | 'NOT_FOUND' }
  > {
    const payload: Record<string, unknown> = {
      name: patch.name,
      contractor_display_name: patch.contractorDisplayName,
      timezone: patch.timezone,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    };
    if (patch.draftStep !== undefined) payload.draft_step = patch.draftStep;

    const { data, error } = await this.client
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .eq('version', expectedVersion)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    if (!data) {
      const exists = await this.getProjectById(projectId);
      return exists && !exists.deletedAt
        ? { ok: false, code: 'STALE_RECORD' }
        : { ok: false, code: 'NOT_FOUND' };
    }
    return { ok: true, project: this.mapProject(data) };
  }

  async updateProjectStatus(
    projectId: string,
    status: ProjectStatus,
    draftStep?: 1 | 2 | 3
  ): Promise<StoredProjectRecord | null> {
    const payload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (draftStep !== undefined) payload.draft_step = draftStep;
    const { data, error } = await this.client
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapProject(data) : null;
  }

  async softDeleteProject(projectId: string): Promise<StoredProjectRecord | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('projects')
      .update({ status: 'deleted', deleted_at: now, updated_at: now })
      .eq('id', projectId)
      .select('*')
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapProject(data) : null;
  }

  async upsertDraftBlueprint(input: {
    id?: string;
    projectId: string;
    areaId?: string;
    areaName: string;
    sheetCode: string;
    revision: string;
    fileName: string | null;
    status: BlueprintStatus;
  }): Promise<ProjectBlueprintRecord> {
    const now = new Date().toISOString();
    const rowPayload: Record<string, unknown> = {
      project_id: input.projectId,
      area_name: input.areaName,
      sheet_code: input.sheetCode,
      revision: input.revision,
      file_name: input.fileName,
      status: input.status,
      updated_at: now,
    };
    if (input.id) rowPayload.id = input.id;

    const { data, error } = await this.client
      .from('project_blueprints')
      .upsert(rowPayload)
      .select('*')
      .single();

    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to save blueprint.');
    return {
      id: String(data.id),
      projectId: String(data.project_id),
      areaId: input.areaId,
      areaName: String(data.area_name),
      sheetCode: String(data.sheet_code),
      revision: String(data.revision),
      status: data.status as BlueprintStatus,
      fileName: data.file_name ? String(data.file_name) : null,
      updatedAt: String(data.updated_at),
    };
  }

  async updateBlueprintStatus(
    projectId: string,
    blueprintId: string,
    status: BlueprintStatus,
    fileName?: string | null
  ): Promise<ProjectBlueprintRecord | null> {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (fileName !== undefined) patch.file_name = fileName;

    const { data, error } = await this.client
      .from('project_blueprints')
      .update(patch)
      .eq('id', blueprintId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      projectId: String(data.project_id),
      areaName: String(data.area_name),
      sheetCode: String(data.sheet_code),
      revision: String(data.revision),
      status: data.status as BlueprintStatus,
      fileName: data.file_name ? String(data.file_name) : null,
      updatedAt: String(data.updated_at),
    };
  }

  // Areas
  private mapArea(row: Record<string, unknown>): ProjectAreaRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      name: String(row.name),
      sortOrder: Number(row.sort_order ?? 0),
      isRegisteredInCommonFrame: Boolean(row.is_registered_in_common_frame),
      frameOffsetXM: Number(row.frame_offset_x_m ?? 0),
      frameOffsetYM: Number(row.frame_offset_y_m ?? 0),
      frameOffsetZM: Number(row.frame_offset_z_m ?? 0),
      activeModelVersionId: row.active_model_version_id ? String(row.active_model_version_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listAreas(projectId: string): Promise<ProjectAreaRecord[]> {
    const { data, error } = await this.client
      .from('project_areas')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return (data ?? []).map((r) => this.mapArea(r));
  }

  async createArea(input: {
    projectId: string;
    name: string;
    sortOrder: number;
    isRegisteredInCommonFrame: boolean;
    frameOffsetXM?: number;
    frameOffsetYM?: number;
    frameOffsetZM?: number;
  }): Promise<ProjectAreaRecord> {
    const { data, error } = await this.client
      .from('project_areas')
      .insert({
        project_id: input.projectId,
        name: input.name,
        sort_order: input.sortOrder,
        is_registered_in_common_frame: input.isRegisteredInCommonFrame,
        frame_offset_x_m: input.frameOffsetXM ?? 0,
        frame_offset_y_m: input.frameOffsetYM ?? 0,
        frame_offset_z_m: input.frameOffsetZM ?? 0,
      })
      .select('*')
      .single();
    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to create area.');
    return this.mapArea(data);
  }

  async updateAreaActiveModel(
    projectId: string,
    areaId: string,
    activeModelVersionId: string | null
  ): Promise<ProjectAreaRecord | null> {
    const { data, error } = await this.client
      .from('project_areas')
      .update({
        active_model_version_id: activeModelVersionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', areaId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapArea(data) : null;
  }

  // Assets
  private mapAsset(row: Record<string, unknown>, areaName = ''): BlueprintAssetRecord {
    const id = String(row.id);
    const projectId = String(row.project_id);
    return {
      id,
      projectId,
      areaId: String(row.area_id),
      areaName: String((row.area_name as string) || areaName || 'Area'),
      sheetCode: String(row.sheet_code),
      revision: String(row.revision),
      fileName: String(row.file_name),
      mimeType: row.mime_type as 'application/pdf' | 'image/png' | 'image/jpeg',
      sizeBytes: Number(row.size_bytes ?? 0),
      planPage: Number(row.plan_page ?? 1),
      planRegion: row.plan_region as PlanRegionNormalized,
      calibration: row.calibration as BlueprintCalibration,
      status: row.status as BlueprintStatus,
      privateFileUrl: `/api/projects/${projectId}/assets/${id}/file`,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listAssets(projectId: string): Promise<BlueprintAssetRecord[]> {
    const [areas, { data, error }] = await Promise.all([
      this.listAreas(projectId),
      this.client
        .from('blueprint_assets')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ]);
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    const areaMap = new Map(areas.map((a) => [a.id, a.name]));
    return (data ?? []).map((r) => this.mapAsset(r, areaMap.get(String(r.area_id)) ?? 'Area'));
  }

  async getAssetById(projectId: string, assetId: string): Promise<BlueprintAssetRecord | null> {
    const { data, error } = await this.client
      .from('blueprint_assets')
      .select('*')
      .eq('id', assetId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    if (!data) return null;
    const areas = await this.listAreas(projectId);
    const areaName = areas.find((a) => a.id === String(data.area_id))?.name ?? 'Area';
    return this.mapAsset(data, areaName);
  }

  async createAsset(input: {
    id: string;
    projectId: string;
    areaId: string;
    areaName: string;
    sheetCode: string;
    revision: string;
    fileName: string;
    mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
    sizeBytes: number;
    storagePath: string;
    planPage: number;
    planRegion: PlanRegionNormalized;
    calibration: BlueprintCalibration;
    status: BlueprintStatus;
    uploadedBy: string;
  }): Promise<BlueprintAssetRecord> {
    const { data, error } = await this.client
      .from('blueprint_assets')
      .insert({
        id: input.id,
        project_id: input.projectId,
        area_id: input.areaId,
        sheet_code: input.sheetCode,
        revision: input.revision,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        storage_path: input.storagePath,
        plan_page: input.planPage,
        plan_region: input.planRegion,
        calibration: input.calibration,
        status: input.status,
        uploaded_by: input.uploadedBy,
      })
      .select('*')
      .single();
    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to store blueprint asset.');
    return this.mapAsset(data, input.areaName);
  }

  async updateAssetStatus(
    projectId: string,
    assetId: string,
    status: BlueprintStatus
  ): Promise<BlueprintAssetRecord | null> {
    const { data, error } = await this.client
      .from('blueprint_assets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', assetId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    if (!data) return null;
    const areas = await this.listAreas(projectId);
    const areaName = areas.find((a) => a.id === String(data.area_id))?.name ?? 'Area';
    return this.mapAsset(data, areaName);
  }

  // Jobs
  private mapJob(row: Record<string, unknown>): ProcessingJobRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      areaId: String(row.area_id),
      blueprintAssetId: String(row.blueprint_asset_id),
      submissionKey: String(row.submission_key),
      mode: row.mode === 'replacement' ? 'replacement' : 'initial',
      replacesModelVersionId: row.replaces_model_version_id ? String(row.replaces_model_version_id) : null,
      status: row.status as ProcessingJobRecord['status'],
      aiProvider: row.ai_provider ? String(row.ai_provider) : null,
      aiModel: row.ai_model ? String(row.ai_model) : null,
      errorCode: row.error_code ? String(row.error_code) : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      proposal: (row.proposal as BlueprintGeometryProposal | null) ?? null,
      builtModel: (row.built_model as BuiltAreaModelSpec | null) ?? null,
      attemptCount: Number(row.attempt_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listJobs(projectId: string): Promise<ProcessingJobRecord[]> {
    const { data, error } = await this.client
      .from('processing_jobs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return (data ?? []).map((r) => this.mapJob(r));
  }

  async getJobById(projectId: string, jobId: string): Promise<ProcessingJobRecord | null> {
    const { data, error } = await this.client
      .from('processing_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapJob(data) : null;
  }

  async findJobBySubmissionKey(
    projectId: string,
    submissionKey: string
  ): Promise<ProcessingJobRecord | null> {
    const { data, error } = await this.client
      .from('processing_jobs')
      .select('*')
      .eq('project_id', projectId)
      .eq('submission_key', submissionKey)
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapJob(data) : null;
  }

  async createJob(input: {
    projectId: string;
    areaId: string;
    blueprintAssetId: string;
    submissionKey: string;
    mode: 'initial' | 'replacement';
    replacesModelVersionId: string | null;
    createdBy: string;
  }): Promise<ProcessingJobRecord> {
    const { data, error } = await this.client
      .from('processing_jobs')
      .insert({
        project_id: input.projectId,
        area_id: input.areaId,
        blueprint_asset_id: input.blueprintAssetId,
        submission_key: input.submissionKey,
        mode: input.mode,
        replaces_model_version_id: input.replacesModelVersionId,
        status: 'queued',
        created_by: input.createdBy,
      })
      .select('*')
      .single();
    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to create job.');
    return this.mapJob(data);
  }

  async updateJob(job: ProcessingJobRecord): Promise<ProcessingJobRecord> {
    const { data, error } = await this.client
      .from('processing_jobs')
      .update({
        status: job.status,
        ai_provider: job.aiProvider,
        ai_model: job.aiModel,
        error_code: job.errorCode,
        error_message: job.errorMessage,
        proposal: job.proposal,
        built_model: job.builtModel,
        attempt_count: job.attemptCount,
        updated_at: job.updatedAt,
      })
      .eq('id', job.id)
      .eq('project_id', job.projectId)
      .select('*')
      .single();
    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to update job.');
    return this.mapJob(data);
  }

  // Model Versions
  private mapModelVersion(row: Record<string, unknown>): ModelVersionRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      areaId: String(row.area_id),
      blueprintAssetId: String(row.blueprint_asset_id),
      processingJobId: row.processing_job_id ? String(row.processing_job_id) : null,
      versionNumber: Number(row.version_number ?? 1),
      sheetCode: String(row.sheet_code),
      revision: String(row.revision),
      status: row.status as ModelVersionStatus,
      calibrationSnapshot: row.calibration_snapshot as BlueprintCalibration,
      geometry: row.geometry as BuiltAreaModelSpec,
      supersedesVersionId: row.supersedes_version_id ? String(row.supersedes_version_id) : null,
      verifiedBy: row.verified_by ? String(row.verified_by) : null,
      verifiedAt: row.verified_at ? String(row.verified_at) : null,
      publishedBy: row.published_by ? String(row.published_by) : null,
      publishedAt: row.published_at ? String(row.published_at) : null,
      createdAt: String(row.created_at),
    };
  }

  async listModelVersions(projectId: string): Promise<ModelVersionRecord[]> {
    const { data, error } = await this.client
      .from('model_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return (data ?? []).map((r) => this.mapModelVersion(r));
  }

  async getModelVersionById(
    projectId: string,
    versionId: string
  ): Promise<ModelVersionRecord | null> {
    const { data, error } = await this.client
      .from('model_versions')
      .select('*')
      .eq('id', versionId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapModelVersion(data) : null;
  }

  async createModelVersion(
    input: Omit<ModelVersionRecord, 'createdAt'>
  ): Promise<ModelVersionRecord> {
    const { data, error } = await this.client
      .from('model_versions')
      .insert({
        id: input.id,
        project_id: input.projectId,
        area_id: input.areaId,
        blueprint_asset_id: input.blueprintAssetId,
        processing_job_id: input.processingJobId,
        version_number: input.versionNumber,
        sheet_code: input.sheetCode,
        revision: input.revision,
        status: input.status,
        calibration_snapshot: input.calibrationSnapshot,
        geometry: input.geometry,
        supersedes_version_id: input.supersedesVersionId,
        verified_by: input.verifiedBy,
        verified_at: input.verifiedAt,
        published_by: input.publishedBy,
        published_at: input.publishedAt,
      })
      .select('*')
      .single();
    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to publish model version.');
    return this.mapModelVersion(data);
  }

  async updateModelVersionStatus(
    projectId: string,
    versionId: string,
    status: ModelVersionStatus
  ): Promise<ModelVersionRecord | null> {
    const { data, error } = await this.client
      .from('model_versions')
      .update({ status })
      .eq('id', versionId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapModelVersion(data) : null;
  }

  async updateModelVersionGeometry(
    projectId: string,
    versionId: string,
    geometry: BuiltAreaModelSpec
  ): Promise<ModelVersionRecord | null> {
    const { data, error } = await this.client
      .from('model_versions')
      .update({ geometry })
      .eq('id', versionId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return data ? this.mapModelVersion(data) : null;
  }

  // Pins
  private mapPin(row: Record<string, unknown>): ProjectPinRecord {
    const rawCat = String(row.category ?? 'Finishing');
    const department: ProjectPinRecord['department'] =
      rawCat === 'Civil' || rawCat === 'Electrical' || rawCat === 'Plumbing' || rawCat === 'Finishing'
        ? rawCat
        : 'Finishing';
    return {
      id: String(row.id),
      slug: String(row.slug),
      projectId: String(row.project_id ?? ''),
      areaId: String(row.area_id),
      modelVersionId: String(row.model_version_id),
      elementId: String(row.element_id),
      elementName: String(row.element_name),
      roomId: String(row.room_id),
      roomName: String(row.room_name),
      surfaceSide: String(row.surface_side),
      title: String(row.title),
      department,
      status: (String(row.status || 'open').toLowerCase() as ProjectPinRecord['status']),
      assigneeName: String(row.assigned_worker_name),
      description: String(row.description),
      position: row.position as ProjectPinRecord['position'],
      normal: row.normal as ProjectPinRecord['normal'],
      cycleNumber: 1,
      materials: (row.materials as ProjectPinRecord['materials']) ?? [],
      evidence: (row.evidence as ProjectPinRecord['evidence']) ?? { before: null, after: null },
      isDemoSeed: false,
      anchorStatus: (row.anchor_status as ProjectPinRecord['anchorStatus']) ?? 'valid',
      remappedFromVersionId: row.remapped_from_version_id ? String(row.remapped_from_version_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listPins(projectId: string): Promise<ProjectPinRecord[]> {
    const { data, error } = await this.client
      .from('project_pins')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return (data ?? []).map((r) => this.mapPin(r));
  }

  async createPin(projectId: string, pin: ProjectPinRecord): Promise<ProjectPinRecord> {
    const { data, error } = await this.client
      .from('project_pins')
      .insert({
        id: pin.id,
        project_id: projectId,
        area_id: pin.areaId,
        model_version_id: pin.modelVersionId,
        slug: pin.slug,
        element_id: pin.elementId,
        element_name: pin.elementName,
        room_id: pin.roomId,
        room_name: pin.roomName,
        surface_side: pin.surfaceSide,
        title: pin.title,
        category: pin.department,
        status: pin.status,
        assigned_worker_name: pin.assigneeName,
        description: pin.description,
        position: pin.position,
        normal: pin.normal,
        materials: pin.materials,
        evidence: pin.evidence,
        anchor_status: pin.anchorStatus,
        remapped_from_version_id: pin.remappedFromVersionId,
      })
      .select('*')
      .single();
    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to create Pin.');
    return this.mapPin(data);
  }

  async updatePin(projectId: string, pin: ProjectPinRecord): Promise<ProjectPinRecord> {
    const { data, error } = await this.client
      .from('project_pins')
      .update({
        model_version_id: pin.modelVersionId,
        element_id: pin.elementId,
        element_name: pin.elementName,
        room_id: pin.roomId,
        room_name: pin.roomName,
        surface_side: pin.surfaceSide,
        position: pin.position,
        normal: pin.normal,
        anchor_status: pin.anchorStatus,
        remapped_from_version_id: pin.remappedFromVersionId,
        updated_at: pin.updatedAt ?? new Date().toISOString(),
      })
      .eq('id', pin.id)
      .eq('project_id', projectId)
      .select('*')
      .single();
    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Failed to update Pin.');
    return this.mapPin(data);
  }

  async getProjectSecret(projectId: string): Promise<ProjectSecretRecord | null> {
    const { data, error } = await this.client
      .from('project_secrets')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    if (!data) return null;
    return {
      projectId: String(data.project_id),
      passwordHash: String(data.password_hash),
      failedAttempts: Number(data.failed_attempts ?? 0),
      lockedUntil: data.locked_until ? String(data.locked_until) : null,
      updatedAt: String(data.updated_at),
    };
  }

  async updateProjectSecret(secret: ProjectSecretRecord): Promise<void> {
    const { error } = await this.client
      .from('project_secrets')
      .update({
        password_hash: secret.passwordHash,
        failed_attempts: secret.failedAttempts,
        locked_until: secret.lockedUntil,
        updated_at: secret.updatedAt,
      })
      .eq('project_id', secret.projectId);

    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
  }

  async appendAuditEvent(event: AppendAuditInput): Promise<AuditEventRecord> {
    const { data, error } = await this.client
      .from('audit_events')
      .insert({
        scope: event.scope,
        project_id: event.projectId,
        actor_user_id: event.actorUserId,
        actor_name: event.actorName,
        action: event.action,
        object_type: event.objectType,
        object_id: event.objectId,
        object_label: event.objectLabel,
        result: event.result,
        reason: event.reason ?? null,
        before_summary: sanitizeAuditValues(event.beforeSummary),
        after_summary: sanitizeAuditValues(event.afterSummary),
      })
      .select('*')
      .single();

    if (error || !data) throw new ServiceError(500, 'DB_ERROR', error?.message ?? 'Audit write failed');
    return this.mapAudit(data);
  }

  async listAuditEvents(filter: {
    scope: AuditScope;
    projectId?: string;
    actorUserId?: string;
    objectType?: AuditObjectType;
    objectId?: string;
  }): Promise<AuditEventRecord[]> {
    let query = this.client
      .from('audit_events')
      .select('*')
      .eq('scope', filter.scope)
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (filter.projectId) query = query.eq('project_id', filter.projectId);
    if (filter.actorUserId) query = query.eq('actor_user_id', filter.actorUserId);
    if (filter.objectType) query = query.eq('object_type', filter.objectType);
    if (filter.objectId) query = query.eq('object_id', filter.objectId);

    const { data, error } = await query;
    if (error) throw new ServiceError(500, 'DB_ERROR', error.message);
    return (data ?? []).map((row) => this.mapAudit(row));
  }

  private mapAudit(row: Record<string, unknown>): AuditEventRecord {
    return {
      id: String(row.id),
      occurredAt: String(row.occurred_at),
      scope: row.scope as AuditScope,
      projectId: row.project_id ? String(row.project_id) : null,
      actorUserId: String(row.actor_user_id),
      actorName: String(row.actor_name),
      action: String(row.action),
      objectType: row.object_type as AuditObjectType,
      objectId: String(row.object_id),
      objectLabel: String(row.object_label),
      result: row.result as AuditResult,
      reason: row.reason ? String(row.reason) : null,
      beforeSummary: sanitizeAuditValues(row.before_summary as Record<string, unknown> | null),
      afterSummary: sanitizeAuditValues(row.after_summary as Record<string, unknown> | null),
    };
  }
}

/**
 * Deterministic in-memory repository strictly for automated unit/integration tests
 * (`node:test`). Never instantiated by the live production server.
 */
export class InMemoryVontaRepository implements VontaStoreRepository {
  profiles = new Map<string, UserProfile>();
  projects = new Map<string, StoredProjectRecord>();
  memberships: ProjectMembership[] = [];
  blueprints = new Map<string, ProjectBlueprintRecord[]>();
  areas = new Map<string, ProjectAreaRecord[]>();
  assets = new Map<string, BlueprintAssetRecord[]>();
  jobs = new Map<string, ProcessingJobRecord[]>();
  modelVersions = new Map<string, ModelVersionRecord[]>();
  pins = new Map<string, ProjectPinRecord[]>();
  secrets = new Map<string, ProjectSecretRecord>();
  auditEvents: AuditEventRecord[] = [];

  async getProfile(userId: string, fallbackEmail: string, fallbackName: string): Promise<UserProfile> {
    const existing = this.profiles.get(userId);
    if (existing) {
      if (existing.pendingEmail && existing.pendingEmail.toLowerCase() === fallbackEmail.toLowerCase()) {
        existing.email = fallbackEmail;
        existing.pendingEmail = null;
      } else {
        existing.email = fallbackEmail;
      }
      return { ...existing };
    }
    const created: UserProfile = {
      userId,
      email: fallbackEmail,
      pendingEmail: null,
      displayName: fallbackName || fallbackEmail.split('@')[0] || 'User',
      phoneNumber: '',
      phoneStatus: 'contact_only',
      displayTimezone: 'Asia/Jakarta',
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(userId, created);
    return { ...created };
  }

  async updateProfile(
    userId: string,
    expectedVersion: number,
    patch: {
      displayName?: string;
      phoneNumber?: string;
      phoneStatus?: 'contact_only' | 'verified';
      displayTimezone?: string;
      pendingEmail?: string | null;
    }
  ): Promise<{ ok: true; profile: UserProfile } | { ok: false; code: 'STALE_RECORD' }> {
    const current = this.profiles.get(userId);
    if (!current || current.version !== expectedVersion) {
      return { ok: false, code: 'STALE_RECORD' };
    }
    const next: UserProfile = {
      ...current,
      displayName: patch.displayName ?? current.displayName,
      phoneNumber: patch.phoneNumber ?? current.phoneNumber,
      phoneStatus: patch.phoneStatus ?? current.phoneStatus,
      displayTimezone: patch.displayTimezone ?? current.displayTimezone,
      pendingEmail: patch.pendingEmail !== undefined ? patch.pendingEmail : current.pendingEmail,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(userId, next);
    return { ok: true, profile: { ...next } };
  }

  async listMembershipsForUser(userId: string, email: string): Promise<ProjectMembership[]> {
    return this.memberships
      .filter(
        (m) =>
          m.userId === userId ||
          (m.invitedEmail && m.invitedEmail.toLowerCase() === email.toLowerCase())
      )
      .map((m) => ({ ...m }));
  }

  async getMembership(projectId: string, userId: string): Promise<ProjectMembership | null> {
    const found = this.memberships.find((m) => m.projectId === projectId && m.userId === userId);
    return found ? { ...found } : null;
  }

  async getProjectById(projectId: string): Promise<StoredProjectRecord | null> {
    const found = this.projects.get(projectId);
    return found ? { ...found } : null;
  }

  async listBlueprintsForProject(projectId: string): Promise<ProjectBlueprintRecord[]> {
    return (this.blueprints.get(projectId) ?? []).map((b) => ({ ...b }));
  }

  async findActiveDraftByKey(userId: string, draftKey: string): Promise<StoredProjectRecord | null> {
    for (const p of this.projects.values()) {
      if (p.createdBy === userId && p.draftKey === draftKey && p.status === 'draft' && !p.deletedAt) {
        return { ...p };
      }
    }
    return null;
  }

  async findLatestDraftForUser(userId: string): Promise<StoredProjectRecord | null> {
    const drafts = Array.from(this.projects.values())
      .filter((p) => p.createdBy === userId && p.status === 'draft' && !p.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return drafts[0] ? { ...drafts[0] } : null;
  }

  async createProjectDraftAtomic(input: {
    creatorUserId: string;
    actorName: string;
    name: string;
    contractorDisplayName: string;
    timezone: string;
    draftKey: string;
    passwordHash: string;
  }): Promise<{ project: StoredProjectRecord; resumed: boolean }> {
    const existing = await this.findActiveDraftByKey(input.creatorUserId, input.draftKey);
    if (existing) {
      return { project: existing, resumed: true };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const project: StoredProjectRecord = {
      id,
      name: input.name,
      contractorDisplayName: input.contractorDisplayName,
      timezone: input.timezone,
      status: 'draft',
      draftStep: 2,
      draftKey: input.draftKey,
      version: 1,
      createdBy: input.creatorUserId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.projects.set(id, project);
    this.memberships.push({
      id: randomUUID(),
      projectId: id,
      userId: input.creatorUserId,
      invitedEmail: null,
      role: 'contractor',
      hasMandorGrant: false,
      hasAccountingGrant: false,
      status: 'active',
    });
    this.secrets.set(id, {
      projectId: id,
      passwordHash: input.passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    });
    await this.appendAuditEvent({
      scope: 'project',
      projectId: id,
      actorUserId: input.creatorUserId,
      actorName: input.actorName,
      action: 'project.draft_created',
      objectType: 'project',
      objectId: id,
      objectLabel: project.name,
      result: 'success',
      afterSummary: {
        name: project.name,
        contractorDisplayName: project.contractorDisplayName,
        timezone: project.timezone,
        status: project.status,
      },
    });

    return { project: { ...project }, resumed: false };
  }

  async updateProjectGeneral(
    projectId: string,
    expectedVersion: number,
    patch: {
      name: string;
      contractorDisplayName: string;
      timezone: string;
      draftStep?: 1 | 2 | 3;
    }
  ): Promise<
    { ok: true; project: StoredProjectRecord } | { ok: false; code: 'STALE_RECORD' | 'NOT_FOUND' }
  > {
    const current = this.projects.get(projectId);
    if (!current || current.deletedAt) return { ok: false, code: 'NOT_FOUND' };
    if (current.version !== expectedVersion) return { ok: false, code: 'STALE_RECORD' };

    const next: StoredProjectRecord = {
      ...current,
      name: patch.name,
      contractorDisplayName: patch.contractorDisplayName,
      timezone: patch.timezone,
      draftStep: patch.draftStep ?? current.draftStep,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(projectId, next);
    return { ok: true, project: { ...next } };
  }

  async updateProjectStatus(
    projectId: string,
    status: ProjectStatus,
    draftStep?: 1 | 2 | 3
  ): Promise<StoredProjectRecord | null> {
    const current = this.projects.get(projectId);
    if (!current || current.deletedAt) return null;
    const next: StoredProjectRecord = {
      ...current,
      status,
      draftStep: draftStep ?? current.draftStep,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(projectId, next);
    return { ...next };
  }

  async softDeleteProject(projectId: string): Promise<StoredProjectRecord | null> {
    const current = this.projects.get(projectId);
    if (!current) return null;
    const now = new Date().toISOString();
    const next: StoredProjectRecord = {
      ...current,
      status: 'deleted',
      deletedAt: now,
      updatedAt: now,
    };
    this.projects.set(projectId, next);
    return { ...next };
  }

  async upsertDraftBlueprint(input: {
    id?: string;
    projectId: string;
    areaId?: string;
    areaName: string;
    sheetCode: string;
    revision: string;
    fileName: string | null;
    status: BlueprintStatus;
  }): Promise<ProjectBlueprintRecord> {
    const list = this.blueprints.get(input.projectId) ?? [];
    const targetId = input.id ?? randomUUID();
    const existingIdx = list.findIndex((b) => b.id === targetId);
    const record: ProjectBlueprintRecord = {
      id: targetId,
      projectId: input.projectId,
      areaId: input.areaId,
      areaName: input.areaName,
      sheetCode: input.sheetCode,
      revision: input.revision,
      status: input.status,
      fileName: input.fileName,
      updatedAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      list[existingIdx] = record;
    } else {
      list.push(record);
    }
    this.blueprints.set(input.projectId, list);
    return { ...record };
  }

  async updateBlueprintStatus(
    projectId: string,
    blueprintId: string,
    status: BlueprintStatus,
    fileName?: string | null
  ): Promise<ProjectBlueprintRecord | null> {
    const list = this.blueprints.get(projectId) ?? [];
    const idx = list.findIndex((b) => b.id === blueprintId);
    if (idx === -1) return null;
    const updated: ProjectBlueprintRecord = {
      ...list[idx],
      status,
      fileName: fileName !== undefined ? fileName : list[idx].fileName,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    return { ...updated };
  }

  async listAreas(projectId: string): Promise<ProjectAreaRecord[]> {
    return (this.areas.get(projectId) ?? [])
      .map((a) => ({ ...a }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createArea(input: {
    projectId: string;
    name: string;
    sortOrder: number;
    isRegisteredInCommonFrame: boolean;
    frameOffsetXM?: number;
    frameOffsetYM?: number;
    frameOffsetZM?: number;
  }): Promise<ProjectAreaRecord> {
    const now = new Date().toISOString();
    const record: ProjectAreaRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      sortOrder: input.sortOrder,
      isRegisteredInCommonFrame: input.isRegisteredInCommonFrame,
      frameOffsetXM: input.frameOffsetXM ?? 0,
      frameOffsetYM: input.frameOffsetYM ?? 0,
      frameOffsetZM: input.frameOffsetZM ?? 0,
      activeModelVersionId: null,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.areas.get(input.projectId) ?? [];
    list.push(record);
    this.areas.set(input.projectId, list);
    return { ...record };
  }

  async updateAreaActiveModel(
    projectId: string,
    areaId: string,
    activeModelVersionId: string | null
  ): Promise<ProjectAreaRecord | null> {
    const list = this.areas.get(projectId) ?? [];
    const idx = list.findIndex((a) => a.id === areaId);
    if (idx === -1) return null;
    const updated: ProjectAreaRecord = {
      ...list[idx],
      activeModelVersionId,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    return { ...updated };
  }

  async listAssets(projectId: string): Promise<BlueprintAssetRecord[]> {
    return (this.assets.get(projectId) ?? []).map((a) => ({ ...a }));
  }

  async getAssetById(projectId: string, assetId: string): Promise<BlueprintAssetRecord | null> {
    const found = (this.assets.get(projectId) ?? []).find((a) => a.id === assetId);
    return found ? { ...found } : null;
  }

  async createAsset(input: {
    id: string;
    projectId: string;
    areaId: string;
    areaName: string;
    sheetCode: string;
    revision: string;
    fileName: string;
    mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
    sizeBytes: number;
    storagePath: string;
    planPage: number;
    planRegion: PlanRegionNormalized;
    calibration: BlueprintCalibration;
    status: BlueprintStatus;
    uploadedBy: string;
  }): Promise<BlueprintAssetRecord> {
    const now = new Date().toISOString();
    const record: BlueprintAssetRecord = {
      id: input.id,
      projectId: input.projectId,
      areaId: input.areaId,
      areaName: input.areaName,
      sheetCode: input.sheetCode,
      revision: input.revision,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      planPage: input.planPage,
      planRegion: input.planRegion,
      calibration: input.calibration,
      status: input.status,
      privateFileUrl: `/api/projects/${input.projectId}/assets/${input.id}/file`,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.assets.get(input.projectId) ?? [];
    list.unshift(record);
    this.assets.set(input.projectId, list);
    return { ...record };
  }

  async updateAssetStatus(
    projectId: string,
    assetId: string,
    status: BlueprintStatus
  ): Promise<BlueprintAssetRecord | null> {
    const list = this.assets.get(projectId) ?? [];
    const idx = list.findIndex((a) => a.id === assetId);
    if (idx === -1) return null;
    const updated: BlueprintAssetRecord = {
      ...list[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    return { ...updated };
  }

  async listJobs(projectId: string): Promise<ProcessingJobRecord[]> {
    return (this.jobs.get(projectId) ?? []).map((j) => ({ ...j }));
  }

  async getJobById(projectId: string, jobId: string): Promise<ProcessingJobRecord | null> {
    const found = (this.jobs.get(projectId) ?? []).find((j) => j.id === jobId);
    return found ? { ...found } : null;
  }

  async findJobBySubmissionKey(
    projectId: string,
    submissionKey: string
  ): Promise<ProcessingJobRecord | null> {
    const found = (this.jobs.get(projectId) ?? []).find((j) => j.submissionKey === submissionKey);
    return found ? { ...found } : null;
  }

  async createJob(input: {
    projectId: string;
    areaId: string;
    blueprintAssetId: string;
    submissionKey: string;
    mode: 'initial' | 'replacement';
    replacesModelVersionId: string | null;
    createdBy: string;
  }): Promise<ProcessingJobRecord> {
    const now = new Date().toISOString();
    const record: ProcessingJobRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      areaId: input.areaId,
      blueprintAssetId: input.blueprintAssetId,
      submissionKey: input.submissionKey,
      mode: input.mode,
      replacesModelVersionId: input.replacesModelVersionId,
      status: 'queued',
      aiProvider: null,
      aiModel: null,
      errorCode: null,
      errorMessage: null,
      proposal: null,
      builtModel: null,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.jobs.get(input.projectId) ?? [];
    list.unshift(record);
    this.jobs.set(input.projectId, list);
    return { ...record };
  }

  async updateJob(job: ProcessingJobRecord): Promise<ProcessingJobRecord> {
    const list = this.jobs.get(job.projectId) ?? [];
    const idx = list.findIndex((j) => j.id === job.id);
    if (idx >= 0) {
      list[idx] = { ...job };
    } else {
      list.unshift({ ...job });
      this.jobs.set(job.projectId, list);
    }
    return { ...job };
  }

  async listModelVersions(projectId: string): Promise<ModelVersionRecord[]> {
    return (this.modelVersions.get(projectId) ?? []).map((v) => ({ ...v }));
  }

  async getModelVersionById(
    projectId: string,
    versionId: string
  ): Promise<ModelVersionRecord | null> {
    const found = (this.modelVersions.get(projectId) ?? []).find((v) => v.id === versionId);
    return found ? { ...found } : null;
  }

  async createModelVersion(
    input: Omit<ModelVersionRecord, 'createdAt'>
  ): Promise<ModelVersionRecord> {
    const record: ModelVersionRecord = {
      ...input,
      createdAt: new Date().toISOString(),
    };
    const list = this.modelVersions.get(input.projectId) ?? [];
    list.unshift(record);
    this.modelVersions.set(input.projectId, list);
    return { ...record };
  }

  async updateModelVersionStatus(
    projectId: string,
    versionId: string,
    status: ModelVersionStatus
  ): Promise<ModelVersionRecord | null> {
    const list = this.modelVersions.get(projectId) ?? [];
    const idx = list.findIndex((v) => v.id === versionId);
    if (idx === -1) return null;
    const updated: ModelVersionRecord = { ...list[idx], status };
    list[idx] = updated;
    return { ...updated };
  }

  async updateModelVersionGeometry(
    projectId: string,
    versionId: string,
    geometry: BuiltAreaModelSpec
  ): Promise<ModelVersionRecord | null> {
    const list = this.modelVersions.get(projectId) ?? [];
    const idx = list.findIndex((v) => v.id === versionId);
    if (idx === -1) return null;
    const updated: ModelVersionRecord = { ...list[idx], geometry };
    list[idx] = updated;
    return { ...updated };
  }

  async listPins(projectId: string): Promise<ProjectPinRecord[]> {
    return (this.pins.get(projectId) ?? []).map((p) => ({ ...p }));
  }

  async createPin(projectId: string, pin: ProjectPinRecord): Promise<ProjectPinRecord> {
    const list = this.pins.get(projectId) ?? [];
    list.unshift({ ...pin });
    this.pins.set(projectId, list);
    return { ...pin };
  }

  async updatePin(projectId: string, pin: ProjectPinRecord): Promise<ProjectPinRecord> {
    const list = this.pins.get(projectId) ?? [];
    const idx = list.findIndex((p) => p.id === pin.id);
    if (idx >= 0) {
      list[idx] = { ...pin };
    } else {
      list.unshift({ ...pin });
      this.pins.set(projectId, list);
    }
    return { ...pin };
  }

  async getProjectSecret(projectId: string): Promise<ProjectSecretRecord | null> {
    const found = this.secrets.get(projectId);
    return found ? { ...found } : null;
  }

  async updateProjectSecret(secret: ProjectSecretRecord): Promise<void> {
    this.secrets.set(secret.projectId, { ...secret });
  }

  async appendAuditEvent(event: AppendAuditInput): Promise<AuditEventRecord> {
    const record: AuditEventRecord = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      scope: event.scope,
      projectId: event.projectId,
      actorUserId: event.actorUserId,
      actorName: event.actorName,
      action: event.action,
      objectType: event.objectType,
      objectId: event.objectId,
      objectLabel: event.objectLabel,
      result: event.result,
      reason: event.reason ?? null,
      beforeSummary: sanitizeAuditValues(event.beforeSummary),
      afterSummary: sanitizeAuditValues(event.afterSummary),
    };
    this.auditEvents.push(record);
    return { ...record };
  }

  async listAuditEvents(filter: {
    scope: AuditScope;
    projectId?: string;
    actorUserId?: string;
    objectType?: AuditObjectType;
    objectId?: string;
  }): Promise<AuditEventRecord[]> {
    return this.auditEvents
      .filter((e) => {
        if (e.scope !== filter.scope) return false;
        if (filter.projectId && e.projectId !== filter.projectId) return false;
        if (filter.actorUserId && e.actorUserId !== filter.actorUserId) return false;
        if (filter.objectType && e.objectType !== filter.objectType) return false;
        if (filter.objectId && e.objectId !== filter.objectId) return false;
        return true;
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((e) => ({ ...e }));
  }
}
