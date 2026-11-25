import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceGeometryLayerCatalog,
  countActiveGeometryLayers,
  filterWorkspacePins,
  isAllPinsFilterClear,
  resetWorkspacePinFilters,
  resolveWorkspaceOutputVisibility,
  setWorkspacePinDepartmentFilter,
  toggleWorkspaceGeometryLayer,
  toggleWorkspacePinMarkers,
  type WorkspacePinFilterState,
} from './workspaceControls';
import { computeCompassOrientation } from './workspaceMath';
import {
  canDownloadWorkspaceView,
  canShareWorkspaceView,
} from './attendanceEngine';
import type { ProjectRole } from './accountTypes';
import { resolveProjectPinDepartments } from './pinBoard';
import { createInitialDemoState } from './demoStore';

const INITIAL_DEMO_PINS = createInitialDemoState().pins;

interface MemberFixture {
  role: ProjectRole;
  status: 'active' | 'revoked';
  canDownloadWorkspaceView: boolean;
  canShareWorkspaceView: boolean;
}

function makeMember(overrides: Partial<MemberFixture>): MemberFixture {
  return {
    role: 'worker',
    status: 'active',
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    ...overrides,
  };
}

test('WS-1: Electrical Pin filter and matching Pin IDs persist across toggling Plumbing geometry twice, and All pins preserves chosen 3D layers', () => {
  let state: WorkspacePinFilterState = {
    activeRoomId: 'ruang-rapat',
    activeDepartmentFilter: null,
    selectedPinId: 'A03-PIN-02',
    layers: {
      civil: true,
      electrical: false,
      plumbing: false,
      pins: true,
    },
  };

  // Select Electrical in Pin filters
  state = setWorkspacePinDepartmentFilter(state, 'Electrical');
  assert.equal(state.activeDepartmentFilter, 'Electrical');
  assert.deepEqual(state.layers, {
    civil: true,
    electrical: false,
    plumbing: false,
    pins: true,
  });

  const beforeToggle = filterWorkspacePins(INITIAL_DEMO_PINS, {
    areaId: 'area-a03-ground',
    roomId: state.activeRoomId,
    departmentName: state.activeDepartmentFilter,
    showPinMarkers: state.layers.pins,
  });
  assert.deepEqual(
    beforeToggle.matchingPins.map((p) => p.id),
    ['A03-PIN-02']
  );

  // Toggle Plumbing geometry ON, then OFF (twice)
  state = toggleWorkspaceGeometryLayer(state, 'plumbing');
  assert.equal(state.layers.plumbing, true);
  assert.equal(state.activeDepartmentFilter, 'Electrical');
  assert.equal(state.activeRoomId, 'ruang-rapat');
  assert.equal(state.selectedPinId, 'A03-PIN-02');

  const afterFirstPlumbingToggle = filterWorkspacePins(INITIAL_DEMO_PINS, {
    areaId: 'area-a03-ground',
    roomId: state.activeRoomId,
    departmentName: state.activeDepartmentFilter,
    showPinMarkers: state.layers.pins,
  });
  assert.deepEqual(
    afterFirstPlumbingToggle.matchingPins.map((p) => p.id),
    ['A03-PIN-02']
  );

  state = toggleWorkspaceGeometryLayer(state, 'plumbing');
  assert.equal(state.layers.plumbing, false);
  assert.equal(state.activeDepartmentFilter, 'Electrical');
  assert.equal(state.activeRoomId, 'ruang-rapat');
  assert.equal(state.selectedPinId, 'A03-PIN-02');

  const afterSecondPlumbingToggle = filterWorkspacePins(INITIAL_DEMO_PINS, {
    areaId: 'area-a03-ground',
    roomId: state.activeRoomId,
    departmentName: state.activeDepartmentFilter,
    showPinMarkers: state.layers.pins,
  });
  assert.deepEqual(
    afterSecondPlumbingToggle.matchingPins.map((p) => p.id),
    ['A03-PIN-02']
  );

  // Change geometry layers (Civil OFF, Electrical ON) then trigger All pins
  state = toggleWorkspaceGeometryLayer(state, 'civil');
  state = toggleWorkspaceGeometryLayer(state, 'electrical');
  assert.equal(countActiveGeometryLayers(state.layers), 1);

  const afterAllPins = resetWorkspacePinFilters(state);
  assert.equal(afterAllPins.activeRoomId, null);
  assert.equal(afterAllPins.activeDepartmentFilter, null);
  assert.equal(afterAllPins.selectedPinId, null);
  assert.equal(afterAllPins.layers.pins, true);
  assert.equal(isAllPinsFilterClear(afterAllPins), true);

  // Chosen 3D geometry layers MUST persist after All pins
  assert.equal(afterAllPins.layers.civil, false);
  assert.equal(afterAllPins.layers.electrical, true);
  assert.equal(afterAllPins.layers.plumbing, false);

  const allMatches = filterWorkspacePins(INITIAL_DEMO_PINS, {
    areaId: 'area-a03-ground',
    roomId: afterAllPins.activeRoomId,
    departmentName: afterAllPins.activeDepartmentFilter,
    showPinMarkers: afterAllPins.layers.pins,
  });
  assert.deepEqual(
    allMatches.matchingPins.map((p) => p.id),
    ['A03-PIN-01', 'A03-PIN-02']
  );
});

