# VONTA Management — Layout System

**Review edition 1.0 · 20 November 2026**

Product owner: ItoLeo. Companion to the English Product Brief and PRD. Use the latest layout decisions in this document for the referenced screens. The figures are the 15 Supabase screenshots supplied by the product owner, in message order. Diagram labels identify regions. Continue to use approved VONTA interface copy.

## 1. VONTA layout system

*Figures 4, 7 and 9*

Use the top bar to change modules. Use the left rail to navigate within the active module. Use the main work surface to select a blueprint area or a room.

**Region order.** Top bar: VONTA, project context, authorized modules, profile at far right. Below: contextual rail at left and page content to its right. Project settings stays at the foot of the rail when a project is active.

| Region or decision | Layout rule |
| --- | --- |
| Entry sequence | Sign in → Projects → select a project → full Project Overview → Open workspace. Keep the directory step when the user has one project. Overview is a page. It never opens over the model. |
| One shared shell | Keep the top bar and rail in the same positions as the user switches modules. A visible module label identifies the active context. Keep one selected rail item for the current destination. |
| Rail interaction | Start with an icon rail. Click or tap its toggle to show labels. A second activation collapses it. Enter and Space operate the same control. Hover or keyboard focus alone leaves its width unchanged. Keep the toggle and active item visible. Working desktop dimensions: 56–64 px top bar, 48–56 px rail, 220–248 px expanded. Treat them as layout defaults. |
| Design authority | This companion to the Product Brief and PRD specifies placement. Use VONTA’s existing English copy, Inter, navy, warm orange, light surfaces and spacing tokens. Apply the same shell to Owner, Contractor, Worker with Mandor permissions, and Accounting with warehouse access. Existing permissions determine visibility. |

**Review check.** Open a project, switch from Workspace to Warehouse, then to Accounting. The rail stays in place, its contents follow the selected module, and the project and profile remain visible.

## 2. Public landing

*Figures 1–3*

Give visitors a clear entry point and enough visual evidence to understand how VONTA connects a drawing, an assigned task and work on site.

**Region order.** Compact header → two-column hero → construction feature grid with one lead tile → grouped footer.

| Region or decision | Layout rule |
| --- | --- |
| Header and hero | Align the wordmark, approved public links and account action on one row. Align the hero to the same content edges. Put the approved headline and primary CTA in the left column, with the explanation in the right column. Use the existing session-dependent Sign in / Open dashboard action. Open a selected public view at its heading. |
| Feature grid | Use a four-column desktop grid. Give Blueprint-to-3D the first two columns. Use the two narrower cells for Spatial Workspace and Work & QC. Use the next row for Warehouse & Materials and Verified Progress. Let both span two columns. Place the approved Accounting explanation with material costs. Keep attendance within team context. |
| Construction illustrations | Use a dimensioned drawing paired with its greybox view for conversion, a selected Pin for spatial work, and an approved before/after pair for QC. Material tiles may show a relevant delivery or stock detail. Crop within the tile and keep text on a clear surface. Use public or cleared assets. Keep A-03’s synthetic label with its preview. |
| Footer | Put the VONTA identity at left and group existing public destinations to the right. Reduce the column count to match the available links. Align the footer to the hero. Omit borrowed social accounts, client logos, newsletters and pricing links. |

**Review check.** At phone width, read the headline, explanation and CTA before the first feature. Every illustration relates to the adjacent construction task. A visitor can reach the account action without reading the grid.

## 3. Projects directory

*Figure 4*

Make project selection the first signed-in task. Provide one clear action for opening a project and a separate entrance to team management.

**Region order.** Context and profile → directory rail → Projects title → search, status and sort → grid/list switch and Create new project → project cards or rows.

