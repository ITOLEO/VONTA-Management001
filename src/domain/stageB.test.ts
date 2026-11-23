import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addProjectDepartment,
  propagateDepartmentColorToPins,
  resolveEffectivePinColor,
  seedDefaultDepartments,
  updateDepartmentPinColor,
} from './departmentCatalog';
import {
  buildBuildingSummarySlides,
  createDemoBlueprintRegister,
  filterBlueprintSheets,
  sortBlueprintSheets,
} from './blueprintRegister';

test('Stage B — Department catalog seeds 4 defaults, adds 5th department, and preserves manual Pin color overrides', () => {
  const seeded = seedDefaultDepartments('proj-1');
  assert.equal(seeded.length, 4);
  assert.deepEqual(
    seeded.map((d) => d.name),
    ['Civil', 'Electrical', 'Plumbing', 'Finishing']
  );

  const dup = addProjectDepartment(seeded, 'proj-1', { name: 'civil' });
  assert.equal(dup.ok, false);

  const added = addProjectDepartment(seeded, 'proj-1', {
    name: 'HVAC',
    defaultPinColor: '#0284c7',
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.departments.length, 5);
  assert.equal(added.created.defaultPinColor, '#0284C7');

  const updated = updateDepartmentPinColor(added.departments, 'dept-electrical', '#E11D48');
  assert.equal(updated.ok, true);
  if (!updated.ok) return;

  const pins = [
    { id: 'P1', department: 'Electrical', color: '#D4652F', pinColorOverride: false },
    { id: 'P2', department: 'Electrical', color: '#111111', pinColorOverride: true },
    { id: 'P3', department: 'Civil', color: '#2563EB', pinColorOverride: false },
  ];
  const propagated = propagateDepartmentColorToPins(pins, 'Electrical', '#E11D48');
  assert.equal(propagated[0].color, '#E11D48');
  assert.equal(propagated[1].color, '#111111'); // explicit manual override preserved
  assert.equal(propagated[2].color, '#2563EB');

  assert.equal(resolveEffectivePinColor(propagated[0], updated.departments), '#E11D48');
  assert.equal(resolveEffectivePinColor(propagated[1], updated.departments), '#111111');
});

test('Stage B — B02/B03: Multi-storey side elevation & ONE shared Electrical + Plumbing slide with both discipline filters finding MEP-101', () => {
  const depts = seedDefaultDepartments('proj-paviliun-kerja-a03');
  const added = addProjectDepartment(depts, 'proj-paviliun-kerja-a03', { name: 'Landscaping' });
  assert.equal(added.ok, true);
  if (!added.ok) return;

  const sheets = createDemoBlueprintRegister('proj-paviliun-kerja-a03', added.departments);
  assert.ok(sheets.length >= 60, `Expected 60+ sheets, got ${sheets.length}`);

  const { wholeBuilding, departmentStrip } = buildBuildingSummarySlides(sheets, added.departments, {
    projectName: 'Paviliun Kerja',
    storyCount: 2,
    hasVerifiedElevationModel: false,
  });

  // Multi-storey side elevation sourced from A-05
  assert.equal(wholeBuilding.hasSideElevation, true);
  assert.equal(wholeBuilding.sideElevationStatus, 'source');
  assert.ok(wholeBuilding.provenanceRefs.some((r) => r.sheetCode === 'A-05'));

  // Exactly ONE shared Electrical + Plumbing slide, and empty Landscaping omitted
  const mepSlides = departmentStrip.filter((s) => s.kind === 'combined_mep');
  assert.equal(mepSlides.length, 1);
  assert.equal(mepSlides[0].title, 'Electrical + Plumbing');
  assert.deepEqual(mepSlides[0].departmentLabels, ['Electrical', 'Plumbing']);
  assert.equal(
    departmentStrip.some((s) => s.title === 'Landscaping'),
    false,
    'Empty department must be omitted from summary strip'
  );

  // Single stored MEP-101 sheet found by BOTH Electrical and Plumbing filters
  const elecMatches = filterBlueprintSheets(sheets, { departmentId: 'dept-electrical' }, added.departments);
  const plumbMatches = filterBlueprintSheets(sheets, { departmentId: 'dept-plumbing' }, added.departments);
  const mepInElec = elecMatches.filter((s) => s.sheetCode === 'MEP-101');
  const mepInPlumb = plumbMatches.filter((s) => s.sheetCode === 'MEP-101');
  assert.equal(mepInElec.length, 1);
  assert.equal(mepInPlumb.length, 1);
  assert.equal(mepInElec[0].id, mepInPlumb[0].id);
  assert.equal(mepInElec[0].sourceFileId, mepInPlumb[0].sourceFileId);
});

test('Stage B — Missing elevation source on 2-storey project displays truthful notice', () => {
  const depts = seedDefaultDepartments('proj-2');
  const sheets = createDemoBlueprintRegister('proj-2', depts).filter(
    (s) => s.classification !== 'elevation'
  );
  const { wholeBuilding } = buildBuildingSummarySlides(sheets, depts, {
    projectName: 'Tower Two',
    storyCount: 2,
    hasVerifiedElevationModel: false,
  });

  assert.equal(wholeBuilding.hasSideElevation, false);
  assert.equal(wholeBuilding.sideElevationStatus, 'missing');
  assert.equal(
    wholeBuilding.sideElevationNotice,
    'Side elevation needs a source or verified model.'
  );
});

test('Stage B — B04: 62-sheet register includes multi-page PDF, duplicate titles across floors, superseded sheet, missing preview, and natural sorting', () => {
  const depts = seedDefaultDepartments('proj-paviliun-kerja-a03');
  const sheets = createDemoBlueprintRegister('proj-paviliun-kerja-a03', depts);
  const sorted = sortBlueprintSheets(sheets, depts);

  // Multi-page structural PDF shares sourceFileId across 6 pages
  const structPages = sorted.filter((s) => s.sourceFileName === 'Paviliun-Structural-Set.pdf');
  assert.equal(structPages.length, 6);
  assert.equal(new Set(structPages.map((s) => s.sourceFileId)).size, 1);

  // Duplicate title across Ground Floor and Level 2
  const dupTitle = sorted.filter((s) => s.title === 'Ruang Rapat Partition Anchorage');
  assert.equal(dupTitle.length, 2);
  assert.notEqual(dupTitle[0].floorLabel, dupTitle[1].floorLabel);

  // Superseded sheet exists and sorts after active A-03
  const a03Sheets = sorted.filter((s) => s.sheetCode === 'A-03');
  assert.equal(a03Sheets.length, 2);
  assert.equal(a03Sheets[0].isSuperseded, false);
  assert.equal(a03Sheets[1].isSuperseded, true);

  // Missing preview sheet explicitly communicates missing preview
  const missingPreview = sorted.find((s) => Boolean(s.previewMissingReason));
  assert.ok(missingPreview, 'Expected a fixture sheet with explicit missing preview reason');
});
