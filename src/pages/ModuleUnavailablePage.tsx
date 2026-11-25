import { isProjectLead } from '../domain/accountTypes';
import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, Plus, Receipt, Wallet } from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useDemoAddendum } from '../context/DemoAddendumContext';
import {
  computeDepartmentBudgetSummary,
  formatCurrencyAmount,
} from '../domain/budgetLedger';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { getProjectRoutes } from '../utils/projectRoutes';
import {
  ACCOUNTING_VIEWS,
  buildAccountingRailGroups,
  buildOverviewRailGroups,
  buildWarehouseRailGroups,
  resolveAccountingView,
  resolveModuleFromSlug,
} from '../utils/moduleNavConfig';

const MODULE_TITLES: Record<string, string> = {
  users: 'Team',
  attendance: 'Attendance',
  inventory: 'Inventory',
  'store-requests': 'Store Requests',
  'purchase-requests': 'Purchase Requests',
  'market-list': 'Market List',
  'goods-receipts': 'Goods Receipts',
  accounting: 'Accounting',
};

/**
 * Shared working shell for Warehouse destinations and live-connected Accounting Monthly Department Budgets.
 * Accounting is wired directly to the shared project department catalog and budget ledger so
 * 5th+ departments created in Overview or Accounting appear immediately across both surfaces.
 */
