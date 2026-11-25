import type { ProjectDepartment } from './departmentCatalog';
import type { Department, PinWorkStatus, SpatialPin } from './types';
import type { DepartmentAttendanceDayMetric } from './attendanceEngine';

export type DashboardGranularity = 'day' | 'month' | 'year';
export type DashboardValueMode = 'count' | 'percent';

export interface ApprovedRingMetric {
  eligibleCount: number;
  approvedCount: number;
  pendingReviewCount: number;
  inProgressCount: number;
  openCount: number;
  approvedPercent: number | null;
}

export interface DepartmentPinBarDatum {
  key: string;
  label: string;
  colorHex: string;
  total: number;
  approved: number;
  outstanding: number;
  approvedPercent: number;
  outstandingPercent: number;
}

export interface PinTrendPoint {
  bucketKey: string;
  label: string;
  eligibleCount: number;
  approvedCount: number;
  approvedPercent: number;
}

export interface AttendanceDistributionSummary {
  present: number;
  izin: number;
  alfa: number;
  pending: number;
  totalScheduled: number;
  presenceRatePercent: number | null;
  rateDenominator: number;
  isPartialCoverage: boolean;
  coveredDayCount: number;
  selectedDateLabel: string;
}

/**
 * Extracts YYYY-MM-DD in project-local timezone from an ISO timestamp.
 */
export function toProjectLocalDate(isoTimestamp: string, timezone = 'Asia/Makassar'): string {
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) {
    return isoTimestamp.slice(0, 10);
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(parsed));
  } catch {
    return isoTimestamp.slice(0, 10);
  }
}

/**
 * Resolves a Pin's status as of the end of `cutoffDate` (YYYY-MM-DD in project local timezone),
 * strictly reconstructing from dated `statusHistory` so later approvals NEVER leak backward
 * into earlier calendar snapshots.
 */
export function resolvePinStatusAsOfDate(
  pin: SpatialPin,
  cutoffDate: string,
  timezone = 'Asia/Makassar'
): PinWorkStatus | null {
  const createdDate = toProjectLocalDate(pin.createdAt, timezone);
  if (createdDate > cutoffDate) {
    return null;
  }

  const history = pin.statusHistory;
  if (!history || history.length === 0) {
    // If a pin has no explicit statusHistory, use updatedAt for non-open status if available
    const updatedDate = pin.updatedAt
      ? toProjectLocalDate(pin.updatedAt, timezone)
      : createdDate;
    if (pin.status === 'approved' && updatedDate > cutoffDate) {
      return 'pending_review';
    }
    return pin.status;
  }

  const sorted = [...history].sort((a, b) => a.at.localeCompare(b.at));
  let resolved: PinWorkStatus | null = null;
  for (const entry of sorted) {
    const entryDate = toProjectLocalDate(entry.at, timezone);
    if (entryDate <= cutoffDate) {
      resolved = entry.status;
    }
  }
  return resolved ?? 'open';
}

function getMonthLastDay(yearMonth: string): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return `${yearMonth}-31`;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Filters Pins by department and project-local period boundary (as of selectedDate/granularity).
 * Counts each eligible Pin once by ID.
 */
export function filterPinsForDashboard(params: {
  pins: SpatialPin[];
  departmentFilter: Department | 'All';
  selectedDate: string;
  granularity: DashboardGranularity;
  timezone?: string;
}): Array<{ pin: SpatialPin; effectiveStatus: PinWorkStatus }> {
  const { pins, departmentFilter, selectedDate, granularity, timezone = 'Asia/Makassar' } = params;
  const monthPrefix = selectedDate.slice(0, 7);
  const yearPrefix = selectedDate.slice(0, 4);

  // Determine the cutoff date for evaluating status in the project timezone
  const cutoffDate =
    granularity === 'day'
      ? selectedDate
      : granularity === 'month'
        ? getMonthLastDay(monthPrefix)
        : `${yearPrefix}-12-31`;

  const seen = new Set<string>();
  const results: Array<{ pin: SpatialPin; effectiveStatus: PinWorkStatus }> = [];

  for (const pin of pins) {
    if (seen.has(pin.id)) continue;
    seen.add(pin.id);

    if (departmentFilter !== 'All' && pin.department !== departmentFilter) {
      continue;
    }

    const effectiveStatus = resolvePinStatusAsOfDate(pin, cutoffDate, timezone);
    if (!effectiveStatus) continue;
    results.push({ pin, effectiveStatus });
  }

  return results;
}

