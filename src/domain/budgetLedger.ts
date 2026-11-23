import type { ProjectDepartment } from './departmentCatalog';

export type BudgetPeriodMode = 'day' | 'month' | 'year';

export interface BudgetAllocationEntry {
  id: string;
  projectId: string;
  departmentId: string;
  /** YYYY-MM in project local calendar */
  periodMonth: string;
  /** Exact monetary amount in project currency */
  amount: number;
  currency: string;
  actorName: string;
  recordedAt: string;
  note?: string;
}

export interface BudgetPostedCharge {
  id: string;
  /** Authoritative source record ID (prevents double counting repeated issue events) */
  sourceRecordId: string;
  projectId: string;
  departmentId: string;
  periodMonth: string;
  /** YYYY-MM-DD in project local calendar */
  postedDate: string;
  /** Positive for usage, negative for credited reversal */
  amount: number;
  currency: string;
  kind: 'internal_usage' | 'reversal' | 'adjustment';
  description: string;
  actorName: string;
  missingPrice?: boolean;
}

export interface BudgetOpenCommitment {
  id: string;
  sourceRecordId: string;
  projectId: string;
  departmentId: string;
  periodMonth: string;
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
}

export interface ProjectBudgetLedger {
  projectId: string;
  currency: string;
  allocations: BudgetAllocationEntry[];
  charges: BudgetPostedCharge[];
  commitments: BudgetOpenCommitment[];
}

export interface DepartmentBudgetComputed {
  departmentId: string;
  departmentName: string;
  currency: string;
  periodMode: BudgetPeriodMode;
  periodLabel: string;
  asOfDate: string;
  allocationStatus: 'allocated' | 'zero' | 'not_allocated';
  allocatedAmount: number | null;
  postedUsedAmount: number;
  dayPostedMovementAmount: number;
  remainingAmount: number | null;
  openCommitmentsAmount: number;
  availableToApproveAmount: number | null;
  isOverrun: boolean;
  overrunAmount: number;
  /** Ring SVG percentage clamped 0..100 */
  ringUsedPercent: number;
  /** Actual numeric usage percent relative to allocation (can exceed 100 on overrun, null if unallocated/zero) */
  actualUsedPercent: number | null;
  hasMissingPrice: boolean;
  transactions: BudgetPostedCharge[];
}

export function formatCurrencyAmount(amount: number, currency = 'IDR'): string {
  const isNegative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const formatted = abs.toLocaleString('en-US');
  if (currency === 'IDR') {
    return `${isNegative ? '-' : ''}Rp ${formatted}`;
  }
  return `${isNegative ? '-' : ''}${currency} ${formatted}`;
}

