import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildA03PaviliunKerjaModel,
  measureRuangRapatClearNorthSouth,
} from './a03Geometry';
import {
  addMaterialRequirementToPin,
  attachEvidencePhotoToPin,
  computeOverviewSummary,
  createDemoPinOnSurface,
  createInitialDemoState,
  filterPinsByOverviewMetric,
  filterRoomsByQuery,
  resolveAllAreasDisplayMode,
} from './demoStore';
import { getProjectRoutes } from '../utils/projectRoutes';

test('A-03 deterministic geometry builds Ruang Rapat clear N-S distance of 2,875 mm from mesh faces', () => {
  const model = buildA03PaviliunKerjaModel();
  assert.equal(model.crossCheck.referenceMm, 2875);
  assert.equal(model.crossCheck.actualMm, 2875);
  assert.equal(model.crossCheck.deltaMm, 0);

  // Verify measurement is truly computed from geometry, not hardcoded:
  const shiftedElements = model.elements.map((el) => {
    if (el.id !== 'W-PART-RAPAT-ARSIP') return el;
    return {
      ...el,
      boxes: el.boxes.map((b) => ({
        ...b,
        center: { ...b.center, z: b.center.z + 0.05 }, // shift 50 mm south
      })),
    };
  });
  const shiftedCheck = measureRuangRapatClearNorthSouth(shiftedElements);
  assert.equal(shiftedCheck.actualMm, 2925);
  assert.equal(shiftedCheck.deltaMm, 50);
});

test('Initial demo seed has two distinct Pins on the shared Ruang Rapat / Ruang Arsip wall', () => {
  const state = createInitialDemoState();
  assert.equal(state.pins.length, 2);
  const [pinA, pinB] = state.pins;
  assert.equal(pinA.id, 'A03-PIN-01');
  assert.equal(pinB.id, 'A03-PIN-02');
  assert.equal(pinA.elementId, 'W-PART-RAPAT-ARSIP');
  assert.equal(pinB.elementId, 'W-PART-RAPAT-ARSIP');
  assert.notEqual(pinA.position.x, pinB.position.x);
  assert.equal(pinA.evidence.before, null);
  assert.equal(pinA.evidence.after, null);
  assert.equal(pinB.evidence.before, null);
  assert.equal(pinB.evidence.after, null);
});

