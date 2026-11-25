import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectRoutes } from './projectRoutes';
import {
  buildProjectSearchDestinations,
  runProjectSearch,
  type ProjectSearchSources,
} from './projectSearch';

function makeProjectASources(): ProjectSearchSources {
  const routes = getProjectRoutes('/demo/projects/paviliun-kerja', 'paviliun-kerja');
  return {
    projectScopeKey: 'demo:paviliun-kerja',
    destinations: buildProjectSearchDestinations(routes),
    blueprints: [
      {
        id: 'sheet-a03-r00',
        sheetCode: 'A-03',
        title: 'Ground Floor Plan (Calibrated)',
        revision: 'R00',
        areaName: 'Ground Floor',
        departmentLabel: 'Civil',
        to: routes.blueprintDetailPath('sheet-a03-r00'),
      },
      {
        id: 'sheet-e01-r00',
        sheetCode: 'E-01',
        title: 'Electrical + Plumbing Power Layout',
        revision: 'R00',
        areaName: 'Ground Floor',
        departmentLabel: 'Electrical + Plumbing',
        to: routes.blueprintDetailPath('sheet-e01-r00'),
      },
    ],
    pins: [
      {
        id: 'A03-PIN-01',
        title: 'Wall surface preparation & skim coat',
        roomName: 'Ruang Rapat',
        department: 'Finishing',
        status: 'open',
        to: routes.pinDetailPath('a03-pin-01'),
      },
      {
        id: 'A03-PIN-02',
        title: 'Conduit stub-out alignment check',
        roomName: 'Ruang Arsip',
        department: 'Electrical',
        status: 'in_progress',
        to: routes.pinDetailPath('a03-pin-02'),
      },
    ],
  };
}

function makeProjectBSources(): ProjectSearchSources {
  const routes = getProjectRoutes('/projects/proj-b', 'proj-b');
  return {
    projectScopeKey: 'live:proj-b',
    destinations: buildProjectSearchDestinations(routes),
    blueprints: [
      {
        id: 'bp-b01',
        sheetCode: 'B-01',
        title: 'North Tower Podium Plan',
        revision: 'R01',
        areaName: 'Podium',
        to: routes.blueprintDetailPath('bp-b01'),
      },
    ],
    pins: [
      {
        id: 'B01-PIN-09',
        title: 'Column rebar cover check',
        roomName: 'Grid B4',
        department: 'Civil',
        status: 'open',
        to: routes.pinDetailPath('b01-pin-09'),
      },
    ],
  };
}

test('searches visible destinations, blueprints by code/title, and Pins by ID/title', () => {
  const sources = makeProjectASources();

  const bpRes = runProjectSearch(sources, 'A-03');
  assert.equal(bpRes.groups.some((g) => g.id === 'blueprints'), true);
  assert.equal(
    bpRes.groups.find((g) => g.id === 'blueprints')?.items[0]?.to,
    '/demo/projects/paviliun-kerja/blueprints/sheet-a03-r00'
  );

  const pinRes = runProjectSearch(sources, 'A03-PIN-01');
  assert.equal(pinRes.groups.some((g) => g.id === 'pins'), true);
  assert.equal(
    pinRes.groups.find((g) => g.id === 'pins')?.items[0]?.to,
    '/demo/projects/paviliun-kerja/pin/a03-pin-01'
  );

  const destRes = runProjectSearch(sources, 'attendance');
  assert.equal(destRes.groups[0]?.id, 'destinations');
  assert.equal(destRes.groups[0]?.items[0]?.to, '/demo/projects/paviliun-kerja/attendance');
});

test('handles no-match queries cleanly with zero items', () => {
  const res = runProjectSearch(makeProjectASources(), 'zzz-no-match-999');
  assert.equal(res.totalCount, 0);
  assert.deepEqual(res.groups, []);
  assert.deepEqual(res.flatItems, []);
});

test('handles missing blueprint and pin sources gracefully without throwing', () => {
  const routes = getProjectRoutes('/projects/empty-proj', 'empty-proj');
  const res = runProjectSearch(
    {
      projectScopeKey: 'live:empty-proj',
      destinations: buildProjectSearchDestinations(routes),
      blueprints: null,
      pins: undefined,
    },
    'workspace'
  );

  assert.deepEqual(res.missingSources, ['blueprints', 'pins']);
  assert.equal(res.groups.length, 1);
  assert.equal(res.groups[0]?.id, 'destinations');
  assert.equal(res.groups[0]?.items[0]?.to, '/projects/empty-proj/spatial');
});

test('switching projects isolates search results and never leaks previous project items', () => {
  const resA = runProjectSearch(makeProjectASources(), 'A-03');
  assert.equal(resA.totalCount > 0, true);

  const resBSearchingA = runProjectSearch(makeProjectBSources(), 'A-03');
  assert.equal(resBSearchingA.projectScopeKey, 'live:proj-b');
  assert.equal(resBSearchingA.totalCount, 0);

  const resBSearchingPinA = runProjectSearch(makeProjectBSources(), 'A03-PIN-01');
  assert.equal(resBSearchingPinA.totalCount, 0);

  const resBSearchingB = runProjectSearch(makeProjectBSources(), 'B01-PIN-09');
  assert.equal(resBSearchingB.groups.find((g) => g.id === 'pins')?.items[0]?.badge, 'B01-PIN-09');
});
