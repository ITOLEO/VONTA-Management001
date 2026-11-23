# Layout, navigation and blueprint register

## Screen changes by reference

| Ref | Screen and required change |
| --- | --- |
| 01 | Account Settings. Highlight the section crossing the fixed header as the user scrolls, including the last short section. |
| 02 | Security. Display the registered email as a value. Offer old password, new password, confirmation, and a challenge to the registered email. |
| 03 | Profile. Show a photo, display name and smaller email on a second line. Use initials when there is no photo. |
| 04 | Overview. Show the generated whole-building summary first, with side elevation for multiple stories, horizontal department summaries and View all blueprints. |
| 05–06 | Preserve the size of the operational chart region across All, one department, no data and long results. Replace list content with the charts in 03. |
| 07 | Project rail expands over the content on hover. It remains reachable through the toggle and keyboard. |
| 08 | Team in the top bar. Use the available main width for four columns. Show department and profession filters. |
| 09 | Attendance in the top bar. Provide Manual attendance and Attendance roster. Use project schedule, worker ID and fresh selfie. |
| 10 | Workspace. Replace the flat panel with grouped drawing tools that open downwards. Keep marks local. |
| 11 | Workspace building areas update from the blueprint register. Provide Blueprint management in the Overview rail. |
| 12 | Remove the demo persona selector from the Workspace. Keep the signed-in profile in the header and test-persona setup outside this work surface. |
| 13 | Share. Give Restricted and Anyone with the link choices. Show Viewer for both. Use a separate invitation flow for project membership. |
| 14 | Pin editor. Keep swatch buttons. Use the four department defaults initially and a manual picker below. |
| 15 | Workspace dock. Use a Department popover styled like Rooms. Rename Pins to All and reset the related filters. |
| 16 | Rename Work to PIN. The left rail controls department. The in-page chips control status. Add project-date filtering and List / Kanban. |
| 17 | Remove Project Settings > History, its card and misplaced links. Keep underlying event records and relevant record histories. |
| 18 | Gallery reference only. Use a large drawing, previous/next, close, and a thumbnail strip. Supply VONTA content, font, colors, and actions. |

## Project shell

Sign in → Projects → full Project Overview → explicit Open workspace. Use the project top bar for Overview, Workspace, PIN, Warehouse, Accounting, Team and Attendance. Preserve the project selector, authorized visibility, local clock through seconds before the profile, and account block at the right. At smaller widths use a labeled overflow menu. Keep the active module visible. Preserve old /work and /users deep links, including Pin detail, query filters, demo/live context and return destinations.

Use an icon rail when collapsed. For a fine pointer, make the expanded rail an overlay. Suggested starting values: 120 ms opening transition, 280 ms close delay and 220 ms closing transition. Cancel pending close when pointer or focus returns. Keep the overlay open while a user types in Search, opens a filter, or navigates its list. Toggle by click/Enter/Space on touch or keyboard. Escape dismisses a transient rail and returns focus. Respect reduced motion. Reserve only collapsed width so opening never moves the camera, graph or full-width table. A persistent click-open state stays until the next deliberate close.

For Account scroll tracking, observe the actual scroll container under the sticky header. Select the section whose heading most recently crossed the reading line. At the end, select the final section even when it cannot reach that line. Update one active link and aria-current. On menu click, scroll to the anchor with the header offset. Avoid jump loops, forced focus on wheel scroll, or a new browser-history entry per scroll. Direct anchors, keyboard navigation, browser Back, and manual scrolling must agree.

## Blueprint Overview and gallery

In the left rail put Overview first, then a divider and the Blueprint heading. Place Blueprint management, Search blueprints, a compact category filter beside search, and the drawing list below. Support drawing code and name. Offer Civil, Electrical and Plumbing at minimum. Include Finishing and other populated disciplines. Keep a separate sheet-classification field for coordination/architectural sheets that do not belong to one budget department. All clears the category. Show floor/area, sheet code and revision on distinguishable rows. Sort predictably by discipline and natural sheet number. Offer an internal scroll region; keep search reachable.

The first view is one VONTA-generated summary of the whole building. Assemble the plan or building footprint and relevant source-backed information from the registered set. For two or more levels include a side elevation with floor labels. Reuse a correctly oriented source elevation or render an orthographic elevation from the verified aligned model, labeled as derived. Preserve scale labels separately for each view. When no reliable side view exists, show “Side elevation needs a source or verified model.” A reviewer can trace every included view to a sheet, page and revision. Keep zoom, fit and the original files.

Immediately below or within the same panel, offer a horizontal strip with one summary per populated department or shared discipline group. Four populated separate drawing categories can yield four summaries. Omit empty departments. Civil and Finishing retain their own views. An Electrical + Plumbing source can be assigned to both departments in a single operation and stored once. Show exactly one shared Electrical + Plumbing slide for their coordinated drawing set. Display both department labels. The Electrical and Plumbing filters must both find it. Separate supplemental electrical or plumbing drawings retain their own classification. Keep each workforce, Pin filter, color and budget independent.