test('Adding material to Pin A validates inputs, keeps issuedQty at 0, and isolates Pin B', () => {
  const state = createInitialDemoState();

  const badQty = addMaterialRequirementToPin(state, 'A03-PIN-01', {
    name: 'Primer coat',
    unit: 'liter',
    requiredQty: 0,
  });
  assert.equal(badQty.ok, false);

  const ok = addMaterialRequirementToPin(state, 'A03-PIN-01', {
    name: 'Alkali wall primer',
    unit: 'liter',
    requiredQty: 4,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    const pinA = ok.state.pins.find((p) => p.id === 'A03-PIN-01')!;
    const pinB = ok.state.pins.find((p) => p.id === 'A03-PIN-02')!;
    assert.equal(pinA.materials.length, 3);
    assert.equal(pinA.materials[2].requiredQty, 4);
    assert.equal(pinA.materials[2].issuedQty, 0);
    assert.equal(pinB.materials.length, 2);
    assert.equal(
      pinB.materials.some((m) => m.name === 'Alkali wall primer'),
      false
    );
  }
});

test('Attaching Before/After photos to Pin A isolates Pin B and does not approve or raise progress', () => {
  const state = createInitialDemoState();
  const res = attachEvidencePhotoToPin(state, 'A03-PIN-01', {
    slot: 'before',
    fileName: 'wall-before.png',
    mimeType: 'image/png',
    sizeBytes: 1200,
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    const pinA = res.state.pins.find((p) => p.id === 'A03-PIN-01')!;
    const pinB = res.state.pins.find((p) => p.id === 'A03-PIN-02')!;
    assert.equal(pinA.evidence.before?.fileName, 'wall-before.png');
    assert.equal(pinA.status, 'open');
    assert.equal(pinB.evidence.before, null);

    const summary = computeOverviewSummary(res.state.pins);
    assert.equal(summary.approvedCount, 0);
    assert.equal(summary.verifiedProgressPercent, 0);
    assert.equal(summary.beforePhotoCount, 1);
    assert.equal(summary.hasQcDecisions, false);
    assert.equal(summary.hasWarehouseIssues, false);
  }
});

test('Creating demo Pin rejects empty void hit and creates valid Pin on surface hit', () => {
  const state = createInitialDemoState();

  const voidAttempt = createDemoPinOnSurface(state, {
    hit: null,
    title: 'Void test pin',
    department: 'Civil',
    assigneeName: 'Agus Pratama (Demo)',
  });
  assert.equal(voidAttempt.ok, false);

  const validAttempt = createDemoPinOnSurface(state, {
    hit: {
      elementId: 'W-EXT-EAST',
      elementName: 'East Exterior Wall (Axis 3)',
      roomId: 'ruang-rapat',
      roomName: 'Ruang Rapat',
      surfaceSide: 'Ruang Rapat (West face)',
      point: { x: 4.125, y: 1.5, z: -1.4 },
      normal: { x: -1, y: 0, z: 0 },
    },
    title: 'Wall plaster inspection',
    department: 'Civil',
    assigneeName: 'Agus Pratama (Demo)',
  });

  assert.equal(validAttempt.ok, true);
  if (validAttempt.ok) {
    assert.equal(validAttempt.state.state.pins.length, 3);
    assert.equal(validAttempt.state.createdPin.id, 'A03-PIN-03');
    assert.equal(validAttempt.state.createdPin.elementId, 'W-EXT-EAST');
    assert.equal(validAttempt.state.createdPin.modelVersionId, 'a03-r00-demo-v1');
  }
});

test('Overview summary metrics match filtered work lists 1:1', () => {
  const state = createInitialDemoState();
  const summary = computeOverviewSummary(state.pins);

  assert.equal(summary.approvedCount, filterPinsByOverviewMetric(state.pins, 'approved').length);
  assert.equal(
    summary.pendingReviewCount,
    filterPinsByOverviewMetric(state.pins, 'pending_review').length
  );
  assert.equal(
    summary.materialExceptionCount,
    filterPinsByOverviewMetric(state.pins, 'material_exceptions').length
  );
  assert.equal(summary.materialExceptionCount, 2);
  assert.equal(summary.openCount, filterPinsByOverviewMetric(state.pins, 'open').length);
});

test('Room search filters A-03 rooms accurately and unregistered areas never superimpose in All Areas', () => {
  const model = buildA03PaviliunKerjaModel();
  assert.equal(filterRoomsByQuery(model.rooms, '').length, 3);
  assert.equal(filterRoomsByQuery(model.rooms, 'rapat').length, 1);
  assert.equal(filterRoomsByQuery(model.rooms, 'rapat')[0].id, 'ruang-rapat');
  assert.equal(filterRoomsByQuery(model.rooms, 'nonexistent-room').length, 0);

  const state = createInitialDemoState();
  const registeredOnly = resolveAllAreasDisplayMode(state.areas);
  assert.equal(registeredOnly.mode, 'single_registered_scene');

  const mixedAreas = [
    ...state.areas,
    {
      id: 'area-annex-unverified',
      name: 'Service Annex',
      sheetLabel: 'Sheet A-04 Draft',
      blueprintStatus: 'Uploaded (scale pending)',
      modelStatus: 'Draft' as const,
      modelVersionId: 'a04-draft-v0',
      isRegisteredInCommonFrame: false,
      blueprintSrc: null,
    },
  ];
  const unverifiedResult = resolveAllAreasDisplayMode(mixedAreas);
  assert.equal(unverifiedResult.mode, 'separate_unverified_previews');
  assert.deepEqual(unverifiedResult.unverifiedAreaIds, ['area-annex-unverified']);
});

test('getProjectRoutes derives overview and settings paths from projectBase without crossing namespaces', () => {
  const demoRoutes = getProjectRoutes('/demo/projects', 'paviliun-kerja');
  assert.equal(demoRoutes.isDemoPrefix, true);
  assert.equal(demoRoutes.directoryPath, '/demo/projects');
  assert.equal(demoRoutes.overviewPath, '/demo/projects/paviliun-kerja');
  assert.equal(demoRoutes.workspacePath, '/demo/projects/paviliun-kerja/spatial');
  assert.equal(demoRoutes.settingsPath, '/demo/projects/paviliun-kerja/settings');

  const liveRoutes = getProjectRoutes('/projects', 'tower-north');
  assert.equal(liveRoutes.isDemoPrefix, false);
  assert.equal(liveRoutes.directoryPath, '/projects');
  assert.equal(liveRoutes.overviewPath, '/projects/tower-north');
  assert.equal(liveRoutes.workspacePath, '/projects/tower-north/spatial');
  assert.equal(liveRoutes.settingsPath, '/projects/tower-north/settings');
});
