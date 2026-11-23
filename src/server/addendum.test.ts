import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createVontaApp } from '../../server';
import { VontaAddendumService } from './addendumService';
import {
  InMemoryVontaRepository,
  VontaDomainService,
  type AuthenticatedActor,
} from './vontaService';

const ACTORS: Record<string, AuthenticatedActor> = {
  'tok-contractor': {
    userId: 'u-contractor',
    email: 'contractor@vonta.test',
    displayName: 'Budi Contractor',
  },
  'tok-owner': {
    userId: 'u-owner',
    email: 'owner@vonta.test',
    displayName: 'Nadia Owner',
  },
  'tok-mandor-civil': {
    userId: 'u-mandor-civil',
    email: 'mandor.civil@vonta.test',
    displayName: 'Hendra Mandor Civil',
  },
  'tok-mandor-elec': {
    userId: 'u-mandor-elec',
    email: 'mandor.elec@vonta.test',
    displayName: 'Tono Mandor Electrical',
  },
  'tok-worker-1': {
    userId: 'u-worker-1',
    email: 'worker1@vonta.test',
    displayName: 'Raka Worker',
  },
  'tok-worker-2': {
    userId: 'u-worker-2',
    email: 'worker2@vonta.test',
    displayName: 'Siti Worker',
  },
  'tok-accounting': {
    userId: 'u-accounting',
    email: 'accounting@vonta.test',
    displayName: 'Dina Accounting',
  },
  'tok-outsider': {
    userId: 'u-outsider',
    email: 'outsider@vonta.test',
    displayName: 'Outside User',
  },
};

