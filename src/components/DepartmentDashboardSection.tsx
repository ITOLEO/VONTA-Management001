import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarCheck2, CheckCircle2, Filter, TrendingUp } from 'lucide-react';
import type { Department, SpatialPin } from '../domain/types';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import { seedDefaultDepartments } from '../domain/departmentCatalog';
import type { DepartmentAttendanceDayMetric } from '../domain/attendanceEngine';
import {
  computeApprovedRingMetric,
  computeAttendanceDistribution,
  computeWorkPinBars,
  computeWorkPinTrend,
  filterPinsForDashboard,
  type DashboardGranularity,
  type DashboardValueMode,
} from '../domain/dashboardAnalytics';

export interface DepartmentDashboardSectionProps {
  pins: SpatialPin[];
  departments?: ProjectDepartment[];
  getPinHref: (pin: SpatialPin) => string;
  pinListHref?: string;
  attendanceDays: DepartmentAttendanceDayMetric[];
  getAttendanceDaysForDepartment?: (
    dept: Department | 'All'
  ) => DepartmentAttendanceDayMetric[];
  attendanceHref: string;
  projectTimezone?: string;
  defaultSelectedDate?: string;
}

/**
 * Stage C Overview Operational Dashboard:
 * - One shared filter bar: Department (seeded + 5th+ catalog depts), Date + Day/Month/Year, Count/Percent.
 * - Three equal-height stable plot cards (`h-[360px]` on desktop, <=1px variance across datasets).
 * - Card 1: Approved Pins ring over FULL eligible Pin count (no 7-Pin cap; 0/0 -> "No eligible Pins.").
 * - Card 2: Work Pins bars with Bars / Trend toggle (Trend strictly from dated statusHistory).
 * - Card 3: Daily attendance distribution (Present / Izin / Alfa / Pending) distinct from presence rate.
 */
