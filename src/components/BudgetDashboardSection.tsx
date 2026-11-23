import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LineChart,
  Plus,
  Receipt,
  X,
} from 'lucide-react';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import {
  computeDepartmentBudgetSummary,
  formatCompactCurrency,
  formatCurrencyAmount,
  type BudgetPeriodMode,
  type DepartmentBudgetComputed,
  type ProjectBudgetLedger,
} from '../domain/budgetLedger';

export interface BudgetDashboardSectionProps {
  departments: ProjectDepartment[];
  ledger: ProjectBudgetLedger;
  accountingHref: string;
  canAddDepartment: boolean;
  onAddDepartment?: (input: { name: string; pinColorHex?: string }) => {
    ok: boolean;
    message?: string;
    error?: string;
  };
  defaultSelectedDate?: string;
  projectTimezone?: string;
}

const DEFAULT_NEW_DEPT_COLORS = ['#0B63CE', '#D4652F', '#15803D', '#6D28D9', '#B45309', '#0F766E'];

/**
 * Stage C Overview Budget Architecture (replaces former Recent Activity):
 * 1. Monthly Department Budget Allocation Carousel (NO department filter):
 *    - 3 visible equal-sized ring cards on wide screens, Prev/Next buttons + touch scroll.
 *    - Red = Used, Green = Unused, visually clamped 0–100%, exact remaining / negative Overrun in center.
 *    - Distinguishes "Not allocated" from explicit Rp 0.
 *    - Shows "Available to approve" when open commitments exist.
 *    - Click any card to open a dated transaction drawer ("On what date did this department spend the money?").
 *    - Contractor "+ Add department" button adds to shared catalog (immediately appears as Not allocated).
 * 2. Full-width Budget Usage Chart directly below:
 *    - Defaults to Line chart; toggle to Bar chart preserving exact container height (340px).
 *    - Independent period + department filter (narrowing chart never hides allocation cards above).
 *    - X = departments in catalog order; separate Allocated and Used series; Amount / Percent toggle.
 */
