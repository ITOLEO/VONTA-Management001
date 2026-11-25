import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDemoOverviewKpis,
  buildLiveOverviewKpis,
  resolveOverviewSlideTargetSheetId,
  resolveSlideVerificationBadge,
} from './overviewKpis';
import { buildBuildingSummarySlides, type BlueprintSheetRecord } from '../domain/blueprintRegister';
import { ensureProjectDepartments } from '../domain/departmentCatalog';
import type { SpatialPin } from '../domain/types';

function makePin(overrides: Partial<SpatialPin> = {}): SpatialPin {
  return {
    id: 'A03-PIN-01',
    slug: 'pin-1',
    projectId: 'p1',
    areaId: 'a1',
    roomId: 'r1',
    roomName: 'Ruang Rapat',
    elementId: 'w1',
    elementName: 'Partition Wall',
    surfaceSide: 'north',
    title: 'Skim coat',
    description: '',
    department: 'Finishing',
    status: 'open',
    cycle: 1,
    assigneeName: 'Budi',
    anchor: { x: 1, y: 1, z: 0 },
    evidence: { before: null, after: null },
    materials: [{ id: 'm1', name: 'Mortar', unit: 'bag', requiredQty: 3, issuedQty: 0 }],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as SpatialPin;
}

function makeSheet(overrides: Partial<BlueprintSheetRecord> = {}): BlueprintSheetRecord {
  return {
    id: 'sheet-a03',
    projectId: 'p1',
    sourceFileId: 'f1',
    sourceFileName: 'A-03.pdf',
    pageNumber: 1,
    totalPages: 1,
    sheetCode: 'A-03',
    title: 'Ground Floor Plan',
    revision: 'R00',
    issueDate: '2026-01-01',
    author: 'Architect',
    floorLabel: 'Ground Floor (0.00 m)',
    areaId: 'a1',
    areaName: 'Ground Floor',
    departmentIds: ['dept-civil'],
    departmentNames: ['Civil'],
    isCombinedElectricalPlumbing: false,
    classification: 'plan',
    isSuperseded: false,
    scaleLabel: '1:50 (mm)',
    hasVerifiedNorth: true,
    northAngleDeg: 0,
    previewSrc: 'data:image/svg+xml;utf8,<svg/>',
    modelPreviewState: 'orbitable',
    notes: [],
    transcription: {
      identity: [],
      geometryAndCriteria: [],
      constructionContent: [],
      provenance: [],
    },
    ...overrides,
  };
}

test('buildDemoOverviewKpis matches original source calculations', () => {
  const pins = [
    makePin({ id: 'P1', status: 'open', evidence: { before: null, after: null } }),
    makePin({
      id: 'P2',
      status: 'in_progress',
      evidence: { before: { url: 'x', capturedAt: '' } as any, after: null },
    }),
  ];

  const kpis = buildDemoOverviewKpis({
    approvedCount: 0,
    totalPins: 2,
    verifiedProgressPercent: 0,
    areaCount: 1,
    pendingReviewCount: 0,
    materialExceptionCount: 2,
    totalIssuedLines: 0,
    totalMaterialLines: 4,
    pins,
  });

  assert.equal(kpis.length, 5);
  assert.deepEqual(
    kpis.map((k) => [k.title, k.value, k.supportingText]),
    [
      ['Verified progress', '0/2', '0% approved'],
      ['Stage readiness', '1/1', 'Area model calibrated'],
      ['Pending QC', '0', 'None waiting'],
      ['Blocked work', '2', '2 missing photos'],
      ['Material exceptions', '2', '0/4 lines issued'],
    ]
  );
});

test('buildLiveOverviewKpis computes truthful live metrics with zero demo leakage', () => {
  const pins = [
    makePin({
      id: 'LP1',
      status: 'approved',
      evidence: { before: { url: 'a' } as any, after: { url: 'b' } as any },
      materials: [{ id: 'm1', name: 'Pipe', unit: 'm', requiredQty: 2, issuedQty: 2 }] as any,
    }),
    makePin({ id: 'LP2', status: 'pending_review' }),
    makePin({ id: 'LP3', status: 'open' }),
  ];

  const kpis = buildLiveOverviewKpis({
    pins,
    publishedModelCount: 1,
    areaCount: 2,
  });

  assert.deepEqual(
    kpis.map((k) => [k.title, k.value, k.supportingText]),
    [
      ['Verified progress', '1/3', '33% approved'],
      ['Stage readiness', '1/2', 'Published areas'],
      ['Pending QC', '1', 'Awaiting inspection'],
      ['Blocked work', '1', 'Needs resolution'],
      ['Material exceptions', '2', 'Open shortages'],
    ]
  );
});

test('buildBuildingSummarySlides retains one E+P slide, omits empty disciplines, and flags missing multistory elevation', () => {
  const departments = ensureProjectDepartments('p1', null);
  const civilDept = departments.find((d) => d.slug === 'civil')!;
  const elecDept = departments.find((d) => d.slug === 'electrical')!;
  const plumbDept = departments.find((d) => d.slug === 'plumbing')!;

  const sheets = [
    makeSheet({
      id: 's-plan',
      sheetCode: 'A-03',
      departmentIds: [civilDept.id],
      departmentNames: [civilDept.name],
      classification: 'plan',
    }),
    makeSheet({
      id: 's-mep',
      sheetCode: 'EP-01',
      title: 'Combined Electrical + Plumbing',
      departmentIds: [elecDept.id, plumbDept.id],
      departmentNames: [elecDept.name, plumbDept.name],
      isCombinedElectricalPlumbing: true,
      classification: 'coordination',
    }),
  ];

  // Multistory with NO elevation sheet and NO verified model -> identifies missing evidence
  const missingElev = buildBuildingSummarySlides(sheets, departments, {
    projectName: 'Tower A',
    storyCount: 2,
    hasVerifiedElevationModel: false,
  });

  assert.equal(missingElev.wholeBuilding.sideElevationStatus, 'missing');
  assert.ok(missingElev.wholeBuilding.sideElevationNotice);
  assert.equal(resolveSlideVerificationBadge(missingElev.wholeBuilding).label, 'Elevation missing');

  // Strip has Civil + ONE shared Electrical + Plumbing slide; empty Finishing omitted
  assert.deepEqual(
    missingElev.departmentStrip.map((s) => s.title),
    ['Civil', 'Electrical + Plumbing']
  );

  // Multistory WITH source elevation -> target sheet switches to elevation sheet in elevation mode
  const withElev = buildBuildingSummarySlides(
    [
      ...sheets,
      makeSheet({
        id: 's-elev',
        sheetCode: 'A-05',
        title: 'South Side Elevation',
        departmentIds: [civilDept.id],
        departmentNames: [civilDept.name],
        classification: 'elevation',
      }),
    ],
    departments,
    {
      projectName: 'Tower A',
      storyCount: 2,
      hasVerifiedElevationModel: false,
    }
  );

  assert.equal(resolveOverviewSlideTargetSheetId(withElev.wholeBuilding, 'both'), 's-plan');
  assert.equal(resolveOverviewSlideTargetSheetId(withElev.wholeBuilding, 'plan'), 's-plan');
  assert.equal(resolveOverviewSlideTargetSheetId(withElev.wholeBuilding, 'elevation'), 's-elev');
  assert.equal(resolveSlideVerificationBadge(withElev.wholeBuilding).label, 'Source verified');
});
