import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALFA_CUTOFF_ELAPSED_MS,
  NAMED_PIN_COLOR_SWATCHES,
  canDecideIzinForShift,
  canDownloadWorkspaceView,
  canDrawLocally,
  canManageWorkspaceOutputGrants,
  canShareWorkspaceView,
  computeDepartmentDailyAttendance,
  computeDepartmentPinDashboard,
  computeShiftCutoffUtcMs,
  deriveEffectiveAttendanceStatus,
  evaluateCheckInAttempt,
  formatProjectClock,
  resolvePinColorHex,
  type AttendanceRecordState,
  type AttendanceShiftObligation,
  type IzinRequestRecord,
} from './attendanceEngine';
import type { SpatialPin } from './types';

function makeShift(
  overrides: Partial<AttendanceShiftObligation> = {}
): AttendanceShiftObligation {
  // Default: 2026-11-20 08:00:00 WITA (UTC+8) = 2026-11-20T00:00:00.000Z
  return {
    id: 'shift-wita-1',
    projectId: 'proj-1',
    workerUserId: 'worker-1',
    workerName: 'Raka Pratama',
    division: 'Civil',
    teamId: 'team-civil-a',
    workDate: '2026-11-20',
    timezone: 'Asia/Makassar',
    eligibility: 'scheduled',
    shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
    shiftLabel: '08:00–17:00',
    assignedMandorUserIds: ['mandor-civil'],
    ...overrides,
  };
}

function makePin(index: number, overrides: Partial<SpatialPin> = {}): SpatialPin {
  return {
    id: `PIN-${String(index).padStart(2, '0')}`,
    slug: `pin-${index}`,
    projectId: 'proj-1',
    areaId: 'area-1',
    modelVersionId: 'mv-1',
    title: `Work item ${index}`,
    description: 'Test pin',
    roomId: 'ruang-rapat',
    roomName: 'Ruang Rapat',
    elementId: 'W-01',
    elementName: 'Partition Wall',
    surfaceSide: 'North face',
    position: { x: 1, y: 1.5, z: 0 },
    normal: { x: 0, y: 0, z: -1 },
    department: 'Civil',
    assigneeName: 'Raka',
    status: 'open',
    cycleNumber: 1,
    materials: [],
    evidence: { before: null, after: null },
    createdAt: `2026-11-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`,
    isDemoSeed: false,
    ...overrides,
  };
}

test('A01: 08:59:59 WITA accepted as Present; 09:00:00 WITA rejected and auto-Alfa (+3,600s)', () => {
  const shift = makeShift();
  const cutoffMs = computeShiftCutoffUtcMs(shift);
  assert.equal(cutoffMs, Date.parse('2026-11-20T01:00:00.000Z')); // 09:00:00 WITA
  assert.equal(cutoffMs! - shift.shiftStartUtcMs!, ALFA_CUTOFF_ELAPSED_MS);

  // 08:59:59 WITA (1 second before cutoff) -> accepted Present
  const beforeCutoff = evaluateCheckInAttempt({
    shift,
    existingRecord: null,
    existingIzin: null,
    serverReceiptUtcMs: Date.parse('2026-11-20T00:59:59.000Z'),
  });
  assert.equal(beforeCutoff.accepted, true);
  if (beforeCutoff.accepted) {
    assert.equal(beforeCutoff.nextRecord.status, 'present');
  }

  // 09:00:00 WITA (exact cutoff instant) -> rejected, automatic Alfa
  const atCutoff = evaluateCheckInAttempt({
    shift,
    existingRecord: null,
    existingIzin: null,
    serverReceiptUtcMs: Date.parse('2026-11-20T01:00:00.000Z'),
  });
  assert.equal(atCutoff.accepted, false);
  if (!atCutoff.accepted) {
    assert.equal(atCutoff.code, 'PAST_CUTOFF');
  }
  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift,
      record: null,
      izin: null,
      nowUtcMs: Date.parse('2026-11-20T01:00:00.000Z'),
    }).attendanceStatus,
    'alfa'
  );
});

