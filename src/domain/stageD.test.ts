import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampStrokeWidthPx,
  computeCompassOrientation,
  computeIncludedAngleDeg,
  distanceVec3,
  formatPhysicalDistanceMm,
  hexToHsl,
  hslToHex,
  normalizeHexColor,
  projectRightAnglePoint,
  splitPolylineByLineStyle,
  strokeWidthPxToWorldMeters,
} from './workspaceMath';
import {
  PRIVATE_DRAWING_FORMAT_VERSION,
  isCursorModeTool,
  migratePrivateAnnotationRecord,
} from '../utils/privateDrawingStore';
import {
  propagateDepartmentColorToPins,
  seedDefaultDepartments,
  updateDepartmentPinColor,
} from './departmentCatalog';
import { VontaAddendumService } from '../server/addendumService';
import { createInitialDemoState } from './demoStore';

test('W01–W03: workspaceMath normalizes hex colors, clamps stroke widths (1..32), and splits solid/dashed/dotted lines', () => {
  assert.equal(normalizeHexColor('#f0a'), '#FF00AA');
  assert.equal(normalizeHexColor('1b2a4a'), '#1B2A4A');
  assert.equal(normalizeHexColor('#ZZZZZZ'), null);
  assert.equal(normalizeHexColor('#12345'), null);

  const hsl = hexToHsl('#D4652F');
  const roundTripped = hslToHex(hsl.h, hsl.s, hsl.l);
  assert.ok(roundTripped.startsWith('#') && roundTripped.length === 7);

  assert.equal(clampStrokeWidthPx(0), 1);
  assert.equal(clampStrokeWidthPx(-5), 1);
  assert.equal(clampStrokeWidthPx(14.6), 15);
  assert.equal(clampStrokeWidthPx(999), 32);
  assert.ok(strokeWidthPxToWorldMeters(8) > strokeWidthPxToWorldMeters(2));

  const line = [
    { x: 0, y: 0, z: 0 },
    { x: 2.0, y: 0, z: 0 },
  ];
  assert.equal(splitPolylineByLineStyle(line, 'solid', 4).length, 1);
  assert.ok(splitPolylineByLineStyle(line, 'dashed', 4).length > 2);
  assert.ok(splitPolylineByLineStyle(line, 'dotted', 4).length > 4);
});

test('W02: calibrated vs uncalibrated ruler formatting, right-angle projection, and included angles', () => {
  const dist = distanceVec3({ x: 0, y: 0, z: 0 }, { x: 2.875, y: 0, z: 0 });
  assert.equal(dist, 2.875);
  assert.equal(formatPhysicalDistanceMm(dist, true), '2,875 mm (2.88 m)');
  assert.equal(formatPhysicalDistanceMm(dist, false), 'Scale not verified');

  // 90-degree angle at origin
  const rightDeg = computeIncludedAngleDeg(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }
  );
  assert.equal(rightDeg, 90);

  // 45-degree angle at origin
  const angle45 = computeIncludedAngleDeg(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 }
  );
  assert.ok(Math.abs(angle45 - 45) < 0.2);

  // Right-angle projection onto perpendicular axis in XY plane (normal +Z)
  const proj = projectRightAnglePoint(
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 1.4, y: 1.5, z: 0 },
    { x: 0, y: 0, z: 1 }
  );
  assert.ok(Math.abs(proj.x - 2) < 1e-6);
  assert.ok(Math.abs(proj.y - 1.5) < 1e-6);
  assert.ok(Math.abs(proj.z) < 1e-6);
});

test('W04: dual compass synchronizes corner needle and ground rose with verified North and stays truthful when unset', () => {
  const verified = computeCompassOrientation(30, 90);
  assert.equal(verified.isNorthVerified, true);
  assert.equal(verified.orientationLabel, 'Verified North (90°)');
  assert.equal(verified.needleRotationDeg, 60);
  assert.ok(Math.abs(verified.groundRoseRotationRad - (-Math.PI / 2)) < 1e-6);

  const unverified = computeCompassOrientation(45, null);
  assert.equal(unverified.isNorthVerified, false);
  assert.equal(unverified.orientationLabel, 'Grid orientation · North not set');
  assert.equal(unverified.groundRoseRotationRad, 0);
});

test('W01: legacy v1 private drawing annotations migrate losslessly to v2 tangent-frame records', () => {
  assert.equal(isCursorModeTool('cursor'), true);
  assert.equal(isCursorModeTool('pan'), true);
  assert.equal(isCursorModeTool('pencil'), false);

  const legacyV1 = {
    id: 'ann-v1-1',
    formatVersion: 1,
    environment: 'demo',
    accountId: 'demo-contractor',
    projectId: 'proj-paviliun-kerja-a03',
    modelVersionId: 'a03-r00-demo-v1',
    areaId: 'area-a03-ground',
    tool: 'pencil',
    colorHex: '#d4652f',
    strokeWidth: 'medium',
    elementId: 'W-EXT-NORTH',
    origin: { x: 1, y: 1.2, z: -2.2 },
    normal: { x: 0, y: 0, z: 1 },
    tangentU: { x: 1, y: 0, z: 0 },
    tangentV: { x: 0, y: 1, z: 0 },
    points2D: [
      { u: 0, v: 0 },
      { u: 0.4, v: 0.2 },
    ],
    createdAt: '2026-11-19T08:00:00.000Z',
  };

  const migrated = migratePrivateAnnotationRecord(legacyV1);
  assert.ok(migrated);
  assert.equal(migrated.formatVersion, PRIVATE_DRAWING_FORMAT_VERSION);
  assert.equal(migrated.colorHex, '#D4652F');
  assert.equal(migrated.strokeWidthPx, 4);
  assert.equal(migrated.lineStyle, 'solid');
  assert.equal(migrated.points2D.length, 2);
});

