import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoomOptionsFromPins,
  computePinStatusCounts,
  describeActivePinFilters,
  filterPinsForBoard,
  groupPinsForKanban,
  resolveProjectPinDepartments,
  type PinBoardFilters,
} from './pinBoard';
import { createInitialDemoState, updateDemoPinStatus } from './demoStore';
import { addProjectDepartment, seedDefaultDepartments } from './departmentCatalog';
import type { SpatialPin } from './types';

function makeTestPin(overrides: Partial<SpatialPin> & { id: string }): SpatialPin {
  const base = createInitialDemoState().pins[0];
  return {
    ...base,
    ...overrides,
    slug: overrides.slug ?? overrides.id.toLowerCase(),
    materials: overrides.materials ?? base.materials,
    evidence: overrides.evidence ?? { before: null, after: null },
  };
}

test('PIN-1: Electrical + Pending QC + Material exceptions + Date produces identical Pin IDs in List and Kanban, and clearing only department preserves other conditions', () => {
  const pins: SpatialPin[] = [
    makeTestPin({
      id: 'PIN-ELEC-QC-EX',
      title: 'Panel board torque check',
      department: 'Electrical',
      status: 'pending_review',
      updatedAt: '2026-11-20T04:00:00.000Z', // 2026-11-20 in Asia/Makassar
      materials: [
        {
          id: 'm1',
          name: 'MCB 16A',
          unit: 'pcs',
          requiredQty: 4,
          issuedQty: 2, // exception
          addedAt: '2026-11-20T01:00:00.000Z',
        },
      ],
    }),
    makeTestPin({
      id: 'PIN-ELEC-QC-NOEX',
      title: 'Conduit label audit',
      department: 'Electrical',
      status: 'pending_review',
      updatedAt: '2026-11-20T05:00:00.000Z',
      materials: [
        {
          id: 'm2',
          name: 'Cable label',
          unit: 'roll',
          requiredQty: 1,
          issuedQty: 1, // no exception
          addedAt: '2026-11-20T01:00:00.000Z',
        },
      ],
    }),
    makeTestPin({
      id: 'PIN-ELEC-QC-OLD',
      title: 'Old distribution check',
      department: 'Electrical',
      status: 'pending_review',
      updatedAt: '2026-11-18T02:00:00.000Z', // outside date range
    }),
    makeTestPin({
      id: 'PIN-PLUMB-QC-EX',
      title: 'Riser pressure test',
      department: 'Plumbing',
      status: 'pending_review',
      updatedAt: '2026-11-20T06:00:00.000Z',
    }),
    makeTestPin({
      id: 'PIN-ELEC-OPEN-EX',
      title: 'Switch box recess',
      department: 'Electrical',
      status: 'open',
      updatedAt: '2026-11-20T06:30:00.000Z',
    }),
  ];

  const filtersWithDept: PinBoardFilters = {
    departmentName: 'Electrical',
    status: 'pending_review',
    materialExceptionOnly: true,
    roomId: '',
    query: '',
    updatedFrom: '2026-11-20',
    updatedTo: '2026-11-20',
    timezone: 'Asia/Makassar',
  };

  const listIds = filterPinsForBoard(pins, filtersWithDept).map((p) => p.id);
  const kanbanCols = groupPinsForKanban(filterPinsForBoard(pins, filtersWithDept));
  const kanbanIds = kanbanCols.flatMap((col) => col.pins.map((p) => p.id));

  assert.deepEqual(listIds, ['PIN-ELEC-QC-EX']);
  assert.deepEqual(kanbanIds, listIds);
  assert.equal(kanbanCols.length, 4);
  assert.equal(
    kanbanCols.find((c) => c.status === 'pending_review')?.pins.length,
    1
  );

  // Status counts stay scoped to Electrical + Material exceptions + 2026-11-20
  const counts = computePinStatusCounts(pins, filtersWithDept);
  assert.equal(counts.all, 2); // PIN-ELEC-QC-EX + PIN-ELEC-OPEN-EX
  assert.equal(counts.open, 1);
  assert.equal(counts.in_progress, 0);
  assert.equal(counts.pending_review, 1);
  assert.equal(counts.approved, 0);
  assert.equal(counts.materialExceptions, 1);

  // Removing ONLY the department condition keeps Pending QC, Material exceptions, and date active
  const filtersWithoutDept: PinBoardFilters = {
    ...filtersWithDept,
    departmentName: 'all',
  };
  const listIdsAfterDeptClear = filterPinsForBoard(pins, filtersWithoutDept).map((p) => p.id);
  const kanbanIdsAfterDeptClear = groupPinsForKanban(
    filterPinsForBoard(pins, filtersWithoutDept)
  ).flatMap((col) => col.pins.map((p) => p.id));

  assert.deepEqual(listIdsAfterDeptClear, ['PIN-ELEC-QC-EX', 'PIN-PLUMB-QC-EX']);
  assert.deepEqual(kanbanIdsAfterDeptClear, listIdsAfterDeptClear);
});

