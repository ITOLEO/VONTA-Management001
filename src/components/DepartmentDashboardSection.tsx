import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ChevronLeft, ChevronRight, Filter, TrendingUp } from 'lucide-react';
import type { Department, SpatialPin } from '../domain/types';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import { seedDefaultDepartments } from '../domain/departmentCatalog';
import type { DepartmentAttendanceDayMetric } from '../domain/attendanceEngine';
import {
  buildAxisTicks,
  computeApprovedRingMetric,
  computeAttendanceBarChartModel,
  computeAttendanceDistribution,
  computeWorkPinBarChartModel,
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

const PLOT_BAR_MAX_PX = 128;

function useHorizontalScrollControls(ref: React.RefObject<HTMLDivElement | null>, depKey: string) {
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const overflow = el.scrollWidth - el.clientWidth;
    setCanLeft(overflow > 2 && el.scrollLeft > 2);
    setCanRight(overflow > 2 && el.scrollLeft < overflow - 2);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const onScroll = () => measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [ref, measure, depKey]);

  const scrollByDir = useCallback(
    (dir: -1 | 1) => {
      const el = ref.current;
      if (!el) return;
      const step = Math.max(180, Math.round(el.clientWidth * 0.65));
      el.scrollBy({ left: dir * step, behavior: 'smooth' });
    },
    [ref]
  );

  return { canLeft, canRight, scrollByDir };
}

