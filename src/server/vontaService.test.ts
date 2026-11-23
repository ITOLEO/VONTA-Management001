import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  InMemoryVontaRepository,
  ServiceError,
  VontaDomainService,
  type AuthenticatedActor,
} from './vontaService';
import { hashProjectPassword, verifyProjectPassword } from './passwordHash';
import { sanitizeAuditValues, type AuditObjectType } from '../domain/accountTypes';
import { createVontaApp } from '../../server';

const ACCOUNT_A: AuthenticatedActor = {
  userId: 'user-a-contractor',
  email: 'contractor-a@vonta.example',
  displayName: 'Budi Santoso',
};

const ACCOUNT_B: AuthenticatedActor = {
  userId: 'user-b-owner',
  email: 'owner-b@vonta.example',
  displayName: 'Rina Kusuma',
};

const ACCOUNT_C_EMPTY: AuthenticatedActor = {
  userId: 'user-c-empty',
  email: 'newcomer-c@vonta.example',
  displayName: 'Dian Pratama',
};

const ACCOUNT_D_INVITED: AuthenticatedActor = {
  userId: 'user-d-invited',
  email: 'invited-d@vonta.example',
  displayName: 'Tono Wijaya',
};

function setupTwoAccountsTwoProjects() {
  const repo = new InMemoryVontaRepository();
  let currentMs = Date.parse('2026-11-19T08:00:00.000Z');
  const service = new VontaDomainService(repo, () => new Date(currentMs));
  return {
    repo,
    service,
    advanceMinutes(mins: number) {
      currentMs += mins * 60 * 1000;
    },
  };
}

test('1. Single-project user directory returns only authorized project; zero-membership & invited states stay isolated', async () => {
  const { repo, service } = setupTwoAccountsTwoProjects();

  // Zero-membership account starts completely empty (no demo projects leaked)
  const emptyDir = await service.listAuthorizedProjects(ACCOUNT_C_EMPTY);
  assert.equal(emptyDir.projects.length, 0);
  assert.equal(emptyDir.pendingInvitations.length, 0);
  assert.equal(emptyDir.activeDraft, null);

  // Account A creates Project 1
  const { project: project1 } = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'North Pavilion',
    contractorDisplayName: 'PT Karya Utama',
    projectPassword: 'ProjectPass#101',
    confirmProjectPassword: 'ProjectPass#101',
    timezone: 'Asia/Jakarta',
    draftKey: 'draft-key-p1',
  });

  // Account A has exactly one project — directory returns list of 1 without auto-redirecting server-side
  const dirA = await service.listAuthorizedProjects(ACCOUNT_A);
  assert.equal(dirA.projects.length, 1);
  assert.equal(dirA.projects[0].id, project1.id);
  assert.equal(dirA.projects[0].membership.role, 'contractor');
  assert.equal(dirA.activeDraft?.id, project1.id);

  // Add pending invitation for Account D
  repo.memberships.push({
    id: 'mem-inv-d',
    projectId: project1.id,
    userId: null,
    invitedEmail: ACCOUNT_D_INVITED.email,
    role: 'owner',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    status: 'invited',
  });

  const dirD = await service.listAuthorizedProjects(ACCOUNT_D_INVITED);
  assert.equal(dirD.projects.length, 0);
  assert.equal(dirD.pendingInvitations.length, 1);
  assert.equal(dirD.pendingInvitations[0].projectId, project1.id);
  assert.equal(dirD.pendingInvitations[0].role, 'owner');
});

test('2. Create draft is atomic, idempotent on retry, resumable after reload, and blocks role escalation', async () => {
  const { repo, service } = setupTwoAccountsTwoProjects();

  const first = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'Studio Annex',
    contractorDisplayName: 'CV Bangun Presisi',
    projectPassword: 'StrongProject#2026',
    confirmProjectPassword: 'StrongProject#2026',
    timezone: 'Asia/Jakarta',
    draftKey: 'same-draft-key',
  });
  assert.equal(first.resumed, false);
  assert.equal(first.project.status, 'draft');
  assert.equal(first.project.draftStep, 2);

  // Secret is stored hashed (scrypt) and never equals plaintext
  const secret = await repo.getProjectSecret(first.project.id);
  assert.ok(secret);
  assert.ok(secret.passwordHash.startsWith('scrypt$'));
  assert.notEqual(secret.passwordHash, 'StrongProject#2026');
  assert.equal(verifyProjectPassword('StrongProject#2026', secret.passwordHash), true);

  // Retrying with the same draftKey resumes the SAME project rather than duplicating
  const retry = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'Studio Annex',
    contractorDisplayName: 'CV Bangun Presisi',
    projectPassword: 'StrongProject#2026',
    confirmProjectPassword: 'StrongProject#2026',
    timezone: 'Asia/Jakarta',
    draftKey: 'same-draft-key',
  });
  assert.equal(retry.resumed, true);
  assert.equal(retry.project.id, first.project.id);
  assert.equal(repo.projects.size, 1);

  // Reload lookup resumes the draft
  const resumedOnReload = await service.getActiveDraft(ACCOUNT_A);
  assert.equal(resumedOnReload?.id, first.project.id);

  // Step 2 saves blueprint draft metadata and advances step to 3
  const withBlueprint = await service.saveDraftBlueprintStep(ACCOUNT_A, first.project.id, {
    areaName: 'Ground Floor',
    sheetCode: 'A-01',
    revision: 'R00',
    fileName: 'studio-ground-floor.pdf',
  });
  assert.equal(withBlueprint.draftStep, 3);
  assert.equal(withBlueprint.blueprints.length, 1);

  // Non-contractor (Owner) cannot hijack or promote another user's draft via existingDraftProjectId
  repo.memberships.push({
    id: 'mem-owner-b',
    projectId: first.project.id,
    userId: ACCOUNT_B.userId,
    invitedEmail: ACCOUNT_B.email,
    role: 'owner',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    status: 'active',
  });

  await assert.rejects(
    () =>
      service.createOrResumeProjectDraft(ACCOUNT_B, {
        name: 'Hijacked Name',
        contractorDisplayName: ACCOUNT_B.displayName,
        projectPassword: '',
        confirmProjectPassword: '',
        timezone: 'Asia/Jakarta',
        existingDraftProjectId: first.project.id,
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 403 && err.code === 'FORBIDDEN_ROLE'
  );
});

