import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachEvidencePhotoToPin,
  createInitialDemoState,
  updateDemoPinStatus,
} from './demoStore';
import {
  filterPinsForBoard,
  groupPinsForKanban,
  toProjectLocalDateKey,
} from './pinBoard';
import { buildA03PaviliunKerjaModel } from './a03Geometry';
import { buildPinDepartmentRailGroups, resolveModuleFromSlug } from '../utils/moduleNavConfig';
import { getProjectRoutes } from '../utils/projectRoutes';
import { seedDefaultDepartments } from './departmentCatalog';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('P01: PIN department rail, independent Material exceptions toggle, Updated project-local date filter, and List/Kanban parity', () => {
  const demo = createInitialDemoState();
  const depts = seedDefaultDepartments(demo.project.id);

  const rail = buildPinDepartmentRailGroups({
    departments: depts.map((d) => ({
      id: d.id,
      name: d.name,
      pinCount: demo.pins.filter((p) => p.department === d.name).length,
    })),
    activeDepartmentId: 'all',
    onSelectDepartment: () => undefined,
  });
  assert.equal(rail.length, 1);
  assert.equal(rail[0].items[0].label, 'All departments');
  assert.equal(rail[0].items.length, 5); // All + 4 default departments (no duplicate status links)

  // Add a 3rd pin with zero material exceptions on a different local date
  const extraPin = {
    ...demo.pins[0],
    id: 'A03-PIN-03',
    slug: 'clean-pin',
    department: 'Finishing' as const,
    status: 'in_progress' as const,
    materials: [],
    updatedAt: '2026-11-22T02:00:00.000Z', // 2026-11-22 in Asia/Makassar
  };
  const allPins = [...demo.pins, extraPin];

  // Independent Material exceptions composes with department filter
  const finishingWithExceptions = filterPinsForBoard(allPins, {
    departmentName: 'Finishing',
    status: 'all',
    materialExceptionOnly: true,
    roomId: '',
    query: '',
    updatedFrom: '',
    updatedTo: '',
    timezone: 'Asia/Makassar',
  });
  assert.equal(finishingWithExceptions.length, 1);
  assert.equal(finishingWithExceptions[0].id, 'A03-PIN-01');

  // Project-local Updated date filter
  assert.equal(toProjectLocalDateKey('2026-11-21T17:30:00.000Z', 'Asia/Makassar'), '2026-11-22');
  const onNov22 = filterPinsForBoard(allPins, {
    departmentName: 'all',
    status: 'all',
    materialExceptionOnly: false,
    roomId: '',
    query: '',
    updatedFrom: '2026-11-22',
    updatedTo: '2026-11-22',
    timezone: 'Asia/Makassar',
  });
  assert.equal(onNov22.length, 1);
  assert.equal(onNov22[0].id, 'A03-PIN-03');

  // Kanban preserves all 4 columns (even empty ones) and matches exact List count
  const columns = groupPinsForKanban(onNov22);
  assert.equal(columns.length, 4);
  assert.deepEqual(
    columns.map((c) => [c.status, c.pins.length]),
    [
      ['open', 0],
      ['in_progress', 1],
      ['pending_review', 0],
      ['approved', 0],
    ]
  );
});

test('P02: Canonical QC transitions reject moves to Pending QC / Approved without both Before+After photos or QC authority', () => {
  const initial = createInitialDemoState();
  const pinId = 'A03-PIN-01';

  // Open -> In Progress is allowed
  const toInProg = updateDemoPinStatus(initial, pinId, 'in_progress', {
    actorName: 'Budi Santoso',
    hasQcAuthority: true,
  });
  assert.equal(toInProg.ok, true);
  if (!toInProg.ok) return;

  // In Progress -> Pending QC without photos MUST FAIL and preserve state
  const badPending = updateDemoPinStatus(toInProg.state, pinId, 'pending_review', {
    actorName: 'Budi Santoso',
    hasQcAuthority: true,
  });
  assert.equal(badPending.ok, false);

  // Direct jump In Progress -> Approved MUST FAIL
  const badApprove = updateDemoPinStatus(toInProg.state, pinId, 'approved', {
    actorName: 'Budi Santoso',
    hasQcAuthority: true,
  });
  assert.equal(badApprove.ok, false);

  // Attach Before + After photos -> Submit for QC succeeds
  const withBefore = attachEvidencePhotoToPin(toInProg.state, pinId, {
    slot: 'before',
    fileName: 'before.png',
    mimeType: 'image/png',
    sizeBytes: 68,
    dataUrl: TINY_PNG,
  });
  assert.equal(withBefore.ok, true);
  if (!withBefore.ok) return;
  const withAfter = attachEvidencePhotoToPin(withBefore.state, pinId, {
    slot: 'after',
    fileName: 'after.png',
    mimeType: 'image/png',
    sizeBytes: 68,
    dataUrl: TINY_PNG,
  });
  assert.equal(withAfter.ok, true);
  if (!withAfter.ok) return;

  const toPending = updateDemoPinStatus(withAfter.state, pinId, 'pending_review', {
    actorName: 'Foreman Civil',
    hasQcAuthority: false,
  });
  assert.equal(toPending.ok, true);
  if (!toPending.ok) return;

  // Non-QC actor (Worker/Foreman) cannot approve -> rejected
  const unauthorizedApprove = updateDemoPinStatus(toPending.state, pinId, 'approved', {
    actorName: 'Foreman Civil',
    hasQcAuthority: false,
  });
  assert.equal(unauthorizedApprove.ok, false);

  // Authorized Contractor approves -> succeeds
  const approved = updateDemoPinStatus(toPending.state, pinId, 'approved', {
    actorName: 'Budi Santoso',
    hasQcAuthority: true,
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.state.pins.find((p) => p.id === pinId)?.status, 'approved');
});

test('R01–R02: Legacy routes (/work, /users, /attendance) remain compatible and A-03 2,875 mm calibration is preserved', () => {
  assert.equal(resolveModuleFromSlug('work'), 'pin');
  assert.equal(resolveModuleFromSlug('pin'), 'pin');
  assert.equal(resolveModuleFromSlug('users'), 'team');
  assert.equal(resolveModuleFromSlug('team'), 'team');
  assert.equal(resolveModuleFromSlug('attendance'), 'attendance');

  const demoRoutes = getProjectRoutes('/demo/projects/paviliun-kerja/pin', 'paviliun-kerja');
  assert.equal(demoRoutes.pinListPath, '/demo/projects/paviliun-kerja/pin');
  assert.equal(demoRoutes.teamPath, '/demo/projects/paviliun-kerja/team');
  assert.equal(demoRoutes.attendancePath, '/demo/projects/paviliun-kerja/attendance');

  const a03 = buildA03PaviliunKerjaModel();
  assert.equal(a03.rooms.length, 3);
  assert.equal(a03.crossCheck.actualMm, 2875);
});
