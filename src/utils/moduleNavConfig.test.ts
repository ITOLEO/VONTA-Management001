import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountingRailGroups,
  buildAttendanceRailGroups,
  buildOverviewRailGroups,
  buildPinDepartmentRailGroups,
  buildProjectsDirectoryRailGroups,
  buildTeamRailGroups,
  buildWarehouseRailGroups,
  buildWorkRailGroups,
  buildWorkspaceRailGroups,
  resolveAccountingView,
  resolveModuleFromSlug,
} from './moduleNavConfig';
import { getProjectRoutes } from './projectRoutes';
import { formatThemeLabel } from './themePreference';

const demoRoutes = getProjectRoutes('/demo/projects/paviliun-kerja', 'paviliun-kerja');

test('resolveModuleFromSlug maps team, attendance, pin, warehouse, and accounting slugs accurately', () => {
  assert.equal(resolveModuleFromSlug('users'), 'team');
  assert.equal(resolveModuleFromSlug('team'), 'team');
  assert.equal(resolveModuleFromSlug('attendance'), 'attendance');
  assert.equal(resolveModuleFromSlug('pin'), 'pin');
  assert.equal(resolveModuleFromSlug('work'), 'pin');
  assert.equal(resolveModuleFromSlug('inventory'), 'warehouse');
  assert.equal(resolveModuleFromSlug('store-requests'), 'warehouse');
  assert.equal(resolveModuleFromSlug('purchase-requests'), 'warehouse');
  assert.equal(resolveModuleFromSlug('market-list'), 'warehouse');
  assert.equal(resolveModuleFromSlug('goods-receipts'), 'warehouse');
  assert.equal(resolveModuleFromSlug('accounting'), 'accounting');
});

test('resolveAccountingView defaults to department-budgets and recognizes valid subviews', () => {
  assert.equal(resolveAccountingView(''), 'department-budgets');
  assert.equal(resolveAccountingView('?view=unknown'), 'department-budgets');
  assert.equal(resolveAccountingView('?view=receiving-costs'), 'receiving-costs');
  assert.equal(resolveAccountingView('?view=internal-usage'), 'internal-usage');
});

test('Projects directory rail groups contain Projects and Team', () => {
  const groups = buildProjectsDirectoryRailGroups({
    directoryPath: '/demo/projects',
    activeItem: 'projects',
    onUserManagementClick: () => {},
  });
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels, ['Projects', 'Team']);
});

test('Overview rail groups contain Overview and Blueprint management (Team and Attendance moved to top bar)', () => {
  const groups = buildOverviewRailGroups(demoRoutes, 'overview');
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels, ['Overview', 'Blueprint management']);
  assert.equal(labels.includes('User Management'), false);
  assert.equal(labels.includes('Attendance'), false);
});

test('Team and Attendance rail helpers expose their scoped views', () => {
  const teamLabels = buildTeamRailGroups(demoRoutes, 'team').flatMap((g) =>
    g.items.map((i) => i.label)
  );
  assert.deepEqual(teamLabels, ['Team roster', 'Attendance']);

  const attLabels = buildAttendanceRailGroups('manual', () => {}).flatMap((g) =>
    g.items.map((i) => i.label)
  );
  assert.deepEqual(attLabels, ['Manual attendance', 'Attendance roster']);
});

test('Workspace rail groups contain Pin list and Model info only', () => {
  const groups = buildWorkspaceRailGroups({
    pinCount: 2,
    pinListOpen: false,
    modelInfoOpen: false,
    onTogglePinList: () => {},
    onToggleModelInfo: () => {},
  });
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels, ['Pin list', 'Model info']);
});

test('PIN department rail groups list All departments followed by catalog departments', () => {
  const groups = buildPinDepartmentRailGroups({
    departments: [
      { id: 'dept-civil', name: 'Civil', pinCount: 2 },
      { id: 'dept-electrical', name: 'Electrical', pinCount: 1 },
    ],
    activeDepartmentId: 'dept-civil',
    onSelectDepartment: () => {},
  });
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels, ['All departments', 'Civil', 'Electrical']);
  const active = groups.flatMap((g) => g.items).find((i) => i.active);
  assert.equal(active?.id, 'pin-dept-dept-civil');
});

test('Legacy work rail helper uses PIN labels and canonical /pin links', () => {
  const groups = buildWorkRailGroups(demoRoutes, 'pending-qc');
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels, ['All Pins', 'Open', 'Pending QC', 'Approved', 'Material exceptions']);
  const active = groups.flatMap((g) => g.items).find((i) => i.active);
  assert.equal(active?.id, 'pending-qc');
  assert.equal(active?.to, '/demo/projects/paviliun-kerja/pin?filter=pending-qc');
});

test('Warehouse rail groups expose the five warehouse operational destinations', () => {
  const groups = buildWarehouseRailGroups(demoRoutes, 'store-requests');
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels, [
    'Inventory',
    'Store Requests',
    'Purchase Requests',
    'Market List',
    'Goods Receipts',
  ]);
  assert.equal(groups.flatMap((g) => g.items).find((i) => i.active)?.id, 'store-requests');
});

test('Accounting rail groups expose Department budgets, Receiving costs, and Internal usage without removed Project Settings History link', () => {
  const groups = buildAccountingRailGroups(demoRoutes, 'receiving-costs');
  const labels = groups.flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(labels, ['Department budgets', 'Receiving costs', 'Internal usage']);
  assert.equal(groups.flatMap((g) => g.items).find((i) => i.active)?.id, 'receiving-costs');
});

test('formatThemeLabel returns human-readable labels with Light default', () => {
  assert.equal(formatThemeLabel('light'), 'Light');
  assert.equal(formatThemeLabel('system'), 'System');
  assert.equal(formatThemeLabel('dark'), 'Dark');
});