| Region or decision | Layout rule |
| --- | --- |
| Directory toolbar | Place search, status and sort at the left. Put the existing grid/list switch and authorized Create new project action at the right. Let controls wrap before the title or search field is squeezed. Use the same positions for populated and empty directories. |
| Project entry | Give each project its recorded name, role and project/model status. Open the full Project Overview from the card or primary action. Keep authorized Edit project and Delete project in the card menu. The selected project sets the context for both actions. |
| User Management location | Place the entry in the Projects rail. Within a selected project, use that project’s members and permissions. Proposed directory behavior when no project is selected: selecting User Management asks the user to choose a project before the team page opens. This is one of the two review decisions. |
| Right side of the reference | Use the available width for cards and rows. The reference’s billing panel and platform banner have no VONTA content assignment. Keep a genuine empty directory distinct from an unsuccessful search or a failed load. |

**Review check.** From Projects, identify where to create a project, open its Overview and reach its team. No team table can mix members from different projects.

## 4. Team and project settings

*Figures 5 and 6*

Team management works best as a table. Project settings needs a section menu and a readable form. Both pages display the selected project.

**Region order.** Team: title → toolbar → member table → count/pagination. Settings: project rail → section menu → grouped form rows → actions.

| Region or decision | Layout rule |
| --- | --- |
| Team table | Put search and the approved role, division and membership filters above the table. Align Invite members to the right for authorized users. Use member identity, project role, division, membership status and permitted row actions. Keep invitations and team history in their existing sections. Attendance stays under User Management. |
| Settings structure | Keep Project settings at the bottom of the selected-project rail. Open a page with a secondary section list and a main form. Use the approved groups for General, Project access, Blueprints, History and Danger zone. Show the active project name in the header. |
| Settings rows | On desktop, put the label and essential help on the left, and the field on the right. Put the existing Save or Cancel actions at the bottom right of the relevant group. Apply this to project and contractor names, project timezone and the project password change form. |
| Project danger zone | Keep Replace blueprint, Remove blueprint and Delete project at the bottom of Project settings. Each row names its target. The project-delete confirmation shows the selected project name and the existing typed confirmation. Place Cancel and the destructive action together after the confirmation fields. |

**Review check.** The Contractor can distinguish editing a member, changing a project password and deleting a project by their page titles, project context and action positions.

## 5. Project Overview

*Figures 7 and 8*

The upper band answers two questions together: which project is open, and which drawing supports the work shown below?

**Region order.** Project header → project details left and large blueprint right → operational summary row → reports and recent activity.

| Region or decision | Layout rule |
| --- | --- |
| Upper left | Start with the project name. Group status, active model version, verification state and relevant exceptions under it. Use the approved Open workspace action here or next to the preview. Use one primary entrance to the viewer. |
| Upper right | Give roughly half the desktop content width to the source blueprint. Put the downward-opening area/sheet/revision selector in the preview header. Fit the complete selected sheet by default. Keep zoom/fit and source state close to the drawing. Selecting a sheet updates its caption and drawing together. It is a preview selection. |
| Below the fold | Place verified progress, stage readiness, pending QC, blocked work and material exceptions in a compact row that wraps. Follow with the existing reports and recent activity. Use charts only where recorded data supports them. Keep the underlying count or link readable. Use genuine empty or unavailable states. |
| Smaller screens | Stack the project context first, the blueprint second and the operational summaries third. Preserve access to the sheet selector. Reserve the preview region during loading. When a source is missing, show the existing empty state in that same location. |

**Review check.** Open a project with two drawings. Select each in turn. The correct preview changes on the right. The page stays in Overview and the active model version stays the same.

## 6. Spatial Workspace

*Figure 9 · VONTA viewer*

Separate page navigation from model selection. The left rail contains Workspace destinations. The blueprint area control sits inside the workspace.

**Region order.** Top module bar → contextual rail → inside the viewer: area control near upper left, canvas in the center, selected Pin Inspector at right, model controls at bottom.

