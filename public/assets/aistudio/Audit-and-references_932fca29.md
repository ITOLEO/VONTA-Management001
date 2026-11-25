# Evidence and decisions

## Source baseline

Inspected archive: `vonta-management (3).zip`. It contains 218 entries. Its SHA-256 is `858de0ba6e076651cb6efff7178a21cbe22634edf74a3570e3b4bd5ea605727b`. Code inspection describes the export. Compare the active app at stage 00. Runtime behavior still needs browser evidence.

| Export location | Observation | Implementation consequence |
| --- | --- | --- |
| `src/App.tsx` | Public, sample and signed-in routes have different entry points. Both PIN route families keep a legacy work path. | Trace each entry and shared component. A pass on sample data covers only that environment. |
| `src/index.css` and `src/pages/LandingPage.tsx` | The root uses Inter. Multiple landing containers use a 1200 px maximum. Local fixed text sizes occur in page components. | Define type by role. Widen the actual wrappers and adjust the hero and navigation. Verify font loading. |
| `src/components/ContextualRail.tsx` and `src/context/LayoutShellContext.tsx` | The rail changes between 52 and 256 px. The layout reserves 52 px. Hover closure already has a delay. A Boolean drives persistent expansion. | Reserve the expanded width only in Expanded. Check the icon centers as well as rail width. Preserve the hover delay. |
| `src/components/ProjectNavbar.tsx`, `PrivateNavbar.tsx`, `ProfileMenu.tsx`, `ProjectClock.tsx` | The account trigger renders an avatar before the text. It has a border and a chevron. Both headers use the clock. | Change the common controls and fit them to each header. Retain account menu actions. |
| `src/components/OverviewBlueprintRailSlot.tsx` | The register uses `max-h-[260px]`. | Let the register own the available vertical space. Fix the full parent flex chain. |
| `src/components/OverviewBlueprintHub.tsx` and both Overview pages | Whole building and single-discipline views have different wrappers. The preview has its own zoom group. The five sample overview KPIs use links. | Reserve the largest preview footprint. Remove the inline zoom group. Convert the five summaries to static output on both routes. |
| `src/components/DepartmentDashboardSection.tsx`, `src/domain/dashboardAnalytics.ts` | The three cards already specify 360 px. Current bars include outstanding work. The attendance plot uses a four-pixel minimum even at zero. | Measure plot bounds as well as outer cards. Draw approved counts only, and leave zero bars at zero. |
| `src/components/BudgetDashboardSection.tsx`, `src/domain/budgetLedger.ts`, `src/pages/PrivateProjectOverviewPage.tsx` | Current budget rings use 8 rem boxes. The signed-in caller in this export passes an empty ledger and disables department creation. | Resize rings without changing balances. Verify the real authorized data adapter. An absent adapter is an open integration item. |
| `src/pages/WorkListPage.tsx`, `src/pages/PrivateProjectRoutePages.tsx`, `src/utils/moduleNavConfig.ts` | The sidebar selects the department. In-page status and exception controls perform different work. The private PIN page starts from default department seeds. | Remove only a second department selector where it exists. A selected department badge can stay. Check the fifth department in both environments. |
| `src/pages/SpatialWorkspacePage.tsx`, `PrivateProjectRoutePages.tsx`, `src/components/DepartmentPicker.tsx` | Pin filtering and technical layer visibility use different state. The sample inspector reserves 390 px on desktop. | Use two labeled popovers. Preserve both state paths. Overlay quick views. |
| `src/components/SpatialViewport3D.tsx` | Ruler label sprites carry an annotation ID. The hit list collects flagged meshes. The ordinary click path selects Pins and elements. | Add mark selection and label hit testing. Test near, far and oblique views. This finding explains a possible failure path. Prove the repair in a browser. |
| `src/utils/privateDrawingStore.ts`, `src/domain/attendanceEngine.ts` | Private drawings have a versioned record and a local scope key. Drawing, download and share are separate capabilities. | Reuse scoped storage and authorization. Undo operates on local annotations only. |

## Screenshot trace

A refers to the first audit batch. B refers to the Supabase rail and Photoshop batch. C refers to the last PIN screenshot. Match by subject when image order differs. A duplicate profile crop appears in one upload.

| User reference | Revision | Stage |
| --- | --- | --- |
| A01, A19 | Right-aligned portrait, name and email first, larger unboxed clock | 03 |
| A02, A03–05 | Full-height sheet register, stable preview, remove the inline zoom group | 04 |
| A06 | Five centered, compact, static KPI summaries | 04 |
| A07, A13–16 | Stable plots, approved-only Pin bars, English attendance labels, remove partial-coverage copy and corner icon | 05 |
| A08–10 | Public navigation, larger type, wider landing composition, short VONTA copy | 01 |
| A11–12 | Remove repeated demo-status labels throughout the interface | 01 |
| A17–18 | Budget rings at 1.5×, right-side Add department, inset carousel arrows | 06 |
| A20 plus B01–02 and B04 | Fixed logo and icon position, rail controls and three modes | 02 |
| B03 and B05 | Feedback, search, icon names, Help and Advisor Center | 03 |
| B06–08 | Broader Overview, overlay rail, left/right chart controls | 02, 04–06 |
| B09–11 | Group tools, select strokes and ruler labels, delete, undo and redo | 09 |
| B12–13 | Transparent compass and collapsible authorized output controls | 08 |
| B14 | Separate popovers for Pin filtering and 3D layers | 08 |
| B15 | Right-side previews overlay the page and preserve camera placement | 02, 08 |
| C and the final PIN clarification | Remove a duplicate department selector. Keep the status row and exceptions. | 07 |

