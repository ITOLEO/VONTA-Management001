import type {
  BuildingElementSpec,
  CrossCheckMeasurement,
  OpeningSpec,
  RoomDefinition,
  SpatialPin,
} from './types';

export type ProjectRole = 'contractor' | 'owner' | 'architect' | 'worker' | 'accounting';
export type MembershipStatus = 'active' | 'invited' | 'revoked';

/** Separate project setup status: becomes 'ready' only after first verified model is published */
export type ProjectStatus = 'draft' | 'ready' | 'active' | 'archived' | 'deleted';

/** Legacy/summary blueprint asset status */
export type BlueprintStatus =
  | 'pending_upload'
  | 'uploaded'
  | 'processing'
  | 'published'
  | 'retired'
  | 'removed';

/** Durable processing job lifecycle status */
export type ProcessingJobStatus =
  | 'queued'
  | 'processing'
  | 'needs_input'
  | 'needs_review'
  | 'failed'
  | 'verified'
  | 'published';

/** Immutable model version lifecycle status */
export type ModelVersionStatus =
  | 'draft'
  | 'needs_review'
  | 'verified'
  | 'published'
  | 'superseded'
  | 'retired';

export type CalibrationUnit = 'mm' | 'cm' | 'm';

export type PhoneStatus = 'contact_only' | 'verified';

export type AuditScope = 'project' | 'account';
export type AuditResult = 'success' | 'rejected' | 'pending' | 'failed';
export type AuditObjectType =
  | 'project'
  | 'project_access'
  | 'area'
  | 'blueprint'
  | 'model'
  | 'pin'
  | 'qc'
  | 'profile'
  | 'security'
  | 'attendance'
  | 'izin_request'
  | 'workspace_output'
  | 'stock_movement'
  | 'budget_decision';