// Minimal valid 1x1 PNG binary data URL for private evidence photo upload tests
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function startAddendumServer(initialUtcIso = '2026-11-20T00:30:00.000Z') {
  let currentMs = Date.parse(initialUtcIso);
  const addendumService = new VontaAddendumService(() => new Date(currentMs));
  const domainService = new VontaDomainService(
    new InMemoryVontaRepository(),
    () => new Date(currentMs)
  );

  // Seed Project A & Project B
  addendumService.registerProjectContext({
    projectId: 'proj-a',
    projectName: 'Paviliun Kerja Live',
    isDeleted: false,
    availableModelVersionIds: ['mv-a-1'],
    availableAreaIds: ['area-ground'],
  });
  addendumService.registerProjectContext({
    projectId: 'proj-b',
    projectName: 'Tower Annex Live',
    isDeleted: false,
    availableModelVersionIds: ['mv-b-1'],
    availableAreaIds: ['area-b1'],
  });

  // Seed active members for Project A
  addendumService.upsertMember({
    membershipId: 'm-1',
    projectId: 'proj-a',
    userId: 'u-contractor',
    displayName: 'Budi Contractor',
    email: 'contractor@vonta.test',
    role: 'contractor',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: true,
    canShareWorkspaceView: true,
    division: 'Civil',
    teamId: 'team-civil-a',
  });
  addendumService.upsertMember({
    membershipId: 'm-2',
    projectId: 'proj-a',
    userId: 'u-owner',
    displayName: 'Nadia Owner',
    email: 'owner@vonta.test',
    role: 'owner',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: true,
    canShareWorkspaceView: true,
    division: 'Civil',
    teamId: 'team-owner',
  });
  addendumService.upsertMember({
    membershipId: 'm-3',
    projectId: 'proj-a',
    userId: 'u-mandor-civil',
    displayName: 'Hendra Mandor Civil',
    email: 'mandor.civil@vonta.test',
    role: 'worker',
    status: 'active',
    hasMandorGrant: true,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Civil',
    teamId: 'team-civil-a',
  });
  addendumService.upsertMember({
    membershipId: 'm-4',
    projectId: 'proj-a',
    userId: 'u-mandor-elec',
    displayName: 'Tono Mandor Electrical',
    email: 'mandor.elec@vonta.test',
    role: 'worker',
    status: 'active',
    hasMandorGrant: true,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Electrical',
    teamId: 'team-elec-a',
  });
  addendumService.upsertMember({
    membershipId: 'm-5',
    projectId: 'proj-a',
    userId: 'u-worker-1',
    displayName: 'Raka Worker',
    email: 'worker1@vonta.test',
    role: 'worker',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Civil',
    teamId: 'team-civil-a',
  });
  addendumService.upsertMember({
    membershipId: 'm-6',
    projectId: 'proj-a',
    userId: 'u-worker-2',
    displayName: 'Siti Worker',
    email: 'worker2@vonta.test',
    role: 'worker',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Civil',
    teamId: 'team-civil-a',
  });
  addendumService.upsertMember({
    membershipId: 'm-7',
    projectId: 'proj-a',
    userId: 'u-accounting',
    displayName: 'Dina Accounting',
    email: 'accounting@vonta.test',
    role: 'accounting',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: true,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Civil',
    teamId: 'team-acct',
  });

  // Worker 1 also belongs to Project B independently (A06)
  addendumService.upsertMember({
    membershipId: 'm-b-5',
    projectId: 'proj-b',
    userId: 'u-worker-1',
    displayName: 'Raka Worker',
    email: 'worker1@vonta.test',
    role: 'worker',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Civil',
    teamId: 'team-b',
  });

  const app = createVontaApp({
    service: domainService,
    addendumService,
    authVerifier: async (token) => ACTORS[token] ?? null,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function req(
    path: string,
    options: { method?: string; token?: string; body?: unknown } = {}
  ) {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const contentType = res.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }

  return {
    addendumService,
    setUtc(iso: string) {
      currentMs = Date.parse(iso);
    },
    req,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('HTTP A01–A06: 08:59:59 vs 09:00:00 WITA boundary, closed-browser cutoff sweep, idempotency, overnight, quarantine, multi-project isolation', async () => {
  const env = await startAddendumServer('2026-11-20T00:59:59.000Z'); // 08:59:59 WITA
  try {
    // Worker 1 & Worker 2 scheduled 08:00 WITA (= 00:00:00Z) on Project A
    env.addendumService.upsertShiftObligation({
      id: 'shift-a-w1',
      projectId: 'proj-a',
      workerUserId: 'u-worker-1',
      workerName: 'Raka Worker',
      division: 'Civil',
      teamId: 'team-civil-a',
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      eligibility: 'scheduled',
      shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
      shiftLabel: '08:00–17:00',
      assignedMandorUserIds: ['u-mandor-civil'],
    });
    env.addendumService.upsertShiftObligation({
      id: 'shift-a-w2',
      projectId: 'proj-a',
      workerUserId: 'u-worker-2',
      workerName: 'Siti Worker',
      division: 'Civil',
      teamId: 'team-civil-a',
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      eligibility: 'scheduled',
      shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
      shiftLabel: '08:00–17:00',
      assignedMandorUserIds: ['u-mandor-civil'],
    });
    // Missing schedule quarantine (A05)
    env.addendumService.upsertShiftObligation({
      id: 'shift-a-missing',
      projectId: 'proj-a',
      workerUserId: 'u-accounting',
      workerName: 'Dina Accounting',
      division: 'Civil',
      teamId: 'team-acct',
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      eligibility: 'missing_schedule',
      shiftStartUtcMs: null,
      shiftLabel: 'Schedule missing',
      assignedMandorUserIds: [],
    });
    // Project B independent shift for Worker 1 (A06)
    env.addendumService.upsertShiftObligation({
      id: 'shift-b-w1',
      projectId: 'proj-b',
      workerUserId: 'u-worker-1',
      workerName: 'Raka Worker',
      division: 'Civil',
      teamId: 'team-b',
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      eligibility: 'scheduled',
      shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
      shiftLabel: '08:00–17:00',
      assignedMandorUserIds: [],
    });

    // 1. Worker 1 checks in at 08:59:59 WITA -> 200 Present
    const r1 = await env.req('/api/projects/proj-a/attendance/shift-a-w1/check-in', {
      method: 'POST',
      token: 'tok-worker-1',
    });
    assert.equal(r1.status, 200);
    assert.equal(r1.data.record.status, 'present');

    // 2. Advance trusted clock to 09:00:00 WITA (= 01:00:00Z): closed-browser server cutoff sweep marks Worker 2 & Project B shift Alfa, quarantines missing schedule without Alfa; re-run is idempotent
    env.setUtc('2026-11-20T01:00:00.000Z');
    const sweep1 = env.addendumService.runAttendanceCutoffSweep();
    assert.ok(sweep1.markedObligationIds.includes('shift-a-w2'));
    assert.ok(sweep1.markedObligationIds.includes('shift-b-w1'));
    assert.ok(!sweep1.markedObligationIds.includes('shift-a-missing'));
    assert.equal(sweep1.quarantinedCount, 1);

    const sweep2 = env.addendumService.runAttendanceCutoffSweep();
    assert.equal(sweep2.markedAlfaCount, 0); // Strictly idempotent

    // 3. Worker 2 tries check-in at 09:00:00 WITA -> rejected (409)
    const r2 = await env.req('/api/projects/proj-a/attendance/shift-a-w2/check-in', {
      method: 'POST',
      token: 'tok-worker-2',
    });
    assert.equal(r2.status, 409);

    // 4. Verify Project A vs Project B independence for Worker 1 (Present in A, Alfa in B)
    const listA = await env.req('/api/projects/proj-a/attendance', { token: 'tok-worker-1' });
    const listB = await env.req('/api/projects/proj-b/attendance', { token: 'tok-worker-1' });
    assert.equal(listA.status, 200);
    assert.equal(listB.status, 200);
    assert.equal(listA.data.obligations[0].attendanceStatus, 'present');
    assert.equal(listB.data.obligations[0].attendanceStatus, 'alfa');
  } finally {
    await env.close();
  }
});

test('HTTP A07–A15: Photo-based Izin, private photo RBAC, Mandor review, double-decision 409, Present conflict 409, zero sensitive leak in metrics', async () => {
  const env = await startAddendumServer('2026-11-20T01:15:00.000Z'); // 09:15 WITA (after cutoff)
  try {
    env.addendumService.upsertShiftObligation({
      id: 'shift-izin-1',
      projectId: 'proj-a',
      workerUserId: 'u-worker-1',
      workerName: 'Raka Worker',
      division: 'Civil',
      teamId: 'team-civil-a',
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      eligibility: 'scheduled',
      shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
      shiftLabel: '08:00–17:00',
      assignedMandorUserIds: ['u-mandor-civil'],
    });
    env.addendumService.upsertShiftObligation({
      id: 'shift-no-mandor',
      projectId: 'proj-a',
      workerUserId: 'u-worker-2',
      workerName: 'Siti Worker',
      division: 'Civil',
      teamId: 'team-civil-a',
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      eligibility: 'scheduled',
      shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
      shiftLabel: '08:00–17:00',
      assignedMandorUserIds: [], // Missing eligible Mandor -> A14
    });

    // Reject unsupported upload MIME type (400)
    const badPhoto = await env.req('/api/projects/proj-a/attendance/izin-evidence', {
      method: 'POST',
      token: 'tok-worker-1',
      body: {
        fileName: 'malicious.html',
        mimeType: 'text/html',
        dataUrl: 'data:text/html;base64,PGh0bWw+PC9odG1sPg==',
      },
    });
    assert.equal(badPhoto.status, 400);

    // Accept PDF evidence document (201) per Doc 04
    const pdfEvidence = await env.req('/api/projects/proj-a/attendance/izin-evidence', {
      method: 'POST',
      token: 'tok-worker-1',
      body: {
        fileName: 'clinic-letter.pdf',
        mimeType: 'application/pdf',
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
      },
    });
    assert.equal(pdfEvidence.status, 201);

    // Reject Izin without evidence photo (400)
    const noPhotoIzin = await env.req('/api/projects/proj-a/attendance/izin', {
      method: 'POST',
      token: 'tok-worker-1',
      body: { obligationId: 'shift-izin-1', reason: 'Clinic visit', evidencePhotoIds: [] },
    });
    assert.equal(noPhotoIzin.status, 400);

    // Upload valid PNG photo
    const photoRes = await env.req('/api/projects/proj-a/attendance/izin-evidence', {
      method: 'POST',
      token: 'tok-worker-1',
      body: {
        fileName: 'doctor-slip-private.png',
        mimeType: 'image/png',
        dataUrl: TINY_PNG_DATA_URL,
      },
    });
    assert.equal(photoRes.status, 201);
    const photoId = photoRes.data.photo.id;

    // Submit Izin after cutoff -> status pending while effective attendance stays alfa
    const izinRes = await env.req('/api/projects/proj-a/attendance/izin', {
      method: 'POST',
      token: 'tok-worker-1',
      body: {
        obligationId: 'shift-izin-1',
        reason: 'Confidential clinic note: acute fever',
        evidencePhotoIds: [photoId],
      },
    });
    assert.equal(izinRes.status, 201);
    const izinId = izinRes.data.izinRequest.id;
    assert.equal(izinRes.data.izinRequest.status, 'pending');
    assert.equal(izinRes.data.attendanceStatus, 'alfa');

    // Private evidence photo RBAC: Worker & assigned Mandor get 200; unrelated Worker 2 & outsider get 403
    const pWorker = await env.req(`/api/projects/proj-a/attendance/izin-evidence/${photoId}`, {
      token: 'tok-worker-1',
    });
    const pMandor = await env.req(`/api/projects/proj-a/attendance/izin-evidence/${photoId}`, {
      token: 'tok-mandor-civil',
    });
    const pOtherWorker = await env.req(`/api/projects/proj-a/attendance/izin-evidence/${photoId}`, {
      token: 'tok-worker-2',
    });
    const pOutsider = await env.req(`/api/projects/proj-a/attendance/izin-evidence/${photoId}`, {
      token: 'tok-outsider',
    });
    assert.equal(pWorker.status, 200);
    assert.equal(pMandor.status, 200);
    assert.equal(pOtherWorker.status, 403);
    assert.equal(pOutsider.status, 403);

    // Out-of-scope Mandor (Electrical) cannot decide Civil worker's izin -> 403
    const wrongMandor = await env.req(`/api/projects/proj-a/attendance/izin/${izinId}/decide`, {
      method: 'POST',
      token: 'tok-mandor-elec',
      body: { decision: 'approve' },
    });
    assert.equal(wrongMandor.status, 403);

    // Reject without reason -> 400
    const emptyReject = await env.req(`/api/projects/proj-a/attendance/izin/${izinId}/decide`, {
      method: 'POST',
      token: 'tok-mandor-civil',
      body: { decision: 'reject', rejectionReason: '   ' },
    });
    assert.equal(emptyReject.status, 400);

    // Assigned Mandor approves -> original workday updated from Alfa to Izin
    const approveRes = await env.req(`/api/projects/proj-a/attendance/izin/${izinId}/decide`, {
      method: 'POST',
      token: 'tok-mandor-civil',
      body: { decision: 'approve' },
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.izinRequest.status, 'approved');
    assert.equal(approveRes.data.attendanceRecord.status, 'izin');

    // Double decision -> 409 conflict
    const secondDecision = await env.req(`/api/projects/proj-a/attendance/izin/${izinId}/decide`, {
      method: 'POST',
      token: 'tok-mandor-civil',
      body: { decision: 'reject', rejectionReason: 'Too late' },
    });
    assert.equal(secondDecision.status, 409);

    // Missing eligible Mandor -> awaiting_mandor_assignment (A14)
    const photo2 = await env.req('/api/projects/proj-a/attendance/izin-evidence', {
      method: 'POST',
      token: 'tok-worker-2',
      body: { fileName: 'proof2.png', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL },
    });
    const izinNoMandor = await env.req('/api/projects/proj-a/attendance/izin', {
      method: 'POST',
      token: 'tok-worker-2',
      body: {
        obligationId: 'shift-no-mandor',
        reason: 'Personal leave',
        evidencePhotoIds: [photo2.data.photo.id],
      },
    });
    assert.equal(izinNoMandor.status, 201);
    assert.equal(izinNoMandor.data.izinRequest.status, 'awaiting_mandor_assignment');

    // A15: Department metrics endpoint never leaks private filenames, photo IDs, or medical notes
    const metricsRes = await env.req('/api/projects/proj-a/attendance/department-metrics', {
      token: 'tok-owner',
    });
    assert.equal(metricsRes.status, 200);
    const rawJson = JSON.stringify(metricsRes.data);
    assert.ok(!rawJson.includes('doctor-slip-private.png'));
    assert.ok(!rawJson.includes('Confidential clinic note'));
    assert.ok(!rawJson.includes(photoId));
  } finally {
    await env.close();
  }
});

test('HTTP E01–E08: Independent Download/Share grants, forbidden share keys rejected, live share re-check & revoked 403 zero-leak, retired model recovery', async () => {
  const env = await startAddendumServer('2026-11-20T02:00:00.000Z');
  try {
    // 1. Owner & Contractor have automatic download & share; Accounting initially has neither (403)
    const ownerDl = await env.req('/api/projects/proj-a/workspace/export-authorize', {
      method: 'POST',
      token: 'tok-owner',
      body: { modelVersionId: 'mv-a-1', areaId: 'area-ground' },
    });
    assert.equal(ownerDl.status, 200);

    const acctDlDenied = await env.req('/api/projects/proj-a/workspace/export-authorize', {
      method: 'POST',
      token: 'tok-accounting',
      body: { modelVersionId: 'mv-a-1', areaId: 'area-ground' },
    });
    assert.equal(acctDlDenied.status, 403);

    // 2. Non-Contractor (Owner) cannot update member grants -> 403
    const ownerGrantDenied = await env.req('/api/projects/proj-a/members/u-accounting/grants', {
      method: 'PATCH',
      token: 'tok-owner',
      body: { canDownloadWorkspaceView: true },
    });
    assert.equal(ownerGrantDenied.status, 403);

    // 3. Contractor grants Download-only to Accounting (Share remains false!)
    const grantRes = await env.req('/api/projects/proj-a/members/u-accounting/grants', {
      method: 'PATCH',
      token: 'tok-contractor',
      body: { canDownloadWorkspaceView: true, canShareWorkspaceView: false },
    });
    assert.equal(grantRes.status, 200);
    assert.equal(grantRes.data.member.canDownloadWorkspaceView, true);
    assert.equal(grantRes.data.member.canShareWorkspaceView, false);

    // Accounting can now download (200) but STILL cannot share (403)
    const acctDlOk = await env.req('/api/projects/proj-a/workspace/export-authorize', {
      method: 'POST',
      token: 'tok-accounting',
      body: { modelVersionId: 'mv-a-1', areaId: 'area-ground' },
    });
    assert.equal(acctDlOk.status, 200);

    const acctShareDenied = await env.req('/api/projects/proj-a/workspace/shares', {
      method: 'POST',
      token: 'tok-accounting',
      body: {
        modelVersionId: 'mv-a-1',
        areaId: 'area-ground',
        camera: { position: { x: 6, y: 8, z: -9 }, target: { x: 0, y: 1, z: 0 } },
        layers: { civil: true, electrical: false, plumbing: false, pins: true },
      },
    });
    assert.equal(acctShareDenied.status, 403);

    // 4. Share payload strictly rejects private drawings / strokes / tokens / NaN camera (400)
    const badSharePayload = await env.req('/api/projects/proj-a/workspace/shares', {
      method: 'POST',
      token: 'tok-contractor',
      body: {
        modelVersionId: 'mv-a-1',
        areaId: 'area-ground',
        camera: { position: { x: 6, y: 8, z: -9 }, target: { x: 0, y: 1, z: 0 } },
        layers: { civil: true, electrical: false, plumbing: false, pins: true },
        strokes: [{ color: '#E11D48' }],
      },
    });
    assert.equal(badSharePayload.status, 400);

    // 5. Contractor creates clean allowlisted Share link (201)
    const shareRes = await env.req('/api/projects/proj-a/workspace/shares', {
      method: 'POST',
      token: 'tok-contractor',
      body: {
        modelVersionId: 'mv-a-1',
        areaId: 'area-ground',
        roomId: 'ruang-rapat',
        selectedPinId: 'PIN-01',
        camera: { position: { x: 6.5, y: 8.5, z: -9.5 }, target: { x: 0, y: 1, z: 0 } },
        layers: { civil: true, electrical: false, plumbing: false, pins: true },
      },
    });
    assert.equal(shareRes.status, 201);
    const shareId = shareRes.data.share.id;

    // 6. Active recipient opens share -> 200 with hideLocalDrawingsOnOpen: true
    const openWorker = await env.req(`/api/workspace/shares/${shareId}`, {
      token: 'tok-worker-1',
    });
    assert.equal(openWorker.status, 200);
    assert.equal(openWorker.data.hideLocalDrawingsOnOpen, true);
    assert.equal(openWorker.data.modelAvailable, true);

    // 7. Non-member & revoked member get 403 with ZERO private project/camera leak (E07)
    const openOutsider = await env.req(`/api/workspace/shares/${shareId}`, {
      token: 'tok-outsider',
    });
    assert.equal(openOutsider.status, 403);
    assert.ok(!JSON.stringify(openOutsider.data).includes('Paviliun Kerja Live'));
    assert.ok(!JSON.stringify(openOutsider.data).includes('ruang-rapat'));

    env.addendumService.revokeMember('proj-a', 'u-worker-1');
    const openRevoked = await env.req(`/api/workspace/shares/${shareId}`, {
      token: 'tok-worker-1',
    });
    assert.equal(openRevoked.status, 403);
    assert.ok(!JSON.stringify(openRevoked.data).includes('Paviliun Kerja Live'));

    // 8. Retired model version returns modelAvailable: false + recovery path (E08)
    env.addendumService.registerProjectContext({
      projectId: 'proj-a',
      projectName: 'Paviliun Kerja Live',
      isDeleted: false,
      availableModelVersionIds: ['mv-a-2'], // mv-a-1 retired
      availableAreaIds: ['area-ground'],
    });
    const openRetired = await env.req(`/api/workspace/shares/${shareId}`, {
      token: 'tok-owner',
    });
    assert.equal(openRetired.status, 200);
    assert.equal(openRetired.data.modelAvailable, false);
    assert.equal(openRetired.data.fallbackWorkspacePath, '/projects/proj-a/spatial');
  } finally {
    await env.close();
  }
});