/**
 * VONTA 05 — Department Operations & Attendance Dashboard:
 * - Equal 360px outer height cards with identical Header (44px), Plot Area (224px), and Footer (60px)
 *   so switching Day / Month / Year, Department, or Count / % never shifts card or plot bounds.
 * - Card 1: Approved Pins ring independent of attendance (no decorative check icon in corner).
 * - Card 2: Work Pins approved-only bars with Y from 0 to total eligible Pins (All) or department total
 *   (single dept), or 0–100% in % mode, with units, light gridlines, exact counts, empty state & Trend view.
 * - Card 3: Attendance bars (Present, Approved leave, Absent, Pending check-in), zero-height bars at 0,
 *   scheduled attendances across shifts labeling, Present / (Present + Absent) presence rate with "—" when
 *   undefined, and Partial coverage banner removed while preserving underlying coverage rules.
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

  const cardsRowRef = useRef<HTMLDivElement | null>(null);
  const workBarsScrollRef = useRef<HTMLDivElement | null>(null);

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

  const workPinChart = useMemo(
    () =>
      computeWorkPinBarChartModel({
        eligible: eligiblePins,
        departments: catalogDepartments,
        departmentFilter: selectedDepartment,
        valueMode,
      }),
    [eligiblePins, catalogDepartments, selectedDepartment, valueMode]
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

  const attendanceChart = useMemo(
    () =>
      computeAttendanceBarChartModel({
        distribution: attendanceDist,
        granularity,
        valueMode,
      }),
    [attendanceDist, granularity, valueMode]
  );

  const cardsRowScroll = useHorizontalScrollControls(cardsRowRef, `${granularity}-${selectedDepartment}`);
  const workBarsScroll = useHorizontalScrollControls(
    workBarsScrollRef,
    `${workPinChart.bars.length}-${selectedDepartment}-${workChartView}`
  );

  // Donut geometry
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const ringPct = approvedRing.approvedPercent ?? 0;
  const dashOffset = circumference * (1 - ringPct / 100);

  // Trend SVG geometry (approved counts vs eligible total or 0..100%)
  const trendMaxY = useMemo(() => {
    if (valueMode === 'percent') return 100;
    return Math.max(1, workPinChart.totalEligible, ...pinTrend.map((pt) => pt.eligibleCount));
  }, [pinTrend, valueMode, workPinChart.totalEligible]);

  const trendTicks = useMemo(
    () => buildAxisTicks(trendMaxY, valueMode === 'percent'),
    [trendMaxY, valueMode]
  );

  const trendPolylinePoints = useMemo(() => {
    if (pinTrend.length === 0) return '';
    const leftX = 34;
    const rightX = 252;
    const topY = 14;
    const bottomY = 122;
    const usableW = rightX - leftX;
    const usableH = bottomY - topY;
    return pinTrend
      .map((pt, idx) => {
        const x =
          pinTrend.length === 1
            ? leftX + usableW / 2
            : leftX + (idx / (pinTrend.length - 1)) * usableW;
        const val = valueMode === 'percent' ? pt.approvedPercent : pt.approvedCount;
        const y = bottomY - (val / trendMaxY) * usableH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [pinTrend, valueMode, trendMaxY]);

  const periodLabel =
    granularity === 'day'
      ? `As of ${selectedDate}`
      : granularity === 'month'
        ? selectedDate.slice(0, 7)
        : selectedDate.slice(0, 4);

  return (
    <section
      data-testid="overview-department-dashboard"
      aria-labelledby="department-ops-heading"
      className="space-y-5 rounded-xl border border-[#D9DEE2] bg-white p-5 lg:p-6"
    >
      {/* Shared Filter & Controls Header */}
      <div className="flex flex-col gap-3 border-b border-[#E6E8EB] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="department-ops-heading"
              className="vonta-section-title text-[#1B2A4A]"
            >
              Department Operations &amp; Attendance
            </h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
              Basis: Eligible Work Pins (QC-approved) &amp; scheduled worker attendance (Owner
              exempt · <span className="tabular-nums">{projectTimezone}</span>).
            </p>
          </div>

          {/* Date + Granularity + Count/Percent controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Date granularity"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              {(
                [
                  { id: 'day', label: 'Day' },
                  { id: 'month', label: 'Month' },
                  { id: 'year', label: 'Year' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`ops-granularity-${id}`}
                  aria-pressed={granularity === id}
                  onClick={() => setGranularity(id)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                    granularity === id
                      ? 'bg-[#1B2A4A] text-white'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  {label}
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
                aria-label="Show percentages"
                title="Show percentages"
                aria-pressed={valueMode === 'percent'}
                onClick={() => setValueMode('percent')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  valueMode === 'percent'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                <span aria-hidden="true">%</span>
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
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dept.defaultPinColor }}
                  aria-hidden="true"
                />
                {dept.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Three Equal-Height (360px) Plot Cards with Subdued Inset Carousel Arrows on Overflow */}
      <div className="relative">
        {cardsRowScroll.canLeft && (
          <button
            type="button"
            data-testid="ops-row-scroll-left"
            aria-label="Scroll operational charts left"
            onClick={() => cardsRowScroll.scrollByDir(-1)}
            className="absolute left-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9DEE2] bg-white/90 text-[#4F5C67] shadow-xs backdrop-blur-xs transition-colors hover:border-[#1B2A4A]/40 hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {cardsRowScroll.canRight && (
          <button
            type="button"
            data-testid="ops-row-scroll-right"
            aria-label="Scroll operational charts right"
            onClick={() => cardsRowScroll.scrollByDir(1)}
            className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9DEE2] bg-white/90 text-[#4F5C67] shadow-xs backdrop-blur-xs transition-colors hover:border-[#1B2A4A]/40 hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <div
          ref={cardsRowRef}
          data-testid="ops-cards-row"
          className="grid grid-cols-1 gap-5 md:flex md:snap-x md:snap-mandatory md:overflow-x-auto md:pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0"
        >
          {/* Card 1: Approved Pins Ring (Independent of Attendance; No Decorative Corner Check Icon) */}
          <article
            data-testid="dashboard-approved-donut"
            className="flex h-[360px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#E6E8EB] bg-[#FAF9F6] p-4 md:w-[340px] md:snap-start lg:w-auto"
          >
            {/* Common Header (44px) */}
            <div
              data-testid="ops-card-header-approved"
              className="flex h-[44px] shrink-0 items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <h3 className="truncate text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                  Approved Pins
                </h3>
                <p className="truncate text-[12px] leading-[16px] text-[#4F5C67] tabular-nums">
                  {selectedDepartment === 'All' ? 'All departments' : selectedDepartment} ·{' '}
                  {periodLabel}
                </p>
              </div>
            </div>

            {/* Common Plot Area (224px) */}
            <div
              data-testid="ops-card-plot-approved"
              className="flex h-[224px] shrink-0 flex-col items-center justify-center overflow-hidden py-2"
            >
              <div className="relative flex h-32 w-32 items-center justify-center">
                <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90" aria-hidden="true">
                  <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="#D9DEE2"
                    strokeWidth="11"
                  />
                  {approvedRing.eligibleCount > 0 && approvedRing.approvedCount > 0 && (
                    <circle
                      cx="60"
                      cy="60"
                      r={radius}
                      fill="none"
                      stroke="#15803D"
                      strokeWidth="11"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
                  {approvedRing.eligibleCount === 0 ? (
                    <span className="text-[14px] font-semibold text-[#4F5C67]">0 / 0</span>
                  ) : valueMode === 'percent' ? (
                    <>
                      <span className="text-[20px] font-bold text-[#1B2A4A]">
                        {Math.round(ringPct)}%
                      </span>
                      <span className="text-[11px] text-[#4F5C67]">Approved</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[20px] font-bold text-[#1B2A4A]">
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
                  className="mt-3 text-[13px] font-medium text-[#4F5C67]"
                >
                  No eligible Pins.
                </p>
              ) : (
                <p
                  data-testid="dashboard-donut-counts"
                  className="mt-3 text-center text-[12px] leading-[18px] text-[#4F5C67] tabular-nums"
                >
                  <strong className="text-[#1B2A4A]">{approvedRing.approvedCount}</strong> of{' '}
                  <strong className="text-[#1B2A4A]">{approvedRing.eligibleCount}</strong> eligible
                  Pins QC-approved ({Math.round(ringPct)}%)
                </p>
              )}
            </div>

            {/* Common Footer (60px) */}
            <div
              data-testid="ops-card-footer-approved"
              className="grid h-[60px] shrink-0 grid-cols-3 items-center gap-2 border-t border-[#E6E8EB] pt-2 text-center text-[12px] tabular-nums"
            >
              <div className="rounded-lg border border-[#E6E8EB] bg-white px-2 py-1">
                <div className="leading-[16px] font-bold text-[#1B2A4A]">
                  {approvedRing.pendingReviewCount}
                </div>
                <div className="truncate text-[11px] leading-[14px] text-[#4F5C67]">Pending QC</div>
              </div>
              <div className="rounded-lg border border-[#E6E8EB] bg-white px-2 py-1">
                <div className="leading-[16px] font-bold text-[#1B2A4A]">
                  {approvedRing.inProgressCount}
                </div>
                <div className="truncate text-[11px] leading-[14px] text-[#4F5C67]">In progress</div>
              </div>
              <div className="rounded-lg border border-[#E6E8EB] bg-white px-2 py-1">
                <div className="leading-[16px] font-bold text-[#1B2A4A]">
                  {approvedRing.openCount}
                </div>
                <div className="truncate text-[11px] leading-[14px] text-[#4F5C67]">Open</div>
              </div>
            </div>
          </article>

          {/* Card 2: Work Pins (Approved-Only Bars & Dated Trend) */}
          <article
            data-testid="dashboard-work-pins-chart"
            className="flex h-[360px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#E6E8EB] bg-[#FAF9F6] p-4 md:w-[340px] md:snap-start lg:w-auto"
          >
            {/* Common Header (44px) */}
            <div
              data-testid="ops-card-header-pins"
              className="flex h-[44px] shrink-0 items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <h3 className="truncate text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                  Work Pins
                </h3>
                <p className="truncate text-[12px] leading-[16px] text-[#4F5C67]">
                  {workChartView === 'bars'
                    ? selectedDepartment === 'All'
                      ? 'QC-approved Pins by department'
                      : `${selectedDepartment} · QC-approved Pins`
                    : 'QC-approved trajectory from status history'}
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

            {/* Common Plot Area (224px) */}
            <div
              data-testid="ops-card-plot-pins"
              className="relative flex h-[224px] shrink-0 flex-col justify-end overflow-hidden py-2"
            >
              {workPinChart.isEmpty ? (
                <div
                  data-testid="work-pins-empty"
                  className="flex h-full items-center justify-center text-center text-[13px] text-[#4F5C67]"
                >
                  No eligible Pins for this filter.
                </div>
              ) : workChartView === 'bars' ? (
                <div data-testid="work-pins-bars-plot" className="flex h-full flex-col">
                  {/* Unit label row */}
                  <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#4F5C67]">
                    <span data-testid="work-pins-y-unit">{workPinChart.unit}</span>
                    <span className="tabular-nums">
                      {valueMode === 'percent'
                        ? 'Approved / eligible (%)'
                        : `0–${workPinChart.yMax} eligible`}
                    </span>
                  </div>

                  {/* Chart Body: Y-axis + Gridlines + Scrollable Bars */}
                  <div className="relative flex min-h-0 flex-1 items-stretch">
                    {/* Y-Axis Ticks */}
                    <div
                      data-testid="work-pins-y-axis"
                      aria-hidden="true"
                      className="flex w-[30px] shrink-0 flex-col justify-between pb-[34px] pr-1.5 pt-[16px] text-right text-[10px] leading-none font-medium text-[#4F5C67] tabular-nums"
                    >
                      {[...workPinChart.yTicks].reverse().map((tick) => (
                        <span key={tick}>
                          {valueMode === 'percent' ? `${tick}%` : tick}
                        </span>
                      ))}
                    </div>

                    {/* Gridlines + Bars Scroll Track */}
                    <div className="relative min-w-0 flex-1">
                      {/* Light horizontal gridlines aligned with bar plot region */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-[16px] bottom-[34px] flex flex-col justify-between"
                      >
                        <div className="border-t border-dashed border-[#D9DEE2]" />
                        <div className="border-t border-dashed border-[#E6E8EB]" />
                        <div className="border-b border-[#CBD2D9]" />
                      </div>

                      {workBarsScroll.canLeft && (
                        <button
                          type="button"
                          aria-label="Scroll department bars left"
                          onClick={() => workBarsScroll.scrollByDir(-1)}
                          className="absolute left-0.5 top-[64px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[#D9DEE2] bg-white/90 text-[#4F5C67] shadow-xs hover:text-[#1B2A4A]"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {workBarsScroll.canRight && (
                        <button
                          type="button"
                          aria-label="Scroll department bars right"
                          onClick={() => workBarsScroll.scrollByDir(1)}
                          className="absolute right-0.5 top-[64px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[#D9DEE2] bg-white/90 text-[#4F5C67] shadow-xs hover:text-[#1B2A4A]"
                        >
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}

                      <div
                        ref={workBarsScrollRef}
                        className="relative flex h-full items-end gap-2 overflow-x-auto px-1"
                      >
                        {workPinChart.bars.map((bar) => {
                          const barPx =
                            bar.value > 0
                              ? Math.max(2, Math.round(bar.barRatio * PLOT_BAR_MAX_PX))
                              : 0;
                          const displayLabel =
                            valueMode === 'percent' ? `${bar.value}%` : String(bar.value);

                          return (
                            <div
                              key={bar.key}
                              data-testid={`work-pin-bar-${bar.label.toLowerCase().replace(/\s+/g, '-')}`}
                              className="flex h-full min-w-[52px] flex-1 flex-col items-center justify-end"
                            >
                              <div className="flex h-[144px] w-full flex-col items-center justify-end">
                                <span
                                  data-testid={`work-pin-bar-value-${bar.label.toLowerCase().replace(/\s+/g, '-')}`}
                                  className="mb-1 text-[11px] leading-[14px] font-semibold text-[#1B2A4A] tabular-nums"
                                >
                                  {displayLabel}
                                </span>
                                <div
                                  data-testid={`work-pin-bar-fill-${bar.label.toLowerCase().replace(/\s+/g, '-')}`}
                                  style={{
                                    height: `${barPx}px`,
                                    backgroundColor: '#15803D',
                                  }}
                                  className="w-full max-w-[36px] rounded-t-sm transition-[height] duration-150"
                                  title={`${bar.label}: ${bar.approved} of ${bar.total} QC-approved (${bar.approvedPercent}%)`}
                                />
                              </div>
                              <div className="flex h-[34px] w-full items-start justify-center pt-1.5">
                                <span
                                  className="w-full truncate text-center text-[11px] leading-[14px] font-medium text-[#4F5C67]"
                                  title={bar.label}
                                >
                                  {bar.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  data-testid="work-pins-trend-plot"
                  className="flex h-full flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold text-[#4F5C67]">
                    <span>{valueMode === 'percent' ? '%' : 'Pins'}</span>
                    <span className="tabular-nums">
                      {valueMode === 'percent' ? '0–100%' : `0–${trendMaxY} eligible`}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 264 148"
                    className="h-[184px] w-full overflow-visible"
                    role="img"
                    aria-label="Work Pins approval trend"
                  >
                    {[...trendTicks].reverse().map((tick, idx, arr) => {
                      const frac = arr.length === 1 ? 0 : idx / (arr.length - 1);
                      const y = 14 + frac * 108;
                      return (
                        <g key={tick}>
                          <line
                            x1="34"
                            y1={y}
                            x2="254"
                            y2={y}
                            stroke={idx === arr.length - 1 ? '#CBD2D9' : '#E6E8EB'}
                            strokeDasharray={idx === arr.length - 1 ? undefined : '3 3'}
                          />
                          <text
                            x="28"
                            y={y + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill="#4F5C67"
                          >
                            {valueMode === 'percent' ? `${tick}%` : tick}
                          </text>
                        </g>
                      );
                    })}
                    {trendPolylinePoints && (
                      <polyline
                        fill="none"
                        stroke="#15803D"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={trendPolylinePoints}
                      />
                    )}
                    {pinTrend.map((pt, idx) => {
                      const leftX = 34;
                      const rightX = 252;
                      const usableW = rightX - leftX;
                      const x =
                        pinTrend.length === 1
                          ? leftX + usableW / 2
                          : leftX + (idx / (pinTrend.length - 1)) * usableW;
                      const val = valueMode === 'percent' ? pt.approvedPercent : pt.approvedCount;
                      const y = 122 - (val / trendMaxY) * 108;
                      return (
                        <g key={pt.bucketKey}>
                          <circle
                            cx={x}
                            cy={y}
                            r="3.5"
                            fill="#15803D"
                            stroke="#FFFFFF"
                            strokeWidth="1.5"
                          >
                            <title>
                              {pt.label}: {pt.approvedCount}/{pt.eligibleCount} approved (
                              {pt.approvedPercent}%)
                            </title>
                          </circle>
                          <text
                            x={x}
                            y="140"
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

            {/* Common Footer (60px) */}
            <div
              data-testid="ops-card-footer-pins"
              className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-t border-[#E6E8EB] pt-2 text-[12px]"
            >
              <div className="min-w-0 space-y-0.5 text-[#4F5C67]">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#1B2A4A]">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#15803D]" aria-hidden="true" />
                    Approved (QC)
                  </span>
                </div>
                <div className="truncate text-[11px] tabular-nums">
                  {workPinChart.totalEligible} eligible Pin
                  {workPinChart.totalEligible === 1 ? '' : 's'} · {approvedRing.approvedCount}{' '}
                  approved
                </div>
              </div>
              {pinListHref && (
                <Link
                  to={pinListHref}
                  className="shrink-0 font-semibold text-[#A64011] hover:underline"
                >
                  Open PIN
                </Link>
              )}
            </div>
          </article>

          {/* Card 3: Attendance Distribution Bars */}
          <article
            data-testid="dashboard-daily-attendance"
            className="flex h-[360px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#E6E8EB] bg-[#FAF9F6] p-4 md:w-[340px] md:snap-start lg:w-auto"
          >
            {/* Common Header (44px) */}
            <div
              data-testid="ops-card-header-attendance"
              className="flex h-[44px] shrink-0 items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <h3 className="truncate text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                  {granularity === 'day' ? 'Daily Attendance' : 'Attendance'}
                </h3>
                <p className="truncate text-[12px] leading-[16px] text-[#4F5C67] tabular-nums">
                  {attendanceDist.selectedDateLabel} · Scheduled only · Owner exempt
                </p>
              </div>
              <Link
                to={attendanceHref}
                className="shrink-0 text-[12px] leading-[20px] font-semibold text-[#A64011] hover:underline"
              >
                Open Attendance
              </Link>
            </div>

            {/* Common Plot Area (224px) */}
            <div
              data-testid="ops-card-plot-attendance"
              className="flex h-[224px] shrink-0 flex-col justify-end overflow-hidden py-2"
            >
              {attendanceChart.isEmpty ? (
                <div
                  data-testid="dashboard-attendance-empty"
                  className="flex h-full flex-col items-center justify-center text-center text-[13px] text-[#4F5C67]"
                >
                  <p>No scheduled attendance records for {attendanceDist.selectedDateLabel}.</p>
                  <p className="mt-1 text-[12px]">Try switching Date or Day / Month granularity.</p>
                </div>
              ) : (
                <div data-testid="attendance-distribution-bars" className="flex h-full flex-col">
                  {/* Unit label row */}
                  <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#4F5C67]">
                    <span data-testid="attendance-y-unit">{attendanceChart.unit}</span>
                    <span className="tabular-nums">
                      {valueMode === 'percent'
                        ? 'Share of scheduled attendances'
                        : `0–${attendanceChart.yMax} scheduled`}
                    </span>
                  </div>

                  {/* Chart Body: Y-axis + Gridlines + 4 Status Bars */}
                  <div className="relative flex min-h-0 flex-1 items-stretch">
                    {/* Y-Axis Ticks */}
                    <div
                      data-testid="attendance-y-axis"
                      aria-hidden="true"
                      className="flex w-[30px] shrink-0 flex-col justify-between pb-[34px] pr-1.5 pt-[16px] text-right text-[10px] leading-none font-medium text-[#4F5C67] tabular-nums"
                    >
                      {[...attendanceChart.yTicks].reverse().map((tick) => (
                        <span key={tick}>
                          {valueMode === 'percent' ? `${tick}%` : tick}
                        </span>
                      ))}
                    </div>

                    {/* Gridlines + 4 Status Columns */}
                    <div className="relative min-w-0 flex-1">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-[16px] bottom-[34px] flex flex-col justify-between"
                      >
                        <div className="border-t border-dashed border-[#D9DEE2]" />
                        <div className="border-t border-dashed border-[#E6E8EB]" />
                        <div className="border-b border-[#CBD2D9]" />
                      </div>

                      <div className="relative grid h-full grid-cols-4 gap-1.5 px-1">
                        {attendanceChart.bars.map((s) => {
                          const barPx =
                            s.value > 0
                              ? Math.max(2, Math.round(s.barRatio * PLOT_BAR_MAX_PX))
                              : 0;
                          return (
                            <div
                              key={s.key}
                              data-testid={`attendance-bar-${s.key}`}
                              className="flex h-full min-w-0 flex-col items-center justify-end"
                            >
                              <div className="flex h-[144px] w-full flex-col items-center justify-end">
                                <span
                                  data-testid={`attendance-bar-value-${s.key}`}
                                  className="mb-1 text-[11px] leading-[14px] font-semibold text-[#1B2A4A] tabular-nums"
                                >
                                  {valueMode === 'percent' ? `${s.percent}%` : s.count}
                                </span>
                                <div
                                  data-testid={`attendance-bar-fill-${s.key}`}
                                  style={{
                                    height: `${barPx}px`,
                                    backgroundColor: s.colorHex,
                                  }}
                                  className="w-full max-w-[34px] rounded-t-sm transition-[height] duration-150"
                                  title={`${s.label}: ${s.count} (${s.percent}%)`}
                                />
                              </div>
                              <div className="flex h-[34px] w-full items-start justify-center pt-1">
                                <span className="line-clamp-2 text-center text-[10px] leading-[13px] font-medium text-[#4F5C67]">
                                  {s.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Common Footer (60px) — No Partial Coverage Banner */}
            <div
              data-testid="ops-card-footer-attendance"
              className="flex h-[60px] shrink-0 flex-col justify-center space-y-1 border-t border-[#E6E8EB] pt-2 text-[12px] text-[#4F5C67]"
            >
              <div className="flex items-center justify-between gap-2 tabular-nums">
                <span className="truncate">Presence rate (Present / (Present + Absent))</span>
                <strong
                  data-testid="dashboard-presence-rate"
                  className="shrink-0 text-[#1B2A4A]"
                >
                  {attendanceChart.presenceRateLabel}
                </strong>
              </div>
              <div
                data-testid="attendance-scheduled-total"
                className="truncate text-[11px] text-[#4F5C67] tabular-nums"
              >
                {attendanceChart.totalLabel}
                {attendanceDist.izin > 0 ? ` · ${attendanceDist.izin} approved leave` : ''}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};