/**
 * Computes Approved Pins ring over the FULL eligible Pin set (no 7-item cap).
 * Completed strictly means QC-approved (`effectiveStatus === 'approved'`).
 * Returns approvedPercent: null when 0 eligible Pins exist.
 */
export function computeApprovedRingMetric(
  eligible: Array<{ pin: SpatialPin; effectiveStatus: PinWorkStatus }>
): ApprovedRingMetric {
  let approvedCount = 0;
  let pendingReviewCount = 0;
  let inProgressCount = 0;
  let openCount = 0;

  for (const item of eligible) {
    switch (item.effectiveStatus) {
      case 'approved':
        approvedCount += 1;
        break;
      case 'pending_review':
        pendingReviewCount += 1;
        break;
      case 'in_progress':
        inProgressCount += 1;
        break;
      default:
        openCount += 1;
        break;
    }
  }

  const eligibleCount = eligible.length;
  const approvedPercent =
    eligibleCount > 0 ? Math.round((approvedCount / eligibleCount) * 1000) / 10 : null;

  return {
    eligibleCount,
    approvedCount,
    pendingReviewCount,
    inProgressCount,
    openCount,
    approvedPercent,
  };
}

/**
 * Computes department bars for Card 2 (approved-only chart source):
 * - When `All` departments selected: one bar per department in catalog order.
 * - When one department selected: that department's single bar datum.
 */
export function computeWorkPinBars(params: {
  eligible: Array<{ pin: SpatialPin; effectiveStatus: PinWorkStatus }>;
  departments: ProjectDepartment[];
  departmentFilter: Department | 'All';
}): DepartmentPinBarDatum[] {
  const { eligible, departments, departmentFilter } = params;

  if (departmentFilter !== 'All') {
    const deptMeta = departments.find((d) => d.name === departmentFilter);
    const total = eligible.length;
    const approved = eligible.filter((i) => i.effectiveStatus === 'approved').length;
    const outstanding = total - approved;
    return [
      {
        key: deptMeta?.id ?? departmentFilter,
        label: departmentFilter,
        colorHex: deptMeta?.defaultPinColor ?? '#15803D',
        total,
        approved,
        outstanding,
        approvedPercent: total > 0 ? Math.round((approved / total) * 100) : 0,
        outstandingPercent: total > 0 ? Math.round((outstanding / total) * 100) : 0,
      },
    ];
  }

  return departments.map((dept) => {
    const deptItems = eligible.filter((i) => i.pin.department === dept.name);
    const total = deptItems.length;
    const approved = deptItems.filter((i) => i.effectiveStatus === 'approved').length;
    const outstanding = total - approved;
    return {
      key: dept.id,
      label: dept.name,
      colorHex: dept.defaultPinColor,
      total,
      approved,
      outstanding,
      approvedPercent: total > 0 ? Math.round((approved / total) * 100) : 0,
      outstandingPercent: total > 0 ? Math.round((outstanding / total) * 100) : 0,
    };
  });
}

export interface WorkPinBarPlotItem extends DepartmentPinBarDatum {
  /** Plotted value: approved count in count mode, or department approved/eligible % in percent mode */
  value: number;
  /** Fraction of Y-axis top (0..1); strictly 0 when value is 0 */
  barRatio: number;
}

export interface WorkPinBarChartModel {
  bars: WorkPinBarPlotItem[];
  yMax: number;
  yTicks: number[];
  unit: 'Pins' | '%';
  totalEligible: number;
  isEmpty: boolean;
}

export interface AttendanceBarPlotItem {
  key: 'present' | 'izin' | 'alfa' | 'pending';
  label: string;
  count: number;
  percent: number;
  value: number;
  barRatio: number;
  colorHex: string;
}

export interface AttendanceBarChartModel {
  bars: AttendanceBarPlotItem[];
  yMax: number;
  yTicks: number[];
  unit: 'Workers' | 'Shifts' | '%';
  totalScheduled: number;
  totalLabel: string;
  presenceRateLabel: string;
  isEmpty: boolean;
}

export function buildAxisTicks(yMax: number, isPercent: boolean): number[] {
  if (isPercent) return [0, 50, 100];
  if (yMax <= 0) return [0];
  if (yMax === 1) return [0, 1];
  if (yMax === 2) return [0, 1, 2];
  return [0, Math.round(yMax / 2), yMax];
}

