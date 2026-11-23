import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addProjectDepartment,
  seedDefaultDepartments,
} from './departmentCatalog';
import {
  computeApprovedRingMetric,
  computeAttendanceDistribution,
  computeWorkPinBars,
  computeWorkPinTrend,
  filterPinsForDashboard,
} from './dashboardAnalytics';
import {
  computeDepartmentBudgetSummary,
  deduplicatePostedCharges,
  type ProjectBudgetLedger,
} from './budgetLedger';
import {
  acceptScopedInvitation,
  canToggleMemberWorkerForeman,
  createScopedInvitation,
  DEMO_REGISTERED_DIRECTORY,
  lookupAccountByExactEmail,
  type ProjectMemberIdentity,
} from './teamInvitations';
import {
  computeDepartmentDailyAttendance,
  evaluateCheckInAttempt,
  type AttendanceShiftObligation,
} from './attendanceEngine';
import type { SpatialPin } from './types';

function makePin(overrides: Partial<SpatialPin> & { id: string }): SpatialPin {
  return {
    slug: overrides.id,
    projectId: 'proj-1',
    areaId: 'area-1',
    modelVersionId: 'mv-1',
    title: `Pin ${overrides.id}`,
    description: '',
    roomId: 'ruang-kerja',
    roomName: 'Ruang Kerja',
    elementId: 'wall-1',
    elementName: 'Wall 1',
    surfaceSide: 'South',
    position: { x: 0, y: 1, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    department: 'Civil',
    assigneeName: 'Worker A',
    status: 'open',
    cycleNumber: 1,
    materials: [],
    evidence: { before: null, after: null },
    createdAt: '2026-11-10T02:00:00.000Z',
    isDemoSeed: false,
    ...overrides,
  };
}

describe('Stage C — Dashboard Charts, Budgets, Team Invitations & Attendance', () => {
  it('C01/C02: Approved Pins ring uses ALL eligible Pins (no 7-item cap), handles 0/0 cleanly, and Trend has zero backward leakage', () => {
    const pins: SpatialPin[] = [];
    for (let i = 1; i <= 12; i += 1) {
      pins.push(
        makePin({
          id: `pin-${i}`,
          department: i <= 8 ? 'Civil' : 'Electrical',
          status: i <= 6 ? 'approved' : 'in_progress',
          createdAt: '2026-11-10T02:00:00.000Z',
          statusHistory:
            i <= 6
              ? [
                  { status: 'open', at: '2026-11-10T02:00:00.000Z' },
                  { status: 'approved', at: '2026-11-18T04:00:00.000Z' },
                ]
              : [{ status: 'in_progress', at: '2026-11-10T02:00:00.000Z' }],
        })
      );
    }

    const eligibleAll = filterPinsForDashboard({
      pins,
      departmentFilter: 'All',
      selectedDate: '2026-11-20',
      granularity: 'month',
    });
    const ring = computeApprovedRingMetric(eligibleAll);
    assert.equal(ring.eligibleCount, 12);
    assert.equal(ring.approvedCount, 6);
    assert.equal(ring.approvedPercent, 50);

    // Empty filter -> 0/0 returns null percent (no NaN)
    const eligiblePlumbing = filterPinsForDashboard({
      pins,
      departmentFilter: 'Plumbing',
      selectedDate: '2026-11-20',
      granularity: 'month',
    });
    const emptyRing = computeApprovedRingMetric(eligiblePlumbing);
    assert.equal(emptyRing.eligibleCount, 0);
    assert.equal(emptyRing.approvedPercent, null);

    // Trend strictly reconstructed from dated statusHistory: before 2026-11-18, 0 pins approved!
    const trend = computeWorkPinTrend({
      pins,
      departmentFilter: 'All',
      selectedDate: '2026-11-20',
      granularity: 'day',
    });
    const nov16 = trend.find((t) => t.bucketKey === '2026-11-16');
    const nov18 = trend.find((t) => t.bucketKey === '2026-11-18');
    assert.ok(nov16 && nov18);
    assert.equal(nov16.approvedCount, 0, 'Later approval on Nov 18 must NOT leak backward to Nov 16');
    assert.equal(nov18.approvedCount, 6);
  });

  it('C03/C04/C05/C06/C07: 5th department starts Not allocated, Rp 0 vs Not allocated distinct, sourceRecordId deduplicated, Available to approve accurate, and negative overrun exact', () => {
    const baseDepts = seedDefaultDepartments('proj-1');
    const addRes = addProjectDepartment(baseDepts, 'proj-1', {
      name: 'HVAC',
      defaultPinColor: '#0F766E',
    });
    assert.equal(addRes.ok, true);
    if (!addRes.ok) return;

    const depts = addRes.departments;
    const hvac = addRes.created;
    const civil = depts.find((d) => d.slug === 'civil')!;
    const elec = depts.find((d) => d.slug === 'electrical')!;
    const plumb = depts.find((d) => d.slug === 'plumbing')!;

    const ledger: ProjectBudgetLedger = {
      projectId: 'proj-1',
      currency: 'IDR',
      allocations: [
        {
          id: 'alloc-civil',
          projectId: 'proj-1',
          departmentId: civil.id,
          periodMonth: '2026-11',
          amount: 1_000_000,
          currency: 'IDR',
          actorName: 'Accounting',
          recordedAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'alloc-elec-zero',
          projectId: 'proj-1',
          departmentId: elec.id,
          periodMonth: '2026-11',
          amount: 0,
          currency: 'IDR',
          actorName: 'Accounting',
          recordedAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'alloc-plumb',
          projectId: 'proj-1',
          departmentId: plumb.id,
          periodMonth: '2026-11',
          amount: 500_000,
          currency: 'IDR',
          actorName: 'Accounting',
          recordedAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      charges: [
        {
          id: 'c1',
          sourceRecordId: 'ISS-001',
          projectId: 'proj-1',
          departmentId: civil.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-05',
          amount: 200_000,
          currency: 'IDR',
          kind: 'internal_usage',
          description: 'Cement issue',
          actorName: 'Warehouse',
        },
        // Duplicate issue event with identical sourceRecordId MUST be deduplicated
        {
          id: 'c1-dup',
          sourceRecordId: 'ISS-001',
          projectId: 'proj-1',
          departmentId: civil.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-05',
          amount: 200_000,
          currency: 'IDR',
          kind: 'internal_usage',
          description: 'Cement issue replay',
          actorName: 'Warehouse',
        },
        // Overrun on Plumbing: 700,000 spent vs 500,000 allocated -> -200,000
        {
          id: 'c2',
          sourceRecordId: 'ISS-002',
          projectId: 'proj-1',
          departmentId: plumb.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-12',
          amount: 700_000,
          currency: 'IDR',
          kind: 'internal_usage',
          description: 'Emergency pipe replacement',
          actorName: 'Warehouse',
        },
      ],
      commitments: [
        {
          id: 'cm1',
          sourceRecordId: 'PR-100',
          projectId: 'proj-1',
          departmentId: civil.id,
          periodMonth: '2026-11',
          amount: 150_000,
          currency: 'IDR',
          description: 'Approved PR rebar',
          createdAt: '2026-11-10T00:00:00.000Z',
        },
      ],
    };

    assert.equal(deduplicatePostedCharges(ledger.charges).length, 2);

    // Civil: 1,000,000 - 200,000 posted = 800,000 remaining; minus 150,000 commitment = 650,000 available to approve
    const civilSummary = computeDepartmentBudgetSummary({
      ledger,
      department: civil,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(civilSummary.allocationStatus, 'allocated');
    assert.equal(civilSummary.postedUsedAmount, 200_000);
    assert.equal(civilSummary.remainingAmount, 800_000);
    assert.equal(civilSummary.availableToApproveAmount, 650_000);

    // Electrical: explicit 0 allocation is distinct from Not allocated
    const elecSummary = computeDepartmentBudgetSummary({
      ledger,
      department: elec,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(elecSummary.allocationStatus, 'zero');
    assert.equal(elecSummary.allocatedAmount, 0);

    // HVAC (5th dept): Not allocated, and included in Work Pin bars
    const hvacSummary = computeDepartmentBudgetSummary({
      ledger,
      department: hvac,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(hvacSummary.allocationStatus, 'not_allocated');
    assert.equal(hvacSummary.allocatedAmount, null);

    const bars = computeWorkPinBars({
      eligible: [],
      departments: depts,
      departmentFilter: 'All',
    });
    assert.ok(bars.some((b) => b.label === 'HVAC'));

    // Plumbing: negative overrun clamped at 100% ring visually, exact negative remaining preserved
    const plumbSummary = computeDepartmentBudgetSummary({
      ledger,
      department: plumb,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(plumbSummary.isOverrun, true);
    assert.equal(plumbSummary.remainingAmount, -200_000);
    assert.equal(plumbSummary.overrunAmount, 200_000);
    assert.equal(plumbSummary.ringUsedPercent, 100);
    assert.equal(plumbSummary.actualUsedPercent, 140);
  });

  it('T01–T05: Dedicated Architect/Accounting roles lock on invite; standard accounts require Worker/Foreman choice; Worker/Foreman toggle rejects dedicated roles', () => {
    const members: ProjectMemberIdentity[] = [
      {
        membershipId: 'm1',
        userId: 'u-ctr',
        email: 'budi.santoso@demo.vonta.local',
        displayName: 'Budi Santoso',
        role: 'contractor',
        hasMandorGrant: false,
        status: 'active',
      },
    ];

    // Exact email lookup for Architect locks dedicated role
    const archLookup = lookupAccountByExactEmail({
      actorRole: 'contractor',
      actorStatus: 'active',
      email: 'arin.putri@studio.vonta.local',
      directory: DEMO_REGISTERED_DIRECTORY,
      projectMembers: members,
    });
    assert.equal(archLookup.ok, true);
    if (archLookup.ok && archLookup.found) {
      assert.equal(archLookup.registeredAccountType, 'architect');
      assert.equal(archLookup.lockedDedicatedRole, 'architect');
    } else {
      assert.fail('Expected registered Architect account to be found');
    }

    // Attempt to downgrade dedicated Architect to worker is rejected with DEDICATED_ROLE_LOCKED
    const tamperedInv = createScopedInvitation({
      projectId: 'proj-1',
      projectName: 'Paviliun Kerja',
      actorUserId: 'u-ctr',
      actorName: 'Budi Santoso',
      actorRole: 'contractor',
      actorStatus: 'active',
      recipientEmail: 'arin.putri@studio.vonta.local',
      requestedStandardRole: 'worker',
      deliveryMode: 'simulated_demo',
      directory: DEMO_REGISTERED_DIRECTORY,
      projectMembers: members,
      existingInvitations: [],
    });
    assert.equal(tamperedInv.ok, false);
    if (!tamperedInv.ok) assert.equal(tamperedInv.code, 'DEDICATED_ROLE_LOCKED');

    // Valid invitation for dedicated Architect locks role to architect
    const archInv = createScopedInvitation({
      projectId: 'proj-1',
      projectName: 'Paviliun Kerja',
      actorUserId: 'u-ctr',
      actorName: 'Budi Santoso',
      actorRole: 'contractor',
      actorStatus: 'active',
      recipientEmail: 'arin.putri@studio.vonta.local',
      requestedStandardRole: null,
      deliveryMode: 'simulated_demo',
      directory: DEMO_REGISTERED_DIRECTORY,
      projectMembers: members,
      existingInvitations: [],
    });
    assert.equal(archInv.ok, true);
    if (archInv.ok) {
      assert.equal(archInv.invitation.assignedRole, 'architect');
      const accepted = acceptScopedInvitation({
        invitation: archInv.invitation,
        recipientEmail: 'arin.putri@studio.vonta.local',
        recipientUserId: archInv.invitation.recipientUserId,
      });
      assert.equal(accepted.ok, true);
      if (accepted.ok) {
        assert.equal(accepted.grantedMembership.role, 'architect');
        assert.equal(accepted.grantedMembership.hasMandorGrant, false);
      }
    }

    // Inviting standard worker requires explicit Worker or Foreman choice
    const missingChoice = createScopedInvitation({
      projectId: 'proj-1',
      projectName: 'Paviliun Kerja',
      actorUserId: 'u-ctr',
      actorName: 'Budi Santoso',
      actorRole: 'contractor',
      actorStatus: 'active',
      recipientEmail: 'fajar.site@crew.vonta.local',
      requestedStandardRole: null,
      deliveryMode: 'simulated_demo',
      directory: DEMO_REGISTERED_DIRECTORY,
      projectMembers: members,
      existingInvitations: [],
    });
    assert.equal(missingChoice.ok, false);

    // Worker/Foreman toggle allowed for standard workers, forbidden for dedicated roles
    assert.equal(canToggleMemberWorkerForeman('contractor', 'active', 'worker', 'active'), true);
    assert.equal(canToggleMemberWorkerForeman('architect', 'active', 'worker', 'active'), true);
    assert.equal(canToggleMemberWorkerForeman('contractor', 'active', 'architect', 'active'), false);
    assert.equal(canToggleMemberWorkerForeman('contractor', 'active', 'accounting', 'active'), false);
    assert.equal(canToggleMemberWorkerForeman('worker', 'active', 'worker', 'active'), false);
  });

  it('A01–A05: Attendance exact 09:00 cutoff rejects check-in, distribution separates Present/Izin/Alfa/Pending from presence rate', () => {
    const shift: AttendanceShiftObligation = {
      id: 'shift-1',
      projectId: 'proj-1',
      workerUserId: 'w-1',
      workerName: 'Raka Pratama',
      division: 'Civil',
      teamId: 'team-1',
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      shiftLabel: '08:00–16:00',
      shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'), // 08:00 WITA
      eligibility: 'scheduled',
      assignedMandorUserIds: ['m-1'],
    };

    // 08:59:59 WITA accepted
    const okBefore = evaluateCheckInAttempt({
      shift,
      existingRecord: null,
      existingIzin: null,
      serverReceiptUtcMs: Date.parse('2026-11-20T00:59:59.000Z'),
    });
    assert.equal(okBefore.accepted, true);

    // Exact 09:00:00 WITA rejected (Alfa boundary)
    const rejAtCutoff = evaluateCheckInAttempt({
      shift,
      existingRecord: null,
      existingIzin: null,
      serverReceiptUtcMs: Date.parse('2026-11-20T01:00:00.000Z'),
    });
    assert.equal(rejAtCutoff.accepted, false);
    if (!rejAtCutoff.accepted) assert.equal(rejAtCutoff.code, 'PAST_CUTOFF');

    const dayMetric = computeDepartmentDailyAttendance({
      shifts: [shift],
      recordsByObligationId: new Map(),
      izinByObligationId: new Map(),
      workDate: '2026-11-20',
      timezone: 'Asia/Makassar',
      division: 'All',
      nowUtcMs: Date.parse('2026-11-20T01:00:00.000Z'),
    });
    const dist = computeAttendanceDistribution({
      attendanceDays: [dayMetric],
      selectedDate: '2026-11-20',
      granularity: 'day',
    });
    assert.equal(dist.alfa, 1);
    assert.equal(dist.present, 0);
    assert.equal(dist.presenceRatePercent, 0);
  });
});
