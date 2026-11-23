import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeterministicAreaModel,
  classifyGenericSurfaceHit,
  computeCalibratedScaleMmPerPx,
  createBlankCalibratedFootprintProposal,
  evaluatePinAnchorImpact,
  unitValueToMm,
  validateBlueprintUploadFile,
  validateCalibration,
  validateClosedRoomBoundary,
} from './blueprintGeometry';
import {
  validateDeleteProjectPhrase,
  type BlueprintCalibration,
  type BlueprintGeometryProposal,
  type ProjectPinRecord,
} from './accountTypes';

const SAMPLE_CALIBRATION: BlueprintCalibration = {
  unit: 'mm',
  pointA: { x: 0.1, y: 0.2 },
  pointB: { x: 0.9, y: 0.2 },
  knownLengthMm: 11200,
  imageWidthPx: 1600,
  imageHeightPx: 1000,
  mmPerPixel: 8.75,
  wallHeightMm: 3600,
  exteriorWallMm: 200,
  interiorWallMm: 120,
};

test('1. File format & size validation accepts single-floor PDF/PNG/JPG and rejects unsupported or empty files', () => {
  assert.equal(
    validateBlueprintUploadFile({
      fileName: 'warehouse-floor.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    }).valid,
    true
  );
  assert.equal(
    validateBlueprintUploadFile({
      fileName: 'level-1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 500,
    }).valid,
    true
  );
  assert.equal(
    validateBlueprintUploadFile({
      fileName: 'plan.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 4096,
    }).valid,
    true
  );

  const badExt = validateBlueprintUploadFile({
    fileName: 'malware.exe',
    mimeType: 'application/octet-stream',
    sizeBytes: 1024,
  });
  assert.equal(badExt.valid, false);
  assert.equal(badExt.code, 'UNSUPPORTED_FILE');

  const emptyFile = validateBlueprintUploadFile({
    fileName: 'empty.png',
    mimeType: 'image/png',
    sizeBytes: 0,
  });
  assert.equal(emptyFile.valid, false);
  assert.equal(emptyFile.code, 'EMPTY_FILE');

  const hugeFile = validateBlueprintUploadFile({
    fileName: 'huge.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 25 * 1024 * 1024,
  });
  assert.equal(hugeFile.valid, false);
  assert.equal(hugeFile.code, 'FILE_TOO_LARGE');
});

test('2. Scale calibration converts mm/cm/m accurately and rejects missing or collapsed scale points', () => {
  assert.equal(unitValueToMm(11.2, 'm'), 11200);
  assert.equal(unitValueToMm(360, 'cm'), 3600);
  assert.equal(unitValueToMm(2875, 'mm'), 2875);

  const scale = computeCalibratedScaleMmPerPx({
    pointA: { x: 0.1, y: 0.2 },
    pointB: { x: 0.9, y: 0.2 },
    imageWidthPx: 1600,
    imageHeightPx: 1000,
    knownLengthMm: 11200,
  });
  assert.equal(scale.ok, true);
  if (scale.ok) {
    assert.equal(scale.pixelSpan, 1280);
    assert.equal(scale.mmPerPixel, 8.75);
  }

  // Collapsed points fail
  const collapsed = computeCalibratedScaleMmPerPx({
    pointA: { x: 0.5, y: 0.5 },
    pointB: { x: 0.501, y: 0.5 },
    imageWidthPx: 1600,
    imageHeightPx: 1000,
    knownLengthMm: 11200,
  });
  assert.equal(collapsed.ok, false);

  // Missing calibration fails validation
  assert.ok(validateCalibration(null).length > 0);
  assert.deepEqual(validateCalibration(SAMPLE_CALIBRATION), []);
});

test('3. Closed-boundary room validation rejects label-only or undersized polygons and accepts closed shapes', () => {
  const labelOnly = validateClosedRoomBoundary({ name: 'Server Room', polygonMm: [] });
  assert.equal(labelOnly.valid, false);

  const twoPoints = validateClosedRoomBoundary({
    name: 'Corridor',
    polygonMm: [
      { xMm: 0, zMm: 0 },
      { xMm: 3000, zMm: 0 },
    ],
  });
  assert.equal(twoPoints.valid, false);

  const tinyPoly = validateClosedRoomBoundary({
    name: 'Tiny',
    polygonMm: [
      { xMm: 0, zMm: 0 },
      { xMm: 200, zMm: 0 },
      { xMm: 200, zMm: 200 },
      { xMm: 0, zMm: 200 },
    ],
  });
  assert.equal(tinyPoly.valid, false);

  const validRoom = validateClosedRoomBoundary({
    name: 'Server Room',
    polygonMm: [
      { xMm: 200, zMm: 200 },
      { xMm: 4200, zMm: 200 },
      { xMm: 4200, zMm: 3200 },
      { xMm: 200, zMm: 3200 },
    ],
  });
  assert.equal(validRoom.valid, true);
  if (validRoom.valid) {
    assert.equal(validRoom.areaSqm, 12);
  }
});

test('4. Deterministic builder creates custom 11,200 x 7,400 mm 3D meshes with zero Paviliun Kerja dimensions', () => {
  const proposal: BlueprintGeometryProposal = {
    footprintLabel: '11,200 × 7,400 mm Workshop Hall',
    sourceNotes: 'Custom workshop plan',
    walls: [
      {
        id: 'W-NORTH',
        label: 'North Exterior Wall',
        category: 'exterior_wall',
        startXMm: 0,
        startZMm: 0,
        endXMm: 11200,
        endZMm: 0,
        thicknessMm: 200,
        heightMm: 3600,
      },
      {
        id: 'W-SOUTH',
        label: 'South Exterior Wall',
        category: 'exterior_wall',
        startXMm: 0,
        startZMm: 7400,
        endXMm: 11200,
        endZMm: 7400,
        thicknessMm: 200,
        heightMm: 3600,
      },
      {
        id: 'W-WEST',
        label: 'West Exterior Wall',
        category: 'exterior_wall',
        startXMm: 0,
        startZMm: 0,
        endXMm: 0,
        endZMm: 7400,
        thicknessMm: 200,
        heightMm: 3600,
      },
      {
        id: 'W-EAST',
        label: 'East Exterior Wall',
        category: 'exterior_wall',
        startXMm: 11200,
        startZMm: 0,
        endXMm: 11200,
        endZMm: 7400,
        thicknessMm: 200,
        heightMm: 3600,
      },
      {
        id: 'W-PART-1',
        label: 'Workshop Office Divider',
        category: 'interior_partition',
        startXMm: 6000,
        startZMm: 0,
        endXMm: 6000,
        endZMm: 7400,
        thicknessMm: 120,
        heightMm: 3600,
      },
    ],
    openings: [
      {
        id: 'OP-D1',
        wallId: 'W-SOUTH',
        code: 'D-01',
        kind: 'door',
        offsetMm: 1200,
        widthMm: 1100,
        sillMm: 0,
        topMm: 2200,
      },
      {
        id: 'OP-W1',
        wallId: 'W-NORTH',
        code: 'W-01',
        kind: 'window',
        offsetMm: 2000,
        widthMm: 2000,
        sillMm: 950,
        topMm: 2350,
      },
    ],
    rooms: [
      {
        id: 'room-bay',
        name: 'Assembly Bay',
        polygonMm: [
          { xMm: 100, zMm: 100 },
          { xMm: 5940, zMm: 100 },
          { xMm: 5940, zMm: 7300 },
          { xMm: 100, zMm: 7300 },
        ],
        verified: true,
      },
      {
        id: 'room-office',
        name: 'Site Office',
        polygonMm: [
          { xMm: 6060, zMm: 100 },
          { xMm: 11100, zMm: 100 },
          { xMm: 11100, zMm: 7300 },
          { xMm: 6060, zMm: 7300 },
        ],
        verified: true,
      },
    ],
  };

  const built = buildDeterministicAreaModel({
    versionId: 'mv-workshop-v1',
    areaId: 'area-workshop',
    blueprintAssetId: 'bp-workshop-r00',
    sheetCode: 'WS-01',
    revision: 'R00',
    calibration: SAMPLE_CALIBRATION,
    proposal,
  });

  // Outer-face footprint = centerline span (11,200 x 7,400) + exterior wall thickness (200 mm)
  assert.equal(built.footprintWidthMm, 11400);
  assert.equal(built.footprintDepthMm, 7600);
  assert.notEqual(built.footprintWidthMm, 8400);
  assert.notEqual(built.footprintDepthMm, 6000);
  assert.notEqual(built.crossCheck.actualMm, 2875);
  assert.equal(built.wallCount, 5);
  assert.equal(built.rooms.length, 2);
  assert.equal(built.openings.length, 2);

  // Every wall + slab produces selectable 3D boxes
  const slab = built.elements.find((e) => e.category === 'floor_slab');
  assert.ok(slab);
  assert.ok(slab.boxes.length >= 1);

  const partition = built.elements.find((e) => e.id === 'W-PART-1');
  assert.ok(partition);
  assert.equal(partition.heightMm, 3600);

  // Generic surface hit classifier maps points inside Site Office accurately
  const hit = classifyGenericSurfaceHit(
    built.rooms,
    partition,
    { x: 2.0, y: 1.4, z: 0 },
    { x: 1, y: 0, z: 0 }
  );
  assert.equal(hit.roomId, 'room-office');
  assert.equal(hit.roomName, 'Site Office');

  // Blank calibrated manual starter uses exact Contractor dimensions
  const manual = createBlankCalibratedFootprintProposal(SAMPLE_CALIBRATION, 9500, 6200, 'Main Hall');
  assert.equal(manual.walls.length, 4);
  assert.equal(manual.rooms[0].name, 'Main Hall');
});

test('5. Pin anchor impact detects removed or shifted host walls and preserves evidence counts', () => {
  const baseProposal = createBlankCalibratedFootprintProposal(
    SAMPLE_CALIBRATION,
    10000,
    6000,
    'Office'
  );
  baseProposal.walls.push({
    id: 'W-DIVIDER',
    label: 'Center Divider',
    category: 'interior_partition',
    startXMm: 5000,
    startZMm: 0,
    endXMm: 5000,
    endZMm: 6000,
    thicknessMm: 120,
    heightMm: 3600,
  });

  const v1 = buildDeterministicAreaModel({
    versionId: 'mv-1',
    areaId: 'area-1',
    blueprintAssetId: 'bp-1',
    sheetCode: 'A-01',
    revision: 'R00',
    calibration: SAMPLE_CALIBRATION,
    proposal: baseProposal,
  });

  const dividerBox = v1.elements.find((e) => e.id === 'W-DIVIDER')!.boxes[0];

  const pinOnDivider: ProjectPinRecord = {
    id: 'pin-1',
    slug: 'pin-1',
    projectId: 'proj-1',
    areaId: 'area-1',
    modelVersionId: 'mv-1',
    title: 'Patch conduit chase',
    description: 'Patch and skim divider wall',
    roomId: v1.rooms[0].id,
    roomName: v1.rooms[0].name,
    elementId: 'W-DIVIDER',
    elementName: 'Center Divider',
    surfaceSide: 'East face',
    position: { ...dividerBox.center },
    normal: { x: 1, y: 0, z: 0 },
    department: 'Electrical',
    assigneeName: 'Arif',
    status: 'in_progress',
    cycleNumber: 1,
    materials: [],
    evidence: {
      before: {
        id: 'ev-before-1',
        slot: 'before',
        cycleNumber: 1,
        fileName: 'before.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1200,
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        uploadedAt: '2026-11-19T08:00:00.000Z',
        note: 'Initial state',
      },
      after: null,
    },
    createdAt: '2026-11-19T08:00:00.000Z',
    isDemoSeed: false,
    anchorStatus: 'valid',
    remappedFromVersionId: null,
  };

  // Same geometry -> zero impacts
  assert.equal(evaluatePinAnchorImpact([pinOnDivider], v1).length, 0);

  // Shifted wall by 1,200 mm -> flagged for remap/revalidation with evidenceCount=1
  const shiftedProposal: BlueprintGeometryProposal = {
    ...baseProposal,
    walls: baseProposal.walls.map((w) =>
      w.id === 'W-DIVIDER' ? { ...w, startXMm: 6200, endXMm: 6200 } : w
    ),
  };
  const v2Shifted = buildDeterministicAreaModel({
    versionId: 'mv-2',
    areaId: 'area-1',
    blueprintAssetId: 'bp-2',
    sheetCode: 'A-01',
    revision: 'R01',
    calibration: SAMPLE_CALIBRATION,
    proposal: shiftedProposal,
  });
  const shiftedImpacts = evaluatePinAnchorImpact([pinOnDivider], v2Shifted);
  assert.equal(shiftedImpacts.length, 1);
  assert.equal(shiftedImpacts[0].pinId, 'pin-1');
  assert.equal(shiftedImpacts[0].evidenceCount, 1);

  // Removed wall -> flagged for remap
  const removedProposal: BlueprintGeometryProposal = {
    ...baseProposal,
    walls: baseProposal.walls.filter((w) => w.id !== 'W-DIVIDER'),
  };
  const v2Removed = buildDeterministicAreaModel({
    versionId: 'mv-3',
    areaId: 'area-1',
    blueprintAssetId: 'bp-3',
    sheetCode: 'A-01',
    revision: 'R02',
    calibration: SAMPLE_CALIBRATION,
    proposal: removedProposal,
  });
  const removedImpacts = evaluatePinAnchorImpact([pinOnDivider], v2Removed);
  assert.equal(removedImpacts.length, 1);
  assert.ok(removedImpacts[0].reason.includes('does not exist'));
});

test('6. Exact two-field DELETE PROJECT phrase enforces exact case and internal spaces (kos12 vs kos 12)', () => {
  // Project named "kos12" rejects "DELETE PROJECT kos 12"
  const wrongSpace = validateDeleteProjectPhrase({
    keyword: 'DELETE',
    typedProjectName: 'kos 12',
    actualProjectName: 'kos12',
  });
  assert.equal(wrongSpace.valid, false);
  assert.ok(wrongSpace.projectNameError);

  // Lowercase keyword fails
  const lowerKeyword = validateDeleteProjectPhrase({
    keyword: 'delete',
    typedProjectName: 'kos12',
    actualProjectName: 'kos12',
  });
  assert.equal(lowerKeyword.valid, false);
  assert.ok(lowerKeyword.keywordError);

  // Exact match for "kos12" succeeds
  const exactNoSpace = validateDeleteProjectPhrase({
    keyword: 'DELETE',
    typedProjectName: 'kos12',
    actualProjectName: 'kos12',
  });
  assert.equal(exactNoSpace.valid, true);

  // Project named "kos 12" accepts "DELETE PROJECT kos 12" and rejects "kos12"
  const exactWithSpace = validateDeleteProjectPhrase({
    keyword: 'DELETE',
    typedProjectName: 'kos 12',
    actualProjectName: 'kos 12',
  });
  assert.equal(exactWithSpace.valid, true);
  assert.equal(exactWithSpace.expectedPhrase, 'DELETE PROJECT kos 12');

  const missingSpace = validateDeleteProjectPhrase({
    keyword: 'DELETE',
    typedProjectName: 'kos12',
    actualProjectName: 'kos 12',
  });
  assert.equal(missingSpace.valid, false);
});
