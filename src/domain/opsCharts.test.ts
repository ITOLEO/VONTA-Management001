import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seedDefaultDepartments } from './departmentCatalog';
import {
  computeApprovedRingMetric,
  computeAttendanceBarChartModel,
  computeAttendanceDistribution,
  computeWorkPinBarChartModel,
  filterPinsForDashboard,
} from './dashboardAnalytics';
import {
  computeDepartmentDailyAttendance,
  deriveEffectiveAttendanceStatus,
  evaluateCheckInAttempt,
  formatAttendanceStatusLabel,
  formatIzinRequestStatusLabel,
  type AttendanceRecordState,
  type AttendanceShiftObligation,
  type IzinRequestRecord,
} from './attendanceEngine';
import type { Department, PinWorkStatus, SpatialPin } from './types';

function makePin(overrides: Partial<SpatialPin> & { id: string; department: Department }): SpatialPin {
  return {
    slug: overrides.id,
    projectId: 'proj-ops',
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
    assigneeName: 'Worker A',
    status: 'open',
    cycleNumber: 1,
    materials: [],
    evidence: { before: null, after: null },
    createdAt: '2026-11-05T02:00:00.000Z',
    isDemoSeed: false,
    ...overrides,
  };
}

describe('VONTA 05 — Pin & Attendance Charts (OPS-1 & OPS-2)', () => {
  it('OPS-1: 12 Electrical (5 approved) & 8 Civil (3 approved) -> All Y 0–20 (bars 5, 3), Electrical Y 0–12 (bar 5, 42%), reopened/pending/empty do not add approved work', () => {
    const depts = seedDefaultDepartments('proj-ops');
    const pins: SpatialPin[] = [];

    // 12 Electrical Pins: 5 approved, 3 pending_review, 2 in_progress, 2 open
    const elecStatuses: PinWorkStatus[] = [
      'approved',
      'approved',
      'approved',
      'approved',
      'approved',
      'pending_review',
      'pending_review',
      'pending_review',
      'in_progress',
      'in_progress',
      'open',
      'open',
    ];
    elecStatuses.forEach((st, idx) => {
      pins.push(
        makePin({
          id: `elec-${idx + 1}`,
          department: 'Electrical',
          status: st,
          statusHistory: [{ status: st, at: '2026-11-10T03:00:00.000Z' }],
        })
      );
    });

    // 8 Civil Pins: 3 approved, 1 reopened (approved on Nov 10 -> reopened in_progress on Nov 15), 2 pending_review, 2 open
    for (let i = 1; i <= 3; i += 1) {
      pins.push(
        makePin({
          id: `civil-app-${i}`,
          department: 'Civil',
          status: 'approved',
          statusHistory: [{ status: 'approved', at: '2026-11-10T03:00:00.000Z' }],
        })
      );
    }
    pins.push(
      makePin({
        id: 'civil-reopened',
        department: 'Civil',
        status: 'in_progress',
        statusHistory: [
          { status: 'open', at: '2026-11-05T02:00:00.000Z' },
          { status: 'approved', at: '2026-11-10T03:00:00.000Z' },
          { status: 'in_progress', at: '2026-11-15T04:00:00.000Z' },
        ],
      })
    );
    for (let i = 1; i <= 2; i += 1) {
      pins.push(
        makePin({
          id: `civil-pending-${i}`,
          department: 'Civil',
          status: 'pending_review',
          statusHistory: [{ status: 'pending_review', at: '2026-11-12T03:00:00.000Z' }],
        })
      );
    }
    for (let i = 1; i <= 2; i += 1) {
      pins.push(
        makePin({
          id: `civil-open-${i}`,
          department: 'Civil',
          status: 'open',
          statusHistory: [{ status: 'open', at: '2026-11-08T03:00:00.000Z' }],
        })
      );
    }

    // Also include a duplicate pin ID to confirm each eligible Pin is counted once
    pins.push({ ...pins[0] });

    const eligibleAll = filterPinsForDashboard({
      pins,
      departmentFilter: 'All',
      selectedDate: '2026-11-20',
      granularity: 'month',
      timezone: 'Asia/Makassar',
    });

    assert.equal(eligibleAll.length, 20);
    const ring = computeApprovedRingMetric(eligibleAll);
    assert.equal(ring.eligibleCount, 20);
    assert.equal(ring.approvedCount, 8); // 5 Electrical + 3 Civil (reopened & pending excluded!)

    // All mode (count): Y 0–20, Electrical = 5, Civil = 3, Plumbing = 0, Finishing = 0
    const allCountModel = computeWorkPinBarChartModel({
      eligible: eligibleAll,
      departments: depts,
      departmentFilter: 'All',
      valueMode: 'count',
    });
    assert.equal(allCountModel.yMax, 20);
    assert.deepEqual(allCountModel.yTicks, [0, 10, 20]);
    assert.equal(allCountModel.unit, 'Pins');
    assert.equal(allCountModel.isEmpty, false);

    const elecBarAll = allCountModel.bars.find((b) => b.label === 'Electrical')!;
    const civilBarAll = allCountModel.bars.find((b) => b.label === 'Civil')!;
    const plumbBarAll = allCountModel.bars.find((b) => b.label === 'Plumbing')!;
    assert.equal(elecBarAll.value, 5);
    assert.equal(elecBarAll.barRatio, 5 / 20);
    assert.equal(civilBarAll.value, 3);
    assert.equal(civilBarAll.barRatio, 3 / 20);
    assert.equal(plumbBarAll.value, 0);
    assert.equal(plumbBarAll.barRatio, 0);

    // Electrical single-department mode (count): Y 0–12, single bar of 5
    const eligibleElec = filterPinsForDashboard({
      pins,
      departmentFilter: 'Electrical',
      selectedDate: '2026-11-20',
      granularity: 'month',
      timezone: 'Asia/Makassar',
    });
    const elecCountModel = computeWorkPinBarChartModel({
      eligible: eligibleElec,
      departments: depts,
      departmentFilter: 'Electrical',
      valueMode: 'count',
    });
    assert.equal(elecCountModel.yMax, 12);
    assert.deepEqual(elecCountModel.yTicks, [0, 6, 12]);
    assert.equal(elecCountModel.bars.length, 1);
    assert.equal(elecCountModel.bars[0].label, 'Electrical');
    assert.equal(elecCountModel.bars[0].value, 5);
    assert.equal(elecCountModel.bars[0].barRatio, 5 / 12);

    // Electrical % mode: Y 0–100, rounds to 42% (5/12 = 41.67%)
    const elecPctModel = computeWorkPinBarChartModel({
      eligible: eligibleElec,
      departments: depts,
      departmentFilter: 'Electrical',
      valueMode: 'percent',
    });
    assert.equal(elecPctModel.yMax, 100);
    assert.equal(elecPctModel.unit, '%');
    assert.equal(elecPctModel.bars[0].value, 42);
    assert.equal(elecPctModel.bars[0].barRatio, 0.42);

    // Empty department -> isEmpty true
    const eligiblePlumb = filterPinsForDashboard({
      pins,
      departmentFilter: 'Plumbing',
      selectedDate: '2026-11-20',
      granularity: 'month',
      timezone: 'Asia/Makassar',
    });
    const emptyModel = computeWorkPinBarChartModel({
      eligible: eligiblePlumb,
      departments: depts,
      departmentFilter: 'Plumbing',
      valueMode: 'count',
    });
    assert.equal(emptyModel.isEmpty, true);
    assert.equal(emptyModel.totalEligible, 0);
  });

  it('OPS-2: 1 present, 1 absent, 1 approved leave, 1 pending -> 25% each, 50% presence rate, 08:59:59 vs 09:00:00 cutoff, dash when undefined, zero-height bar at 0', () => {
    const workDate = '2026-11-20';
    const shiftStartUtcMs = Date.parse('2026-11-20T00:00:00.000Z'); // 08:00:00 Asia/Makassar (UTC+8)
    const beforeCutoffUtcMs = Date.parse('2026-11-20T00:59:59.000Z'); // 08:59:59 WITA
    const exactCutoffUtcMs = Date.parse('2026-11-20T01:00:00.000Z'); // 09:00:00 WITA

    const makeShift = (id: string, workerUserId: string, startMs = shiftStartUtcMs): AttendanceShiftObligation => ({
      id,
      projectId: 'proj-ops',
      workerUserId,
      workerName: `Worker ${workerUserId}`,
      division: 'Civil',
      teamId: 'team-1',
      workDate,
      timezone: 'Asia/Makassar',
      eligibility: 'scheduled',
      shiftStartUtcMs: startMs,
      shiftLabel: '08:00–16:00',
      assignedMandorUserIds: ['foreman-1'],
    });

    // Strict boundary check: 08:59:59 vs 09:00:00 with no eligible check-in
    const boundaryShift = makeShift('sh-boundary', 'w-boundary');
    const at085959 = deriveEffectiveAttendanceStatus({
      shift: boundaryShift,
      record: null,
      izin: null,
      nowUtcMs: beforeCutoffUtcMs,
    });
    assert.equal(at085959.attendanceStatus, 'no_record_yet');
    assert.equal(formatAttendanceStatusLabel(at085959.attendanceStatus), 'Pending check-in');
    assert.equal(at085959.canSelfCheckIn, true);

    const at090000 = deriveEffectiveAttendanceStatus({
      shift: boundaryShift,
      record: null,
      izin: null,
      nowUtcMs: exactCutoffUtcMs,
    });
    assert.equal(at090000.attendanceStatus, 'alfa');
    assert.equal(formatAttendanceStatusLabel(at090000.attendanceStatus), 'Absent');
    assert.equal(at090000.canSelfCheckIn, false);

    const checkIn085959 = evaluateCheckInAttempt({
      shift: boundaryShift,
      existingRecord: null,
      existingIzin: null,
      serverReceiptUtcMs: beforeCutoffUtcMs,
    });
    assert.equal(checkIn085959.accepted, true);

    const checkIn090000 = evaluateCheckInAttempt({
      shift: boundaryShift,
      existingRecord: null,
      existingIzin: null,
      serverReceiptUtcMs: exactCutoffUtcMs,
    });
    assert.equal(checkIn090000.accepted, false);
    if (!checkIn090000.accepted) assert.equal(checkIn090000.code, 'PAST_CUTOFF');

    // Display labels check
    assert.equal(formatAttendanceStatusLabel('present'), 'Present');
    assert.equal(formatAttendanceStatusLabel('izin'), 'Approved leave');
    assert.equal(formatAttendanceStatusLabel('alfa'), 'Absent');
    assert.equal(formatAttendanceStatusLabel('no_record_yet'), 'Pending check-in');
    assert.equal(formatIzinRequestStatusLabel('pending'), 'Leave request pending');

    // 4 scheduled workers: 1 Present, 1 Absent, 1 Approved leave, 1 Pending check-in
    const shifts: AttendanceShiftObligation[] = [
      makeShift('s-present', 'w1', shiftStartUtcMs),
      makeShift('s-absent', 'w2', shiftStartUtcMs),
      makeShift('s-leave', 'w3', shiftStartUtcMs),
      // 4th worker on later shift (09:00 start -> still Pending check-in at 09:00:00)
      makeShift('s-pending', 'w4', Date.parse('2026-11-20T01:00:00.000Z')),
    ];
    const records = new Map<string, AttendanceRecordState>([
      [
        's-present',
        {
          obligationId: 's-present',
          projectId: 'proj-ops',
          workerUserId: 'w1',
          workDate,
          division: 'Civil',
          status: 'present',
          checkInReceivedAtUtcMs: Date.parse('2026-11-20T00:15:00.000Z'),
          effectiveAtUtcMs: Date.parse('2026-11-20T00:15:00.000Z'),
          recordedAtUtcMs: Date.parse('2026-11-20T00:15:00.000Z'),
          markedBy: 'worker',
          version: 1,
        },
      ],
    ]);
    const izins = new Map<string, IzinRequestRecord>([
      [
        's-leave',
        {
          id: 'iz-1',
          obligationId: 's-leave',
          projectId: 'proj-ops',
          workerUserId: 'w3',
          workerName: 'Worker w3',
          division: 'Civil',
          teamId: 'team-1',
          workDate,
          reason: 'Clinic visit',
          evidencePhotoIds: ['ev-1'],
          status: 'approved',
          submittedAtUtcMs: Date.parse('2026-11-20T00:10:00.000Z'),
          reviewedAtUtcMs: Date.parse('2026-11-20T00:20:00.000Z'),
          reviewedByUserId: 'foreman-1',
          reviewedByName: 'Foreman A',
          rejectionReason: null,
          requiresCorrectionWorkflow: false,
          version: 2,
        },
      ],
    ]);

    const dayMetric = computeDepartmentDailyAttendance({
      shifts,
      recordsByObligationId: records,
      izinByObligationId: izins,
      workDate,
      timezone: 'Asia/Makassar',
      division: 'All',
      nowUtcMs: exactCutoffUtcMs,
    });
    // Underlying coverage rule preserved
    assert.equal(dayMetric.isPartialCoverage, true);
    assert.equal(dayMetric.eligibleForRanking, false);

    const dist = computeAttendanceDistribution({
      attendanceDays: [dayMetric],
      selectedDate: workDate,
      granularity: 'day',
    });
    assert.equal(dist.totalScheduled, 4);
    assert.equal(dist.presenceRatePercent, 50);

    const pctModel = computeAttendanceBarChartModel({
      distribution: dist,
      granularity: 'day',
      valueMode: 'percent',
    });
    assert.deepEqual(
      pctModel.bars.map((b) => ({ label: b.label, pct: b.percent })),
      [
        { label: 'Present', pct: 25 },
        { label: 'Approved leave', pct: 25 },
        { label: 'Absent', pct: 25 },
        { label: 'Pending check-in', pct: 25 },
      ]
    );
    assert.equal(pctModel.presenceRateLabel, '50%');

    // Month label explicitly states "scheduled attendances across shifts"
    const monthModel = computeAttendanceBarChartModel({
      distribution: dist,
      granularity: 'month',
      valueMode: 'count',
    });
    assert.equal(monthModel.totalLabel, '4 scheduled attendances across shifts');

    // Undefined rate (0 present, 0 absent) -> "—" and zero counts produce strict 0 barRatio
    const undefinedRateDist = computeAttendanceDistribution({
      attendanceDays: [
        {
          ...dayMetric,
          presentCount: 0,
          alfaCount: 0,
          excusedIzinCount: 1,
          noRecordYetCount: 1,
          rateDenominator: 0,
          attendanceRatePercent: null,
        },
      ],
      selectedDate: workDate,
      granularity: 'day',
    });
    const undefinedModel = computeAttendanceBarChartModel({
      distribution: undefinedRateDist,
      granularity: 'day',
      valueMode: 'count',
    });
    assert.equal(undefinedModel.presenceRateLabel, '—');
    assert.equal(undefinedModel.bars.find((b) => b.key === 'present')!.barRatio, 0);
    assert.equal(undefinedModel.bars.find((b) => b.key === 'alfa')!.barRatio, 0);
    assert.equal(undefinedModel.bars.find((b) => b.key === 'izin')!.barRatio, 0.5);
  });
});