export const BudgetDashboardSection: React.FC<BudgetDashboardSectionProps> = ({
  departments,
  ledger,
  accountingHref,
  canAddDepartment,
  onAddDepartment,
  defaultSelectedDate = '2026-11-20',
  projectTimezone = 'Asia/Makassar',
}) => {
  // Carousel controls (NO department filter!)
  const [allocPeriod, setAllocPeriod] = useState<BudgetPeriodMode>('month');
  const [allocDate, setAllocDate] = useState<string>(defaultSelectedDate);
  const [allocMode, setAllocMode] = useState<'amount' | 'percent'>('amount');
  const carouselRef = useRef<HTMLDivElement | null>(null);

  // Add department modal state
  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState(DEFAULT_NEW_DEPT_COLORS[0]);
  const [addDeptError, setAddDeptError] = useState<string | null>(null);

  // Dated transaction drawer
  const [drawerDeptId, setDrawerDeptId] = useState<string | null>(null);

  // Usage chart independent controls
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [chartPeriod, setChartPeriod] = useState<BudgetPeriodMode>('month');
  const [chartDate, setChartDate] = useState<string>(defaultSelectedDate);
  const [chartMode, setChartMode] = useState<'amount' | 'percent'>('amount');
  const [chartDeptFilter, setChartDeptFilter] = useState<string>('all');
  const [hoveredDeptId, setHoveredDeptId] = useState<string | null>(null);

  const carouselSummaries = useMemo(
    () =>
      departments.map((dept) =>
        computeDepartmentBudgetSummary({
          ledger,
          department: dept,
          periodMode: allocPeriod,
          selectedDate: allocDate,
        })
      ),
    [departments, ledger, allocPeriod, allocDate]
  );

  const chartSummaries = useMemo(() => {
    const all = departments.map((dept) =>
      computeDepartmentBudgetSummary({
        ledger,
        department: dept,
        periodMode: chartPeriod,
        selectedDate: chartDate,
      })
    );
    if (chartDeptFilter === 'all') return all;
    return all.filter((s) => s.departmentId === chartDeptFilter);
  }, [departments, ledger, chartPeriod, chartDate, chartDeptFilter]);

  const drawerSummary: DepartmentBudgetComputed | null = useMemo(
    () => carouselSummaries.find((s) => s.departmentId === drawerDeptId) ?? null,
    [carouselSummaries, drawerDeptId]
  );

  const scrollCarousel = (direction: -1 | 1) => {
    const el = carouselRef.current;
    if (!el) return;
    const step = Math.max(280, Math.floor(el.clientWidth * 0.85));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  const handleAddDepartmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddDepartment) return;
    const res = onAddDepartment({ name: newDeptName.trim(), pinColorHex: newDeptColor });
    if (!res.ok) {
      setAddDeptError(res.error ?? res.message ?? 'Could not add department.');
      return;
    }
    setAddDeptError(null);
    setNewDeptName('');
    setAddDeptOpen(false);
    // Smoothly scroll carousel to the end so the newly created department card is visible
    setTimeout(() => {
      carouselRef.current?.scrollTo({
        left: carouselRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }, 60);
  };

  // Usage Chart SVG geometry
  const chartMaxY = useMemo(() => {
    if (chartMode === 'percent') {
      const maxPct = Math.max(
        100,
        ...chartSummaries.map((s) => (s.actualUsedPercent !== null ? Math.ceil(s.actualUsedPercent) : 0))
      );
      return maxPct;
    }
    const maxAmt = Math.max(
      1_000_000,
      ...chartSummaries.map((s) => Math.max(s.allocatedAmount ?? 0, s.postedUsedAmount))
    );
    return maxAmt;
  }, [chartSummaries, chartMode]);

  const svgWidth = Math.max(640, chartSummaries.length * 140);
  const svgHeight = 230;
  const padL = 68;
  const padR = 28;
  const padT = 18;
  const padB = 36;
  const plotW = svgWidth - padL - padR;
  const plotH = svgHeight - padT - padB;

  const getChartX = (index: number) => {
    if (chartSummaries.length <= 1) return padL + plotW / 2;
    return padL + (index / (chartSummaries.length - 1)) * plotW;
  };
  const getChartY = (value: number) => {
    const clamped = Math.max(0, Math.min(chartMaxY, value));
    return padT + plotH - (clamped / chartMaxY) * plotH;
  };

  const activeHoverSummary = useMemo(
    () => chartSummaries.find((s) => s.departmentId === hoveredDeptId) ?? null,
    [chartSummaries, hoveredDeptId]
  );

  return (
    <div data-testid="overview-budget-section" className="space-y-6">
      {/* Row 1: Monthly Department Budget Allocation Carousel (NO department filter) */}
      <section
        aria-labelledby="budget-allocation-heading"
        data-testid="budget-allocation-carousel-section"
        className="rounded-xl border border-[#D9DEE2] bg-white p-5 lg:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6E8EB] pb-4">
          <div>
            <h2
              id="budget-allocation-heading"
              className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
            >
              Department Budget Allocation
            </h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
              Posted monthly budgets across all {departments.length} project departments (
              {ledger.currency} · {projectTimezone}). Click any card to inspect dated spend.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Granularity */}
            <div
              role="group"
              aria-label="Budget allocation period"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              {(['day', 'month', 'year'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`budget-alloc-period-${p}`}
                  aria-pressed={allocPeriod === p}
                  onClick={() => setAllocPeriod(p)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize transition-colors ${
                    allocPeriod === p
                      ? 'bg-[#1B2A4A] text-white'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center">
              <span className="sr-only">Budget reference date</span>
              <input
                type="date"
                value={allocDate}
                onChange={(e) => setAllocDate(e.target.value || defaultSelectedDate)}
                data-testid="budget-alloc-date"
                className="h-8 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[12px] font-medium text-[#1B2A4A] tabular-nums"
              />
            </label>

            <div
              role="group"
              aria-label="Allocation ring display mode"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              <button
                type="button"
                aria-pressed={allocMode === 'amount'}
                onClick={() => setAllocMode('amount')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  allocMode === 'amount'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                Amount
              </button>
              <button
                type="button"
                aria-pressed={allocMode === 'percent'}
                onClick={() => setAllocMode('percent')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  allocMode === 'percent'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                Percent
              </button>
            </div>

            {/* Carousel Prev / Next */}
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous departments"
                data-testid="budget-carousel-prev"
                onClick={() => scrollCarousel(-1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next departments"
                data-testid="budget-carousel-next"
                onClick={() => scrollCarousel(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {canAddDepartment && onAddDepartment && (
              <button
                type="button"
                data-testid="budget-add-department-btn"
                onClick={() => {
                  setAddDeptError(null);
                  setAddDeptOpen(true);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3 text-[12px] font-semibold text-white hover:bg-[#1B2A4A]/90"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add department
              </button>
            )}
          </div>
        </div>

        {/* Inline Add Department Form */}
        {addDeptOpen && (
          <form
            onSubmit={handleAddDepartmentSubmit}
            data-testid="add-department-form"
            className="rounded-xl border border-[#1B2A4A]/20 bg-[#FAF9F6] p-4 flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[200px] flex-1">
              <label
                htmlFor="new-dept-name-input"
                className="block text-[12px] font-semibold text-[#1B2A4A]"
              >
                Department name
              </label>
              <input
                id="new-dept-name-input"
                type="text"
                required
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g., HVAC, Landscape, Structural Steel"
                className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] text-[#1B2A4A] focus:border-[#0B63CE] focus:outline-none"
              />
            </div>

            <div>
              <span className="block text-[12px] font-semibold text-[#1B2A4A]">
                Default Pin color
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                {DEFAULT_NEW_DEPT_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Select color ${hex}`}
                    onClick={() => setNewDeptColor(hex)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      newDeptColor === hex
                        ? 'scale-110 border-[#1B2A4A]'
                        : 'border-white shadow-sm'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                data-testid="confirm-add-department-btn"
                className="h-9 rounded-lg bg-[#A64011] px-4 text-[13px] font-semibold text-white hover:bg-[#8C350E]"
              >
                Create department
              </button>
              <button
                type="button"
                onClick={() => setAddDeptOpen(false)}
                className="h-9 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                Cancel
              </button>
            </div>

            {addDeptError && (
              <p className="w-full text-[12px] font-medium text-[#B42318]">{addDeptError}</p>
            )}
          </form>
        )}

        {/* 3-Visible Equal-Sized Ring Card Carousel */}
        <div
          ref={carouselRef}
          data-testid="budget-cards-carousel"
          className="grid grid-flow-col auto-cols-[100%] sm:auto-cols-[calc((100%-16px)/2)] lg:auto-cols-[calc((100%-32px)/3)] gap-4 overflow-x-auto pb-2 snap-x snap-mandatory"
        >
          {carouselSummaries.map((item) => {
            const deptMeta = departments.find((d) => d.id === item.departmentId);
            const r = 46;
            const c = 2 * Math.PI * r;
            const usedArc = (item.ringUsedPercent / 100) * c;
            const isUnallocated = item.allocationStatus === 'not_allocated';

            return (
              <button
                key={item.departmentId}
                type="button"
                data-testid={`budget-card-${deptMeta?.slug ?? item.departmentId}`}
                onClick={() => setDrawerDeptId(item.departmentId)}
                className="snap-start flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-[#FAF9F6] p-4 text-left transition-colors hover:border-[#A64011] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: deptMeta?.defaultPinColor ?? '#1B2A4A' }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-[15px] font-semibold text-[#1B2A4A]">
                        {item.departmentName}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#4F5C67]">{item.periodLabel}</p>
                  </div>
                  {item.isOverrun ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[#FEE4E2] px-2 py-0.5 text-[11px] font-semibold text-[#B42318]">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Overrun
                    </span>
                  ) : isUnallocated ? (
                    <span className="shrink-0 rounded bg-[#E6E8EB] px-2 py-0.5 text-[11px] font-medium text-[#4F5C67]">
                      Not allocated
                    </span>
                  ) : null}
                </div>

                {/* Red Used / Green Unused Ring */}
                <div className="my-3 flex items-center justify-center">
                  <div className="relative flex h-32 w-32 items-center justify-center">
                    <svg viewBox="0 0 116 116" className="h-32 w-32 -rotate-90" aria-hidden="true">
                      <circle
                        cx="58"
                        cy="58"
                        r={r}
                        fill="none"
                        stroke={isUnallocated ? '#D9DEE2' : '#15803D'}
                        strokeWidth="11"
                      />
                      {!isUnallocated && item.ringUsedPercent > 0 && (
                        <circle
                          cx="58"
                          cy="58"
                          r={r}
                          fill="none"
                          stroke="#B42318"
                          strokeWidth="11"
                          strokeDasharray={`${usedArc} ${c}`}
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center tabular-nums">
                      {isUnallocated ? (
                        <span className="text-[12px] font-semibold text-[#4F5C67]">
                          Not allocated
                        </span>
                      ) : allocMode === 'percent' ? (
                        <>
                          <span
                            className={`text-[18px] font-bold ${
                              item.isOverrun ? 'text-[#B42318]' : 'text-[#1B2A4A]'
                            }`}
                          >
                            {item.actualUsedPercent !== null ? `${item.actualUsedPercent}%` : '—'}
                          </span>
                          <span className="text-[10px] text-[#4F5C67]">Used</span>
                        </>
                      ) : (
                        <>
                          <span
                            className={`text-[14px] font-bold leading-tight ${
                              item.isOverrun ? 'text-[#B42318]' : 'text-[#1B2A4A]'
                            }`}
                          >
                            {item.remainingAmount !== null
                              ? formatCompactCurrency(item.remainingAmount, item.currency)
                              : '—'}
                          </span>
                          <span className="text-[10px] text-[#4F5C67]">
                            {item.isOverrun ? 'Overrun' : 'Remaining'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Metrics */}
                <dl className="w-full space-y-1 border-t border-[#E6E8EB] pt-2.5 text-[12px] tabular-nums">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#4F5C67]">Allocated</dt>
                    <dd className="font-semibold text-[#1B2A4A]">
                      {item.allocatedAmount !== null
                        ? formatCurrencyAmount(item.allocatedAmount, item.currency)
                        : 'Not allocated'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="inline-flex items-center gap-1 text-[#4F5C67]">
                      <span className="h-2 w-2 rounded-full bg-[#B42318]" aria-hidden="true" />
                      Posted used
                    </dt>
                    <dd className="font-semibold text-[#B42318]">
                      {formatCurrencyAmount(item.postedUsedAmount, item.currency)}
                    </dd>
                  </div>
                  {item.openCommitmentsAmount > 0 && item.availableToApproveAmount !== null && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#4F5C67]">
                      <dt>Available to approve</dt>
                      <dd className="font-semibold text-[#1B2A4A]">
                        {formatCurrencyAmount(item.availableToApproveAmount, item.currency)}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 text-[11px] font-medium text-[#A64011]">
                    <span>
                      {item.transactions.length} posted transaction
                      {item.transactions.length === 1 ? '' : 's'}
                    </span>
                    <span>Inspect dates →</span>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      </section>

      {/* Row 2: Full-Width Budget Usage Chart (Default Line + Bar toggle) */}
      <section
        aria-labelledby="budget-usage-chart-heading"
        data-testid="budget-usage-chart-section"
        className="rounded-xl border border-[#D9DEE2] bg-white p-5 lg:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6E8EB] pb-4">
          <div>
            <h2
              id="budget-usage-chart-heading"
              className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
            >
              Budget Usage Comparison
            </h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
              Allocated budget vs posted internal usage by department (independent chart filters).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Independent Department Filter (does NOT hide carousel cards above) */}
            <label className="inline-flex items-center">
              <span className="sr-only">Filter usage chart department</span>
              <select
                value={chartDeptFilter}
                onChange={(e) => setChartDeptFilter(e.target.value)}
                data-testid="usage-chart-dept-filter"
                className="h-8 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[12px] font-medium text-[#1B2A4A]"
              >
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Independent Period */}
            <div
              role="group"
              aria-label="Usage chart period"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              {(['day', 'month', 'year'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={chartPeriod === p}
                  onClick={() => setChartPeriod(p)}
                  className={`rounded-md px-2 py-1 text-[12px] font-semibold capitalize ${
                    chartPeriod === p
                      ? 'bg-[#1B2A4A] text-white'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <input
              type="date"
              aria-label="Usage chart date"
              value={chartDate}
              onChange={(e) => setChartDate(e.target.value || defaultSelectedDate)}
              className="h-8 rounded-lg border border-[#D9DEE2] bg-white px-2 text-[12px] text-[#1B2A4A] tabular-nums"
            />

            {/* Amount / Percent */}
            <div
              role="group"
              aria-label="Usage chart value mode"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              <button
                type="button"
                aria-pressed={chartMode === 'amount'}
                onClick={() => setChartMode('amount')}
                className={`rounded-md px-2 py-1 text-[12px] font-semibold ${
                  chartMode === 'amount'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                Amount
              </button>
              <button
                type="button"
                aria-pressed={chartMode === 'percent'}
                onClick={() => setChartMode('percent')}
                className={`rounded-md px-2 py-1 text-[12px] font-semibold ${
                  chartMode === 'percent'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                Percent
              </button>
            </div>

            {/* Line (default) / Bar toggle */}
            <div
              role="group"
              aria-label="Usage chart type"
              className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-0.5"
            >
              <button
                type="button"
                data-testid="usage-chart-type-line"
                aria-pressed={chartType === 'line'}
                onClick={() => setChartType('line')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold ${
                  chartType === 'line'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                <LineChart className="h-3.5 w-3.5" aria-hidden="true" />
                Line
              </button>
              <button
                type="button"
                data-testid="usage-chart-type-bar"
                aria-pressed={chartType === 'bar'}
                onClick={() => setChartType('bar')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold ${
                  chartType === 'bar'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                Bar
              </button>
            </div>
          </div>
        </div>

        {/* Fixed-height container preserving exact 340px height across Line & Bar */}
        <div
          data-testid="budget-usage-chart-plot"
          className="flex h-[340px] flex-col justify-between rounded-xl border border-[#E6E8EB] bg-[#FAF9F6] p-4"
        >
          {/* Legend + Hover Readout */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="flex items-center gap-4 text-[#4F5C67]">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#1B2A4A]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#1B2A4A]" aria-hidden="true" />
                Allocated
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-[#B42318]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#B42318]" aria-hidden="true" />
                Posted used
              </span>
            </div>

            <div className="min-h-[20px] text-[12px] text-[#4F5C67] tabular-nums">
              {activeHoverSummary ? (
                <span>
                  <strong className="text-[#1B2A4A]">{activeHoverSummary.departmentName}:</strong>{' '}
                  Allocated{' '}
                  {activeHoverSummary.allocatedAmount !== null
                    ? formatCurrencyAmount(activeHoverSummary.allocatedAmount, ledger.currency)
                    : 'Not allocated'}{' '}
                  · Used {formatCurrencyAmount(activeHoverSummary.postedUsedAmount, ledger.currency)}
                  {activeHoverSummary.remainingAmount !== null
                    ? ` · Remaining ${formatCurrencyAmount(activeHoverSummary.remainingAmount, ledger.currency)}`
                    : ''}
                </span>
              ) : (
                <span>Hover or focus a department point to inspect exact values.</span>
              )}
            </div>
          </div>

          {/* Chart SVG */}
          <div className="flex-1 overflow-x-auto flex items-center">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="h-[240px] w-full min-w-[520px]"
              role="img"
              aria-label={`Budget usage ${chartType} chart`}
            >
              {/* Horizontal Y gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const val = chartMaxY * frac;
                const y = getChartY(val);
                return (
                  <g key={frac}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={svgWidth - padR}
                      y2={y}
                      stroke="#E6E8EB"
                      strokeDasharray={frac === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#4F5C67"
                    >
                      {chartMode === 'percent'
                        ? `${Math.round(val)}%`
                        : formatCompactCurrency(val, ledger.currency)}
                    </text>
                  </g>
                );
              })}

              {chartType === 'line' ? (
                <>
                  {/* Allocated Line */}
                  {chartSummaries.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#1B2A4A"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      points={chartSummaries
                        .map((s, idx) => {
                          const v =
                            chartMode === 'percent'
                              ? s.allocatedAmount !== null
                                ? 100
                                : 0
                              : s.allocatedAmount ?? 0;
                          return `${getChartX(idx).toFixed(1)},${getChartY(v).toFixed(1)}`;
                        })
                        .join(' ')}
                    />
                  )}

                  {/* Posted Used Line */}
                  {chartSummaries.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#B42318"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      points={chartSummaries
                        .map((s, idx) => {
                          const v =
                            chartMode === 'percent'
                              ? s.actualUsedPercent ?? 0
                              : s.postedUsedAmount;
                          return `${getChartX(idx).toFixed(1)},${getChartY(v).toFixed(1)}`;
                        })
                        .join(' ')}
                    />
                  )}

                  {/* Interactive Points & Labels */}
                  {chartSummaries.map((s, idx) => {
                    const cx = getChartX(idx);
                    const allocVal =
                      chartMode === 'percent'
                        ? s.allocatedAmount !== null
                          ? 100
                          : 0
                        : s.allocatedAmount ?? 0;
                    const usedVal =
                      chartMode === 'percent' ? s.actualUsedPercent ?? 0 : s.postedUsedAmount;
                    return (
                      <g
                        key={s.departmentId}
                        tabIndex={0}
                        onMouseEnter={() => setHoveredDeptId(s.departmentId)}
                        onMouseLeave={() => setHoveredDeptId(null)}
                        onFocus={() => setHoveredDeptId(s.departmentId)}
                        className="cursor-pointer outline-none"
                      >
                        <circle
                          cx={cx}
                          cy={getChartY(allocVal)}
                          r="4.5"
                          fill="#1B2A4A"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx={cx}
                          cy={getChartY(usedVal)}
                          r="4.5"
                          fill="#B42318"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <text
                          x={cx}
                          y={svgHeight - 10}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill="#1B2A4A"
                        >
                          {s.departmentName}
                        </text>
                      </g>
                    );
                  })}
                </>
              ) : (
                /* Bar Chart Mode */
                chartSummaries.map((s, idx) => {
                  const groupW = plotW / Math.max(1, chartSummaries.length);
                  const centerX = padL + groupW * idx + groupW / 2;
                  const barW = Math.min(28, Math.max(14, groupW * 0.25));
                  const allocVal =
                    chartMode === 'percent'
                      ? s.allocatedAmount !== null
                        ? 100
                        : 0
                      : s.allocatedAmount ?? 0;
                  const usedVal =
                    chartMode === 'percent' ? s.actualUsedPercent ?? 0 : s.postedUsedAmount;
                  const allocY = getChartY(allocVal);
                  const usedY = getChartY(usedVal);
                  const baseY = padT + plotH;

                  return (
                    <g
                      key={s.departmentId}
                      tabIndex={0}
                      onMouseEnter={() => setHoveredDeptId(s.departmentId)}
                      onMouseLeave={() => setHoveredDeptId(null)}
                      onFocus={() => setHoveredDeptId(s.departmentId)}
                      className="cursor-pointer outline-none"
                    >
                      <rect
                        x={centerX - barW - 3}
                        y={allocY}
                        width={barW}
                        height={Math.max(2, baseY - allocY)}
                        rx="3"
                        fill="#1B2A4A"
                      />
                      <rect
                        x={centerX + 3}
                        y={usedY}
                        width={barW}
                        height={Math.max(2, baseY - usedY)}
                        rx="3"
                        fill="#B42318"
                      />
                      <text
                        x={centerX}
                        y={svgHeight - 10}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill="#1B2A4A"
                      >
                        {s.departmentName}
                      </text>
                    </g>
                  );
                })
              )}
            </svg>
          </div>

          <div className="flex items-center justify-between border-t border-[#E6E8EB] pt-2 text-[12px] text-[#4F5C67]">
            <span>
              Catalog order ·{' '}
              {chartPeriod === 'day'
                ? `Through ${chartDate}`
                : chartPeriod === 'month'
                  ? chartDate.slice(0, 7)
                  : `YTD ${chartDate.slice(0, 4)}`}
            </span>
            <Link to={accountingHref} className="font-semibold text-[#A64011] hover:underline">
              Open Accounting ledger →
            </Link>
          </div>
        </div>
      </section>

      {/* Dated Transaction Drawer */}
      {drawerSummary && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-drawer-title"
          data-testid="budget-transaction-drawer"
          className="fixed inset-0 z-50 flex justify-end bg-[#1B2A4A]/40 backdrop-blur-[1px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerDeptId(null);
          }}
        >
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl border-l border-[#D9DEE2]">
            <div className="flex items-start justify-between gap-3 border-b border-[#D9DEE2] px-6 py-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#A64011]">
                  <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                  Dated Department Spend
                </div>
                <h3
                  id="budget-drawer-title"
                  className="mt-0.5 text-[20px] font-bold text-[#1B2A4A]"
                >
                  {drawerSummary.departmentName}
                </h3>
                <p className="text-[12px] text-[#4F5C67]">{drawerSummary.periodLabel}</p>
              </div>
              <button
                type="button"
                aria-label="Close transaction drawer"
                onClick={() => setDrawerDeptId(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#D9DEE2] text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 border-b border-[#E6E8EB] bg-[#FAF9F6] px-6 py-4 text-[12px] tabular-nums">
              <div>
                <div className="text-[#4F5C67]">Allocated</div>
                <div className="mt-0.5 font-bold text-[#1B2A4A]">
                  {drawerSummary.allocatedAmount !== null
                    ? formatCurrencyAmount(drawerSummary.allocatedAmount, drawerSummary.currency)
                    : 'Not allocated'}
                </div>
              </div>
              <div>
                <div className="text-[#4F5C67]">Posted used</div>
                <div className="mt-0.5 font-bold text-[#B42318]">
                  {formatCurrencyAmount(drawerSummary.postedUsedAmount, drawerSummary.currency)}
                </div>
              </div>
              <div>
                <div className="text-[#4F5C67]">Remaining</div>
                <div
                  className={`mt-0.5 font-bold ${
                    drawerSummary.isOverrun ? 'text-[#B42318]' : 'text-[#15803D]'
                  }`}
                >
                  {drawerSummary.remainingAmount !== null
                    ? formatCurrencyAmount(drawerSummary.remainingAmount, drawerSummary.currency)
                    : '—'}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerSummary.openCommitmentsAmount > 0 &&
                drawerSummary.availableToApproveAmount !== null && (
                  <div className="mb-4 rounded-lg border border-[#D9DEE2] bg-[#FFF8EB] px-3.5 py-2.5 text-[12px] text-[#1B2A4A] tabular-nums">
                    Open commitments:{' '}
                    <strong>
                      {formatCurrencyAmount(drawerSummary.openCommitmentsAmount, drawerSummary.currency)}
                    </strong>{' '}
                    · Available to approve:{' '}
                    <strong>
                      {formatCurrencyAmount(
                        drawerSummary.availableToApproveAmount,
                        drawerSummary.currency
                      )}
                    </strong>
                  </div>
                )}

              <h4 className="text-[13px] font-semibold text-[#1B2A4A]">
                Posted Transactions ({drawerSummary.transactions.length})
              </h4>

              {drawerSummary.transactions.length === 0 ? (
                <p className="mt-3 rounded-lg border border-[#E6E8EB] bg-[#FAF9F6] p-4 text-[13px] text-[#4F5C67]">
                  No posted charges recorded for {drawerSummary.departmentName} in{' '}
                  {drawerSummary.periodLabel}.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[#E6E8EB] rounded-lg border border-[#E6E8EB]">
                  {drawerSummary.transactions.map((tx) => (
                    <li key={tx.id} className="px-4 py-3 text-[13px]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#1B2A4A]">{tx.description}</div>
                          <div className="mt-0.5 text-[12px] text-[#4F5C67] tabular-nums">
                            {tx.postedDate} · {tx.sourceRecordId} · {tx.actorName}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 font-bold tabular-nums ${
                            tx.amount < 0 ? 'text-[#15803D]' : 'text-[#B42318]'
                          }`}
                        >
                          {formatCurrencyAmount(tx.amount, tx.currency)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#D9DEE2] px-6 py-3.5">
              <Link
                to={accountingHref}
                onClick={() => setDrawerDeptId(null)}
                className="text-[13px] font-semibold text-[#A64011] hover:underline"
              >
                Manage monthly budget in Accounting →
              </Link>
              <button
                type="button"
                onClick={() => setDrawerDeptId(null)}
                className="rounded-lg border border-[#D9DEE2] bg-white px-4 py-1.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