test('A04/A05/A06: Overnight shift anchors to original work date; missing/ambiguous schedule quarantined; day off never Alfa', () => {
  // Overnight shift starting 23:30 WITA on 2026-11-20 (= 2026-11-20T15:30:00Z), cutoff 00:30 WITA on 2026-11-21 (= 16:30:00Z)
  const overnight = makeShift({
    id: 'shift-overnight',
    workDate: '2026-11-20',
    shiftStartUtcMs: Date.parse('2026-11-20T15:30:00.000Z'),
    shiftLabel: '23:30–07:30 (overnight)',
  });
  const cutoff = computeShiftCutoffUtcMs(overnight);
  assert.equal(cutoff, Date.parse('2026-11-20T16:30:00.000Z'));
  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift: overnight,
      record: null,
      izin: null,
      nowUtcMs: Date.parse('2026-11-20T16:29:59.000Z'),
    }).attendanceStatus,
    'no_record_yet'
  );
  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift: overnight,
      record: null,
      izin: null,
      nowUtcMs: Date.parse('2026-11-20T16:30:00.000Z'),
    }).attendanceStatus,
    'alfa'
  );
  assert.equal(overnight.workDate, '2026-11-20');

  // Missing / ambiguous schedules quarantine as schedule_unavailable (NEVER blanket Alfa)
  const missing = makeShift({ eligibility: 'missing_schedule', shiftStartUtcMs: null });
  const ambiguous = makeShift({ eligibility: 'ambiguous_schedule', shiftStartUtcMs: null });
  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift: missing,
      record: null,
      izin: null,
      nowUtcMs: Date.parse('2026-11-20T12:00:00.000Z'),
    }).attendanceStatus,
    'schedule_unavailable'
  );
  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift: ambiguous,
      record: null,
      izin: null,
      nowUtcMs: Date.parse('2026-11-20T12:00:00.000Z'),
    }).attendanceStatus,
    'schedule_unavailable'
  );

  // Day off, cancelled, attendance disabled -> not_scheduled (NEVER Alfa)
  for (const eligibility of ['day_off', 'cancelled', 'attendance_disabled'] as const) {
    const s = makeShift({ eligibility, shiftStartUtcMs: null });
    assert.equal(
      deriveEffectiveAttendanceStatus({
        shift: s,
        record: null,
        izin: null,
        nowUtcMs: Date.parse('2026-11-20T12:00:00.000Z'),
      }).attendanceStatus,
      'not_scheduled'
    );
  }
});