export const DepartmentDashboardSection: React.FC<DepartmentDashboardSectionProps> = ({
  pins,
  departments,
  pinListHref,
  attendanceDays,
  getAttendanceDaysForDepartment,
  attendanceHref,
  projectTimezone = 'Asia/Makassar',
  defaultSelectedDate = '2026-11-20',
}) => {
  const catalogDepartments = useMemo(
    () => (departments && departments.length > 0 ? departments : seedDefaultDepartments('default')),
    [departments]
  );

  const [selectedDepartment, setSelectedDepartment] = useState<Department | 'All'>('All');
  const [granularity, setGranularity] = useState<DashboardGranularity>('month');
  const [selectedDate, setSelectedDate] = useState<string>(defaultSelectedDate);
  const [valueMode, setValueMode] = useState<DashboardValueMode>('count');
  const [workChartView, setWorkChartView] = useState<'bars' | 'trend'>('bars');

  const eligiblePins = useMemo(
    () =>
      filterPinsForDashboard({
        pins,
        departmentFilter: selectedDepartment,
        selectedDate,
        granularity,
        timezone: projectTimezone,
      }),
    [pins, selectedDepartment, selectedDate, granularity, projectTimezone]
  );

  const approvedRing = useMemo(() => computeApprovedRingMetric(eligiblePins), [eligiblePins]);

  const pinBars = useMemo(
    () =>
      computeWorkPinBars({
        eligible: eligiblePins,
        departments: catalogDepartments,
        departmentFilter: selectedDepartment,
      }),
    [eligiblePins, catalogDepartments, selectedDepartment]
  );

  const pinTrend = useMemo(
    () =>
      computeWorkPinTrend({
        pins,
        departmentFilter: selectedDepartment,
        selectedDate,
        granularity,
        timezone: projectTimezone,
      }),
    [pins, selectedDepartment, selectedDate, granularity, projectTimezone]
  );

  const filteredAttendanceDays = useMemo(() => {
    if (getAttendanceDaysForDepartment) {
      return getAttendanceDaysForDepartment(selectedDepartment);
    }
    if (selectedDepartment === 'All') return attendanceDays;
    return attendanceDays.filter(
      (d) => d.division === selectedDepartment || d.division === 'All'
    );
  }, [attendanceDays, getAttendanceDaysForDepartment, selectedDepartment]);

  const attendanceDist = useMemo(
    () =>
      computeAttendanceDistribution({
        attendanceDays: filteredAttendanceDays,
        selectedDate,
        granularity,
      }),
    [filteredAttendanceDays, selectedDate, granularity]
  );

  // Donut geometry
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const ringPct = approvedRing.approvedPercent ?? 0;
  const dashOffset = circumference * (1 - ringPct / 100);

  // Bar scaling for Work Pins
  const maxBarValue = useMemo(() => {
    if (valueMode === 'percent') return 100;
    const maxVal = Math.max(
      1,
      ...pinBars.map((b) =>
        selectedDepartment === 'All' ? b.total : Math.max(b.approved, b.outstanding)
      )
    );
    return maxVal;
  }, [pinBars, valueMode, selectedDepartment]);

  // Attendance bar items
  const attendanceSeries = useMemo(() => {
    const total = Math.max(1, attendanceDist.totalScheduled);
    return [
      {
        key: 'present',
        label: 'Present',
        count: attendanceDist.present,
        pct: Math.round((attendanceDist.present / total) * 100),
        color: '#15803D',
      },
      {
        key: 'izin',
        label: 'Izin',
        count: attendanceDist.izin,
        pct: Math.round((attendanceDist.izin / total) * 100),
        color: '#0B63CE',
      },
      {
        key: 'alfa',
        label: 'Alfa',
        count: attendanceDist.alfa,
        pct: Math.round((attendanceDist.alfa / total) * 100),
        color: '#B42318',
      },
      {
        key: 'pending',
        label: 'Pending',
        count: attendanceDist.pending,
        pct: Math.round((attendanceDist.pending / total) * 100),
        color: '#B45309',
      },
    ];
  }, [attendanceDist]);

  const maxAttendanceBar = useMemo(() => {
    if (valueMode === 'percent') return 100;
    return Math.max(1, ...attendanceSeries.map((s) => s.count));
  }, [attendanceSeries, valueMode]);

  // Trend SVG geometry
  const trendMaxY = useMemo(() => {
    if (valueMode === 'percent') return 100;
    return Math.max(1, ...pinTrend.map((pt) => Math.max(pt.approvedCount, pt.eligibleCount)));
  }, [pinTrend, valueMode]);

  const trendPolylinePoints = useMemo(() => {
    if (pinTrend.length === 0) return '';
    const w = 260;
    const h = 128;
    const padX = 16;
    const padY = 12;
    const usableW = w - padX * 2;
    const usableH = h - padY * 2;
    return pinTrend
      .map((pt, idx) => {
        const x =
          pinTrend.length === 1 ? padX + usableW / 2 : padX + (idx / (pinTrend.length - 1)) * usableW;
        const val = valueMode === 'percent' ? pt.approvedPercent : pt.approvedCount;
        const y = padY + usableH - (val / trendMaxY) * usableH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [pinTrend, valueMode, trendMaxY]);

  return (
    <section
      data-testid="overview-department-dashboard"
      aria-labelledby="department-ops-heading"
      className="rounded-xl border border-[#D9DEE2] bg-white p-5 lg:p-6 space-y-5"
    >
      {/* Shared Filter & Controls Header */}
      <div className="flex flex-col gap-3 border-b border-[#E6E8EB] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="department-ops-heading"
              className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
            >
              Department Operations &amp; Attendance
            </h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
              Basis: All eligible Work Pins &amp; scheduled worker attendance (Owner exempt ·{' '}
              <span className="tabular-nums">{projectTimezone}</span>).
            </p>
          </div>

          {/* Date + Granularity + Count/Percent controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Date granularity"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              {(['day', 'month', 'year'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  data-testid={`ops-granularity-${g}`}
                  aria-pressed={granularity === g}
                  onClick={() => setGranularity(g)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize transition-colors ${
                    granularity === g
                      ? 'bg-[#1B2A4A] text-white'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center">
              <span className="sr-only">Reference date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || defaultSelectedDate)}
                data-testid="ops-date-input"
                className="h-8 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[12px] font-medium text-[#1B2A4A] tabular-nums focus:border-[#0B63CE] focus:outline-none"
              />
            </label>

            <div
              role="group"
              aria-label="Value display mode"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              <button
                type="button"
                data-testid="ops-mode-count"
                aria-pressed={valueMode === 'count'}
                onClick={() => setValueMode('count')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  valueMode === 'count'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                Count
              </button>
              <button
                type="button"
                data-testid="ops-mode-percent"
                aria-pressed={valueMode === 'percent'}
                onClick={() => setValueMode('percent')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  valueMode === 'percent'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                Percent
              </button>
            </div>
          </div>
        </div>

        {/* Shared Department Filter Strip (includes 5th+ catalog departments) */}
        <div
          role="group"
          aria-label="Filter operational charts by department"
          data-testid="dashboard-department-filter"
          className="flex flex-wrap items-center gap-1.5"
        >
          <Filter className="mr-1 h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
          <button
            type="button"
            data-testid="dept-filter-all"
            aria-pressed={selectedDepartment === 'All'}
            onClick={() => setSelectedDepartment('All')}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              selectedDepartment === 'All'
                ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                : 'border-[#D9DEE2] bg-[#FAF9F6] text-[#1B2A4A] hover:bg-[#F4F3EF]'
            }`}
          >
            All
          </button>
          {catalogDepartments.map((dept) => {
            const active = selectedDepartment === dept.name;
            return (
              <button
                key={dept.id}
                type="button"
                data-testid={`dept-filter-${dept.slug}`}
                aria-pressed={active}
                onClick={() => setSelectedDepartment(dept.name)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                    : 'border-[#D9DEE2] bg-[#FAF9F6] text-[#1B2A4A] hover:bg-[#F4F3EF]'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: dept.defaultPinColor }}
                  aria-hidden="true"
                />
                {dept.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Three Equal Fixed-Height Plot Cards (360px stable height on desktop) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Card 1: Approved Pins Ring (Full eligible dataset) */}
        <article
          data-testid="dashboard-approved-donut"
          className="flex h-[360px] flex-col justify-between overflow-hidden rounded-xl border border-[#E6E8EB] bg-[#FAF9F6] p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[14px] font-semibold text-[#1B2A4A]">Approved Pins</h3>
              <p className="text-[12px] text-[#4F5C67]">
                {selectedDepartment === 'All' ? 'All departments' : selectedDepartment} ·{' '}
                {granularity === 'day'
                  ? `As of ${selectedDate}`
                  : granularity === 'month'
                    ? selectedDate.slice(0, 7)
                    : selectedDate.slice(0, 4)}
              </p>
            </div>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" aria-hidden="true" />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="relative flex h-36 w-36 items-center justify-center">
              <svg viewBox="0 0 128 128" className="h-36 w-36 -rotate-90" aria-hidden="true">
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="#D9DEE2"
                  strokeWidth="12"
                />
                {approvedRing.eligibleCount > 0 && (
                  <circle
                    cx="64"
                    cy="64"
                    r={radius}
                    fill="none"
                    stroke="#15803D"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
                {approvedRing.eligibleCount === 0 ? (
                  <span className="text-[13px] font-semibold text-[#4F5C67]">0 / 0</span>
                ) : valueMode === 'percent' ? (
                  <>
                    <span className="text-[22px] font-bold text-[#1B2A4A]">
                      {Math.round(ringPct)}%
                    </span>
                    <span className="text-[11px] text-[#4F5C67]">Approved</span>
                  </>
                ) : (
                  <>
                    <span className="text-[22px] font-bold text-[#1B2A4A]">
                      {approvedRing.approvedCount}/{approvedRing.eligibleCount}
                    </span>
                    <span className="text-[11px] text-[#4F5C67]">Approved</span>
                  </>
                )}
              </div>
            </div>

            {approvedRing.eligibleCount === 0 ? (
              <p
                data-testid="dashboard-donut-empty"
                className="mt-2 text-[13px] font-medium text-[#4F5C67]"
              >
                No eligible Pins.
              </p>
            ) : (
              <p
                data-testid="dashboard-donut-counts"
                className="mt-2 text-center text-[13px] text-[#4F5C67] tabular-nums"
              >
                <strong className="text-[#1B2A4A]">{approvedRing.approvedCount}</strong> of{' '}
                <strong className="text-[#1B2A4A]">{approvedRing.eligibleCount}</strong> eligible
                Pins approved ({Math.round(ringPct)}%)
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-[#E6E8EB] pt-3 text-center text-[12px] tabular-nums">
            <div className="rounded-lg bg-white px-2 py-1.5 border border-[#E6E8EB]">
              <div className="font-bold text-[#1B2A4A]">{approvedRing.pendingReviewCount}</div>
              <div className="text-[11px] text-[#4F5C67]">Pending QC</div>
            </div>
            <div className="rounded-lg bg-white px-2 py-1.5 border border-[#E6E8EB]">
              <div className="font-bold text-[#1B2A4A]">{approvedRing.inProgressCount}</div>
              <div className="text-[11px] text-[#4F5C67]">In progress</div>
            </div>
            <div className="rounded-lg bg-white px-2 py-1.5 border border-[#E6E8EB]">
              <div className="font-bold text-[#1B2A4A]">{approvedRing.openCount}</div>
              <div className="text-[11px] text-[#4F5C67]">Open</div>
            </div>
          </div>
        </article>

        {/* Card 2: Work Pins Bars / Trend */}
        <article
          data-testid="dashboard-work-pins-chart"
          className="flex h-[360px] flex-col justify-between overflow-hidden rounded-xl border border-[#E6E8EB] bg-[#FAF9F6] p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[14px] font-semibold text-[#1B2A4A]">Work Pins</h3>
              <p className="text-[12px] text-[#4F5C67]">
                {workChartView === 'bars'
                  ? selectedDepartment === 'All'
                    ? 'Approved vs outstanding by department'
                    : `${selectedDepartment}: Approved vs outstanding`
                  : 'Approved trajectory from status history'}
              </p>
            </div>
            <div
              role="group"
              aria-label="Work Pins chart mode"
              className="inline-flex shrink-0 rounded-lg border border-[#D9DEE2] bg-white p-0.5"
            >
              <button
                type="button"
                data-testid="work-pins-mode-bars"
                aria-pressed={workChartView === 'bars'}
                onClick={() => setWorkChartView('bars')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                  workChartView === 'bars'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                <BarChart3 className="h-3 w-3" aria-hidden="true" />
                Bars
              </button>
              <button
                type="button"
                data-testid="work-pins-mode-trend"
                aria-pressed={workChartView === 'trend'}
                onClick={() => setWorkChartView('trend')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                  workChartView === 'trend'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                Trend
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-end overflow-x-auto py-3">
            {approvedRing.eligibleCount === 0 ? (
              <div className="flex flex-1 items-center justify-center text-[13px] text-[#4F5C67]">
                No eligible Pins for this filter.
              </div>
            ) : workChartView === 'bars' ? (
              <div
                data-testid="work-pins-bars-plot"
                className="flex h-[186px] min-w-full items-end gap-3 px-1"
              >
                {pinBars.map((bar) => {
                  const primaryVal =
                    selectedDepartment === 'All'
                      ? valueMode === 'percent'
                        ? bar.approvedPercent
                        : bar.approved
                      : bar.key === 'approved'
                        ? valueMode === 'percent'
                          ? bar.approvedPercent
                          : bar.approved
                        : valueMode === 'percent'
                          ? bar.outstandingPercent
                          : bar.outstanding;

                  const secondaryVal =
                    selectedDepartment === 'All'
                      ? valueMode === 'percent'
                        ? bar.outstandingPercent
                        : bar.outstanding
                      : 0;

                  const totalBarVal = primaryVal + secondaryVal;
                  const approvedH = Math.round((primaryVal / maxBarValue) * 126);
                  const outstandingH = Math.round((secondaryVal / maxBarValue) * 126);

                  return (
                    <div
                      key={bar.key}
                      className="flex min-w-[54px] flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="text-[11px] font-semibold text-[#1B2A4A] tabular-nums">
                        {valueMode === 'percent'
                          ? `${selectedDepartment === 'All' ? bar.approvedPercent : primaryVal}%`
                          : totalBarVal}
                      </span>
                      <div className="flex h-[128px] w-full max-w-[38px] flex-col justify-end overflow-hidden rounded-t-md bg-[#E6E8EB]/60">
                        {secondaryVal > 0 && (
                          <div
                            style={{
                              height: `${Math.max(secondaryVal > 0 ? 4 : 0, outstandingH)}px`,
                              backgroundColor: '#D4652F',
                            }}
                            title={`${bar.label} outstanding: ${bar.outstanding}`}
                          />
                        )}
                        {primaryVal > 0 && (
                          <div
                            style={{
                              height: `${Math.max(primaryVal > 0 ? 4 : 0, approvedH)}px`,
                              backgroundColor:
                                selectedDepartment === 'All' ? '#15803D' : bar.colorHex,
                            }}
                            title={`${bar.label}: ${
                              selectedDepartment === 'All' ? `${bar.approved} approved` : primaryVal
                            }`}
                          />
                        )}
                      </div>
                      <span
                        className="w-full truncate text-center text-[11px] font-medium text-[#4F5C67]"
                        title={bar.label}
                      >
                        {bar.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div data-testid="work-pins-trend-plot" className="flex h-[186px] flex-col justify-end">
                <svg
                  viewBox="0 0 260 144"
                  className="h-[154px] w-full overflow-visible"
                  role="img"
                  aria-label="Work Pins approval trend"
                >
                  {[0, 0.5, 1].map((frac) => {
                    const y = 12 + (1 - frac) * 104;
                    return (
                      <line
                        key={frac}
                        x1="12"
                        y1={y}
                        x2="248"
                        y2={y}
                        stroke="#E6E8EB"
                        strokeDasharray="3 3"
                      />
                    );
                  })}
                  {trendPolylinePoints && (
                    <polyline
                      fill="none"
                      stroke="#15803D"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={trendPolylinePoints}
                    />
                  )}
                  {pinTrend.map((pt, idx) => {
                    const padX = 16;
                    const usableW = 260 - padX * 2;
                    const x =
                      pinTrend.length === 1
                        ? padX + usableW / 2
                        : padX + (idx / (pinTrend.length - 1)) * usableW;
                    const val = valueMode === 'percent' ? pt.approvedPercent : pt.approvedCount;
                    const y = 12 + 104 - (val / trendMaxY) * 104;
                    return (
                      <g key={pt.bucketKey}>
                        <circle cx={x} cy={y} r="3.5" fill="#15803D" stroke="#FFFFFF" strokeWidth="1.5">
                          <title>
                            {pt.label}: {pt.approvedCount}/{pt.eligibleCount} approved ({pt.approvedPercent}%)
                          </title>
                        </circle>
                        <text
                          x={x}
                          y="138"
                          textAnchor="middle"
                          fontSize="9"
                          fill="#4F5C67"
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#E6E8EB] pt-3 text-[12px]">
            <div className="flex items-center gap-3 text-[#4F5C67]">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#15803D]" aria-hidden="true" />
                Approved
              </span>
              {workChartView === 'bars' && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#D4652F]" aria-hidden="true" />
                  Outstanding
                </span>
              )}
            </div>
            {pinListHref && (
              <Link
                to={pinListHref}
                className="font-semibold text-[#A64011] hover:underline"
              >
                Open PIN
              </Link>
            )}
          </div>
        </article>

        {/* Card 3: Daily Attendance Distribution Bars */}
        <article
          data-testid="dashboard-daily-attendance"
          className="flex h-[360px] flex-col justify-between overflow-hidden rounded-xl border border-[#E6E8EB] bg-[#FAF9F6] p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#1B2A4A]">
                <CalendarCheck2 className="h-4 w-4 text-[#D4652F]" aria-hidden="true" />
                <span>Daily Attendance</span>
              </h3>
              <p className="text-[12px] text-[#4F5C67] tabular-nums">
                {attendanceDist.selectedDateLabel} · Distribution (Owner exempt)
              </p>
            </div>
            <Link
              to={attendanceHref}
              className="shrink-0 text-[12px] font-semibold text-[#A64011] hover:underline"
            >
              Open Attendance
            </Link>
          </div>

          <div className="flex flex-1 flex-col justify-end py-3">
            {attendanceDist.totalScheduled === 0 ? (
              <div
                data-testid="dashboard-attendance-empty"
                className="flex flex-1 flex-col items-center justify-center text-center text-[13px] text-[#4F5C67]"
              >
                <p>No scheduled attendance records for {attendanceDist.selectedDateLabel}.</p>
                <p className="mt-1 text-[12px]">Try switching Date or Day / Month granularity.</p>
              </div>
            ) : (
              <div
                data-testid="attendance-distribution-bars"
                className="flex h-[186px] items-end gap-4 px-2"
              >
                {attendanceSeries.map((s) => {
                  const val = valueMode === 'percent' ? s.pct : s.count;
                  const barH = Math.round((val / maxAttendanceBar) * 124);
                  return (
                    <div
                      key={s.key}
                      data-testid={`attendance-bar-${s.key}`}
                      className="flex flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="text-[11px] font-semibold text-[#1B2A4A] tabular-nums">
                        {valueMode === 'percent' ? `${s.pct}%` : s.count}
                      </span>
                      <div className="flex h-[126px] w-full max-w-[40px] flex-col justify-end overflow-hidden rounded-t-md bg-[#E6E8EB]/60">
                        {val > 0 && (
                          <div
                            style={{
                              height: `${Math.max(4, barH)}px`,
                              backgroundColor: s.color,
                            }}
                            title={`${s.label}: ${s.count} (${s.pct}%)`}
                          />
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-[#4F5C67]">{s.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-[#E6E8EB] pt-2.5 text-[12px] text-[#4F5C67] space-y-1">
            <div className="flex items-center justify-between gap-2 tabular-nums">
              <span>Presence rate (Present / (Present + Alfa))</span>
              <strong
                data-testid="dashboard-presence-rate"
                className="text-[#1B2A4A]"
              >
                {attendanceDist.presenceRatePercent !== null
                  ? `${attendanceDist.presenceRatePercent}%`
                  : 'Pending'}
              </strong>
            </div>
            {attendanceDist.isPartialCoverage ? (
              <div
                data-testid="attendance-partial-coverage-note"
                className="truncate rounded bg-[#FFF8EB] px-2 py-0.5 text-[11px] font-medium text-amber-900"
              >
                Partial coverage ({attendanceDist.pending} pending) — excluded from complete-day ranking
              </div>
            ) : (
              <div className="truncate text-[11px] text-[#4F5C67] tabular-nums">
                {attendanceDist.rateDenominator} finalized · {attendanceDist.izin} excused Izin
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
};