/**
 * Builds the Work Pins approved-only bar chart model:
 * - All mode (count): Y spans 0..total eligible Pins across displayed departments; bars draw approved counts only.
 * - Single-department mode (count): Y spans 0..that department's total eligible Pins; single bar draws approved count only.
 * - Percent mode: Y spans 0..100; each bar draws that department's rounded approved/eligible %.
 */
export function computeWorkPinBarChartModel(params: {
  eligible: Array<{ pin: SpatialPin; effectiveStatus: PinWorkStatus }>;
  departments: ProjectDepartment[];
  departmentFilter: Department | 'All';
  valueMode: DashboardValueMode;
}): WorkPinBarChartModel {
  const { eligible, departments, departmentFilter, valueMode } = params;
  const rawBars = computeWorkPinBars({ eligible, departments, departmentFilter });
  const totalEligible =
    departmentFilter === 'All'
      ? rawBars.reduce((sum, b) => sum + b.total, 0)
      : (rawBars[0]?.total ?? 0);

  const isPercent = valueMode === 'percent';
  const yMax = isPercent ? 100 : totalEligible;
  const bars: WorkPinBarPlotItem[] = rawBars.map((bar) => {
    const value = isPercent ? bar.approvedPercent : bar.approved;
    const barRatio = yMax > 0 && value > 0 ? Math.min(1, value / yMax) : 0;
    return {
      ...bar,
      value,
      barRatio,
    };
  });

  return {
    bars,
    yMax,
    yTicks: buildAxisTicks(yMax, isPercent),
    unit: isPercent ? '%' : 'Pins',
    totalEligible,
    isEmpty: totalEligible === 0,
  };
}

/**
 * Builds the Attendance status bar chart model:
 * - Statuses on X: Present, Approved leave, Absent, Pending check-in (using existing internal keys).
 * - Distribution % uses total scheduled attendances as denominator.
 * - Presence rate uses Present / (Present + Absent), returning "—" when undefined.
 * - Zero counts produce strictly 0 barRatio (zero-height bar).
 */