test('A08/A10: Pending izin preserves no_record_yet before cutoff & alfa after cutoff; Mandor scope and non-self review enforced', () => {
  const shift = makeShift();
  const pendingIzin: IzinRequestRecord = {
    id: 'izin-1',
    obligationId: shift.id,
    projectId: shift.projectId,
    workerUserId: shift.workerUserId,
    workerName: shift.workerName,
    division: shift.division,
    teamId: shift.teamId,
    workDate: shift.workDate,
    reason: 'Family medical appointment',
    evidencePhotoIds: ['photo-1'],
    status: 'pending',
    submittedAtUtcMs: Date.parse('2026-11-20T00:30:00.000Z'),
    reviewedAtUtcMs: null,
    reviewedByUserId: null,
    reviewedByName: null,
    rejectionReason: null,
    requiresCorrectionWorkflow: false,
    version: 1,
  };

  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift,
      record: null,
      izin: pendingIzin,
      nowUtcMs: Date.parse('2026-11-20T00:45:00.000Z'),
    }).attendanceStatus,
    'no_record_yet'
  );
  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift,
      record: null,
      izin: pendingIzin,
      nowUtcMs: Date.parse('2026-11-20T01:05:00.000Z'),
    }).attendanceStatus,
    'alfa'
  );

  const approvedIzin: IzinRequestRecord = { ...pendingIzin, status: 'approved' };
  assert.equal(
    deriveEffectiveAttendanceStatus({
      shift,
      record: null,
      izin: approvedIzin,
      nowUtcMs: Date.parse('2026-11-20T01:05:00.000Z'),
    }).attendanceStatus,
    'izin'
  );

  // Assigned Mandor allowed
  const okDecision = canDecideIzinForShift({
    reviewerUserId: 'mandor-civil',
    reviewerMembership: { role: 'worker', status: 'active', hasMandorGrant: true },
    shift,
  });
  assert.equal(okDecision.allowed, true);

  // Self-review strictly denied even if worker holds Mandor grant
  const selfShift = makeShift({
    workerUserId: 'mandor-civil',
    assignedMandorUserIds: ['mandor-civil'],
  });
  const selfDecision = canDecideIzinForShift({
    reviewerUserId: 'mandor-civil',
    reviewerMembership: { role: 'worker', status: 'active', hasMandorGrant: true },
    shift: selfShift,
  });
  assert.equal(selfDecision.allowed, false);

  // Out-of-scope Mandor denied
  const otherMandor = canDecideIzinForShift({
    reviewerUserId: 'mandor-electrical',
    reviewerMembership: { role: 'worker', status: 'active', hasMandorGrant: true },
    shift,
  });
  assert.equal(otherMandor.allowed, false);

  // Contractor without Mandor grant cannot decide izin directly
  const contractorAttempt = canDecideIzinForShift({
    reviewerUserId: 'contractor-1',
    reviewerMembership: { role: 'contractor', status: 'active', hasMandorGrant: false },
    shift,
  });
  assert.equal(contractorAttempt.allowed, false);
});

test('D01 & E01/E02: Drawing, Download, and Share capabilities are independent and never conflated', () => {
  const contractor = { role: 'contractor' as const, status: 'active' as const };
  const owner = { role: 'owner' as const, status: 'active' as const };
  const mandorNoOutputGrants = {
    role: 'worker' as const,
    status: 'active' as const,
    hasMandorGrant: true,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
  };
  const workerWithDownloadOnly = {
    role: 'worker' as const,
    status: 'active' as const,
    hasMandorGrant: false,
    canDownloadWorkspaceView: true,
    canShareWorkspaceView: false,
  };
  const accountingWithShareOnly = {
    role: 'accounting' as const,
    status: 'active' as const,
    hasMandorGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: true,
  };
  const revokedOwner = { role: 'owner' as const, status: 'revoked' as const };

  // Owner & Contractor get draw + download + share automatically
  assert.equal(canDrawLocally(contractor), true);
  assert.equal(canDownloadWorkspaceView(contractor), true);
  assert.equal(canShareWorkspaceView(contractor), true);
  assert.equal(canManageWorkspaceOutputGrants(contractor), true);

  assert.equal(canDrawLocally(owner), true);
  assert.equal(canDownloadWorkspaceView(owner), true);
  assert.equal(canShareWorkspaceView(owner), true);
  assert.equal(canManageWorkspaceOutputGrants(owner), false);

  // Mandor can draw locally, but without explicit grants cannot download or share
  assert.equal(canDrawLocally(mandorNoOutputGrants), true);
  assert.equal(canDownloadWorkspaceView(mandorNoOutputGrants), false);
  assert.equal(canShareWorkspaceView(mandorNoOutputGrants), false);

  // Download-only grant NEVER grants draw or share
  assert.equal(canDrawLocally(workerWithDownloadOnly), false);
  assert.equal(canDownloadWorkspaceView(workerWithDownloadOnly), true);
  assert.equal(canShareWorkspaceView(workerWithDownloadOnly), false);

  // Share-only grant NEVER grants draw or download
  assert.equal(canDrawLocally(accountingWithShareOnly), false);
  assert.equal(canDownloadWorkspaceView(accountingWithShareOnly), false);
  assert.equal(canShareWorkspaceView(accountingWithShareOnly), true);

  // Revoked member gets nothing
  assert.equal(canDrawLocally(revokedOwner), false);
  assert.equal(canDownloadWorkspaceView(revokedOwner), false);
  assert.equal(canShareWorkspaceView(revokedOwner), false);
});

