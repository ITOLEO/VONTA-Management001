# Departments, Overview and Accounting

## One department catalog

Use project-scoped stable department IDs. Seed Civil, Electrical, Plumbing and Finishing once. Preserve the membership, discipline, department assignment, and Pin color on legacy records during migration. Read the same catalog in Overview, Accounting, PIN, Team, Attendance, Workspace, Blueprint management and Project Settings. Preserve legacy links and historic labels. Catalog entries and financial records belong to their project.

Put Add department in the budget allocation section for the existing department-management authority (Contractor in the baseline). Persist the catalog entry once, handle concurrent duplicate names, and refresh all relevant screens. A new department appears in filters, Accounting, color settings, the fourth or later carousel position, and the usage chart axis. Its budget starts as **Not allocated** until Accounting records an allocation. A zero allocation entered explicitly is distinct from a missing one. Historical records keep their department when a label changes.

## Dashboard frame and filters

Layout order: operational charts → monthly allocation cards → one full-width budget usage chart. Replace the former Recent activity section at this location. Keep underlying audit data and Pin detail histories available from their proper destinations.

On desktop use a taller, stable row of three chart panels for Pin approval, Pin distribution and attendance. Start with a 360 px plot-card body and allow about 320–420 px by viewport breakpoint. Use the same size at each breakpoint for every filter, loading, empty and denied state. Reserve space for axes and legends. Scroll long legends or detailed rows inside their regions; give crowded categories horizontal scrolling. The page can scroll vertically. Stack the panels on mobile. Keep headings, filter controls and axes reachable at larger text sizes.

Give all visualizations a project-local date selector with Day, Month and Year, and an explicit Count / Percent or Amount / Percent mode. Controls may be shared across the operational row if their scope is visible above all three. The budget carousel shares dates and units across its cards. Its date control is independent of the department filter. The usage chart has its own department and period controls. Show selected dates, data coverage, source units, and “as of” date for balances. Date intervals are half-open in project time, computed from local calendar boundaries, including DST. Format identifiers and currency consistently.

## Chart contracts

| Chart | All departments | One department | Units, axis and meaning |
| --- | --- | --- | --- |
| Approved Pins ring | Sum approved and eligible distinct Pins across all visible departments. | Use the same counts for the selected department. | Count mode: approved/eligible. Percent mode: 100 × approved/eligible. Keep underlying counts in the label or tooltip. Its only data source is work Pins. 0/0 is an empty ring with “No eligible Pins.” |
| Work Pins bars | X = department. Two bars or stacked segments per department: Approved and Outstanding. | X = Approved, Outstanding. Y = the count of Pins or the share of the selected department’s eligible Pins. | Outstanding = eligible minus approved, including open, in progress and pending review. Keep actual QC states available in drill-down. Use all records, including the eighth and later Pins. |
| Pin progress line | Show the share approved over time across enabled departments. | Apply the selection to the same trend. | Use the same middle card with a Bars / Trend toggle, or an inset if labels remain legible. X = time, Y = percentage by default. Count mode uses approved count. Keep numerator and denominator on each point. |
| Daily attendance bars | Group recorded worker-days for the selected period across departments. | Same groups for one department. | X = Present, Izin, Alfa, and Pending/unresolved when applicable. Y = workers on a single day, worker-days over longer periods. Percent mode uses eligible scheduled worker-days, with all categories labeled. Show unresolved coverage. Owner is outside the denominator. |

Use project-local period end for the Pin snapshot, including Pins created by that boundary and eligible under the existing archive/delete policy. Reconstruct status from dated history. Trend points use the eligible population at each point. A later approval must not appear in an earlier snapshot. When historic coverage is absent, show the supported range or “Historical data unavailable.” Link drill-down to the PIN list using the same constraints. A recent-list cap or a page of search results cannot feed an aggregate.

Distinguish the attendance **distribution** from the **presence rate** shown on Team/roster. For an eligible completed period with 6 Present, 2 Alfa and 2 Izin, the bars are 60%, 20%, 20%; the excused-adjusted rate is 6/(6+2) = 75%. A pending izin after cutoff still contributes to Alfa until approved. Exclude unresolved days from department rankings and disclose coverage. Where comparing departments, show ties. A denied data source is distinct from no activity.

## Monthly department budget allocation

Show one equal-sized ring card for every department with three visible on wide screens. Use labeled Previous departments and Next departments controls plus touch scrolling. Four initial departments means Finishing is reachable immediately. Newly added departments get their own card. This section has **no department filter**.

Each ring uses red for Used and green for Unused. Add text labels and amounts so color is optional. Center the remaining currency amount; it decreases as usage posts. Show monthly allocation and used value next to or below it. Amount/Percent switches the side labels and tooltip; leave the center balance in currency with an optional percentage below. For zero or missing allocation, show the actual amounts and an explicit state. If posted use exceeds allocation, show the negative remaining amount and the overrun in text. Cap ring geometry at 100% and keep the real values.

For Day, show month-to-date balance through the selected date plus that day’s posted movements. For Month, show its monthly allocation and usage. For Year, sum separate monthly allocations once and show year-to-date usage through the selected cutoff. Show the exact period so monthly and annual values cannot be confused. Provide a dated transaction list via chart interaction to answer “On what date did this department spend the money?”

## Full-width budget usage chart

Place one large chart below the allocation cards. Default to Line, provide Bar, and preserve height when switching. X = department in stable catalog order. Y = amount in the project currency. Draw separate labeled series for Allocated and Used. The line connects categorical points only for comparison. Use the date control to inspect other periods; it is not a time axis. Amount mode shows actual currency. Percent mode normalizes each department to its own allocation (Allocated = 100% when allocation is positive). Tooltips show currency, posted use, remaining and coverage. A department filter narrows this chart without hiding any allocation cards above it.

## Money and authority

Accounting owns budget entries. The Contractor manages the department directory. Reuse a single authoritative ledger and project currency. Use exact monetary amounts. Preserve the existing budget approval gate and stock accounting rules.

- Allocation = sum of unique authorized allocations and effective adjustments for the period. Posted usage = actual posted departmental charges under the agreed Accounting basis, including credited reversals. Reuse the source IDs. Never count a request, its approval, its receipt and its issue as four expenses for the same demand.
- For the existing material workflow, internal usage equals issued quantity × tracking price at issue. Warehouse receiving cost is a different measure. Pending requests, ordered materials and open commitments must not silently appear as posted spend.
- Remaining displayed on the ring = allocated − posted usage. Available to approve = allocated − posted usage − outstanding commitments, where the approved budget policy uses commitments. Label each balance. Preserve permission boundaries, actor, posting date, project currency and period.
- Example: allocate IDR 1,000,000, post IDR 200,000 of department usage, and retain IDR 150,000 in open commitments. The ring shows 200,000 used and 800,000 remaining. The approval gate sees 650,000 available. A repeated issue event with the same record ID changes none of these values. Missing prices or mixed currencies without an approved conversion yield an incomplete value, never a synthetic zero.
- A dashboard reader needs a budget-read entitlement for each financial figure. An unrestricted Workspace share must never contain budget data. If the ledger is missing in the current project, implement the smallest authorized monthly allocation/posting integration required or show the exact integration gap. Keep clearly labeled test fixtures outside live results.