| Region or decision | Layout rule |
| --- | --- |
| Area selector | Place the current area and a disclosure control inside the workspace, above the model at the upper left. Opening it shows All areas, a scrollable list of large area rows and the authorized Add area action. Display real area names. Keep the chosen area visible when the list closes. |
| Workspace rail | Use existing workspace destinations such as the Pin list and Model info. Reuse their established panels and actions. Keep project settings at the rail foot. Area names, All areas and Add area belong to the in-view selector. Rooms stays in the bottom dock. |
| Viewer and Inspector | Give the existing 3D scene the largest region. Open the existing Inspector on the right for the selected element or Pin. Retain camera presets, picking, markers, source layers and evidence links. Changing layout width must preserve the camera and selection. Keep demo/source notices readable once within the viewer. |
| Bottom dock | Keep Fit Model, Overall View, the upward Rooms picker, Pin Focus and layer toggles together. Place Add pin beside the layer group. Keep Add room in the room workflow and Add area in the area selector. On a phone, keep the selected area and primary action reachable and use the existing inspector sheet. |

**Review check.** Focus the second of two Pins on one wall. Expand and collapse the rail, then open and dismiss the area selector. Camera, selected Pin, highlight and Inspector still match. Choosing a different area changes the visible scope. Use the A-03 2,875 mm cross-check as a geometry regression reference.

## 7. Warehouse and Accounting

*Figure 9 · contextual navigation*

The top bar selects the module. The left rail lists authorized destinations in that module. The main region displays the selected destination.

**Region order.** Same project bar and rail frame → active module and destination → module content or the approved development screen.

| Region or decision | Layout rule |
| --- | --- |
| Warehouse | Keep Warehouse in the top bar. Group Inventory, Store Requests, Purchase Requests, Market List and Goods Receipts in its left rail. If the approved top dropdown is present, it is a shortcut to those same destinations. Support a long list with internal rail scrolling. |
| Accounting | Keep Accounting in the top bar. Use its left rail for the approved budget, receiving cost and internal department usage views. Position the applicable History entry near its records. Distinguish the two cost views with their existing labels. |
| Current development screens | Retain the module navigation and project context. Center the existing VONTA mark, destination name and approved development status in the body while a destination is unfinished. Apply the same rule to unfinished Users or Attendance views. The Team table on the earlier page describes the target layout when enabled. |
| Across the application | Use the same active marker, spacing, group dividers, click toggle and settings location. Keep only links the account is allowed to access. When a module changes, update its rail and content together. Reuse this pattern on other approved pages. |

**Review check.** Switch from Workspace to Warehouse and then to Accounting. The top selection and left destinations agree. The blueprint area picker appears only inside Workspace.

## 8. Profile menu and account settings

*Figures 10 and 11*

Open a compact menu beneath the top-right avatar. Open the full Account page for profile edits and longer forms.

**Region order.** Profile menu: identity → account destinations → theme → timezone → sign out. Account page: header → settings section list → centered form column.

| Region or decision | Layout rule |
| --- | --- |
| Profile popover | Right-align the menu to its trigger. Put the user name and email first. Group Account, appearance options, timezone and Sign out with dividers. Show the current theme and timezone. Keep Light as the default. The menu closes on Escape or outside activation and returns focus to its trigger on keyboard dismissal. |
| Reference-only items | Changelog is excluded by explicit request. Figure 10 also shows Feature previews and Upgrade to Pro. Their inclusion conflicts with the layout-only scope and earlier product decisions. Their placement is pending owner confirmation. The current review layout leaves both out. |
| Account page | Use the account header, a Back to dashboard control and a local settings list. Center the form column within the remaining space. Put existing name, contact phone and account email fields in grouped rows. Place account password and other established security actions in Security. Place personal change history in Account history. |
| Separate contexts | Account settings identify the signed-in person. Project settings identify the selected project. A return from Account restores the applicable authorized context. Never reproduce personal identities, account identifiers or URLs visible in a reference image. |

**Review check.** Open the menu by keyboard, inspect the selected theme and timezone, then open Account. The profile fields identify the user; project fields appear only in Project settings.

## 9. Preferences and deletion

*Figures 12–15*

Keep long settings readable by grouping related controls. Give a destructive action its own final section and identify the object it affects.

**Region order.** Appearance choices → display timezone → existing preference groups, if available → account deletion warning as the final block.