test('L04: Department Pin dashboard caps recent list at 7 distinct Pins while donut uses full counts, and daily attendance excludes partial days from ranking', () => {
  const pins: SpatialPin[] = [
    ...Array.from({ length: 8 }, (_, idx) =>
      makePin(idx + 1, {
        department: idx % 2 === 0 ? 'Civil' : 'Electrical',
        status: idx < 4 ? 'approved' : 'open',
      })
    ),
  ];

  const allDash = computeDepartmentPinDashboard(pins, 'All');
  assert.equal(allDash.totalEligiblePins, 8);
  assert.equal(allDash.approvedPins, 4);
  assert.equal(allDash.completionPercent, 50);
  // Strictly capped at 7 distinct Pins with newest (8th Pin) at index 0
  assert.equal(allDash.recentDistinctPins.length, 7);
  assert.equal(allDash.recentDistinctPins[0].id, 'PIN-08');

  const civilDash = computeDepartmentPinDashboard(pins, 'Civil');
  assert.equal(civilDash.totalEligiblePins, 4);
  assert.equal(civilDash.recentDistinctPins.length, 4);

  // Attendance metrics: Day 1 finalized (2 Present, 1 Alfa, 1 Izin -> 2/3 = 66.7%), Day 2 partial coverage
  const shifts: AttendanceShiftObligation[] = [
    makeShift({ id: 'd1-1', workDate: '2026-11-19', workerUserId: 'w1', shiftStartUtcMs: Date.parse('2026-11-19T00:00:00Z') }),
    makeShift({ id: 'd1-2', workDate: '2026-11-19', workerUserId: 'w2', shiftStartUtcMs: Date.parse('2026-11-19T00:00:00Z') }),
    makeShift({ id: 'd1-3', workDate: '2026-11-19', workerUserId: 'w3', shiftStartUtcMs: Date.parse('2026-11-19T00:00:00Z') }),
    makeShift({ id: 'd1-4', workDate: '2026-11-19', workerUserId: 'w4', shiftStartUtcMs: Date.parse('2026-11-19T00:00:00Z') }),
    makeShift({ id: 'd2-1', workDate: '2026-11-20', workerUserId: 'w1', shiftStartUtcMs: Date.parse('2026-11-20T00:00:00Z') }),
    makeShift({ id: 'd2-2', workDate: '2026-11-20', workerUserId: 'w2', shiftStartUtcMs: Date.parse('2026-11-20T00:00:00Z') }),
  ];

  const records = new Map<string, AttendanceRecordState>([
    ['d1-1', { obligationId: 'd1-1', projectId: 'proj-1', workerUserId: 'w1', workDate: '2026-11-19', division: 'Civil', status: 'present', checkInReceivedAtUtcMs: Date.parse('2026-11-19T00:10:00Z'), effectiveAtUtcMs: Date.parse('2026-11-19T00:10:00Z'), recordedAtUtcMs: Date.parse('2026-11-19T00:10:00Z'), markedBy: 'worker', version: 1 }],
    ['d1-2', { obligationId: 'd1-2', projectId: 'proj-1', workerUserId: 'w2', workDate: '2026-11-19', division: 'Civil', status: 'present', checkInReceivedAtUtcMs: Date.parse('2026-11-19T00:20:00Z'), effectiveAtUtcMs: Date.parse('2026-11-19T00:20:00Z'), recordedAtUtcMs: Date.parse('2026-11-19T00:20:00Z'), markedBy: 'worker', version: 1 }],
    ['d1-3', { obligationId: 'd1-3', projectId: 'proj-1', workerUserId: 'w3', workDate: '2026-11-19', division: 'Civil', status: 'alfa', checkInReceivedAtUtcMs: null, effectiveAtUtcMs: Date.parse('2026-11-19T01:00:00Z'), recordedAtUtcMs: Date.parse('2026-11-19T01:00:00Z'), markedBy: 'system_cutoff', version: 1 }],
    ['d1-4', { obligationId: 'd1-4', projectId: 'proj-1', workerUserId: 'w4', workDate: '2026-11-19', division: 'Civil', status: 'izin', checkInReceivedAtUtcMs: null, effectiveAtUtcMs: Date.parse('2026-11-19T00:40:00Z'), recordedAtUtcMs: Date.parse('2026-11-19T00:40:00Z'), markedBy: 'mandor_approval', version: 1 }],
    ['d2-1', { obligationId: 'd2-1', projectId: 'proj-1', workerUserId: 'w1', workDate: '2026-11-20', division: 'Civil', status: 'present', checkInReceivedAtUtcMs: Date.parse('2026-11-20T00:15:00Z'), effectiveAtUtcMs: Date.parse('2026-11-20T00:15:00Z'), recordedAtUtcMs: Date.parse('2026-11-20T00:15:00Z'), markedBy: 'worker', version: 1 }],
  ]);

  const day1 = computeDepartmentDailyAttendance({
    shifts,
    recordsByObligationId: records,
    izinByObligationId: new Map(),
    workDate: '2026-11-19',
    timezone: 'Asia/Makassar',
    division: 'Civil',
    nowUtcMs: Date.parse('2026-11-20T00:30:00Z'),
  });
  const day2 = computeDepartmentDailyAttendance({
    shifts,
    recordsByObligationId: records,
    izinByObligationId: new Map(),
    workDate: '2026-11-20',
    timezone: 'Asia/Makassar',
    division: 'Civil',
    nowUtcMs: Date.parse('2026-11-20T00:30:00Z'), // Day 2 still pre-cutoff for w2
  });

  assert.equal(day1.presentCount, 2);
  assert.equal(day1.alfaCount, 1);
  assert.equal(day1.excusedIzinCount, 1);
  assert.equal(day1.rateDenominator, 3); // Present + Alfa (excludes excused Izin)
  assert.equal(day1.attendanceRatePercent, 66.7);
  assert.equal(day1.isPartialCoverage, false);
  assert.equal(day1.eligibleForRanking, true);

  assert.equal(day2.isPartialCoverage, true);
  assert.equal(day2.eligibleForRanking, false);
});

test('L02 & L05: Named Pin color swatches resolve safely and ProjectClock formats worldwide, UTC, DST, and fractional-offset IANA zones', () => {
  assert.ok(NAMED_PIN_COLOR_SWATCHES.length >= 6);
  assert.equal(resolvePinColorHex('#0B63CE'), '#0B63CE');
  assert.equal(resolvePinColorHex('invalid-color'), NAMED_PIN_COLOR_SWATCHES[0].hex);

  const sampleDate = new Date('2026-11-20T08:15:42.000Z');
  for (const tz of [
    'UTC',
    'Asia/Makassar',
    'Asia/Kolkata', // +05:30 fractional
    'Asia/Kathmandu', // +05:45 fractional
    'Australia/Adelaide', // +10:30 DST fractional
    'America/New_York', // DST-observing
    'Europe/Berlin',
    'Pacific/Auckland',
  ]) {
    const formatted = formatProjectClock(sampleDate, tz);
    assert.equal(formatted.valid, true, `Expected valid clock for ${tz}`);
    assert.match(formatted.timeWithSeconds, /^\d{2}:\d{2}:\d{2}$/);
    assert.equal(formatted.timezone, tz);
  }
});