test('3. Project rename preserves stable UUID links, enforces optimistic concurrency (409), and writes sanitized audit diff', async () => {
  const { service } = setupTwoAccountsTwoProjects();

  const { project: created } = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'Tower Block A',
    contractorDisplayName: 'PT Konstruksi Jaya',
    projectPassword: 'TowerPassword#99',
    confirmProjectPassword: 'TowerPassword#99',
    timezone: 'Asia/Jakarta',
    draftKey: 'draft-tower',
  });
  const stableId = created.id;

  const renamed = await service.updateProjectGeneral(ACCOUNT_A, stableId, {
    name: 'Tower Block A — Phase 2',
    contractorDisplayName: 'PT Konstruksi Jaya Mandiri',
    timezone: 'Asia/Makassar',
    expectedVersion: created.version,
  });

  assert.equal(renamed.id, stableId);
  assert.equal(renamed.name, 'Tower Block A — Phase 2');
  assert.equal(renamed.version, created.version + 1);

  // Existing stable-ID link still resolves the renamed project
  const fetchedByOldId = await service.getProjectDetail(ACCOUNT_A, stableId);
  assert.equal(fetchedByOldId.name, 'Tower Block A — Phase 2');
  assert.equal(fetchedByOldId.timezone, 'Asia/Makassar');

  // Stale expectedVersion triggers 409 STALE_RECORD
  await assert.rejects(
    () =>
      service.updateProjectGeneral(ACCOUNT_A, stableId, {
        name: 'Stale Write',
        contractorDisplayName: 'PT Konstruksi Jaya',
        timezone: 'Asia/Jakarta',
        expectedVersion: created.version,
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 409 && err.code === 'STALE_RECORD'
  );

  // Audit log captures before -> after summary cleanly
  const history = await service.getProjectHistory(ACCOUNT_A, stableId);
  const renameEvent = history.find((e) => e.action === 'project.general_updated');
  assert.ok(renameEvent);
  assert.equal(renameEvent.beforeSummary?.name, 'Tower Block A');
  assert.equal(renameEvent.afterSummary?.name, 'Tower Block A — Phase 2');
});

test('4. Wrong old project password is rejected, rate-limited after 5 failures, and leaves zero secret leakage in audit logs', async () => {
  const { repo, service, advanceMinutes } = setupTwoAccountsTwoProjects();

  const { project } = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'Warehouse West',
    contractorDisplayName: 'CV Logistik',
    projectPassword: 'OriginalProject#11',
    confirmProjectPassword: 'OriginalProject#11',
    timezone: 'Asia/Jakarta',
    draftKey: 'draft-wh',
  });

  // 4 incorrect attempts -> 400 INVALID_CURRENT_PASSWORD
  for (let attempt = 1; attempt <= 4; attempt++) {
    await assert.rejects(
      () =>
        service.changeProjectPassword(ACCOUNT_A, project.id, {
          currentPassword: `WrongGuess#${attempt}`,
          newPassword: 'NextPassword#22',
          confirmNewPassword: 'NextPassword#22',
        }),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.status === 400 &&
        err.code === 'INVALID_CURRENT_PASSWORD' &&
        Boolean(err.fieldErrors?.currentPassword)
    );
  }

  // 5th incorrect attempt triggers 429 RATE_LIMITED
  await assert.rejects(
    () =>
      service.changeProjectPassword(ACCOUNT_A, project.id, {
        currentPassword: 'WrongGuess#5',
        newPassword: 'NextPassword#22',
        confirmNewPassword: 'NextPassword#22',
      }),
    (err: unknown) =>
      err instanceof ServiceError &&
      err.status === 429 &&
      err.code === 'RATE_LIMITED' &&
      (err.retryAfterSeconds ?? 0) > 0
  );

  // Even the RIGHT password is blocked during lockout window
  await assert.rejects(
    () =>
      service.changeProjectPassword(ACCOUNT_A, project.id, {
        currentPassword: 'OriginalProject#11',
        newPassword: 'NextPassword#22',
        confirmNewPassword: 'NextPassword#22',
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 429 && err.code === 'RATE_LIMITED'
  );

  // After 16 minutes, lockout expires and correct old password succeeds
  advanceMinutes(16);
  const changed = await service.changeProjectPassword(ACCOUNT_A, project.id, {
    currentPassword: 'OriginalProject#11',
    newPassword: 'NextPassword#22',
    confirmNewPassword: 'NextPassword#22',
  });
  assert.ok(changed.changedAt);

  const secret = await repo.getProjectSecret(project.id);
  assert.ok(secret);
  assert.equal(secret.failedAttempts, 0);
  assert.equal(verifyProjectPassword('NextPassword#22', secret.passwordHash), true);
  assert.equal(verifyProjectPassword('OriginalProject#11', secret.passwordHash), false);

  // Verify audit logs contain ZERO password plaintext or hashes
  const history = await service.getProjectHistory(ACCOUNT_A, project.id);
  const serialized = JSON.stringify(history);
  assert.equal(serialized.includes('OriginalProject#11'), false);
  assert.equal(serialized.includes('NextPassword#22'), false);
  assert.equal(serialized.includes('WrongGuess'), false);
  assert.equal(serialized.includes('scrypt$'), false);
  assert.ok(history.some((e) => e.action === 'project_access.password_change' && e.result === 'rejected'));
  assert.ok(history.some((e) => e.action === 'project_access.password_change' && e.result === 'success'));
});