export function ModuleUnavailablePage({ moduleKey }: { moduleKey: string }) {
  const location = useLocation();
  const { state, departments, addDepartment } = useDemo();
  const addendum = useDemoAddendum();
  const routes = getProjectRoutes(location.pathname, state.project.slug);
  const activeModule = resolveModuleFromSlug(moduleKey);
  const accountingView = resolveAccountingView(location.search);

  // Accounting interactive state
  const [selectedMonth, setSelectedMonth] = useState('2026-11');
  const [allocDeptId, setAllocDeptId] = useState(departments[0]?.id ?? 'dept-civil');
  const [allocAmount, setAllocAmount] = useState('15000000');
  const [allocNote, setAllocNote] = useState('');
  const [chargeDeptId, setChargeDeptId] = useState(departments[0]?.id ?? 'dept-civil');
  const [chargeDate, setChargeDate] = useState('2026-11-20');
  const [chargeAmount, setChargeAmount] = useState('1250000');
  const [chargeSourceId, setChargeSourceId] = useState('');
  const [chargeDesc, setChargeDesc] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { moduleLabel, railGroups, title } = useMemo(() => {
    if (activeModule === 'warehouse') {
      return {
        moduleLabel: 'Warehouse',
        railGroups: buildWarehouseRailGroups(routes, moduleKey),
        title: MODULE_TITLES[moduleKey] ?? 'Warehouse',
      };
    }

    if (activeModule === 'accounting') {
      return {
        moduleLabel: 'Accounting',
        railGroups: buildAccountingRailGroups(routes, accountingView),
        title: ACCOUNTING_VIEWS[accountingView].title,
      };
    }

    return {
      moduleLabel: 'Overview',
      railGroups: buildOverviewRailGroups(
        routes,
        moduleKey === 'attendance' ? 'attendance' : 'users'
      ),
      title: MODULE_TITLES[moduleKey] ?? 'Module',
    };
  }, [activeModule, routes, moduleKey, accountingView]);

  const departmentSummaries = useMemo(
    () =>
      departments.map((dept) =>
        computeDepartmentBudgetSummary({
          ledger: addendum.budgetLedger,
          department: dept,
          periodMode: 'month',
          selectedDate: `${selectedMonth}-28`,
        })
      ),
    [departments, addendum.budgetLedger, selectedMonth]
  );

  const handleRecordAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(allocAmount.replace(/[^0-9.-]/g, ''));
    const res = addendum.recordBudgetAllocation({
      departmentId: allocDeptId,
      periodMonth: selectedMonth,
      amount: numeric,
      note: allocNote,
    });
    setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message });
    if (res.ok) setAllocNote('');
  };

  const handlePostCharge = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(chargeAmount.replace(/[^0-9.-]/g, ''));
    const res = addendum.postBudgetCharge({
      departmentId: chargeDeptId,
      periodMonth: chargeDate.slice(0, 7),
      postedDate: chargeDate,
      amount: numeric,
      description: chargeDesc || 'Internal warehouse material issue',
      sourceRecordId: chargeSourceId || `ISS-${Date.now()}`,
    });
    setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message });
    if (res.ok) {
      setChargeDesc('');
      setChargeSourceId('');
    }
  };

  const handleAddDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addDepartment({ name: newDeptName.trim() });
    if (!res.ok) {
      setBanner({ kind: 'err', text: res.error });
      return;
    }
    setNewDeptName('');
    setAllocDeptId(res.created.id);
    setBanner({
      kind: 'ok',
      text: `Added "${res.created.name}" to the shared project department catalog. Record its monthly allocation below.`,
    });
  };

  if (activeModule === 'accounting') {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <ProjectNavbar />

        <div className="flex min-h-[calc(100dvh-60px)] flex-1">
          <ContextualRail
            moduleLabel={moduleLabel}
            groups={railGroups}
            projectSettingsPath={routes.settingsPath}
          />

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1240px] space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#A64011]">
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                    Accounting · {title}
                  </span>
                  <h1 className="vonta-page-title mt-1 text-[#1B2A4A]">
                    Monthly Department Budgets
                  </h1>
                  <p className="mt-1 text-[14px] text-[#4F5C67]">
                    Authoritative monthly allocations and posted warehouse usage shared with
                    Overview budget cards and usage charts.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] font-medium text-[#1B2A4A]">
                  <span>Period</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value || '2026-11')}
                    data-testid="accounting-month-input"
                    className="font-semibold text-[#1B2A4A] tabular-nums focus:outline-none"
                  />
                </label>
              </div>

              {banner && (
                <div
                  role="status"
                  data-testid="accounting-banner"
                  className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-[13px] font-medium ${
                    banner.kind === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-red-200 bg-red-50 text-red-900'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{banner.text}</span>
                </div>
              )}

              {/* Department Budget Register Table */}
              <section
                aria-labelledby="accounting-dept-table-heading"
                data-testid="accounting-department-table"
                className="overflow-hidden rounded-xl border border-[#D9DEE2] bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E8EB] px-5 py-4">
                  <h2
                    id="accounting-dept-table-heading"
                    className="vonta-section-title text-[#1B2A4A]"
                  >
                    Department Ledger ({departments.length} departments · {selectedMonth})
                  </h2>

                  {isProjectLead(addendum.activePersona.role) && (
                    <form onSubmit={handleAddDepartment} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        placeholder="Add 5th+ department…"
                        aria-label="New department name"
                        className="h-8 rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] px-2.5 text-[12px] text-[#1B2A4A]"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#1B2A4A] px-3 text-[12px] font-semibold text-white hover:bg-[#1B2A4A]/90"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add
                      </button>
                    </form>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-[13px]">
                    <thead className="border-b border-[#E6E8EB] bg-[#FAF9F6] text-[12px] font-semibold text-[#4F5C67]">
                      <tr>
                        <th className="px-5 py-3">Department</th>
                        <th className="px-4 py-3 text-right">Monthly Allocation</th>
                        <th className="px-4 py-3 text-right">Posted Used</th>
                        <th className="px-4 py-3 text-right">Remaining</th>
                        <th className="px-4 py-3 text-right">Open Commitments</th>
                        <th className="px-5 py-3 text-right">Available to Approve</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E6E8EB] tabular-nums">
                      {departmentSummaries.map((row) => {
                        const dept = departments.find((d) => d.id === row.departmentId);
                        return (
                          <tr
                            key={row.departmentId}
                            data-testid={`accounting-dept-row-${dept?.slug ?? row.departmentId}`}
                            className="hover:bg-[#FAF9F6]/60"
                          >
                            <td className="px-5 py-3.5 font-semibold text-[#1B2A4A]">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: dept?.defaultPinColor ?? '#1B2A4A' }}
                                />
                                {row.departmentName}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-medium text-[#1B2A4A]">
                              {row.allocatedAmount !== null
                                ? formatCurrencyAmount(row.allocatedAmount, row.currency)
                                : 'Not allocated'}
                            </td>
                            <td className="px-4 py-3.5 text-right font-medium text-[#B42318]">
                              {formatCurrencyAmount(row.postedUsedAmount, row.currency)}
                            </td>
                            <td
                              className={`px-4 py-3.5 text-right font-semibold ${
                                row.isOverrun ? 'text-[#B42318]' : 'text-[#15803D]'
                              }`}
                            >
                              {row.remainingAmount !== null
                                ? formatCurrencyAmount(row.remainingAmount, row.currency)
                                : '—'}
                              {row.isOverrun ? ' (Overrun)' : ''}
                            </td>
                            <td className="px-4 py-3.5 text-right text-[#4F5C67]">
                              {formatCurrencyAmount(row.openCommitmentsAmount, row.currency)}
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold text-[#1B2A4A]">
                              {row.availableToApproveAmount !== null
                                ? formatCurrencyAmount(row.availableToApproveAmount, row.currency)
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Two Action Forms: Record Monthly Allocation & Post Internal Usage */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <form
                  onSubmit={handleRecordAllocation}
                  data-testid="accounting-allocation-form"
                  className="rounded-xl border border-[#D9DEE2] bg-white p-5 space-y-3.5"
                >
                  <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                    Set Monthly Department Allocation
                  </h2>
                  <p className="text-[12px] text-[#4F5C67]">
                    Records or updates the monthly budget for any catalog department (including
                    explicit Rp 0).
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                      Department
                      <select
                        value={allocDeptId}
                        onChange={(e) => setAllocDeptId(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-normal"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                      Allocation ({addendum.budgetLedger.currency})
                      <input
                        type="number"
                        min={0}
                        step={50000}
                        required
                        value={allocAmount}
                        onChange={(e) => setAllocAmount(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-normal tabular-nums"
                      />
                    </label>
                  </div>
                  <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                    Note (optional)
                    <input
                      type="text"
                      value={allocNote}
                      onChange={(e) => setAllocNote(e.target.value)}
                      placeholder="e.g., Revised monthly cap after owner approval"
                      className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-normal"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center rounded-lg bg-[#1B2A4A] px-4 text-[13px] font-semibold text-white hover:bg-[#1B2A4A]/90"
                  >
                    Save allocation
                  </button>
                </form>

                <form
                  onSubmit={handlePostCharge}
                  data-testid="accounting-charge-form"
                  className="rounded-xl border border-[#D9DEE2] bg-white p-5 space-y-3.5"
                >
                  <h2 className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-[#1B2A4A]">
                    <Receipt className="h-4 w-4 text-[#D4652F]" aria-hidden="true" />
                    Post Department Usage / Reversal
                  </h2>
                  <p className="text-[12px] text-[#4F5C67]">
                    Deduplicated by source record ID so repeated warehouse issues never double
                    count spend.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                      Department
                      <select
                        value={chargeDeptId}
                        onChange={(e) => setChargeDeptId(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-normal"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                      Posted date
                      <input
                        type="date"
                        required
                        value={chargeDate}
                        onChange={(e) => setChargeDate(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-normal tabular-nums"
                      />
                    </label>
                    <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                      Amount (negative for reversal)
                      <input
                        type="number"
                        step={10000}
                        required
                        value={chargeAmount}
                        onChange={(e) => setChargeAmount(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-normal tabular-nums"
                      />
                    </label>
                    <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                      Source record ID
                      <input
                        type="text"
                        value={chargeSourceId}
                        onChange={(e) => setChargeSourceId(e.target.value)}
                        placeholder="e.g., ISS-20261120-011"
                        className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-normal"
                      />
                    </label>
                  </div>
                  <label className="block text-[12px] font-semibold text-[#1B2A4A]">
                    Description
                    <input
                      type="text"
                      value={chargeDesc}
                      onChange={(e) => setChargeDesc(e.target.value)}
                      placeholder="e.g., Cable tray brackets & anchor bolts"
                      className="mt-1 h-9 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-normal"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center rounded-lg bg-[#A64011] px-4 text-[13px] font-semibold text-white hover:bg-[#8C350E]"
                  >
                    Post to ledger
                  </button>
                </form>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <ProjectNavbar />

      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <ContextualRail
          moduleLabel={moduleLabel}
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
        />

        <main className="flex min-w-0 flex-1 items-center justify-center px-4 py-12">
          <section
            aria-labelledby="module-dev-heading"
            data-testid="module-dev-card"
            className="w-full max-w-md rounded-xl border border-[#D9DEE2] bg-white px-8 py-12 text-center"
          >
            <div className="text-[20px] leading-[24px] font-bold tracking-tight text-[#1B2A4A]">
              VONTA
            </div>
            <h1
              id="module-dev-heading"
              className="vonta-page-title mt-4 text-[#1B2A4A]"
            >
              {title}
            </h1>
            <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
              This module is in development.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
