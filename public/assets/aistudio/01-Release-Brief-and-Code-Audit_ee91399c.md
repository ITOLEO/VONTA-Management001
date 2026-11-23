# VONTA Management | Field operations revision
**22 November 2026 · Implementation brief for the existing AI Studio project**

## How to run this package

Attach documents 01–06 to the existing VONTA chat. Include the current source or keep the project that produced the screenshots open. Paste 07-Gemini-Prompt.txt. The two standalone HTML files illustrate the requested dashboard and blueprint layouts. They are design aids for humans. The six documents contain the implementation contract.

Apply the latest decisions in this package to the affected features. Keep the earlier PRD and attendance addendum for rules outside these changes. Use actual project data and the existing VONTA design system. The five product workflows remain blueprint interpretation and verified 3D, spatial work, Pin-based QC, materials and warehouse, and verified project monitoring.

## Source and evidence

Reviewed `vonta-management (2).zip`, 173 archive entries including 70 TypeScript/TSX files under src, plus 17 issue images and one gallery-layout reference. Archive SHA-256: `a09c6b5a33377f6b9fcc74cc1fa40b7c7ca29730201c5dd9d71571386f18f054`. ZIP integrity passed. Ran the unmodified attendanceEngine, blueprintGeometry, and vontaDomain test files against their extracted source with Node 24 and a temporary relative-import resolver. **20 passed, 0 failed**. This is a baseline of three domain suites. No live email, camera, database, deployed scheduler, public sharing or new UI was verified in this review.

| Evidence in the archive | Consequence for the implementation |
| --- | --- |
| src/pages/ProfileSettingsPage.tsx updates activeSection on navigation and calls scrollIntoView. src/context/AuthContext.tsx has a live requestEmailChange path. changeAccountPassword signs in with the old password then calls updateUser. | Connect section tracking to actual scrolling. Enforce address immutability and a challenge sent to the current inbox for every signed-in password change. Disabled demo fields do not prove either rule. |
| src/components/ContextualRail.tsx documents click-only expansion and a width of 232 px. src/utils/moduleNavConfig.ts and both ProjectNavbar.tsx and PrivateNavbar.tsx place Work in the header and Team/Attendance in the Overview rail. | Update both shells, mobile overflow, active-module logic and route tests together. Preserve project selection as a separate page. |
| src/components/DepartmentDashboardSection.tsx prints recentDistinctPins with a seven-item cap. src/domain/types.ts defines a four-value Department union. | Build chart queries from all eligible records. Replace department-name switches and identifiers across UI, API and persisted data with a project catalog and stable keys. |
| src/components/BlueprintReviewStudio.tsx supports initial, add-area, and replace. src/domain/blueprintGeometry.ts validates scale. The database already has project_areas, blueprint_assets, processing_jobs, model_versions and project_pins. | Extend the existing versioned process. Keep file, sheet, area and model distinct. Implement a many-sheet register and source-linked notes. |
| src/server/blueprintAiExtractor.ts declares the literal gemini-4-hydrogen. | The chat model and the runtime extraction provider are independent. Check the configured provider and supported model in the actual environment. Report unavailable processing explicitly. |
| src/pages/UsersAccessPage.tsx and src/pages/AttendancePage.tsx contain separate demo and private pages. The private Attendance page renders descriptive API text. src/domain/accountTypes.ts defines contractor, owner, worker, accounting as ProjectRole. | Implement live forms and queries as well as the demo. Architect needs a real account/membership mapping and compatible access checks. A new dropdown option alone does not implement it. |
| src/domain/attendanceEngine.ts, src/server/addendumService.ts and the attendance migration exist. server.ts calls startCutoffScheduler(30_000). The migration includes a commented cron registration. | Reuse the cutoff engine. Confirm an active persistent production schedule or equivalent independent job. Displayed status must be correct while all clients are closed. |
| src/utils/privateDrawingStore.ts and WorkspaceDrawingToolbar.tsx support device-local marks; SpatialViewport3D.tsx already picks mesh surfaces and intersects the active stroke plane. SpatialWorkspacePage.tsx contains workspace-demo-persona-select. | Extend drawing data compatibly. Remove the Workspace persona selector. Use the same 3D scene for rulers, orientation and private paint. |
| src/pages/SharedWorkspaceViewPage.tsx resolves an authenticated reference then navigates to /spatial. WorkspaceOutputActions.tsx provides the action UI. | Both share modes need a dedicated view-only renderer. A redirect into the editing workspace cannot guarantee viewer-only behavior. |
| WorkListPage.tsx combines status tabs with rail filters. PrivateProjectRoutePages.tsx also implements private work/Pin screens and unfinished module shells. ProjectSettingsPage.tsx and PrivateProjectSettingsPage.tsx both define History. | Build one filtered Pin query for two views. Update both settings pages and old history links. For budget, connect trustworthy Accounting records or expose missing setup. |