test('5. Account password & project password act independently; registered email is locked', async () => {
  const { repo, service } = setupTwoAccountsTwoProjects();

  const { project } = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'Civic Hall',
    contractorDisplayName: 'PT Civic',
    projectPassword: 'CivicProject#44',
    confirmProjectPassword: 'CivicProject#44',
    timezone: 'Asia/Jakarta',
    draftKey: 'draft-civic',
  });
  const initialProjectHash = (await repo.getProjectSecret(project.id))!.passwordHash;

  // Record an account password change — must NOT alter project_secrets hash
  const pwEvent = await service.recordAccountSecurityEvent(ACCOUNT_A, {
    eventType: 'account_password_changed',
  });
  assert.equal(pwEvent.event.scope, 'account');
  assert.equal(pwEvent.event.action, 'account.password_changed');
  assert.equal((await repo.getProjectSecret(project.id))!.passwordHash, initialProjectHash);

  // Attempting to request an email change is rejected with 403 EMAIL_LOCKED
  await assert.rejects(
    () =>
      service.recordAccountSecurityEvent(ACCOUNT_A, {
        eventType: 'email_change_requested',
        targetEmail: 'new-contractor-a@vonta.example',
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 403 && err.code === 'EMAIL_LOCKED'
  );

  // Profile retains the original locked email
  const currentProfile = await service.getOwnProfile(ACCOUNT_A);
  assert.equal(currentProfile.email, ACCOUNT_A.email);
  assert.equal(currentProfile.pendingEmail, null);

  // Updating profile displayTimezone preserves project timezone independently
  const updatedProfile = await service.updateOwnProfile(ACCOUNT_A, {
    displayName: 'Budi Santoso',
    phoneNumber: '+62 812-3456-7890',
    displayTimezone: 'UTC',
    expectedVersion: currentProfile.version,
  });
  assert.equal(updatedProfile.displayTimezone, 'UTC');
  assert.equal(updatedProfile.phoneStatus, 'contact_only');
  assert.equal((await service.getProjectDetail(ACCOUNT_A, project.id)).timezone, 'Asia/Jakarta');

  // Audit sanitizer strips secrets
  const sanitized = sanitizeAuditValues({
    name: 'Safe Value',
    password: 'SecretValue',
    passwordHash: 'scrypt$abc',
    token: 'jwt.token.here',
    verificationCode: '123456',
    dataUrl: 'data:image/png;base64,AAAA',
  });
  assert.deepEqual(sanitized, { name: 'Safe Value' });
});