export function computeAttendanceBarChartModel(params: {
  distribution: AttendanceDistributionSummary;
  granularity: DashboardGranularity;
  valueMode: DashboardValueMode;
}): AttendanceBarChartModel {
  const { distribution, granularity, valueMode } = params;
  const totalScheduled = distribution.totalScheduled;
  const isPercent = valueMode === 'percent';
  const yMax = isPercent ? 100 : totalScheduled;

  const raw: Array<{
    key: AttendanceBarPlotItem['key'];
    label: string;
    count: number;
    colorHex: string;
  }> = [
    { key: 'present', label: 'Present', count: distribution.present, colorHex: '#15803D' },
    { key: 'izin', label: 'Approved leave', count: distribution.izin, colorHex: '#0B63CE' },
    { key: 'alfa', label: 'Absent', count: distribution.alfa, colorHex: '#B42318' },
    { key: 'pending', label: 'Pending check-in', count: distribution.pending, colorHex: '#B45309' },
  ];

  const bars: AttendanceBarPlotItem[] = raw.map((item) => {
    const percent = totalScheduled > 0 ? Math.round((item.count / totalScheduled) * 100) : 0;
    const value = isPercent ? percent : item.count;
    const barRatio = yMax > 0 && value > 0 ? Math.min(1, value / yMax) : 0;
    return {
      ...item,
      percent,
      value,
      barRatio,
    };
  });

  const totalLabel =
    granularity === 'day'
      ? `${totalScheduled} scheduled ${totalScheduled === 1 ? 'worker' : 'workers'}`
      : `${totalScheduled} scheduled ${totalScheduled === 1 ? 'attendance' : 'attendances'} across shifts`;

  const presenceRateLabel =
    distribution.presenceRatePercent !== null
      ? `${
          Number.isInteger(distribution.presenceRatePercent)
            ? distribution.presenceRatePercent
            : distribution.presenceRatePercent.toFixed(1)
        }%`
      : '—';

  return {
    bars,
    yMax,
    yTicks: buildAxisTicks(yMax, isPercent),
    unit: isPercent ? '%' : granularity === 'day' ? 'Workers' : 'Shifts',
    totalScheduled,
    totalLabel,
    presenceRateLabel,
    isEmpty: totalScheduled === 0,
  };
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Reconstructs Approved Pin Trend strictly from dated `statusHistory` snapshots
 * with zero backward leakage of future approvals.
 */
export function computeWorkPinTrend(params: {
  pins: SpatialPin[];
  departmentFilter: Department | 'All';
  selectedDate: string;
  granularity: DashboardGranularity;
  timezone?: string;
}): PinTrendPoint[] {
  const { pins, departmentFilter, selectedDate, granularity, timezone = 'Asia/Makassar' } = params;
  const filteredPins =
    departmentFilter === 'All'
      ? pins
      : pins.filter((p) => p.department === departmentFilter);

  const buckets: Array<{ key: string; label: string; cutoffDate: string }> = [];

  if (granularity === 'day') {
    // 7-day window ending on selectedDate
    for (let offset = -6; offset <= 0; offset += 1) {
      const dateStr = addDaysIso(selectedDate, offset);
      buckets.push({
        key: dateStr,
        label: dateStr.slice(5), // MM-DD
        cutoffDate: dateStr,
      });
    }
  } else if (granularity === 'month') {
    const year = Number(selectedDate.slice(0, 4));
    const month = Number(selectedDate.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const checkpoints = [5, 10, 15, 20, 25, lastDay];
    const ym = selectedDate.slice(0, 7);
    for (const dayNum of checkpoints) {
      const dd = String(dayNum).padStart(2, '0');
      buckets.push({
        key: `${ym}-${dd}`,
        label: `${dd}/${String(month).padStart(2, '0')}`,
        cutoffDate: `${ym}-${dd}`,
      });
    }
  } else {
    // 6-month / full-year milestones up to selectedDate's month
    const year = selectedDate.slice(0, 4);
    const maxMonth = Math.max(1, Number(selectedDate.slice(5, 7)));
    const startMonth = Math.max(1, maxMonth - 5);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = startMonth; m <= maxMonth; m += 1) {
      const mm = String(m).padStart(2, '0');
      buckets.push({
        key: `${year}-${mm}`,
        label: monthNames[m - 1] ?? mm,
        cutoffDate: `${year}-${mm}-31`,
      });
    }
  }

  return buckets.map((bucket) => {
    let eligibleCount = 0;
    let approvedCount = 0;
    for (const pin of filteredPins) {
      const status = resolvePinStatusAsOfDate(pin, bucket.cutoffDate, timezone);
      if (!status) continue;
      eligibleCount += 1;
      if (status === 'approved') approvedCount += 1;
    }
    const approvedPercent =
      eligibleCount > 0 ? Math.round((approvedCount / eligibleCount) * 100) : 0;
    return {
      bucketKey: bucket.key,
      label: bucket.label,
      eligibleCount,
      approvedCount,
      approvedPercent,
    };
  });
}

/**
 * Aggregates Daily Attendance distribution (Present, Izin, Alfa, Pending) separately
 * from presence rate `Present / (Present + Alfa)`. Project Owner is already excluded
 * from shift obligations.
 */
export function computeAttendanceDistribution(params: {
  attendanceDays: DepartmentAttendanceDayMetric[];
  selectedDate: string;
  granularity: DashboardGranularity;
}): AttendanceDistributionSummary {
  const { attendanceDays, selectedDate, granularity } = params;
  const monthPrefix = selectedDate.slice(0, 7);
  const yearPrefix = selectedDate.slice(0, 4);

  const matching = attendanceDays.filter((d) => {
    if (granularity === 'day') return d.workDate === selectedDate;
    if (granularity === 'month') return d.workDate.startsWith(`${monthPrefix}-`);
    return d.workDate.startsWith(`${yearPrefix}-`);
  });

  // Fallback to latest available day if exact date has no fixture row in day mode?
  // No — truthful empty state for the selected date!
  let present = 0;
  let izin = 0;
  let alfa = 0;
  let pending = 0;
  let isPartialCoverage = false;

  for (const day of matching) {
    present += day.presentCount;
    izin += day.excusedIzinCount;
    alfa += day.alfaCount;
    pending += day.noRecordYetCount;
    if (day.isPartialCoverage) isPartialCoverage = true;
  }

  const rateDenominator = present + alfa;
  const presenceRatePercent =
    rateDenominator > 0 ? Math.round((present / rateDenominator) * 1000) / 10 : null;

  const selectedDateLabel =
    granularity === 'day'
      ? selectedDate
      : granularity === 'month'
        ? monthPrefix
        : yearPrefix;

  return {
    present,
    izin,
    alfa,
    pending,
    totalScheduled: present + izin + alfa + pending,
    presenceRatePercent,
    rateDenominator,
    isPartialCoverage,
    coveredDayCount: matching.length,
    selectedDateLabel,
  };
}
