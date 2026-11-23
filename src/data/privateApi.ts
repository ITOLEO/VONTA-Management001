import type {
  AuditEventRecord,
  AuditObjectType,
  AuthorizedProject,
  BlueprintAssetRecord,
  BlueprintCalibration,
  BlueprintGeometryProposal,
  BlueprintImpactSummary,
  ModelVersionRecord,
  PendingInvitationRecord,
  PinRemapDecision,
  PlanRegionNormalized,
  ProcessingJobRecord,
  ProjectAreaRecord,
  ProjectBlueprintRecord,
  ProjectPinRecord,
  UserProfile,
} from '../domain/accountTypes';
import type { DepartmentAttendanceDayMetric } from '../domain/attendanceEngine';

export class ApiClientError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
  isNetworkError: boolean;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    retryAfterSeconds?: number;
    details?: Record<string, unknown>;
    isNetworkError?: boolean;
  }) {
    super(options.message);
    this.status = options.status;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.details = options.details;
    this.isNetworkError = Boolean(options.isNetworkError);
  }
}

async function requestJson<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message:
        'Network request failed. Your unsaved input has been preserved—check your connection and try again.',
      isNetworkError: true,
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new ApiClientError({
      status: response.status,
      code: typeof body.code === 'string' ? body.code : 'REQUEST_FAILED',
      message:
        typeof body.message === 'string'
          ? body.message
          : `Request failed with status ${response.status}.`,
      fieldErrors:
        body.fieldErrors && typeof body.fieldErrors === 'object'
          ? (body.fieldErrors as Record<string, string>)
          : undefined,
      retryAfterSeconds:
        typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
      details:
        body.details && typeof body.details === 'object'
          ? (body.details as Record<string, unknown>)
          : undefined,
    });
  }

  return body as T;
}