test('W05–W06: department default Pin color updates inheriting Pins while preserving manual Pin color overrides', () => {
  const demo = createInitialDemoState();
  const depts = seedDefaultDepartments(demo.project.id);
  const finishingDept = depts.find((d) => d.name === 'Finishing');
  assert.ok(finishingDept);

  // Add a second Finishing pin with an explicit manual color override
  const pins = [
    ...demo.pins,
    {
      ...demo.pins[0],
      id: 'A03-PIN-OVERRIDE',
      slug: 'manual-override-pin',
      color: '#7C3AED',
      pinColorOverride: true,
    },
  ];

  const colorRes = updateDepartmentPinColor(depts, finishingDept.id, '#0F766E');
  assert.equal(colorRes.ok, true);
  if (!colorRes.ok) return;

  const updatedPins = propagateDepartmentColorToPins(
    pins,
    colorRes.updated.name,
    colorRes.updated.defaultPinColor
  );

  const inheritedPin = updatedPins.find((p) => p.id === 'A03-PIN-01');
  const overridePin = updatedPins.find((p) => p.id === 'A03-PIN-OVERRIDE');
  const electricalPin = updatedPins.find((p) => p.id === 'A03-PIN-02');

  assert.equal(inheritedPin?.color, '#0F766E');
  assert.equal(overridePin?.color, '#7C3AED');
  assert.equal(overridePin?.pinColorOverride, true);
  assert.equal(electricalPin?.color, '#0B63CE');
});

test('S01–S03: Restricted vs Anyone-with-link viewer-only sharing, revocation, and zero-leak allowlist', () => {
  const svc = new VontaAddendumService(() => new Date('2026-11-22T02:00:00.000Z'));
  const contractorActor = {
    userId: 'u-contractor',
    email: 'contractor@vonta.test',
    displayName: 'Budi Santoso',
  };
  svc.registerProjectContext({
    projectId: 'proj-s1',
    projectName: 'Secret Villa Confidential',
    isDeleted: false,
    availableModelVersionIds: ['mv-1'],
    availableAreaIds: ['area-1'],
  });
  svc.upsertMember({
    membershipId: 'm-1',
    projectId: 'proj-s1',
    userId: 'u-contractor',
    displayName: 'Budi Santoso',
    email: 'contractor@vonta.test',
    role: 'contractor',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: true,
    canShareWorkspaceView: true,
    division: 'Civil',
    teamId: 'team-1',
  });

  // 1. Default share is restricted + viewer-only
  const created = svc.createWorkspaceShare(contractorActor, 'proj-s1', {
    modelVersionId: 'mv-1',
    areaId: 'area-1',
    roomId: 'ruang-rapat',
    camera: { position: { x: 5, y: 6, z: -8 }, target: { x: 0, y: 1, z: 0 } },
    layers: { civil: true, electrical: false, plumbing: false, pins: true },
  });
  assert.equal(created.share.accessMode, 'restricted');
  assert.equal(created.share.permission, 'viewer');
  assert.equal(created.share.publicToken, null);
  assert.ok(created.sharePath.startsWith('/share/'));

  // 2. Switch to anyone_with_link -> opaque 48-hex publicToken generated
  const openedPublic = svc.updateWorkspaceShareAccess(
    contractorActor,
    'proj-s1',
    created.share.id,
    'anyone_with_link'
  );
  assert.equal(openedPublic.share.accessMode, 'anyone_with_link');
  assert.equal(openedPublic.share.permission, 'viewer');
  assert.ok(openedPublic.share.publicToken && /^[a-f0-9]{48}$/.test(openedPublic.share.publicToken));

  // 3. Anonymous resolution returns allowlisted viewer payload only (no projectId or createdByUserId)
  const resolved = svc.resolvePublicWorkspaceShare(openedPublic.share.publicToken!);
  assert.equal(resolved.viewerShare.accessMode, 'anyone_with_link');
  assert.equal(resolved.viewerShare.permission, 'viewer');
  assert.equal(resolved.hideLocalDrawingsOnOpen, true);
  assert.equal(resolved.modelAvailable, true);
  assert.equal('createdByUserId' in resolved.viewerShare, false);
  assert.equal('projectId' in resolved.viewerShare, false);

  // 4. Switching back to restricted immediately invalidates the public token
  const restrictedAgain = svc.updateWorkspaceShareAccess(
    contractorActor,
    'proj-s1',
    created.share.id,
    'restricted'
  );
  assert.equal(restrictedAgain.share.publicToken, null);
  assert.throws(
    () => svc.resolvePublicWorkspaceShare(openedPublic.share.publicToken!),
    (err: unknown) => (err as { status?: number }).status === 403
  );

  // 5. Public link created directly and then revoked -> 403 with zero project leak
  const publicShare = svc.createWorkspaceShare(contractorActor, 'proj-s1', {
    modelVersionId: 'mv-1',
    areaId: 'area-1',
    accessMode: 'anyone_with_link',
    camera: { position: { x: 5, y: 6, z: -8 }, target: { x: 0, y: 1, z: 0 } },
    layers: { civil: true, electrical: false, plumbing: false, pins: true },
  });
  assert.ok(publicShare.share.publicToken);
  svc.revokeWorkspaceShare(contractorActor, 'proj-s1', publicShare.share.id);
  assert.throws(
    () => svc.resolvePublicWorkspaceShare(publicShare.share.publicToken!),
    (err: unknown) => {
      const e = err as { status?: number; message?: string };
      return e.status === 403 && !String(e.message).includes('Secret Villa Confidential');
    }
  );
});