test('WS-1: Pin markers visibility toggles independently and adding a custom department never creates a 3D geometry layer', () => {
  let state: WorkspacePinFilterState = {
    activeRoomId: null,
    activeDepartmentFilter: 'Electrical',
    selectedPinId: 'A03-PIN-02',
    layers: { civil: true, electrical: false, plumbing: false, pins: true },
  };

  state = toggleWorkspacePinMarkers(state);
  assert.equal(state.layers.pins, false);
  assert.equal(state.activeDepartmentFilter, 'Electrical');
  assert.equal(state.layers.civil, true);
  assert.equal(isAllPinsFilterClear(state), false);

  const hiddenResult = filterWorkspacePins(INITIAL_DEMO_PINS, {
    areaId: 'area-a03-ground',
    departmentName: state.activeDepartmentFilter,
    showPinMarkers: state.layers.pins,
  });
  assert.deepEqual(
    hiddenResult.matchingPins.map((p) => p.id),
    ['A03-PIN-02']
  );
  assert.deepEqual(hiddenResult.visibleMarkerPins, []);

  // Adding a 5th custom department ("HVAC") appears in Pin filters catalog, NOT in 3D geometry layers
  const pinDepartments = resolveProjectPinDepartments(
    'proj-custom',
    [
      {
        id: 'dept-hvac',
        projectId: 'proj-custom',
        name: 'HVAC',
        slug: 'hvac',
        defaultPinColor: '#0284C7',
        isSeeded: false,
        sortOrder: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    INITIAL_DEMO_PINS
  );
  assert.ok(pinDepartments.some((d) => d.name === 'HVAC'));

  const geometryCatalog = buildWorkspaceGeometryLayerCatalog('Sheet A-03 R00');
  assert.deepEqual(
    geometryCatalog.map((l) => l.key),
    ['civil', 'electrical', 'plumbing']
  );
  assert.equal(geometryCatalog[0].available, true);
  assert.equal(geometryCatalog[1].available, false);
  assert.equal(geometryCatalog[2].available, false);
  assert.match(geometryCatalog[2].statusText, /Unavailable/i);
});

test('WS-2: Compass orientation handles orbit with verified north and missing north truthfully', () => {
  const verifiedNorthInitial = computeCompassOrientation(0, 0);
  assert.equal(verifiedNorthInitial.isNorthVerified, true);
  assert.equal(verifiedNorthInitial.needleRotationDeg, 0);
  assert.match(verifiedNorthInitial.orientationLabel, /Verified North/i);

  // Orbit camera clockwise by 45 degrees -> north needle rotates counter-clockwise to 315 degrees
  const verifiedNorthOrbited = computeCompassOrientation(45, 0);
  assert.equal(verifiedNorthOrbited.isNorthVerified, true);
  assert.equal(verifiedNorthOrbited.needleRotationDeg, 315);

  // Verified north at +90 degrees rotates needle and ground rose identically
  const rotatedProjectNorth = computeCompassOrientation(0, 90);
  assert.equal(rotatedProjectNorth.needleRotationDeg, 90);
  assert.ok(Math.abs(rotatedProjectNorth.groundRoseRotationRad - -Math.PI / 2) < 1e-9);

  // Missing north -> truthful unavailable state
  const missingNorth = computeCompassOrientation(30, null);
  assert.equal(missingNorth.isNorthVerified, false);
  assert.equal(missingNorth.needleRotationDeg, 330);
  assert.match(missingNorth.orientationLabel, /North not set/i);
});

test('WS-2: Output actions visibility respects Owner, Contractor, single-grant member, and hides toggle when no grants exist', () => {
  const owner = makeMember({ role: 'owner' });
  const contractor = makeMember({ role: 'contractor' });
  const downloadOnlyMember = makeMember({
    role: 'worker',
    canDownloadWorkspaceView: true,
    canShareWorkspaceView: false,
  });
  const shareOnlyMember = makeMember({
    role: 'accounting',
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: true,
  });
  const noGrantMember = makeMember({
    role: 'worker',
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
  });

  assert.deepEqual(
    resolveWorkspaceOutputVisibility({
      canDownload: canDownloadWorkspaceView(owner),
      canShare: canShareWorkspaceView(owner),
    }),
    { showToggle: true, showDownload: true, showShare: true }
  );

  assert.deepEqual(
    resolveWorkspaceOutputVisibility({
      canDownload: canDownloadWorkspaceView(contractor),
      canShare: canShareWorkspaceView(contractor),
    }),
    { showToggle: true, showDownload: true, showShare: true }
  );

  assert.deepEqual(
    resolveWorkspaceOutputVisibility({
      canDownload: canDownloadWorkspaceView(downloadOnlyMember),
      canShare: canShareWorkspaceView(downloadOnlyMember),
    }),
    { showToggle: true, showDownload: true, showShare: false }
  );

  assert.deepEqual(
    resolveWorkspaceOutputVisibility({
      canDownload: canDownloadWorkspaceView(shareOnlyMember),
      canShare: canShareWorkspaceView(shareOnlyMember),
    }),
    { showToggle: true, showDownload: false, showShare: true }
  );

  assert.deepEqual(
    resolveWorkspaceOutputVisibility({
      canDownload: canDownloadWorkspaceView(noGrantMember),
      canShare: canShareWorkspaceView(noGrantMember),
    }),
    { showToggle: false, showDownload: false, showShare: false }
  );
});