test('PIN-2: unified department catalog preserves custom departments from both catalog and live Pins, and empty states describe active filters', () => {
  const seeded = seedDefaultDepartments('proj-live-1');
  const added = addProjectDepartment(seeded, 'proj-live-1', {
    name: 'HVAC',
    defaultPinColor: '#0284C7',
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;

  const hvacPin = makeTestPin({
    id: 'LIVE-PIN-1',
    department: 'Fire Protection',
    roomId: 'room-mech',
    roomName: 'Mechanical Room',
    color: '#BE185D',
  });

  // Catalog custom dept + Pin-derived custom dept both resolve cleanly without duplicates
  const unified = resolveProjectPinDepartments('proj-live-1', added.departments, [hvacPin]);
  const names = unified.map((d) => d.name);
  assert.deepEqual(names, ['Civil', 'Electrical', 'Plumbing', 'Finishing', 'HVAC', 'Fire Protection']);

  // Room options merge base rooms and pin rooms without duplication
  const rooms = buildRoomOptionsFromPins(
    [{ id: 'ruang-rapat', name: 'Ruang Rapat' }],
    [hvacPin]
  );
  assert.deepEqual(rooms, [
    { id: 'ruang-rapat', name: 'Ruang Rapat' },
    { id: 'room-mech', name: 'Mechanical Room' },
  ]);

  // Empty result for custom department HVAC describes exact active filters
  const emptyFilters: PinBoardFilters = {
    departmentName: 'HVAC',
    status: 'pending_review',
    materialExceptionOnly: true,
    roomId: 'room-mech',
    query: 'damper',
    updatedFrom: '2026-11-19',
    updatedTo: '2026-11-20',
    timezone: 'Asia/Makassar',
  };
  const emptyMatches = filterPinsForBoard([hvacPin], emptyFilters);
  assert.equal(emptyMatches.length, 0);

  const activeLabels = describeActivePinFilters(emptyFilters, { roomName: 'Mechanical Room' });
  assert.deepEqual(activeLabels, [
    'Department: HVAC',
    'Status: Pending QC',
    'Material exceptions',
    'Room: Mechanical Room',
    'Search: "damper"',
    'Updated: 2026-11-19 to 2026-11-20',
  ]);
});

test('PIN-2: authorized QC transitions cannot bypass Pending QC status, Before/After evidence, or QC authority', () => {
  const initial = createInitialDemoState();
  const pin = initial.pins[1]; // A03-PIN-02, Electrical, status: open, 0/2 evidence

  // Cannot approve directly from open
  const directApprove = updateDemoPinStatus(initial, pin.id, 'approved', {
    actorName: 'Contractor',
    hasQcAuthority: true,
  });
  assert.equal(directApprove.ok, false);

  // Cannot move to pending_review without Before + After photos
  const missingEvidencePending = updateDemoPinStatus(initial, pin.id, 'pending_review', {
    actorName: 'Contractor',
    hasQcAuthority: true,
  });
  assert.equal(missingEvidencePending.ok, false);

  // Even if in pending_review with both photos, worker without QC authority cannot approve
  const preparedState = {
    ...initial,
    pins: initial.pins.map((p) =>
      p.id === pin.id
        ? {
            ...p,
            status: 'pending_review' as const,
            evidence: {
              before: {
                id: 'ev-before',
                slot: 'before' as const,
                dataUrl: 'data:image/png;base64,AAA',
                fileName: 'before.png',
                mimeType: 'image/png',
                sizeBytes: 1024,
                note: 'Before installation photo',
                uploadedAt: '2026-11-20T01:00:00.000Z',
                uploadedBy: 'Worker',
                cycleNumber: 1,
              },
              after: {
                id: 'ev-after',
                slot: 'after' as const,
                dataUrl: 'data:image/png;base64,BBB',
                fileName: 'after.png',
                mimeType: 'image/png',
                sizeBytes: 1024,
                note: 'After installation photo',
                uploadedAt: '2026-11-20T02:00:00.000Z',
                uploadedBy: 'Worker',
                cycleNumber: 1,
              },
            },
          }
        : p
    ),
  };

  const unauthorizedApprove = updateDemoPinStatus(preparedState, pin.id, 'approved', {
    actorName: 'Worker',
    hasQcAuthority: false,
  });
  assert.equal(unauthorizedApprove.ok, false);

  // Authorized Contractor with both photos in pending_review succeeds
  const authorizedApprove = updateDemoPinStatus(preparedState, pin.id, 'approved', {
    actorName: 'Contractor',
    hasQcAuthority: true,
  });
  assert.equal(authorizedApprove.ok, true);
});