| Region or decision | Layout rule |
| --- | --- |
| Appearance and timezone | Use a small theme preview grid with the existing System, Dark and Light choices where supported. Put the timezone in a separate row with its current value on the right. These displays use the same account preferences as the popup. Project dates continue to use their configured project timezone. |
| Long preference panels | Figures 13 and 14 show how to align labels with compact right-side controls. Use that pattern only for preferences already available in VONTA. The persistent section menu helps users return to Security or History on a long page. Avoid importing editor shortcuts, analytics controls or theme sliders. |
| Account deletion | Put the account warning last on the Account page. Use a warning icon at left, a concise consequence in the center and the account action at right. The confirmation names the current account. Display only the actual approved consequences and timing. Account deletion policy and retention are separate product decisions. |
| Project deletion | Reuse the warning-row proportions in Project settings. Name the project in the confirmation. Keep the approved DELETE + fixed PROJECT + exact current project name interaction. A project confirmation must never invoke an account action. At phone width, place the action below the warning. |

**Review check.** Read the two confirmation screens in isolation. It is clear whether the target is a person’s account or one named project. The supplied Supabase retention period does not appear as VONTA policy.

## 10. Layout review

*Acceptance checks · all 15 figures*

Use these checks to review a design or a running build. The diagrams specify placement and are not evidence of completed functionality.

**Region order.** Review desktop first, then tablet and phone. Record page, viewport, action and observed result for each failed check.

| Region or decision | Layout rule |
| --- | --- |
| Desktop and tablet | At 1440 × 900, inspect the landing columns, the directory toolbar, the Overview drawing and the docked rail. At 1024 and 768 px, shrink the secondary navigation before it crowds the content. Keep controls reachable and table headings associated with their rows. |
| Phone | At 390 and 360 px, stack landing and Overview content, collapse local section menus to an accessible chooser and place the profile popup inside viewport bounds. Keep touch targets around 44 px. Contain wide tables within their own scroll region. |
| Interaction states | Check loading, empty, unavailable, error and permission-limited views inside the same page regions. Keyboard focus must reach the rail toggle, area picker, blueprint selector, profile, settings sections and Cancel. Opening a menu must not move focus to the 3D canvas or reset it. |
| Review decisions | Confirm the directory-to-team selection when no project is active. Confirm whether Feature previews and Upgrade to Pro in figure 10 have approved VONTA equivalents. Until confirmed, use the conservative placements specified in this document. |

**Review check.** Layout approval covers placement, reading order and navigation behavior only. Use the PRD acceptance tests separately to verify 3D generation, permissions, persistence and business transactions.

## Reference index

The file identifier is the six-digit time suffix in the supplied image filename. Use the figure numbers in the text for review.

| Figure | File suffix | Screen | Layout pattern |
| --- | --- | --- | --- |
| 1 | 221236 | Landing grid | One wide lead tile plus smaller construction feature tiles. |
| 2 | 221320 | Landing footer | Identity at left; grouped existing links at right. |
| 3 | 221334 | Landing header and hero | Compact header, split introduction and CTA below the headline. |
| 4 | 221446 | Projects | Directory rail, title, toolbar, view switch and new-project action. |
| 5 | 221455 | Project settings | Section navigation beside grouped forms with local actions. |
| 6 | 221505 | User Management | Page title, filters, invite action and members table. |
| 7 | 221625 | Project Overview, upper | Project details at left and the project blueprint at right. |
| 8 | 221708 | Project Overview, lower | Horizontal summaries with reports and activity beneath. |
| 9 | 221726 | Contextual rail | Compact icons expand to labeled groups on click. |
| 10 | 222053 | Profile menu | Right-edge popover with identity, grouped preferences and exit. |
| 11 | 222202 | Account settings | Section list and centered account forms. |
| 12 | 222229 | Appearance | Theme options arranged as a compact choice grid. |
| 13 | 222241 | Timezone and preferences | Label at left, relevant control at right. |
| 14 | 222254 | Long settings page | Repeatable preference rows and persistent section context. |
| 15 | 222302 | Delete account | Final warning block with an explicit target and separate action. |
