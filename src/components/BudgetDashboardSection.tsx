import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Info,
  LineChart,
  Plus,
  Receipt,
  X,
} from 'lucide-react';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import {
  computeBudgetUsageSeriesPoint,
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
  /** Optional truthful notice shown when a live signed-in backend ledger integration is not yet connected */
  liveSourceNotice?: string;
}

function getRingBalanceTextClass(formatted: string): string {
  if (formatted.length <= 8) return 'text-[20px] leading-[24px]';
  if (formatted.length <= 11) return 'text-[17px] leading-[22px]';
  return 'text-[14px] leading-[18px]';
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
  liveSourceNotice,
}) => {
  // Carousel controls (NO department filter!)
  const [allocPeriod, setAllocPeriod] = useState<BudgetPeriodMode>('month');
  const [allocDate, setAllocDate] = useState<string>(defaultSelectedDate);
  const [allocMode, setAllocMode] = useState<'amount' | 'percent'>('amount');
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const prevBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [hasCarouselOverflow, setHasCarouselOverflow] = useState(false);

  // Add department modal state
  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState(DEFAULT_NEW_DEPT_COLORS[0]);
  const [addDeptError, setAddDeptError] = useState<string | null>(null);

  // Dated transaction drawer (modal right-side overlay with preserved modal focus behavior)
  const [drawerDeptId, setDrawerDeptId] = useState<string | null>(null);
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!drawerDeptId) return;
    drawerOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const raf = window.requestAnimationFrame(() => {
      drawerCloseBtnRef.current?.focus({ preventScroll: true });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawerDeptId(null);
        return;
      }
      if (e.key === 'Tab' && drawerPanelRef.current) {
        const focusable = Array.from(
          drawerPanelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      const opener = drawerOpenerRef.current;
      if (opener && opener.isConnected) {
        window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
      }
    };
  }, [drawerDeptId]);

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

  const measureCarousel = useCallback(() => {
    const el = carouselRef.current;
    if (!el) {
      setCanScrollPrev(false);
      setCanScrollNext(false);
      setHasCarouselOverflow(false);
      return;
    }
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const overflow = maxScroll > 4;
    setHasCarouselOverflow(overflow);
    setCanScrollPrev(overflow && el.scrollLeft > 4);
    setCanScrollNext(overflow && el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    measureCarousel();
    const onScroll = () => measureCarousel();
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measureCarousel());
      ro.observe(el);
    }
    window.addEventListener('resize', measureCarousel);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measureCarousel);
      ro?.disconnect();
    };
  }, [measureCarousel, departments.length]);

  const scrollCarousel = useCallback(
    (direction: -1 | 1) => {
      const el = carouselRef.current;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxScroll <= 4) return;
      const firstCard = el.firstElementChild as HTMLElement | null;
      const stride = firstCard
        ? firstCard.getBoundingClientRect().width + 16
        : Math.max(280, Math.floor(el.clientWidth * 0.85));
      const currentIdx = Math.round(el.scrollLeft / stride);
      const maxIdx = Math.max(1, Math.round(maxScroll / stride));
      const nextIdx = Math.max(0, Math.min(maxIdx, currentIdx + direction));
      const targetLeft =
        nextIdx >= maxIdx ? maxScroll : Math.max(0, Math.min(maxScroll, Math.round(nextIdx * stride)));
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({
        left: targetLeft,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });

      const willHitStart = targetLeft <= 4;
      const willHitEnd = targetLeft >= maxScroll - 4;
      setCanScrollPrev(!willHitStart);
      setCanScrollNext(!willHitEnd);
      const activeEl = document.activeElement;
      if (direction === 1 && willHitEnd && activeEl === nextBtnRef.current) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => prevBtnRef.current?.focus({ preventScroll: true }));
        });
      } else if (direction === -1 && willHitStart && activeEl === prevBtnRef.current) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => nextBtnRef.current?.focus({ preventScroll: true }));
        });
      }

      window.setTimeout(measureCarousel, 420);
    },
    [measureCarousel]
  );

  const handleCarouselKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    ) {
      return;
    }
    if (e.key === 'ArrowRight' && canScrollNext) {
      e.preventDefault();
      scrollCarousel(1);
    } else if (e.key === 'ArrowLeft' && canScrollPrev) {
      e.preventDefault();
      scrollCarousel(-1);
    }
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
    // Scroll carousel flush to the end so the newly created department card is fully visible
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = carouselRef.current;
        if (!el) return;
        const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
        el.scrollTo({
          left: maxScroll,
          behavior: 'auto',
        });
        measureCarousel();
      });
    });
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
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6E8EB] pb-4 xl:flex-nowrap xl:items-center">
          <div className="min-w-0 flex-1">
            <h2
              id="budget-allocation-heading"
              className="vonta-section-title text-[#1B2A4A]"
            >
              Department Budget Allocation
            </h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
              Posted budgets across {departments.length} departments ({ledger.currency} ·{' '}
              {projectTimezone}). Click any card for dated spend.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {/* Period Granularity (applies to all departments) */}
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
                aria-label="Show percentages"
                title="Show percentages"
                aria-pressed={allocMode === 'percent'}
                onClick={() => setAllocMode('percent')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  allocMode === 'percent'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                <span aria-hidden="true">%</span>
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
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#1B2A4A]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add department
              </button>
            )}
          </div>
        </div>

        {liveSourceNotice && (
          <div
            role="status"
            data-testid="budget-live-source-notice"
            className="flex items-start gap-2 rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] px-3.5 py-2.5 text-[12px] leading-[17px] text-[#4F5C67]"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F5C67]" aria-hidden="true" />
            <span>{liveSourceNotice}</span>
          </div>
        )}

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

        {/* 3-Visible Equal-Sized Ring Card Carousel with Large Quiet Inset Prev/Next Arrows */}
        <div
          role="region"
          aria-roledescription="carousel"
          aria-label="Department budget allocation cards"
          onKeyDown={handleCarouselKeyDown}
          className="relative"
        >
          {(hasCarouselOverflow || departments.length > 3) && (
            <button
              ref={prevBtnRef}
              type="button"
              aria-label="Previous departments"
              title="Previous departments"
              data-testid="budget-carousel-prev"
              disabled={!canScrollPrev}
              onClick={() => scrollCarousel(-1)}
              className="absolute left-2 top-[176px] z-10 inline-flex h-12 w-11 sm:w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9DEE2] bg-white/92 text-[#1B2A4A] shadow-sm backdrop-blur-[2px] transition-all hover:border-[#1B2A4A]/40 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] disabled:cursor-not-allowed disabled:border-[#E6E8EB] disabled:bg-[#F4F3EF]/85 disabled:text-[#94A3B8] disabled:opacity-35 disabled:shadow-none"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
          )}

          <div
            ref={carouselRef}
            data-testid="budget-cards-carousel"
            className="grid grid-flow-col auto-cols-[100%] sm:auto-cols-[calc((100%-16px)/2)] lg:auto-cols-[calc((100%-32px)/3)] gap-4 overflow-x-auto pb-2 snap-x snap-mandatory touch-pan-x"
          >
            {carouselSummaries.map((item) => {
              const deptMeta = departments.find((d) => d.id === item.departmentId);
              const r = 76;
              const c = 2 * Math.PI * r;
              const usedArc = (item.ringUsedPercent / 100) * c;
              const isUnallocated = item.allocationStatus === 'not_allocated';
              const isExplicitZeroNoSpend =
                item.allocationStatus === 'zero' && item.postedUsedAmount === 0;
              const compactRemaining =
                item.remainingAmount !== null
                  ? formatCompactCurrency(item.remainingAmount, item.currency)
                  : '—';
              const exactRemaining =
                item.remainingAmount !== null
                  ? formatCurrencyAmount(item.remainingAmount, item.currency)
                  : 'Not allocated';

              return (
                <button
                  key={item.departmentId}
                  type="button"
                  data-testid={`budget-card-${deptMeta?.slug ?? item.departmentId}`}
                  onClick={() => setDrawerDeptId(item.departmentId)}
                  className="snap-start flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-[#FAF9F6] p-5 text-left transition-colors hover:border-[#A64011] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
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
                      <p className="mt-0.5 text-[12px] text-[#4F5C67]">{item.periodLabel}</p>
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

                  {/* 1.5x Scaled Ring (192 CSS px on desktop): Red Posted Use / Green Unspent Balance */}
                  <div className="my-4 flex items-center justify-center">
                    <div
                      data-testid="budget-ring-wrapper"
                      className="relative flex h-[168px] w-[168px] sm:h-[180px] sm:w-[180px] lg:h-[192px] lg:w-[192px] shrink-0 items-center justify-center"
                    >
                      <svg
                        viewBox="0 0 192 192"
                        data-testid="budget-ring-svg"
                        className="h-full w-full -rotate-90"
                        aria-hidden="true"
                      >
                        <circle
                          cx="96"
                          cy="96"
                          r={r}
                          fill="none"
                          stroke={
                            isUnallocated
                              ? '#D9DEE2'
                              : isExplicitZeroNoSpend
                                ? '#CBD5E1'
                                : '#15803D'
                          }
                          strokeWidth="18"
                        />
                        {!isUnallocated && item.ringUsedPercent > 0 && (
                          <circle
                            cx="96"
                            cy="96"
                            r={r}
                            fill="none"
                            stroke="#B42318"
                            strokeWidth="18"
                            strokeDasharray={`${usedArc} ${c}`}
                          />
                        )}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center tabular-nums">
                        {isUnallocated ? (
                          <>
                            <span className="text-[13px] font-semibold text-[#4F5C67]">
                              Not allocated
                            </span>
                            <span className="mt-1 text-[11px] text-[#64748B]">
                              {formatCompactCurrency(item.postedUsedAmount, item.currency)} used
                            </span>
                          </>
                        ) : allocMode === 'percent' ? (
                          <>
                            <span
                              className={`text-[22px] font-bold leading-tight ${
                                item.isOverrun ? 'text-[#B42318]' : 'text-[#1B2A4A]'
                              }`}
                            >
                              {item.actualUsedPercent !== null ? `${item.actualUsedPercent}%` : '—'}
                            </span>
                            <span className="text-[11px] font-medium text-[#4F5C67]">Used</span>
                            <span
                              title={exactRemaining}
                              className={`mt-1 max-w-[132px] break-words text-[12px] font-semibold leading-tight ${
                                item.isOverrun ? 'text-[#B42318]' : 'text-[#15803D]'
                              }`}
                            >
                              {compactRemaining}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              title={exactRemaining}
                              data-testid="budget-ring-balance"
                              className={`max-w-[136px] break-words font-bold ${getRingBalanceTextClass(
                                compactRemaining
                              )} ${item.isOverrun ? 'text-[#B42318]' : 'text-[#1B2A4A]'}`}
                            >
                              {compactRemaining}
                            </span>
                            <span
                              className={`mt-0.5 text-[12px] font-medium ${
                                item.isOverrun ? 'text-[#B42318]' : 'text-[#4F5C67]'
                              }`}
                            >
                              {item.isOverrun ? 'Overrun' : 'Remaining'}
                            </span>
                            {item.actualUsedPercent !== null && (
                              <span className="mt-0.5 text-[11px] text-[#64748B]">
                                {item.actualUsedPercent}% used
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Metrics (clear of inset carousel arrows, consistent height across cards) */}
                  <dl
                    data-testid="budget-card-metrics"
                    className="mt-auto flex min-h-[106px] w-full flex-col justify-between border-t border-[#E6E8EB] pt-3 text-[12px] tabular-nums"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[#4F5C67]">Allocated</dt>
                        <dd className="font-semibold text-[#1B2A4A]">
                          {item.allocatedAmount !== null
                            ? formatCurrencyAmount(item.allocatedAmount, item.currency)
                            : 'Not allocated'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="inline-flex items-center gap-1.5 text-[#4F5C67]">
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
                    </div>
                    <div className="flex items-center justify-between pt-2 text-[11px] font-medium text-[#A64011]">
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

          {(hasCarouselOverflow || departments.length > 3) && (
            <button
              ref={nextBtnRef}
              type="button"
              aria-label="Next departments"
              title="Next departments"
              data-testid="budget-carousel-next"
              disabled={!canScrollNext}
              onClick={() => scrollCarousel(1)}
              className="absolute right-2 top-[176px] z-10 inline-flex h-12 w-11 sm:w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9DEE2] bg-white/92 text-[#1B2A4A] shadow-sm backdrop-blur-[2px] transition-all hover:border-[#1B2A4A]/40 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] disabled:cursor-not-allowed disabled:border-[#E6E8EB] disabled:bg-[#F4F3EF]/85 disabled:text-[#94A3B8] disabled:opacity-35 disabled:shadow-none"
            >
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
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
              className="vonta-section-title text-[#1B2A4A]"
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
                aria-label="Show percentages"
                title="Show percentages"
                aria-pressed={chartMode === 'percent'}
                onClick={() => setChartMode('percent')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${
                  chartMode === 'percent'
                    ? 'bg-[#1B2A4A] text-white'
                    : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                }`}
              >
                <span aria-hidden="true">%</span>
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
                          const pt = computeBudgetUsageSeriesPoint(s, chartMode);
                          return `${getChartX(idx).toFixed(1)},${getChartY(pt.allocatedValue).toFixed(1)}`;
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
                          const pt = computeBudgetUsageSeriesPoint(s, chartMode);
                          return `${getChartX(idx).toFixed(1)},${getChartY(pt.usedValue).toFixed(1)}`;
                        })
                        .join(' ')}
                    />
                  )}

                  {/* Interactive Points & Labels */}
                  {chartSummaries.map((s, idx) => {
                    const cx = getChartX(idx);
                    const pt = computeBudgetUsageSeriesPoint(s, chartMode);
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
                          cy={getChartY(pt.allocatedValue)}
                          r="4.5"
                          fill="#1B2A4A"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx={cx}
                          cy={getChartY(pt.usedValue)}
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
                  const pt = computeBudgetUsageSeriesPoint(s, chartMode);
                  const allocY = getChartY(pt.allocatedValue);
                  const usedY = getChartY(pt.usedValue);
                  const baseY = padT + plotH;
                  const allocH = pt.allocatedValue <= 0 ? 0 : Math.max(2, baseY - allocY);
                  const usedH = pt.usedValue <= 0 ? 0 : Math.max(2, baseY - usedY);

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
                        y={allocH === 0 ? baseY : allocY}
                        width={barW}
                        height={allocH}
                        rx="3"
                        fill="#1B2A4A"
                      />
                      <rect
                        x={centerX + 3}
                        y={usedH === 0 ? baseY : usedY}
                        width={barW}
                        height={usedH}
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
          <div
            ref={drawerPanelRef}
            className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl border-l border-[#D9DEE2]"
          >
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
                ref={drawerCloseBtnRef}
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
