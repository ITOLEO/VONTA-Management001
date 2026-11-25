import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBudgetUsageSeriesPoint,
  computeDepartmentBudgetSummary,
  formatCompactCurrency,
  type ProjectBudgetLedger,
} from './budgetLedger';
import {
  addProjectDepartment,
  resolveEffectivePinColor,
  seedDefaultDepartments,
} from './departmentCatalog';

describe('VONTA 06 — Budget Rings, Ledger Basis & Department Mapping (BUD-1 & BUD-2)', () => {
  it('BUD-2: allocation 100, posted use 40, open commitments 10 -> balance 60, available to approve 50; posted 120 -> negative balance -20; missing vs zero distinct', () => {
    const depts = seedDefaultDepartments('proj-bud2');
    const civil = depts.find((d) => d.slug === 'civil')!;
    const elec = depts.find((d) => d.slug === 'electrical')!;
    const plumb = depts.find((d) => d.slug === 'plumbing')!;
    const finish = depts.find((d) => d.slug === 'finishing')!;

    const ledger: ProjectBudgetLedger = {
      projectId: 'proj-bud2',
      currency: 'USD',
      allocations: [
        {
          id: 'alloc-civil-100',
          projectId: 'proj-bud2',
          departmentId: civil.id,
          periodMonth: '2026-11',
          amount: 100,
          currency: 'USD',
          actorName: 'Accounting',
          recordedAt: '2026-11-01T08:00:00.000Z',
        },
        {
          id: 'alloc-elec-100',
          projectId: 'proj-bud2',
          departmentId: elec.id,
          periodMonth: '2026-11',
          amount: 100,
          currency: 'USD',
          actorName: 'Accounting',
          recordedAt: '2026-11-01T08:00:00.000Z',
        },
        {
          id: 'alloc-plumb-zero',
          projectId: 'proj-bud2',
          departmentId: plumb.id,
          periodMonth: '2026-11',
          amount: 0,
          currency: 'USD',
          actorName: 'Accounting',
          recordedAt: '2026-11-01T08:00:00.000Z',
        },
        // Finishing intentionally omitted -> Not allocated
      ],
      charges: [
        // Civil: posted 40 (+ duplicate sourceRecordId replay ignored + 15 charge & -15 reversal nets to 40)
        {
          id: 'chg-c1',
          sourceRecordId: 'ISS-BUD2-01',
          projectId: 'proj-bud2',
          departmentId: civil.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-10',
          amount: 40,
          currency: 'USD',
          kind: 'internal_usage',
          description: 'Primary material issue',
          actorName: 'Warehouse',
        },
        {
          id: 'chg-c1-dup',
          sourceRecordId: 'ISS-BUD2-01',
          projectId: 'proj-bud2',
          departmentId: civil.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-10',
          amount: 40,
          currency: 'USD',
          kind: 'internal_usage',
          description: 'Duplicate event replay',
          actorName: 'Warehouse',
        },
        {
          id: 'chg-c2',
          sourceRecordId: 'ISS-BUD2-02',
          projectId: 'proj-bud2',
          departmentId: civil.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-12',
          amount: 15,
          currency: 'USD',
          kind: 'internal_usage',
          description: 'Temporary issue',
          actorName: 'Warehouse',
        },
        {
          id: 'chg-c2-rev',
          sourceRecordId: 'ISS-BUD2-02',
          projectId: 'proj-bud2',
          departmentId: civil.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-13',
          amount: -15,
          currency: 'USD',
          kind: 'reversal',
          description: 'Credited reversal for temporary issue',
          actorName: 'Warehouse',
        },
        // Electrical: posted 120 against allocation 100 -> negative balance -20
        {
          id: 'chg-e1',
          sourceRecordId: 'ISS-BUD2-03',
          projectId: 'proj-bud2',
          departmentId: elec.id,
          periodMonth: '2026-11',
          postedDate: '2026-11-14',
          amount: 120,
          currency: 'USD',
          kind: 'internal_usage',
          description: 'Overrun electrical panel charge',
          actorName: 'Warehouse',
        },
      ],
      commitments: [
        {
          id: 'cmt-c1',
          sourceRecordId: 'PR-BUD2-01',
          projectId: 'proj-bud2',
          departmentId: civil.id,
          periodMonth: '2026-11',
          amount: 10,
          currency: 'USD',
          description: 'Open PR commitment',
          createdAt: '2026-11-15T00:00:00.000Z',
        },
      ],
    };

    // 1. Allocation 100, posted 40, open commitments 10 -> center balance 60, available to approve 50
    const civilSummary = computeDepartmentBudgetSummary({
      ledger,
      department: civil,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(civilSummary.allocationStatus, 'allocated');
    assert.equal(civilSummary.allocatedAmount, 100);
    assert.equal(civilSummary.postedUsedAmount, 40);
    assert.equal(civilSummary.remainingAmount, 60);
    assert.equal(civilSummary.openCommitmentsAmount, 10);
    assert.equal(civilSummary.availableToApproveAmount, 50);
    assert.equal(civilSummary.isOverrun, false);
    assert.equal(civilSummary.actualUsedPercent, 40);
    assert.equal(civilSummary.ringUsedPercent, 40);

    // Percent scaling for positive allocation
    const civilPctPoint = computeBudgetUsageSeriesPoint(civilSummary, 'percent');
    assert.equal(civilPctPoint.hasPositiveAllocation, true);
    assert.equal(civilPctPoint.allocatedValue, 100);
    assert.equal(civilPctPoint.usedValue, 40);

    // 2. Posted 120 vs allocation 100 -> negative balance -20, overrun true, ring clamped 100%, actual 120%
    const elecSummary = computeDepartmentBudgetSummary({
      ledger,
      department: elec,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(elecSummary.remainingAmount, -20);
    assert.equal(elecSummary.isOverrun, true);
    assert.equal(elecSummary.overrunAmount, 20);
    assert.equal(elecSummary.ringUsedPercent, 100);
    assert.equal(elecSummary.actualUsedPercent, 120);
    assert.equal(formatCompactCurrency(elecSummary.remainingAmount!, 'USD'), '-USD 20');

    const elecPctPoint = computeBudgetUsageSeriesPoint(elecSummary, 'percent');
    assert.equal(elecPctPoint.allocatedValue, 100);
    assert.equal(elecPctPoint.usedValue, 120);

    // 3. Explicit zero allocation vs missing allocation must remain distinct
    const plumbSummary = computeDepartmentBudgetSummary({
      ledger,
      department: plumb,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(plumbSummary.allocationStatus, 'zero');
    assert.equal(plumbSummary.allocatedAmount, 0);
    assert.equal(plumbSummary.remainingAmount, 0);
    assert.equal(plumbSummary.actualUsedPercent, null);
    const plumbPctPoint = computeBudgetUsageSeriesPoint(plumbSummary, 'percent');
    assert.equal(plumbPctPoint.hasPositiveAllocation, false);
    assert.equal(plumbPctPoint.allocatedValue, 0);

    const finishSummary = computeDepartmentBudgetSummary({
      ledger,
      department: finish,
      periodMode: 'month',
      selectedDate: '2026-11-20',
    });
    assert.equal(finishSummary.allocationStatus, 'not_allocated');
    assert.equal(finishSummary.allocatedAmount, null);
    assert.equal(finishSummary.remainingAmount, null);
    assert.equal(finishSummary.availableToApproveAmount, null);
    const finishPctPoint = computeBudgetUsageSeriesPoint(finishSummary, 'percent');
    assert.equal(finishPctPoint.hasPositiveAllocation, false);
    assert.equal(finishPctPoint.allocatedValue, 0);

    // 4. Compact formatting for large and negative balances
    assert.equal(formatCompactCurrency(-1_250_000_000, 'IDR'), '-Rp 1.3B');
    assert.equal(formatCompactCurrency(2_400_000_000_000, 'IDR'), 'Rp 2.4T');
    assert.equal(formatCompactCurrency(-2_400_000_000_000, 'IDR'), '-Rp 2.4T');
  });

  it('BUD-1: adding a 5th department links catalog order, Not allocated budget state, and Pin palette mapping', () => {
    const seeded = seedDefaultDepartments('proj-bud1');
    const added = addProjectDepartment(seeded, 'proj-bud1', {
      name: 'HVAC',
      defaultPinColor: '#0F766E',
    });
    assert.equal(added.ok, true);
    if (!added.ok) return;

    assert.equal(added.departments.length, 5);
    assert.equal(added.departments[4].name, 'HVAC');
    assert.equal(added.departments[4].defaultPinColor, '#0F766E');

    // Pin in HVAC inherits department default color; explicit override is preserved
    assert.equal(
      resolveEffectivePinColor({ department: 'HVAC', color: undefined }, added.departments),
      '#0F766E'
    );
    assert.equal(
      resolveEffectivePinColor(
        { department: 'HVAC', color: '#B42318', pinColorOverride: true },
        added.departments
      ),
      '#B42318'
    );
  });
});