## Decisions that supersede older instructions

1. On PIN, the sidebar selects the department. The in-page toolbar keeps work status, material exceptions, date, search and other existing controls.
2. In Workspace, the left popover selects Pin filters. The second popover sets 3D layer visibility. The All pins reset belongs in the first popover.
3. Advisor Center opens a panel in its intended shape. Show an unavailable message inside it. Feedback also shows an unavailable state.
4. Use the Supabase type roles. Keep VONTA colors, terms and project data. The user wants the reference geometry and spacing for the landing navigation and page.
5. Remove routine demo badges from pages. Distinguish entry into a sample project. Source verification, missing service and access states must remain truthful.
6. Absence and leave labels change in the UI. The existing 60-minute cutoff, approval rule and stored status keys remain valid.
7. Current work is an incremental revision. Treat the older numbered release files as history when they conflict with these decisions. The new stages do not repeat that release.

## Source register

| Reference | What it supports |
| --- | --- |
| [Supabase landing page](https://supabase.com/) and user screen A09 | Left product menus, separated account actions, prominent hero with two columns and a wide content grid. Use real VONTA links. |
| [Supabase typography implementation](https://github.com/supabase/supabase/blob/master/apps/design-system/app/layout.tsx) and [typography utilities](https://github.com/supabase/supabase/blob/master/packages/config/typography.css) | The design system binds Inter to sans text and Manrope to headings. VONTA sizes in stage 01 are starting values informed by the supplied images. |
| [Supabase layout](https://supabase.com/design-system/docs/ui-patterns/layout) and [sidebar design discussion](https://github.com/orgs/supabase/discussions/34794) | Use width according to the task. Give dense tables and charts enough room. Support explicit sidebar modes. |
| [Supabase copywriting](https://supabase.com/design-system/docs/copywriting) and [Impeccable source](https://github.com/pbakaus/impeccable) | Use specific action text. Review borders, repeated headings and decorative labels against a real field task. |
| [W3C hover and focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) and [carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) | Allow pointer travel, dismissal, keyboard operation and named directional controls. |
| [ONS chart axes](https://service-manual.ons.gov.uk/data-visualisation/guidance/axes-and-gridlines) | Draw count bars from zero. Select the denominator and the period from the VONTA definition. |
| [Adobe grouped tools](https://helpx.adobe.com/photoshop/desktop/get-started/set-up-toolbars-panels/show-or-hide-tool-tips.html), [Adobe Undo and Redo](https://helpx.adobe.com/photoshop/desktop/get-started/set-up-toolbars-panels/use-undo-redo-commands.html), [Three.js Raycaster](https://threejs.org/docs/pages/Raycaster.html) | Use a small tool group, a clear active tool, reversible edits and input targets that the 3D picker can intersect. |
| [Google AI Studio Build](https://ai.google.dev/gemini-api/docs/aistudio-build-mode), [prompt design](https://ai.google.dev/gemini-api/docs/prompting-strategies) and [tokens](https://ai.google.dev/gemini-api/docs/tokens) | Use the current project, clear tasks, examples and short handoffs. Attachments also contribute to input size. |
| [ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf) | Prefer direct instructions. Define terms once and keep exact product labels. |
| User-supplied prompt references: 36-page and 17-page modules, Lee Boonstra’s 68-page guide, Anthropic’s two-page guide, and the 22-page UI reference module | Give each stage its own goal, evidence, constraints, expected result and stop point. Use one numeric example and an adverse case where they help. |

## Design decisions for this kit

The 72% landing width comes from the supplied wide screenshot. Treat that proportion as a desktop comparison target. Match the hero, logo, and feature row edges at the same viewport. For operational pages, preserve broad working space and keep prose to a readable measure. A stable card means stable bounds at one viewport. Responsive layout can change at a breakpoint.

The initial desktop sidebar mode is Expand on hover if the account has no saved preference. Search covers permitted destinations, blueprints and Pins in the active project. The Help action may explain existing controls. Undo history may end at reload. Saved marks must survive reload where persistent device storage is available. These are implementation choices for points the audit did not specify.

## Prompt rehearsal

A desk review followed each stage in order. Three likely execution errors were checked against the latest decisions. Deleting the in-page PIN status row fails PIN-1. Wiring the layer selector to the Pin department field fails WS-1. Populating the Advisor panel with sample alerts fails HEAD-2. A fourth check prevents the signed-in budget view from inheriting sample balances. No Gemini session or authenticated project was used for this rehearsal.