## Replaced decisions

| Subject | Current decision |
| --- | --- |
| Navigation | Desktop project rail floats open on hover and closes slowly. Keep click, keyboard and touch support. Projects directory has no rail. Team, Attendance and PIN move to the top bar. |
| Blueprint Overview | VONTA builds an overall summary from the drawing set and exposes department summaries by horizontal scroll. Browse the full register through View all blueprints, rail navigation and Blueprint management. Preserve all original files and revisions. |
| Metrics | The old seven-item Recent Work Pins list becomes a full-data chart. The second Recent activity area becomes budgets. The earlier seven-row cap only applies to surviving short lists elsewhere. |
| Account and audit | Account email is fixed. Password changes require current-email confirmation. Keep Account history; remove the History section from Project Settings. |
| Team | Team membership editing is restricted to Worker or Foreman. Dedicated identities stay protected. The former grants table is removed from Team. Preserve independent existing export/share entitlements behind the interface. |
| Attendance | Worker ID and a fresh selfie record presence. Izin supports private evidence documents as well as photos. Owner is exempt. Time is managed by the project. |
| Workspace | Keep drawings device-local. Add rulers, wall fill and compasses. A share link can be restricted or explicitly accessible to anyone holding it. Both links open a read-only view. |

## Confirmed decisions and working defaults

1. Confirmed by the product owner: VONTA composes the overall building summary from all approved relevant blueprint sources. A multistory building also needs a side elevation. Swipe or use arrows to view populated department summaries. Each upload requires a department binding. Electrical and Plumbing share one coordinated summary slide, confirmed by the product owner. Their staffing, work and budgets remain distinct.
2. Confirmed by the product owner: a registered Owner, Contractor, Architect or Accounting account can enter another project by invitation and retains its dedicated role in that project. Show the registered type and lock the invitation role. Offer Worker/Foreman only for standard worker accounts. Existing membership and the creator’s own project remain valid. Provide no discovery or self-join route into another project. Anyone-with-link viewers receive no membership and no directory listing.
3. “Age at work” means elapsed time since joining this project. “Attendance %” means the share of eligible finalized worker-days recorded Present. Use the English product term Foreman for Mandor. HR describes the operational task. Use existing authorized staffing scope.
4. Money charts show posted department usage using the established Accounting budget basis, with material issues valued at issue time. Label it clearly. Show commitments separately from posted use. If the live source has only receipts or lacks the budget ledger, show a missing source. Never invent expenditure.
5. For Pin bars within one department, place Approved and Outstanding on X and count or percent on Y. Show a progress line over time as a separate visual encoding. The requested two quantities can then be compared on one scale.
6. Default day/month/year uses project time. Set a monthly allocation per department and show the balance as of the selected date. Keep historic membership, department, budget events, and original file identity.

## Reading order

02 defines screen placement and sheet management. 03 defines department identity, charts and budgets. 04 defines accounts, Team, attendance and sharing. 05 defines spatial tools and PIN. 06 maps acceptance tests and research. 07 is the copyable implementation prompt. Open `08-Dashboard-Layout.html` or `09-Blueprint-Layout.html` in a browser. The second example uses all 20 sheets of the supplied Garden Suites C01 concept set, actual plan and elevation pages, and one shared Electrical + Plumbing summary. Department assignments in the example are illustrative.