test('6. Cross-project isolation & role enforcement: another project settings/history stay 403; display name never grants rights', async () => {
  const { repo, service } = setupTwoAccountsTwoProjects();

  // Account A creates Project 1
  const { project: project1 } = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'Project Alpha',
    contractorDisplayName: ACCOUNT_B.displayName, // Deliberately set display name to Account B's name!
    projectPassword: 'AlphaPassword#1',
    confirmProjectPassword: 'AlphaPassword#1',
    timezone: 'Asia/Jakarta',
    draftKey: 'draft-alpha',
  });

  // Account B is Owner on Project 1
  repo.memberships.push({
    id: 'mem-b-owner-p1',
    projectId: project1.id,
    userId: ACCOUNT_B.userId,
    invitedEmail: ACCOUNT_B.email,
    role: 'owner',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    status: 'active',
  });

  // Account B creates Project 2 (Account A has NO membership on Project 2)
  const { project: project2 } = await service.createOrResumeProjectDraft(ACCOUNT_B, {
    name: 'Project Beta',
    contractorDisplayName: 'PT Beta Works',
    projectPassword: 'BetaPassword#2',
    confirmProjectPassword: 'BetaPassword#2',
    timezone: 'Asia/Jakarta',
    draftKey: 'draft-beta',
  });

  // Account A cannot read Project 2 detail, history, edit, password, or delete
  await assert.rejects(
    () => service.getProjectDetail(ACCOUNT_A, project2.id),
    (err: unknown) => err instanceof ServiceError && err.status === 403
  );
  await assert.rejects(
    () => service.getProjectHistory(ACCOUNT_A, project2.id),
    (err: unknown) => err instanceof ServiceError && err.status === 403
  );
  await assert.rejects(
    () =>
      service.updateProjectGeneral(ACCOUNT_A, project2.id, {
        name: 'Tampered Beta',
        contractorDisplayName: 'PT Alpha',
        timezone: 'Asia/Jakarta',
        expectedVersion: project2.version,
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 403
  );
  await assert.rejects(
    () =>
      service.changeProjectPassword(ACCOUNT_A, project2.id, {
        currentPassword: 'BetaPassword#2',
        newPassword: 'HackedPassword#9',
        confirmNewPassword: 'HackedPassword#9',
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 403
  );
  await assert.rejects(
    () =>
      service.deleteProject(ACCOUNT_A, project2.id, {
        keyword: 'DELETE',
        typedProjectName: 'Project Beta',
        expectedVersion: project2.version,
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 403
  );

  // Account B (Owner on Project 1) can read Project 1 detail & history,
  // but CANNOT edit Project 1 or change its password even though contractorDisplayName === Account B's name!
  const p1AsOwner = await service.getProjectDetail(ACCOUNT_B, project1.id);
  assert.equal(p1AsOwner.membership.role, 'owner');
  const p1HistoryAsOwner = await service.getProjectHistory(ACCOUNT_B, project1.id);
  assert.ok(p1HistoryAsOwner.length >= 1);

  await assert.rejects(
    () =>
      service.updateProjectGeneral(ACCOUNT_B, project1.id, {
        name: 'Owner Renamed',
        contractorDisplayName: ACCOUNT_B.displayName,
        timezone: 'Asia/Jakarta',
        expectedVersion: project1.version,
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 403 && err.code === 'FORBIDDEN_ROLE'
  );
  await assert.rejects(
    () =>
      service.changeProjectPassword(ACCOUNT_B, project1.id, {
        currentPassword: 'AlphaPassword#1',
        newPassword: 'OwnerNewPass#1',
        confirmNewPassword: 'OwnerNewPass#1',
      }),
    (err: unknown) => err instanceof ServiceError && err.status === 403 && err.code === 'FORBIDDEN_ROLE'
  );
});

test('7. Scoped contextual history filters by objectType/objectId and supports attendance, stock_movement, budget_decision', async () => {
  const { repo, service } = setupTwoAccountsTwoProjects();

  const { project } = await service.createOrResumeProjectDraft(ACCOUNT_A, {
    name: 'Operations Site',
    contractorDisplayName: 'PT Ops',
    projectPassword: 'OpsPassword#55',
    confirmProjectPassword: 'OpsPassword#55',
    timezone: 'Asia/Jakarta',
    draftKey: 'draft-ops',
  });

  const withBp = await service.saveDraftBlueprintStep(ACCOUNT_A, project.id, {
    areaName: 'Level 1',
    sheetCode: 'A-03',
    revision: 'R00',
    fileName: 'level1.png',
  });
  const bpId = withBp.blueprints[0].id;

  // Record future operational module audit types directly through the shared audit contract
  const operationalTypes: AuditObjectType[] = ['attendance', 'stock_movement', 'budget_decision'];
  for (const objectType of operationalTypes) {
    await repo.appendAuditEvent({
      scope: 'project',
      projectId: project.id,
      actorUserId: ACCOUNT_A.userId,
      actorName: ACCOUNT_A.displayName,
      action: `${objectType}.recorded`,
      objectType,
      objectId: `${objectType}-001`,
      objectLabel: `Sample ${objectType}`,
      result: 'success',
    });
  }

  const blueprintHistory = await service.getProjectHistory(ACCOUNT_A, project.id, {
    objectType: 'blueprint',
    objectId: bpId,
  });
  assert.equal(blueprintHistory.length, 1);
  assert.equal(blueprintHistory[0].objectId, bpId);

  const stockHistory = await service.getProjectHistory(ACCOUNT_A, project.id, {
    objectType: 'stock_movement',
  });
  assert.equal(stockHistory.length, 1);
  assert.equal(stockHistory[0].objectType, 'stock_movement');

  // Password hash utility sanity check
  const h1 = hashProjectPassword('TestSecret#1');
  const h2 = hashProjectPassword('TestSecret#1');
  assert.notEqual(h1, h2); // unique random salt per hash
  assert.equal(verifyProjectPassword('TestSecret#1', h1), true);
  assert.equal(verifyProjectPassword('TestSecret#1', h2), true);
});

test('8. Express API routes report unconfigured Supabase honestly and never leak demo data into /api/projects', async () => {
  const app = createVontaApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  try {
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    const healthRes = await fetch(`${base}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as {
      ok: boolean;
      supabaseConfigured: boolean;
      aiConfigured: boolean;
    };
    assert.equal(healthJson.ok, true);
    assert.equal(typeof healthJson.supabaseConfigured, 'boolean');
    assert.equal(typeof healthJson.aiConfigured, 'boolean');

    // Without live Supabase credentials in this container, /api/projects returns 503 (or 401 if configured) — NEVER 200 with demo data
    const projectsRes = await fetch(`${base}/api/projects`);
    assert.ok(projectsRes.status === 503 || projectsRes.status === 401);
    const projectsBody = (await projectsRes.json()) as { code: string };
    assert.ok(
      projectsBody.code === 'SUPABASE_NOT_CONFIGURED' || projectsBody.code === 'UNAUTHORIZED'
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt 3 Verification Tests (Disposable Test Projects Only)
// ─────────────────────────────────────────────────────────────────────────────

// Minimal valid 1x1 PNG encoded as base64 for private upload testing
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const CALIBRATION_OFFICE_L1 = {
  unit: 'mm' as const,
  pointA: { x: 0.1, y: 0.2 },
  pointB: { x: 0.9, y: 0.2 },
  knownLengthMm: 10500,
  imageWidthPx: 1600,
  imageHeightPx: 1000,
  mmPerPixel: 8.2031,
  wallHeightMm: 3400,
  exteriorWallMm: 180,
  interiorWallMm: 110,
};

function createCustomProposal(widthMm: number, depthMm: number, dividerXMm: number | null, label: string) {
  const walls: Array<{
    id: string;
    label: string;
    category: 'exterior_wall' | 'interior_partition';
    startXMm: number;
    startZMm: number;
    endXMm: number;
    endZMm: number;
    thicknessMm: number;
    heightMm: number;
  }> = [
    {
      id: 'W-NORTH',
      label: 'North Exterior Wall',
      category: 'exterior_wall',
      startXMm: 0,
      startZMm: 0,
      endXMm: widthMm,
      endZMm: 0,
      thicknessMm: 180,
      heightMm: 3400,
    },
    {
      id: 'W-SOUTH',
      label: 'South Exterior Wall',
      category: 'exterior_wall',
      startXMm: 0,
      startZMm: depthMm,
      endXMm: widthMm,
      endZMm: depthMm,
      thicknessMm: 180,
      heightMm: 3400,
    },
    {
      id: 'W-WEST',
      label: 'West Exterior Wall',
      category: 'exterior_wall',
      startXMm: 0,
      startZMm: 0,
      endXMm: 0,
      endZMm: depthMm,
      thicknessMm: 180,
      heightMm: 3400,
    },
    {
      id: 'W-EAST',
      label: 'East Exterior Wall',
      category: 'exterior_wall',
      startXMm: widthMm,
      startZMm: 0,
      endXMm: widthMm,
      endZMm: depthMm,
      thicknessMm: 180,
      heightMm: 3400,
    },
  ];
  if (dividerXMm !== null) {
    walls.push({
      id: 'W-PART-1',
      label: 'Center Office Partition',
      category: 'interior_partition' as const,
      startXMm: dividerXMm,
      startZMm: 0,
      endXMm: dividerXMm,
      endZMm: depthMm,
      thicknessMm: 110,
      heightMm: 3400,
    });
  }
  return {
    footprintLabel: label,
    sourceNotes: 'Extracted by test blueprint extractor',
    walls,
    openings: [
      {
        id: 'OP-D1',
        wallId: 'W-SOUTH',
        code: 'D-01',
        kind: 'door' as const,
        offsetMm: 1400,
        widthMm: 1000,
        sillMm: 0,
        topMm: 2150,
      },
    ],
    rooms:
      dividerXMm !== null
        ? [
            {
              id: 'room-west-studio',
              name: 'West Studio',
              polygonMm: [
                { xMm: 100, zMm: 100 },
                { xMm: dividerXMm - 60, zMm: 100 },
                { xMm: dividerXMm - 60, zMm: depthMm - 100 },
                { xMm: 100, zMm: depthMm - 100 },
              ],
              verified: false,
            },
            {
              id: 'room-east-studio',
              name: 'East Studio',
              polygonMm: [
                { xMm: dividerXMm + 60, zMm: 100 },
                { xMm: widthMm - 100, zMm: 100 },
                { xMm: widthMm - 100, zMm: depthMm - 100 },
                { xMm: dividerXMm + 60, zMm: depthMm - 100 },
              ],
              verified: false,
            },
          ]
        : [
            {
              id: 'room-open-hall',
              name: 'Open Hall',
              polygonMm: [
                { xMm: 100, zMm: 100 },
                { xMm: widthMm - 100, zMm: 100 },
                { xMm: widthMm - 100, zMm: depthMm - 100 },
                { xMm: 100, zMm: depthMm - 100 },
              ],
              verified: false,
            },
          ],
  };
}

test('9. Check #1 & #4: Resume after refresh & failed AI processing (missing GEMINI_API_KEY) NEVER marks project ready', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const repo = new InMemoryVontaRepository();
    const service = new VontaDomainService(repo); // uses real GeminiBlueprintExtractor

    const { project: draft } = await service.createOrResumeProjectDraft(ACCOUNT_A, {
      name: 'Disposable Failing AI Site',
      contractorDisplayName: 'PT Test Builder',
      projectPassword: 'TestPassword#99',
      confirmProjectPassword: 'TestPassword#99',
      timezone: 'Asia/Jakarta',
      draftKey: 'draft-fail-ai',
    });

    const uploadRes = await service.submitBlueprintJob(ACCOUNT_A, draft.id, {
      areaName: 'Ground Floor',
      sheetCode: 'S-01',
      revision: 'R00',
      fileName: 'site-ground.png',
      mimeType: 'image/png',
      base64Data: TINY_PNG_BASE64,
      calibration: CALIBRATION_OFFICE_L1,
      submissionKey: 'sub-fail-001',
    });

    // AI extraction honestly fails without GEMINI_API_KEY (never fabricates geometry or marks project ready!)
    assert.equal(uploadRes.job.status, 'failed');
    assert.equal(uploadRes.job.errorCode, 'AI_PROVIDER_UNCONFIGURED');
    assert.equal(uploadRes.job.proposal, null);
    assert.equal(uploadRes.job.builtModel, null);
    assert.equal(uploadRes.project.status, 'draft'); // NOT ready!
    assert.equal(uploadRes.project.modelVersions?.length ?? 0, 0);

    // Check #1: Resume after refresh retrieves the exact same draft, asset, and durable job ID
    const resumedDraft = await service.getActiveDraft(ACCOUNT_A);
    assert.ok(resumedDraft);
    assert.equal(resumedDraft.id, draft.id);
    assert.equal(resumedDraft.jobs?.[0].id, uploadRes.job.id);
    assert.equal(resumedDraft.assets?.[0].id, uploadRes.asset.id);

    // Retrying with the same submissionKey deduplicates cleanly (no duplicate job/asset)
    const dedup = await service.submitBlueprintJob(ACCOUNT_A, draft.id, {
      areaName: 'Ground Floor',
      sheetCode: 'S-01',
      revision: 'R00',
      fileName: 'site-ground.png',
      mimeType: 'image/png',
      base64Data: TINY_PNG_BASE64,
      calibration: CALIBRATION_OFFICE_L1,
      submissionKey: 'sub-fail-001',
    });
    assert.equal(dedup.deduplicated, true);
    assert.equal(dedup.job.id, uploadRes.job.id);

    // Retrying the failed job reuses the SAME job ID and increments attemptCount
    const retried = await service.retryProcessingJob(ACCOUNT_A, draft.id, uploadRes.job.id);
    assert.equal(retried.job.id, uploadRes.job.id);
    assert.equal(retried.job.attemptCount, 2);
    assert.equal(retried.job.status, 'failed');
    assert.equal(retried.project.status, 'draft');
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test('10. Checks #2, #3, #5, #6, #7, #8 via real Express HTTP: multi-area blueprints, closed-boundary rooms, replacement preserving evidence + Pin remap, retire vs remove, and exact DELETE PROJECT + concurrent rename + access revocation', async () => {
  const repo = new InMemoryVontaRepository();
  let extractMode: 'area1_v1' | 'area2_v1' | 'area1_v2_shifted' = 'area1_v1';

  const stubExtractor = {
    isConfigured: () => true,
    async extractGeometry() {
      if (extractMode === 'area1_v1') {
        return {
          provider: 'test-stub',
          model: 'test-deterministic-proposal',
          proposal: createCustomProposal(10500, 6800, 5200, '10,500 × 6,800 mm Ground Office'),
        };
      }
      if (extractMode === 'area2_v1') {
        return {
          provider: 'test-stub',
          model: 'test-deterministic-proposal',
          proposal: createCustomProposal(8000, 5000, null, '8,000 × 5,000 mm Upper Deck'),
        };
      }
      // Replacement R01 removes W-PART-1 -> existing Pin on W-PART-1 MUST require explicit remap!
      return {
        provider: 'test-stub',
        model: 'test-deterministic-proposal',
        proposal: createCustomProposal(10500, 6800, null, '10,500 × 6,800 mm Open Plan R01'),
      };
    },
  };

  const service = new VontaDomainService(repo, () => new Date('2026-11-19T10:00:00.000Z'), {
    aiExtractor: stubExtractor,
  });

  const app = createVontaApp({
    service,
    authVerifier: async (token) => {
      if (token === 'token-contractor-a') return ACCOUNT_A;
      if (token === 'token-owner-b') return ACCOUNT_B;
      return null;
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  async function api(path: string, init?: RequestInit, token = 'token-contractor-a') {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, body, contentType };
  }

  try {
    // ── A. Create disposable primary project "kos12" + sibling untouched project ──
    const draft1 = await api('/api/projects/draft', {
      method: 'POST',
      body: JSON.stringify({
        name: 'kos12',
        contractorDisplayName: 'PT Test Kos',
        projectPassword: 'KosPassword#12',
        confirmProjectPassword: 'KosPassword#12',
        timezone: 'Asia/Jakarta',
        draftKey: 'draft-kos12',
      }),
    });
    assert.equal(draft1.status, 201);
    const projectId = (draft1.body as { project: { id: string } }).project.id;

    const siblingDraft = await api('/api/projects/draft', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Sibling Safe Project',
        contractorDisplayName: 'PT Safe',
        projectPassword: 'SafePassword#12',
        confirmProjectPassword: 'SafePassword#12',
        timezone: 'Asia/Jakarta',
        draftKey: 'draft-sibling',
      }),
    });
    assert.equal(siblingDraft.status, 201);
    const siblingProjectId = (siblingDraft.body as { project: { id: string } }).project.id;

    // ── B. Upload Area 1 blueprint, Contractor reviews, edits, and publishes v1 ──
    extractMode = 'area1_v1';
    const uploadA1 = await api(`/api/projects/${projectId}/blueprints/upload`, {
      method: 'POST',
      body: JSON.stringify({
        areaName: 'Ground Office',
        isRegisteredInCommonFrame: true,
        sheetCode: 'A-101',
        revision: 'R00',
        fileName: 'ground-office-r00.png',
        mimeType: 'image/png',
        base64Data: TINY_PNG_BASE64,
        calibration: CALIBRATION_OFFICE_L1,
        submissionKey: 'sub-a1-r00',
      }),
    });
    assert.equal(uploadA1.status, 201);
    const a1Job = (uploadA1.body as { job: { id: string; status: string; builtModel: { footprintWidthMm: number; footprintDepthMm: number } }; asset: { id: string; privateFileUrl: string }; area: { id: string } });
    assert.equal(a1Job.job.status, 'needs_review');
    // Outer-face footprint = centerline span (10,500 x 6,800 mm) + exterior wall thickness (180 mm)
    assert.equal(a1Job.job.builtModel.footprintWidthMm, 10680);
    assert.equal(a1Job.job.builtModel.footprintDepthMm, 6980);
    const area1Id = a1Job.area.id;
    const asset1Id = a1Job.asset.id;

    // Private asset streams 200 OK with exact PNG bytes while project is active
    const asset1File = await api(a1Job.asset.privateFileUrl, { method: 'GET' });
    assert.equal(asset1File.status, 200);
    assert.equal(asset1File.contentType, 'image/png');
    assert.equal((asset1File.body as ArrayBuffer).byteLength, Buffer.from(TINY_PNG_BASE64, 'base64').byteLength);

    // Publish v1 -> project transitions from draft -> ready
    const pubA1 = await api(`/api/projects/${projectId}/jobs/${a1Job.job.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ verificationNotes: 'Verified 10.5m x 6.8m perimeter.' }),
    });
    assert.equal(pubA1.status, 200);
    const mv1 = (pubA1.body as { modelVersion: { id: string; versionNumber: number; geometry: { elements: Array<{ id: string; boxes: Array<{ center: { x: number; y: number; z: number } }> }> } }; project: { status: string } });
    assert.equal(mv1.project.status, 'ready');
    assert.equal(mv1.modelVersion.versionNumber, 1);

    // ── C. Check #2 & #3: Add second area with its own blueprint + closed-boundary room ──
    extractMode = 'area2_v1';
    const uploadA2 = await api(`/api/projects/${projectId}/blueprints/upload`, {
      method: 'POST',
      body: JSON.stringify({
        areaName: 'Upper Deck',
        isRegisteredInCommonFrame: false,
        sheetCode: 'A-201',
        revision: 'R00',
        fileName: 'upper-deck-r00.png',
        mimeType: 'image/png',
        base64Data: TINY_PNG_BASE64,
        calibration: { ...CALIBRATION_OFFICE_L1, knownLengthMm: 8000 },
        submissionKey: 'sub-a2-r00',
      }),
    });
    assert.equal(uploadA2.status, 201);
    const a2Data = uploadA2.body as { job: { id: string }; area: { id: string }; asset: { id: string; privateFileUrl: string } };
    const area2Id = a2Data.area.id;

    const pubA2 = await api(`/api/projects/${projectId}/jobs/${a2Data.job.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ verificationNotes: 'Upper deck verified.' }),
    });
    assert.equal(pubA2.status, 200);

    // Verify source selector has 2 distinct private assets & distinct footprints
    const detailAfterTwoAreas = await api(`/api/projects/${projectId}`);
    const projTwoAreas = (detailAfterTwoAreas.body as { project: { areas: Array<{ id: string; isRegisteredInCommonFrame: boolean }>; assets: Array<{ id: string; sheetCode: string; privateFileUrl: string }>; modelVersions: Array<{ areaId: string; geometry: { footprintWidthMm: number } }> } }).project;
    assert.equal(projTwoAreas.areas.length, 2);
    assert.equal(projTwoAreas.assets.length, 2);
    assert.notEqual(projTwoAreas.assets[0].privateFileUrl, projTwoAreas.assets[1].privateFileUrl);
    assert.equal(projTwoAreas.areas.find((a) => a.id === area2Id)?.isRegisteredInCommonFrame, false);

    // Label-only room is rejected (400 ROOM_BOUNDARY_REQUIRED); closed boundary room succeeds
    const badRoom = await api(`/api/projects/${projectId}/areas/${area2Id}/rooms`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Label Only Storage', polygonMm: [] }),
    });
    assert.equal(badRoom.status, 400);

    const goodRoom = await api(`/api/projects/${projectId}/areas/${area2Id}/rooms`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Deck Lounge',
        polygonMm: [
          { xMm: 200, zMm: 200 },
          { xMm: 4200, zMm: 200 },
          { xMm: 4200, zMm: 3200 },
          { xMm: 200, zMm: 3200 },
        ],
      }),
    });
    assert.equal(goodRoom.status, 201);

    // ── D. Check #5: Create work Pin with Before/After evidence on Area 1 W-PART-1, then replace blueprint ──
    const partBox = mv1.modelVersion.geometry.elements.find((e) => e.id === 'W-PART-1')!.boxes[0];
    const createdPinRes = await api(`/api/projects/${projectId}/pins`, {
      method: 'POST',
      body: JSON.stringify({
        areaId: area1Id,
        roomId: 'room-west-studio',
        roomName: 'West Studio',
        elementId: 'W-PART-1',
        elementName: 'Center Office Partition',
        surfaceSide: 'West face',
        title: 'Acoustic insulation & skim coat',
        category: 'Finishing',
        assignedWorkerName: 'Hendra',
        description: 'Apply skim coat along full height of center partition.',
        position: partBox.center,
        normal: { x: -1, y: 0, z: 0 },
      }),
    });
    assert.equal(createdPinRes.status, 201);
    const pinId = (createdPinRes.body as { pin: { id: string } }).pin.id;

    // Attach Before/After evidence to the Pin to verify evidence preservation across replacement & retirement
    const storedPin = (await repo.listPins(projectId)).find((p) => p.id === pinId)!;
    storedPin.evidence.before = {
      id: 'ev-before-kos12',
      slot: 'before',
      cycleNumber: 1,
      fileName: 'before-partition.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1500,
      dataUrl: 'data:image/png;base64,' + TINY_PNG_BASE64,
      uploadedAt: '2026-11-19T10:05:00.000Z',
      note: 'Before skim coat',
    };
    await repo.updatePin(projectId, storedPin);

    // Upload replacement R01 for Area 1 (removes W-PART-1)
    extractMode = 'area1_v2_shifted';
    const replaceUpload = await api(`/api/projects/${projectId}/blueprints/upload`, {
      method: 'POST',
      body: JSON.stringify({
        areaId: area1Id,
        areaName: 'Ground Office',
        sheetCode: 'A-101',
        revision: 'R01',
        fileName: 'ground-office-r01.png',
        mimeType: 'image/png',
        base64Data: TINY_PNG_BASE64,
        calibration: CALIBRATION_OFFICE_L1,
        submissionKey: 'sub-a1-r01',
        mode: 'replacement',
        replacesModelVersionId: mv1.modelVersion.id,
      }),
    });
    assert.equal(replaceUpload.status, 201);
    const r01JobId = (replaceUpload.body as { job: { id: string } }).job.id;

    // Before publishing R01, v1 remains active!
    const beforePubR01 = await api(`/api/projects/${projectId}`);
    const activeArea1Before = (beforePubR01.body as { project: { areas: Array<{ id: string; activeModelVersionId: string }> } }).project.areas.find((a) => a.id === area1Id)!;
    assert.equal(activeArea1Before.activeModelVersionId, mv1.modelVersion.id);

    // Publishing R01 WITHOUT remap decisions MUST fail with 409 PIN_REMAP_REQUIRED (never silently move Pin!)
    const blockedPub = await api(`/api/projects/${projectId}/jobs/${r01JobId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ verificationNotes: 'Trying without remap' }),
    });
    assert.equal(blockedPub.status, 409);
    assert.equal((blockedPub.body as { code: string }).code, 'PIN_REMAP_REQUIRED');

    // Publishing R01 WITH explicit Pin remap decision succeeds, supersedes v1, and preserves Before/After evidence!
    const remapPub = await api(`/api/projects/${projectId}/jobs/${r01JobId}/publish`, {
      method: 'POST',
      body: JSON.stringify({
        verificationNotes: 'Remapped partition pin to North Exterior Wall.',
        pinRemapDecisions: [
          {
            pinId,
            action: 'remap',
            targetElementId: 'W-NORTH',
            targetElementName: 'North Exterior Wall',
            targetRoomId: 'room-open-hall',
            targetRoomName: 'Open Hall',
          },
        ],
      }),
    });
    assert.equal(remapPub.status, 200);
    const afterReplace = remapPub.body as {
      modelVersion: { id: string; versionNumber: number };
      project: {
        modelVersions: Array<{ id: string; status: string }>;
        pins: Array<{ id: string; elementId: string; anchorStatus: string; evidence: { before: { id: string } | null } }>;
      };
    };
    assert.equal(afterReplace.modelVersion.versionNumber, 2);
    assert.equal(
      afterReplace.project.modelVersions.find((v) => v.id === mv1.modelVersion.id)?.status,
      'superseded'
    );
    const remappedPin = afterReplace.project.pins.find((p) => p.id === pinId)!;
    assert.equal(remappedPin.elementId, 'W-NORTH');
    assert.equal(remappedPin.anchorStatus, 'remapped');
    assert.equal(remappedPin.evidence.before?.id, 'ev-before-kos12'); // Evidence preserved!

    // ── E. Retire blueprint preserves History & Area 2, rejects hard removal of published asset ──
    const r01AssetId = (replaceUpload.body as { asset: { id: string } }).asset.id;
    const impactRes = await api(`/api/projects/${projectId}/blueprints/${r01AssetId}/impact`);
    assert.equal(impactRes.status, 200);
    assert.equal((impactRes.body as { impact: { canHardRemoveDraft: boolean; pinCount: number; evidenceCount: number } }).impact.canHardRemoveDraft, false);
    assert.equal((impactRes.body as { impact: { pinCount: number } }).impact.pinCount, 1);
    assert.equal((impactRes.body as { impact: { evidenceCount: number } }).impact.evidenceCount, 1);

    const hardRemoveBlocked = await api(`/api/projects/${projectId}/blueprints/${r01AssetId}/retire`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'remove' }),
    });
    assert.equal(hardRemoveBlocked.status, 409);

    const retireOk = await api(`/api/projects/${projectId}/blueprints/${r01AssetId}/retire`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'retire', reason: 'Retiring Area 1 sheet for re-issue' }),
    });
    assert.equal(retireOk.status, 200);
    // Area 2 published model remains untouched!
    const area2StillPublished = (retireOk.body as { project: { areas: Array<{ id: string; activeModelVersionId: string | null }> } }).project.areas.find((a) => a.id === area2Id)!;
    assert.ok(area2StillPublished.activeModelVersionId);

    // ── F. Checks #6, #7, #8: Exact two-field DELETE PROJECT (kos12 vs kos 12), concurrent rename (409), access revocation ──
    const preDeleteDetail = await api(`/api/projects/${projectId}`);
    const versionBeforeRename = (preDeleteDetail.body as { project: { version: number; name: string } }).project.version;
    assert.equal((preDeleteDetail.body as { project: { name: string } }).project.name, 'kos12');

    // Check #6: On "kos12", typing "DELETE PROJECT kos 12" (space) MUST fail!
    const wrongPhraseRes = await api(`/api/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        keyword: 'DELETE',
        typedProjectName: 'kos 12',
        expectedVersion: versionBeforeRename,
      }),
    });
    assert.equal(wrongPhraseRes.status, 400);
    assert.equal((wrongPhraseRes.body as { code: string }).code, 'DELETE_PHRASE_MISMATCH');

    // Check #7: Concurrent rename from "kos12" -> "kos 12" causes stale delete request to fail safely with 409 STALE_RECORD
    const renameRes = await api(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'kos 12',
        contractorDisplayName: 'PT Test Kos',
        timezone: 'Asia/Jakarta',
        expectedVersion: versionBeforeRename,
      }),
    });
    assert.equal(renameRes.status, 200);
    const versionAfterRename = (renameRes.body as { project: { version: number } }).project.version;

    const staleDeleteRes = await api(`/api/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        keyword: 'DELETE',
        typedProjectName: 'kos12',
        expectedVersion: versionBeforeRename,
      }),
    });
    assert.equal(staleDeleteRes.status, 409);
    assert.equal((staleDeleteRes.body as { code: string }).code, 'STALE_RECORD');

    // Check #8: Exact match for renamed "kos 12" with current expectedVersion succeeds logically
    const correctDeleteRes = await api(`/api/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        keyword: 'DELETE',
        typedProjectName: 'kos 12',
        expectedVersion: versionAfterRename,
      }),
    });
    assert.equal(correctDeleteRes.status, 200);
    assert.equal((correctDeleteRes.body as { deletionMode: string; alreadyDeleted: boolean }).deletionMode, 'logical');
    assert.equal((correctDeleteRes.body as { alreadyDeleted: boolean }).alreadyDeleted, false);

    // Idempotent retry returns 200 with alreadyDeleted=true
    const retryDeleteRes = await api(`/api/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        keyword: 'DELETE',
        typedProjectName: 'kos 12',
        expectedVersion: versionAfterRename,
      }),
    });
    assert.equal(retryDeleteRes.status, 200);
    assert.equal((retryDeleteRes.body as { alreadyDeleted: boolean }).alreadyDeleted, true);

    // Deleted project's ordinary route AND private file URL lose access immediately (404)
    const deletedRouteRes = await api(`/api/projects/${projectId}`);
    assert.equal(deletedRouteRes.status, 404);

    const revokedFileRes = await api(`/api/projects/${projectId}/assets/${asset1Id}/file`, {
      method: 'GET',
    });
    assert.equal(revokedFileRes.status, 404);

    // Sibling project remains completely untouched and accessible!
    const siblingRes = await api(`/api/projects/${siblingProjectId}`);
    assert.equal(siblingRes.status, 200);
    assert.equal((siblingRes.body as { project: { name: string } }).project.name, 'Sibling Safe Project');

    // Restricted deletion audit record is preserved in account history without leaking file blobs or passwords
    const accountHistRes = await api('/api/profile/history');
    assert.equal(accountHistRes.status, 200);
    const accountEvents = (accountHistRes.body as { events: Array<{ action: string; objectId: string }> }).events;
    assert.ok(accountEvents.some((e) => e.action === 'account.project_deleted' && e.objectId === projectId));
    assert.ok(repo.auditEvents.some((e) => e.action === 'project.deleted' && e.projectId === projectId));
    assert.equal(JSON.stringify(accountEvents).includes(TINY_PNG_BASE64), false);
    assert.equal(JSON.stringify(accountEvents).includes('KosPassword#12'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