export interface PlanRegionNormalized {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface BlueprintCalibration {
  unit: CalibrationUnit;
  /** Two reference points in normalized image coordinates (0..1) */
  pointA: Point2D;
  pointB: Point2D;
  /** Physical distance between pointA and pointB expressed in millimeters */
  knownLengthMm: number;
  /** Image pixel width/height used to derive mm/px */
  imageWidthPx: number;
  imageHeightPx: number;
  /** Derived millimeters per normalized X unit (or image px) */
  mmPerPixel: number;
  wallHeightMm: number;
  exteriorWallMm: number;
  interiorWallMm: number;
}

export interface ProposedWallSegment {
  id: string;
  label: string;
  category: 'exterior_wall' | 'interior_partition';
  startXMm: number;
  startZMm: number;
  endXMm: number;
  endZMm: number;
  thicknessMm: number;
  heightMm: number;
}

export interface ProposedOpening {
  id: string;
  wallId: string;
  code: string;
  kind: 'door' | 'window';
  /** Distance from wall start along wall axis in mm */
  offsetMm: number;
  widthMm: number;
  sillMm: number;
  topMm: number;
}

export interface ProposedRoomBoundary {
  id: string;
  name: string;
  /** Closed polygon boundary in calibrated millimeters (X, Z) — minimum 3 vertices */
  polygonMm: Array<{ xMm: number; zMm: number }>;
  verified: boolean;
}

export interface BlueprintGeometryProposal {
  footprintLabel: string;
  sourceNotes: string;
  walls: ProposedWallSegment[];
  openings: ProposedOpening[];
  rooms: ProposedRoomBoundary[];
}

export interface BuiltAreaModelSpec {
  versionId: string;
  areaId: string;
  blueprintAssetId: string;
  sheetCode: string;
  revision: string;
  elements: BuildingElementSpec[];
  openings: OpeningSpec[];
  rooms: RoomDefinition[];
  crossCheck: CrossCheckMeasurement;
  footprintWidthMm: number;
  footprintDepthMm: number;
  wallCount: number;
}

export interface ProjectAreaRecord {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  isRegisteredInCommonFrame: boolean;
  frameOffsetXM: number;
  frameOffsetYM: number;
  frameOffsetZM: number;
  activeModelVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintAssetRecord {
  id: string;
  projectId: string;
  areaId: string;
  areaName: string;
  sheetCode: string;
  revision: string;
  fileName: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  sizeBytes: number;
  planPage: number;
  planRegion: PlanRegionNormalized;
  calibration: BlueprintCalibration;
  status: BlueprintStatus;
  /** Authenticated API URL for private image/file preview (never a public URL) */
  privateFileUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingJobRecord {
  id: string;
  projectId: string;
  areaId: string;
  blueprintAssetId: string;
  submissionKey: string;
  mode: 'initial' | 'replacement';
  replacesModelVersionId: string | null;
  status: ProcessingJobStatus;
  aiProvider: string | null;
  aiModel: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  proposal: BlueprintGeometryProposal | null;
  builtModel: BuiltAreaModelSpec | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelVersionRecord {
  id: string;
  projectId: string;
  areaId: string;
  blueprintAssetId: string;
  processingJobId: string | null;
  versionNumber: number;
  sheetCode: string;
  revision: string;
  status: ModelVersionStatus;
  calibrationSnapshot: BlueprintCalibration;
  geometry: BuiltAreaModelSpec;
  supersedesVersionId: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface ProjectPinRecord extends SpatialPin {
  anchorStatus: 'valid' | 'needs_remap' | 'remapped';
  remappedFromVersionId: string | null;
  updatedAt?: string;
}

export interface PinAnchorImpact {
  pinId: string;
  title: string;
  roomName: string;
  elementId: string;
  elementName: string;
  reason: string;
  hasEvidence: boolean;
  evidenceCount: number;
}

export interface PinRemapDecision {
  pinId: string;
  action: 'revalidate' | 'remap';
  targetElementId?: string;
  targetElementName?: string;
  targetRoomId?: string;
  targetRoomName?: string;
  position?: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
}

export interface BlueprintImpactSummary {
  blueprintId: string;
  areaId: string;
  areaName: string;
  sheetCode: string;
  revision: string;
  status: BlueprintStatus;
  dependentModelVersionIds: string[];
  publishedVersionCount: number;
  roomCount: number;
  pinCount: number;
  evidenceCount: number;
  canHardRemoveDraft: boolean;
  requiresRetireOrReplace: boolean;
  historyRetentionSummary: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  pendingEmail: string | null;
  displayName: string;
  phoneNumber: string;
  phoneStatus: PhoneStatus;
  displayTimezone: string;
  version: number;
  updatedAt: string;
}

export interface ProjectMembership {
  id: string;
  projectId: string;
  userId: string | null;
  invitedEmail: string | null;
  role: ProjectRole;
  hasMandorGrant: boolean;
  hasAccountingGrant: boolean;
  canDownloadWorkspaceView?: boolean;
  canShareWorkspaceView?: boolean;
  division?: string;
  teamId?: string;
  status: MembershipStatus;
}

export interface ProjectBlueprintRecord {
  id: string;
  projectId: string;
  areaId?: string;
  areaName: string;
  sheetCode: string;
  revision: string;
  status: BlueprintStatus;
  fileName: string | null;
  updatedAt: string;
}

export interface AuthorizedProject {
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
  membership: {
    role: ProjectRole;
    hasMandorGrant: boolean;
    hasAccountingGrant: boolean;
    canDownloadWorkspaceView?: boolean;
    canShareWorkspaceView?: boolean;
    division?: string;
    teamId?: string;
    status: MembershipStatus;
  };
  blueprints: ProjectBlueprintRecord[];
  areas?: ProjectAreaRecord[];
  assets?: BlueprintAssetRecord[];
  jobs?: ProcessingJobRecord[];
  modelVersions?: ModelVersionRecord[];
  pins?: ProjectPinRecord[];
}

export interface PendingInvitationRecord {
  id: string;
  projectId: string;
  projectName: string;
  role: ProjectRole;
  invitedEmail: string;
  createdAt: string;
}

export interface AuditEventRecord {
  id: string;
  occurredAt: string;
  scope: AuditScope;
  projectId: string | null;
  actorUserId: string;
  actorName: string;
  action: string;
  objectType: AuditObjectType;
  objectId: string;
  objectLabel: string;
  result: AuditResult;
  reason: string | null;
  beforeSummary: Record<string, unknown> | null;
  afterSummary: Record<string, unknown> | null;
}

export const COMMON_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (WIB · UTC+7)' },
  { value: 'Asia/Makassar', label: 'Asia/Makassar (WITA · UTC+8)' },
  { value: 'Asia/Jayapura', label: 'Asia/Jayapura (WIT · UTC+9)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT · UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST · UTC+9)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST · UTC+5:30)' },
  { value: 'Asia/Kathmandu', label: 'Asia/Kathmandu (NPT · UTC+5:45)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST · DST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST · DST)' },
  { value: 'America/New_York', label: 'America/New_York (ET · DST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT · DST)' },
  { value: 'Australia/Adelaide', label: 'Australia/Adelaide (ACST/ACDT · UTC+9:30/+10:30)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT · DST)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST/NZDT · DST)' },
];

export function canEditProjectSettings(role: ProjectRole | null | undefined): boolean {
  return role === 'contractor';
}

export function canPublishModel(role: ProjectRole | null | undefined): boolean {
  return role === 'contractor';
}

export function canManageProjectAccess(role: ProjectRole | null | undefined): boolean {
  return role === 'contractor';
}

export function formatRoleLabel(
  role: ProjectRole,
  grants?: { hasMandorGrant?: boolean; hasAccountingGrant?: boolean }
): string {
  const base =
    role === 'contractor'
      ? 'Contractor'
      : role === 'owner'
        ? 'Owner'
        : role === 'architect'
          ? 'Architect'
          : role === 'accounting'
            ? 'Accounting'
            : grants?.hasMandorGrant
              ? 'Foreman'
              : 'Worker';
  const extras: string[] = [];
  if (role === 'worker' && grants?.hasAccountingGrant) extras.push('Accounting');
  return extras.length > 0 ? `${base} (${extras.join(' + ')})` : base;
}

export function formatBlueprintStatusLabel(status: BlueprintStatus): string {
  switch (status) {
    case 'pending_upload':
      return 'Pending upload';
    case 'uploaded':
      return 'Uploaded (awaiting review)';
    case 'processing':
      return 'Processing';
    case 'published':
      return 'Published';
    case 'retired':
      return 'Retired (preserved in History)';
    case 'removed':
      return 'Removed';
  }
}

export function formatJobStatusLabel(status: ProcessingJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'needs_input':
      return 'Needs input';
    case 'needs_review':
      return 'Needs review';
    case 'failed':
      return 'Failed';
    case 'verified':
      return 'Verified';
    case 'published':
      return 'Published';
  }
}

export function formatProjectSetupStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft (setup in progress)';
    case 'ready':
    case 'active':
      return 'Ready';
    case 'archived':
      return 'Archived';
    case 'deleted':
      return 'Deleted';
  }
}

/**
 * Exact two-field destructive confirmation contract (Behavior #6):
 * - Field 1 must equal "DELETE" (exact case, no extra spaces).
 * - Fixed middle word is "PROJECT".
 * - Field 2 must match the exact current project display name (case & internal spaces).
 * Assembled phrase: `DELETE PROJECT ${typedProjectName}` vs `DELETE PROJECT ${actualProjectName}`.
 */
export function validateDeleteProjectPhrase(input: {
  keyword: string;
  typedProjectName: string;
  actualProjectName: string;
}): {
  valid: boolean;
  expectedPhrase: string;
  assembledPhrase: string;
  keywordError?: string;
  projectNameError?: string;
} {
  const expectedPhrase = `DELETE PROJECT ${input.actualProjectName}`;
  const assembledPhrase = `${input.keyword} PROJECT ${input.typedProjectName}`;

  const keywordValid = input.keyword === 'DELETE';
  const nameValid = input.typedProjectName === input.actualProjectName;

  return {
    valid: keywordValid && nameValid && assembledPhrase === expectedPhrase,
    expectedPhrase,
    assembledPhrase,
    keywordError: keywordValid ? undefined : 'Type DELETE in uppercase.',
    projectNameError: nameValid
      ? undefined
      : `Type "${input.actualProjectName}" matching exact case and spaces.`,
  };
}

const FORBIDDEN_AUDIT_KEY_PATTERN =
  /pass(word)?|hash|secret|token|code|credential|evidence|dataurl|blob|cookie|session|base64|filedata/i;

/**
 * Strips any secret, password, hash, token, verification code, or private evidence/file
 * fields before an audit event is stored or returned.
 */
export function sanitizeAuditValues(
  input: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_AUDIT_KEY_PATTERN.test(key)) {
      continue;
    }
    if (typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('data:application/pdf'))) {
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = sanitizeAuditValues(value as Record<string, unknown>);
      if (nested && Object.keys(nested).length > 0) {
        out[key] = nested;
      }
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function formatAuditTimestamp(iso: string, timezone?: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch {
    return iso;
  }
}

export interface ProjectDetailsValidationErrors {
  name?: string;
  contractorDisplayName?: string;
  projectPassword?: string;
  confirmProjectPassword?: string;
  timezone?: string;
}

export function validateProjectDraftInput(input: {
  name: string;
  contractorDisplayName: string;
  projectPassword: string;
  confirmProjectPassword: string;
  timezone: string;
  requirePassword?: boolean;
}): ProjectDetailsValidationErrors {
  const errors: ProjectDetailsValidationErrors = {};
  const name = input.name.trim();
  const contractor = input.contractorDisplayName.trim();

  if (!name) {
    errors.name = 'Project name is required.';
  } else if (name.length > 140) {
    errors.name = 'Project name must be 140 characters or fewer.';
  }

  if (!contractor) {
    errors.contractorDisplayName = 'Contractor name is required.';
  } else if (contractor.length > 140) {
    errors.contractorDisplayName = 'Contractor name must be 140 characters or fewer.';
  }

  if (input.requirePassword !== false) {
    if (!input.projectPassword) {
      errors.projectPassword = 'Project password is required.';
    } else if (input.projectPassword.length < 8) {
      errors.projectPassword = 'Project password must be at least 8 characters.';
    }

    if (!input.confirmProjectPassword) {
      errors.confirmProjectPassword = 'Confirm the project password.';
    } else if (input.projectPassword !== input.confirmProjectPassword) {
      errors.confirmProjectPassword = 'Project passwords do not match.';
    }
  }

  if (!input.timezone.trim()) {
    errors.timezone = 'Select a project timezone.';
  }

  return errors;
}

export interface ProjectPasswordChangeErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
}

export function validateProjectPasswordChangeInput(input: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}): ProjectPasswordChangeErrors {
  const errors: ProjectPasswordChangeErrors = {};
  if (!input.currentPassword) {
    errors.currentPassword = 'Enter the current project password.';
  }
  if (!input.newPassword) {
    errors.newPassword = 'Enter a new project password.';
  } else if (input.newPassword.length < 8) {
    errors.newPassword = 'New project password must be at least 8 characters.';
  } else if (input.currentPassword && input.newPassword === input.currentPassword) {
    errors.newPassword = 'New project password must differ from the current password.';
  }
  if (!input.confirmNewPassword) {
    errors.confirmNewPassword = 'Confirm the new project password.';
  } else if (input.newPassword !== input.confirmNewPassword) {
    errors.confirmNewPassword = 'New project passwords do not match.';
  }
  return errors;
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