export interface BlueprintUploadPayload {
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

export interface BlueprintUploadResponse {
  job: ProcessingJobRecord;
  asset: BlueprintAssetRecord;
  area: ProjectAreaRecord;
  project: AuthorizedProject;
  deduplicated: boolean;
}

export const privateApi = {
  listProjects(accessToken: string) {
    return requestJson<{
      projects: AuthorizedProject[];
      pendingInvitations: PendingInvitationRecord[];
      activeDraft: AuthorizedProject | null;
    }>('/api/projects', accessToken);
  },

  getActiveDraft(accessToken: string) {
    return requestJson<{ draft: AuthorizedProject | null }>('/api/projects/draft', accessToken);
  },

  createOrResumeDraft(
    accessToken: string,
    payload: {
      name: string;
      contractorDisplayName: string;
      projectPassword: string;
      confirmProjectPassword: string;
      timezone: string;
      draftKey?: string;
      existingDraftProjectId?: string;
    }
  ) {
    return requestJson<{ project: AuthorizedProject; resumed: boolean }>(
      '/api/projects/draft',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  getProject(accessToken: string, projectId: string) {
    return requestJson<{ project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      accessToken
    );
  },

  updateProjectGeneral(
    accessToken: string,
    projectId: string,
    payload: {
      name: string;
      contractorDisplayName: string;
      timezone: string;
      expectedVersion: number;
    }
  ) {
    return requestJson<{ project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  saveDraftBlueprint(
    accessToken: string,
    projectId: string,
    payload: {
      areaName: string;
      sheetCode: string;
      revision: string;
      fileName?: string | null;
    }
  ) {
    return requestJson<{ project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}/blueprints`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  addArea(
    accessToken: string,
    projectId: string,
    payload: {
      name: string;
      isRegisteredInCommonFrame?: boolean;
    }
  ) {
    return requestJson<{ area: ProjectAreaRecord; project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}/areas`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * Uploads blueprint file with real XHR upload progress events (no fake timers).
   */
  uploadBlueprintWithProgress(
    accessToken: string,
    projectId: string,
    payload: BlueprintUploadPayload,
    onProgress?: (percent: number) => void
  ): Promise<BlueprintUploadResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/projects/${encodeURIComponent(projectId)}/blueprints/upload`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          onProgress?.(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        }
      };

      xhr.onerror = () => {
        reject(
          new ApiClientError({
            status: 0,
            code: 'NETWORK_ERROR',
            message: 'Upload failed due to a network interruption. Your form inputs remain intact.',
            isNetworkError: true,
          })
        );
      };

      xhr.onload = () => {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(xhr.responseText || '{}') as Record<string, unknown>;
        } catch {
          body = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(body as unknown as BlueprintUploadResponse);
        } else {
          reject(
            new ApiClientError({
              status: xhr.status,
              code: typeof body.code === 'string' ? body.code : 'UPLOAD_FAILED',
              message:
                typeof body.message === 'string'
                  ? body.message
                  : `Upload failed with status ${xhr.status}.`,
              fieldErrors:
                body.fieldErrors && typeof body.fieldErrors === 'object'
                  ? (body.fieldErrors as Record<string, string>)
                  : undefined,
              details:
                body.details && typeof body.details === 'object'
                  ? (body.details as Record<string, unknown>)
                  : undefined,
            })
          );
        }
      };

      xhr.send(JSON.stringify(payload));
    });
  },

  getProcessingJob(accessToken: string, projectId: string, jobId: string) {
    return requestJson<{ job: ProcessingJobRecord }>(
      `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`,
      accessToken
    );
  },

  retryProcessingJob(accessToken: string, projectId: string, jobId: string) {
    return requestJson<{ job: ProcessingJobRecord; project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/retry`,
      accessToken,
      { method: 'POST' }
    );
  },

  updateJobProposal(
    accessToken: string,
    projectId: string,
    jobId: string,
    payload: {
      proposal: BlueprintGeometryProposal;
      calibration?: BlueprintCalibration;
    }
  ) {
    return requestJson<{ job: ProcessingJobRecord; project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/proposal`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  verifyAndPublishJob(
    accessToken: string,
    projectId: string,
    jobId: string,
    payload?: {
      verificationNotes?: string;
      pinRemapDecisions?: PinRemapDecision[];
    }
  ) {
    return requestJson<{
      modelVersion: ModelVersionRecord;
      job: ProcessingJobRecord;
      project: AuthorizedProject;
    }>(
      `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/publish`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      }
    );
  },

  addVerifiedRoom(
    accessToken: string,
    projectId: string,
    areaId: string,
    payload: {
      name: string;
      polygonMm: Array<{ xMm: number; zMm: number }>;
    }
  ) {
    return requestJson<{ modelVersion: ModelVersionRecord; project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}/areas/${encodeURIComponent(areaId)}/rooms`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  getBlueprintImpact(accessToken: string, projectId: string, blueprintId: string) {
    return requestJson<{ impact: BlueprintImpactSummary }>(
      `/api/projects/${encodeURIComponent(projectId)}/blueprints/${encodeURIComponent(blueprintId)}/impact`,
      accessToken
    );
  },

  removeOrRetireBlueprint(
    accessToken: string,
    projectId: string,
    blueprintId: string,
    payload: { mode: 'remove' | 'retire'; reason?: string }
  ) {
    return requestJson<{ impact: BlueprintImpactSummary; project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}/blueprints/${encodeURIComponent(blueprintId)}/retire`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  createProjectPin(
    accessToken: string,
    projectId: string,
    payload: {
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
    }
  ) {
    return requestJson<{ pin: ProjectPinRecord; project: AuthorizedProject }>(
      `/api/projects/${encodeURIComponent(projectId)}/pins`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async fetchPrivateAssetBlobUrl(accessToken: string, privateFileUrl: string): Promise<string | null> {
    try {
      const resp = await fetch(privateFileUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  },

  performBlueprintAction(
    accessToken: string,
    projectId: string,
    blueprintId: string,
    payload: { action: 'remove' | 'replace'; reason?: string }
  ) {
    return requestJson<{ blueprint: ProjectBlueprintRecord }>(
      `/api/projects/${encodeURIComponent(projectId)}/blueprints/${encodeURIComponent(blueprintId)}/action`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  changeProjectPassword(
    accessToken: string,
    projectId: string,
    payload: {
      currentPassword: string;
      newPassword: string;
      confirmNewPassword: string;
    }
  ) {
    return requestJson<{ changedAt: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/password`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  deleteProject(
    accessToken: string,
    projectId: string,
    payload: {
      keyword: string;
      typedProjectName: string;
      expectedVersion: number;
    }
  ) {
    return requestJson<{ deletedProjectId: string; alreadyDeleted: boolean; deletionMode: 'logical' }>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      accessToken,
      {
        method: 'DELETE',
        body: JSON.stringify(payload),
      }
    );
  },

  getProjectHistory(
    accessToken: string,
    projectId: string,
    filters?: { objectType?: AuditObjectType; objectId?: string }
  ) {
    const params = new URLSearchParams();
    if (filters?.objectType) params.set('objectType', filters.objectType);
    if (filters?.objectId) params.set('objectId', filters.objectId);
    const qs = params.toString();
    return requestJson<{ events: AuditEventRecord[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/history${qs ? `?${qs}` : ''}`,
      accessToken
    );
  },

  getProfile(accessToken: string) {
    return requestJson<{ profile: UserProfile }>('/api/profile', accessToken);
  },

  updateProfile(
    accessToken: string,
    payload: {
      displayName?: string;
      phoneNumber?: string;
      displayTimezone?: string;
      expectedVersion: number;
    }
  ) {
    return requestJson<{ profile: UserProfile }>('/api/profile', accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  recordAccountSecurityEvent(
    accessToken: string,
    payload: {
      eventType: 'account_password_changed' | 'account_password_failed';
      reason?: string;
    }
  ) {
    return requestJson<{ profile: UserProfile; event: AuditEventRecord }>(
      '/api/profile/security-events',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  requestAccountPasswordChallenge(
    accessToken: string,
    payload?: { providerReauthSent?: boolean }
  ) {
    return requestJson<{
      challengeId: string;
      registeredEmail: string;
      expiresAt: string;
      resendAfterSeconds: number;
      deliveryMode: 'supabase_reauth' | 'mail_sender' | 'delivery_unavailable';
      deliveryMessage: string;
    }>('/api/profile/password-challenge', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },

  verifyAccountPasswordChallenge(
    accessToken: string,
    payload: { challengeId: string; code: string }
  ) {
    return requestJson<{ verified: true; challengeId: string; verifiedAt: string }>(
      '/api/profile/password-challenge/verify',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  cancelAccountPasswordChallenge(accessToken: string, payload: { challengeId: string }) {
    return requestJson<{ cancelled: true }>(
      '/api/profile/password-challenge/cancel',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  getAccountHistory(accessToken: string) {
    return requestJson<{ events: AuditEventRecord[] }>('/api/profile/history', accessToken);
  },

  // --------------------------------------------------------------------------
  // 20 Nov 2026 Addendum: Members, Attendance, Izin, Workspace Outputs
  // --------------------------------------------------------------------------

  listProjectMembers(accessToken: string, projectId: string) {
    return requestJson<{
      members: Array<{
        membershipId: string;
        projectId: string;
        userId: string;
        displayName: string;
        email: string;
        role: 'contractor' | 'owner' | 'worker' | 'accounting';
        status: 'active' | 'invited' | 'revoked';
        hasMandorGrant: boolean;
        hasAccountingGrant: boolean;
        canDownloadWorkspaceView: boolean;
        canShareWorkspaceView: boolean;
        division: 'Civil' | 'Electrical' | 'Plumbing' | 'Finishing';
        teamId: string;
      }>;
    }>(`/api/projects/${encodeURIComponent(projectId)}/members`, accessToken);
  },

  updateMemberGrants(
    accessToken: string,
    projectId: string,
    userId: string,
    payload: {
      canDownloadWorkspaceView?: boolean;
      canShareWorkspaceView?: boolean;
      hasMandorGrant?: boolean;
      division?: 'Civil' | 'Electrical' | 'Plumbing' | 'Finishing';
      teamId?: string;
    }
  ) {
    return requestJson<{ member: Record<string, unknown> }>(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/grants`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  getAttendanceOverview(accessToken: string, projectId: string, workDate?: string) {
    const qs = workDate ? `?workDate=${encodeURIComponent(workDate)}` : '';
    return requestJson<{
      serverNowUtcMs: number;
      member: Record<string, unknown>;
      capabilities: {
        canDrawLocally: boolean;
        canDownloadWorkspaceView: boolean;
        canShareWorkspaceView: boolean;
        canManageGrants: boolean;
        isMandor: boolean;
      };
      obligations: Array<Record<string, unknown>>;
      history: Array<Record<string, unknown>>;
    }>(`/api/projects/${encodeURIComponent(projectId)}/attendance${qs}`, accessToken);
  },

  recordCheckIn(accessToken: string, projectId: string, obligationId: string) {
    return requestJson<{ record: Record<string, unknown>; reconciledFromAlfa: boolean }>(
      `/api/projects/${encodeURIComponent(projectId)}/attendance/${encodeURIComponent(obligationId)}/check-in`,
      accessToken,
      { method: 'POST' }
    );
  },

  uploadIzinEvidence(
    accessToken: string,
    projectId: string,
    payload: { fileName: string; mimeType: string; base64Data: string }
  ) {
    return requestJson<{
      photo: {
        id: string;
        projectId: string;
        workerUserId: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        uploadedAt: string;
      };
    }>(`/api/projects/${encodeURIComponent(projectId)}/attendance/izin-evidence`, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  submitIzinRequest(
    accessToken: string,
    projectId: string,
    payload: { obligationId: string; reason: string; evidencePhotoIds: string[] }
  ) {
    return requestJson<{ izinRequest: Record<string, unknown>; attendanceStatus: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/attendance/izin`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  getMandorReviewQueue(accessToken: string, projectId: string) {
    return requestJson<{
      queue: Array<Record<string, unknown>>;
      unassigned: Array<{
        izinId: string;
        workerName: string;
        division: string;
        workDate: string;
        status: string;
      }>;
    }>(`/api/projects/${encodeURIComponent(projectId)}/attendance/mandor-queue`, accessToken);
  },

  decideIzinRequest(
    accessToken: string,
    projectId: string,
    izinId: string,
    payload: {
      decision: 'approve' | 'reject';
      rejectionReason?: string;
      expectedVersion?: number;
    }
  ) {
    return requestJson<{
      izinRequest: Record<string, unknown>;
      attendanceRecord: Record<string, unknown> | null;
      effectiveAttendanceStatus: string;
    }>(
      `/api/projects/${encodeURIComponent(projectId)}/attendance/izin/${encodeURIComponent(izinId)}/decide`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  getDepartmentAttendanceMetrics(
    accessToken: string,
    projectId: string,
    params: { timezone: string; division?: string }
  ) {
    const qs = new URLSearchParams({ timezone: params.timezone });
    if (params.division) qs.set('division', params.division);
    return requestJson<{ serverNowUtcMs: number; days: DepartmentAttendanceDayMetric[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/attendance/department-metrics?${qs.toString()}`,
      accessToken
    );
  },

  authorizeWorkspaceDownload(
    accessToken: string,
    projectId: string,
    payload: { modelVersionId: string; areaId: string }
  ) {
    return requestJson<{
      authorized: true;
      exportToken: string;
      projectId: string;
      modelVersionId: string;
      areaId: string;
      issuedAt: string;
      suggestedFileName: string;
    }>(`/api/projects/${encodeURIComponent(projectId)}/workspace/export-authorize`, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createWorkspaceShare(
    accessToken: string,
    projectId: string,
    payload: {
      modelVersionId: string;
      areaId: string;
      roomId?: string | null;
      selectedPinId?: string | null;
      accessMode?: 'restricted' | 'anyone_with_link';
      camera: {
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
      };
      layers: {
        civil: boolean;
        electrical: boolean;
        plumbing: boolean;
        pins: boolean;
      };
    }
  ) {
    return requestJson<{
      share: {
        id: string;
        accessMode: 'restricted' | 'anyone_with_link';
        permission: 'viewer';
        publicToken: string | null;
        [key: string]: unknown;
      };
      sharePath: string;
    }>(`/api/projects/${encodeURIComponent(projectId)}/workspace/shares`, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateWorkspaceShareAccess(
    accessToken: string,
    projectId: string,
    shareId: string,
    accessMode: 'restricted' | 'anyone_with_link'
  ) {
    return requestJson<{
      share: {
        id: string;
        accessMode: 'restricted' | 'anyone_with_link';
        permission: 'viewer';
        publicToken: string | null;
      };
      sharePath: string;
    }>(
      `/api/projects/${encodeURIComponent(projectId)}/workspace/shares/${encodeURIComponent(shareId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ accessMode }),
      }
    );
  },

  revokeWorkspaceShare(accessToken: string, projectId: string, shareId: string) {
    return requestJson<{ revoked: true; shareId: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/workspace/shares/${encodeURIComponent(shareId)}`,
      accessToken,
      { method: 'DELETE' }
    );
  },

  resolveWorkspaceShare(accessToken: string, shareId: string) {
    return requestJson<{
      share: {
        id: string;
        projectId: string;
        modelVersionId: string;
        areaId: string;
        roomId: string | null;
        selectedPinId: string | null;
        accessMode: 'restricted' | 'anyone_with_link';
        permission: 'viewer';
        camera: {
          position: { x: number; y: number; z: number };
          target: { x: number; y: number; z: number };
        };
        layers: {
          civil: boolean;
          electrical: boolean;
          plumbing: boolean;
          pins: boolean;
        };
        createdByName: string;
        createdAt: string;
      };
      hideLocalDrawingsOnOpen: true;
      modelAvailable: boolean;
      recoveryMessage: string | null;
      fallbackWorkspacePath: string;
    }>(`/api/workspace/shares/${encodeURIComponent(shareId)}`, accessToken);
  },

  async resolvePublicWorkspaceShare(token: string) {
    const res = await fetch(`/api/public/workspace/shares/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiClientError({
        status: res.status,
        code: data?.code ?? 'ACCESS_DENIED',
        message: data?.message ?? 'This shared view link is restricted or disabled.',
      });
    }
    return data as {
      viewerShare: {
        areaId: string;
        modelVersionId: string;
        roomId: string | null;
        selectedPinId: string | null;
        camera: {
          position: { x: number; y: number; z: number };
          target: { x: number; y: number; z: number };
        };
        layers: {
          civil: boolean;
          electrical: boolean;
          plumbing: boolean;
          pins: boolean;
        };
        accessMode: 'anyone_with_link';
        permission: 'viewer';
        createdAt: string;
      };
      hideLocalDrawingsOnOpen: true;
      modelAvailable: boolean;
      recoveryMessage: string | null;
    };
  },
};