export function formatCompactCurrency(amount: number, currency = 'IDR'): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const prefix = currency === 'IDR' ? 'Rp ' : `${currency} `;
  if (abs >= 1_000_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${prefix}${Math.round(abs / 1_000)}k`;
  }
  return `${sign}${prefix}${Math.round(abs)}`;
}

/**
 * Deduplicates posted charges by sourceRecordId so a repeated issue event
 * with the same record ID never double-counts spend.
 */
export function deduplicatePostedCharges(charges: BudgetPostedCharge[]): BudgetPostedCharge[] {
  const bySource = new Map<string, BudgetPostedCharge>();
  for (const charge of charges) {
    const key = `${charge.projectId}::${charge.sourceRecordId}::${charge.kind}`;
    if (!bySource.has(key)) {
      bySource.set(key, charge);
    }
  }
  return Array.from(bySource.values());
}

export function computeDepartmentBudgetSummary(params: {
  ledger: ProjectBudgetLedger;
  department: ProjectDepartment;
  periodMode: BudgetPeriodMode;
  /** YYYY-MM-DD in project local calendar */
  selectedDate: string;
}): DepartmentBudgetComputed {
  const { ledger, department, periodMode, selectedDate } = params;
  const yearStr = selectedDate.slice(0, 4);
  const monthStr = selectedDate.slice(0, 7);

  // Deduplicate allocations by ID
  const uniqueAllocMap = new Map<string, BudgetAllocationEntry>();
  for (const a of ledger.allocations) {
    if (a.departmentId !== department.id) continue;
    if (periodMode === 'year') {
      if (a.periodMonth.startsWith(`${yearStr}-`) && a.periodMonth <= monthStr) {
        uniqueAllocMap.set(a.id, a);
      }
    } else {
      if (a.periodMonth === monthStr) {
        uniqueAllocMap.set(a.id, a);
      }
    }
  }
  const matchingAllocations = Array.from(uniqueAllocMap.values());

  let allocationStatus: 'allocated' | 'zero' | 'not_allocated' = 'not_allocated';
  let allocatedAmount: number | null = null;
  if (matchingAllocations.length > 0) {
    const sum = matchingAllocations.reduce((acc, a) => acc + a.amount, 0);
    allocatedAmount = sum;
    allocationStatus = sum === 0 ? 'zero' : 'allocated';
  }

  // Deduplicate posted charges by sourceRecordId
  const uniqueCharges = deduplicatePostedCharges(
    ledger.charges.filter((c) => c.departmentId === department.id)
  );

  const periodCharges = uniqueCharges.filter((c) => {
    if (periodMode === 'day') {
      return c.periodMonth === monthStr && c.postedDate <= selectedDate;
    }
    if (periodMode === 'month') {
      return c.periodMonth === monthStr;
    }
    return c.postedDate.startsWith(`${yearStr}-`) && c.postedDate <= selectedDate;
  });

  const dayCharges = uniqueCharges.filter((c) => c.postedDate === selectedDate);
  const dayPostedMovementAmount = dayCharges.reduce((acc, c) => acc + c.amount, 0);
  const postedUsedAmount = periodCharges.reduce((acc, c) => acc + c.amount, 0);
  const hasMissingPrice = periodCharges.some((c) => c.missingPrice);

  // Deduplicate open commitments by sourceRecordId
  const uniqueCommitments = new Map<string, BudgetOpenCommitment>();
  for (const cm of ledger.commitments) {
    if (cm.departmentId !== department.id) continue;
    const inPeriod =
      periodMode === 'year'
        ? cm.periodMonth.startsWith(`${yearStr}-`) && cm.periodMonth <= monthStr
        : cm.periodMonth === monthStr;
    if (inPeriod) {
      uniqueCommitments.set(cm.sourceRecordId, cm);
    }
  }
  const openCommitmentsAmount = Array.from(uniqueCommitments.values()).reduce(
    (acc, cm) => acc + cm.amount,
    0
  );

  const remainingAmount =
    allocatedAmount !== null ? allocatedAmount - postedUsedAmount : null;
  const availableToApproveAmount =
    allocatedAmount !== null
      ? allocatedAmount - postedUsedAmount - openCommitmentsAmount
      : null;

  const isOverrun = remainingAmount !== null && remainingAmount < 0;
  const overrunAmount = isOverrun && remainingAmount !== null ? Math.abs(remainingAmount) : 0;

  let actualUsedPercent: number | null = null;
  let ringUsedPercent = 0;
  if (allocatedAmount !== null && allocatedAmount > 0) {
    actualUsedPercent = Math.round((postedUsedAmount / allocatedAmount) * 1000) / 10;
    ringUsedPercent = Math.max(0, Math.min(100, actualUsedPercent));
  } else if (postedUsedAmount > 0) {
    ringUsedPercent = 100;
  }

  const periodLabel =
    periodMode === 'day'
      ? `Month-to-date through ${selectedDate}`
      : periodMode === 'month'
        ? `Month ${monthStr}`
        : `Year-to-date ${yearStr} (through ${selectedDate})`;

  const sortedTransactions = [...periodCharges].sort((a, b) =>
    b.postedDate.localeCompare(a.postedDate) || b.id.localeCompare(a.id)
  );

  return {
    departmentId: department.id,
    departmentName: department.name,
    currency: ledger.currency,
    periodMode,
    periodLabel,
    asOfDate: selectedDate,
    allocationStatus,
    allocatedAmount,
    postedUsedAmount,
    dayPostedMovementAmount,
    remainingAmount,
    openCommitmentsAmount,
    availableToApproveAmount,
    isOverrun,
    overrunAmount,
    ringUsedPercent,
    actualUsedPercent,
    hasMissingPrice,
    transactions: sortedTransactions,
  };
}

export function createDemoBudgetLedger(
  projectId: string,
  departments: ProjectDepartment[]
): ProjectBudgetLedger {
  const civilId = departments.find((d) => d.slug === 'civil')?.id ?? 'dept-civil';
  const elecId = departments.find((d) => d.slug === 'electrical')?.id ?? 'dept-electrical';
  const plumbId = departments.find((d) => d.slug === 'plumbing')?.id ?? 'dept-plumbing';
  const finishId = departments.find((d) => d.slug === 'finishing')?.id ?? 'dept-finishing';

  return {
    projectId,
    currency: 'IDR',
    allocations: [
      {
        id: 'alloc-2026-11-civil',
        projectId,
        departmentId: civilId,
        periodMonth: '2026-11',
        amount: 45_000_000,
        currency: 'IDR',
        actorName: 'Siti Rahma (Accounting)',
        recordedAt: '2026-11-01T08:00:00.000Z',
        note: 'November structural & masonry allocation',
      },
      {
        id: 'alloc-2026-11-elec',
        projectId,
        departmentId: elecId,
        periodMonth: '2026-11',
        amount: 18_500_000,
        currency: 'IDR',
        actorName: 'Siti Rahma (Accounting)',
        recordedAt: '2026-11-01T08:05:00.000Z',
        note: 'November electrical rough-in & panel allocation',
      },
      {
        id: 'alloc-2026-11-plumb',
        projectId,
        departmentId: plumbId,
        periodMonth: '2026-11',
        amount: 14_000_000,
        currency: 'IDR',
        actorName: 'Siti Rahma (Accounting)',
        recordedAt: '2026-11-01T08:10:00.000Z',
        note: 'November water supply & sanitary allocation',
      },
      {
        id: 'alloc-2026-11-finish',
        projectId,
        departmentId: finishId,
        periodMonth: '2026-11',
        amount: 22_000_000,
        currency: 'IDR',
        actorName: 'Siti Rahma (Accounting)',
        recordedAt: '2026-11-01T08:15:00.000Z',
        note: 'November skim coat, paint & interior fixtures allocation',
      },
      // October prior month for Year-to-date aggregation
      {
        id: 'alloc-2026-10-civil',
        projectId,
        departmentId: civilId,
        periodMonth: '2026-10',
        amount: 40_000_000,
        currency: 'IDR',
        actorName: 'Siti Rahma (Accounting)',
        recordedAt: '2026-10-01T08:00:00.000Z',
      },
      {
        id: 'alloc-2026-10-elec',
        projectId,
        departmentId: elecId,
        periodMonth: '2026-10',
        amount: 12_000_000,
        currency: 'IDR',
        actorName: 'Siti Rahma (Accounting)',
        recordedAt: '2026-10-01T08:05:00.000Z',
      },
    ],
    charges: [
      {
        id: 'chg-01',
        sourceRecordId: 'ISS-20261105-001',
        projectId,
        departmentId: civilId,
        periodMonth: '2026-11',
        postedDate: '2026-11-05',
        amount: 14_250_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'Ready-mix concrete K-250 & tie-beam rebar issue',
        actorName: 'Warehouse Issue · Budi Santoso',
      },
      {
        id: 'chg-02',
        sourceRecordId: 'ISS-20261114-004',
        projectId,
        departmentId: civilId,
        periodMonth: '2026-11',
        postedDate: '2026-11-14',
        amount: 8_900_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'Lightweight AAC block & mortar issue (Ground Floor)',
        actorName: 'Warehouse Issue · Hendra Kusuma',
      },
      {
        id: 'chg-03',
        sourceRecordId: 'ISS-20261111-002',
        projectId,
        departmentId: elecId,
        periodMonth: '2026-11',
        postedDate: '2026-11-11',
        amount: 6_400_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'NYM 3×2.5 cable coils & PVC 20 mm conduit issue',
        actorName: 'Warehouse Issue · Hendra Wijaya',
      },
      {
        id: 'chg-04',
        sourceRecordId: 'ISS-20261119-007',
        projectId,
        departmentId: elecId,
        periodMonth: '2026-11',
        postedDate: '2026-11-19',
        amount: 3_150_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'Main distribution panel MDP-1 breakers & switch boxes',
        actorName: 'Warehouse Issue · Hendra Wijaya',
      },
      {
        id: 'chg-05',
        sourceRecordId: 'ISS-20261112-003',
        projectId,
        departmentId: plumbId,
        periodMonth: '2026-11',
        postedDate: '2026-11-12',
        amount: 5_200_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'PPR PN-16 water supply risers & ball valves',
        actorName: 'Warehouse Issue · Dedi Kurniawan',
      },
      {
        id: 'chg-06',
        sourceRecordId: 'ISS-20261118-006',
        projectId,
        departmentId: finishId,
        periodMonth: '2026-11',
        postedDate: '2026-11-18',
        amount: 7_800_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'Skim coat mortar bags, primer & interior matte paint',
        actorName: 'Warehouse Issue · Budi Santoso',
      },
      {
        id: 'chg-07',
        sourceRecordId: 'ISS-20261120-009',
        projectId,
        departmentId: finishId,
        periodMonth: '2026-11',
        postedDate: '2026-11-20',
        amount: 2_450_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'Ruang Rapat acoustic trim & sandpaper #180',
        actorName: 'Warehouse Issue · Budi Santoso',
      },
      // October prior spend for YTD
      {
        id: 'chg-oct-01',
        sourceRecordId: 'ISS-20261018-001',
        projectId,
        departmentId: civilId,
        periodMonth: '2026-10',
        postedDate: '2026-10-18',
        amount: 36_400_000,
        currency: 'IDR',
        kind: 'internal_usage',
        description: 'October foundation footing concrete & formwork',
        actorName: 'Warehouse Issue · Budi Santoso',
      },
    ],
    commitments: [
      {
        id: 'cmt-01',
        sourceRecordId: 'PR-202611-012',
        projectId,
        departmentId: civilId,
        periodMonth: '2026-11',
        amount: 4_500_000,
        currency: 'IDR',
        description: 'Approved PR for Level 2 slab waterproofing membrane',
        createdAt: '2026-11-18T09:00:00.000Z',
      },
      {
        id: 'cmt-02',
        sourceRecordId: 'PR-202611-015',
        projectId,
        departmentId: elecId,
        periodMonth: '2026-11',
        amount: 1_800_000,
        currency: 'IDR',
        description: 'Approved PR for LED linear luminaires',
        createdAt: '2026-11-19T10:30:00.000Z',
      },
    ],
  };
}