Recompute only affected summaries when a source revision changes. Record the input revision set and generation status. During regeneration show the last reviewed summary as an earlier version, or a clear initial empty state. Avoid blending inconsistent scales, levels or north references. Flag conflicts for review. A summary is a navigational drawing with provenance, never permission to publish construction geometry.

View all blueprints opens a modal lightbox over Overview. Show one large page, filename or drawing name, code, revision, area and a horizontal thumbnail strip; highlight the selected drawing. Support arrows, keyboard Left/Right, Escape, focus return and touch. Provide Open drawing for details. The modal uses the current search/filter when entered from the rail. Keep the main dashboard cover selected after the modal closes. Load small thumbnails progressively and render high resolution only for the active drawing. Test 60 or more sheets, duplicate names, a multi-page PDF, missing previews and a currently superseded revision. Sixty is a workload example, never a product limit.

## Single drawing page

Show the full blueprint first. Give it usable zoom/pan, Fit, Enlarge, revision and source file access subject to rights. Under it, render a structured, readable transcription. Use the information actually present on that sheet.

| Detail group | Fields when available |
| --- | --- |
| Identity | Drawing code, title, sheet/page, revision, issue date, author or issuer, discipline, project, floor/area, drawing purpose. |
| Geometry and criteria | Scale and units, grid axes, levels and datums, north reference, dimension strings, sections and elevation references. |
| Construction content | Named elements, structural or service symbols, schedules, notes, material specifications and keyed details. For MEP, distinguish a schematic from a physically located route. |
| Provenance | Source filename, page and note or region reference for each extracted group, revision, review status, conflicts and missing values. Preserve the original wording for critical annotations. |

Mark uncertain extraction “Needs review” and missing values “Not specified on this sheet.” An authorized reviewer checks the transcription against the source. Do not invent wall thickness, elevations, pipe routes, structural adequacy or construction criteria. A drawing register can contain plans, schedules, sections and details. Each kind has a useful page even when it supplies no independent geometry.

## Blueprint management and 3D

Make management reachable directly below Overview. A Contractor can add drawings, associate them with an existing area or create a new physical area, replace revisions and review the generated summary and its source mappings. Require one department or the combined Electrical + Plumbing assignment before accepting an upload. Label a whole-building sheet by its responsible department and optional cross-discipline scope. Reuse the existing preview and replacement lifecycle. Filters: department/discipline, area, and name or code. For each result show only required material: left source preview, right orbitable 3D preview or a precise processing state, and a compact line with code, area, title and revision. Provide a disclosure for source-backed notes, View drawing details, and Open this area in 3D. Opening a result selects the matching rail entry.

| Event | Drawing register | Workspace result |
| --- | --- | --- |
| Upload accepted | Show a durable row and job ID. A multi-page PDF can have several sheet records linked to the same original. | Update the area list after a confirmed mapping. Multiple drawings on one floor share the area. Show processing or reference-only status. |
| Extract and build | Validate sheet type, scale/calibration, units, dimensions, reference frame, orientation and vertical data. The AI proposes semantics. Deterministic code builds real selectable geometry for supported inputs. | Show a draft preview or a reason for failure. Reference-only sheets can support another model. Do not create 60 superimposed models from 60 drawings. |
| Review and publish | Identify ambiguities and source provenance. A Contractor verifies the result and publishes the reviewed version. Report job success separately from publication. | Invalidate relevant project queries. A verified published area becomes available across sessions without hard refresh. A failed replacement keeps the previous published version active. |
| Replace or retry | Preserve source revisions and history. Make retries idempotent. Display upload, queued, processing, review required, published, failed/retry, or reference-only as appropriate. | Keep stable area IDs and model-version references. Flag old Pins that need revalidation. Only combine models with verified shared origin, scale, elevation and orientation. |

Use the existing project authentication, private file storage and asynchronous processing paths. On demo data, identify fixtures and simulated states. On provider failure show a recovery action and the real cause category. Keep the source file accessible. No demo scene may stand in for a generated building.

## Data relationships and rollout

Use stable project keys for departments, physical areas, source files, sheet pages, revisions, summaries, jobs and models. Give sheet revisions a many-to-many department binding. For a combined source, insert Electrical and Plumbing bindings; reuse the one source, page and revision. Keep project ID on joins, and reject cross-project links. A file can hold many pages; an area can have many sheets; a model can cite several source revisions. A summary references an ordered set of those revisions, its verified orientation, generation status and review state. A new revision invalidates affected derived previews without overwriting issued originals.

Migrate old single-area/single-sheet projects into this catalog incrementally. Seed defaults idempotently, preserve original IDs where possible, and backfill established data from known mappings. Flag any unmapped historical sheet or membership for review. Require a department on new uploads. Keep old view URLs functional through aliases. Make metadata/thumbnail reads lightweight for 60+ records; lazy-load original PDFs and 3D assets.

## Visual review

Use the original navy, orange, neutral palette, Inter, existing text-size adjustments and source notices. Align the controls to content and retain keyboard focus indicators. Use real figure captions, readable drawings and actual empty states. Avoid generic illustrations, copied third-party branding, fabricated avatars, ornamental gradients, and giant empty panels. Capture changed pages at 1440 × 900 and check a narrow laptop and phone. Compare protected regions, particularly camera, source drawing and inspector, with the original behavior.
