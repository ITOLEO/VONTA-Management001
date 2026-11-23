# VONTA Management | Screens and user flows

**Design and copy contract · 20 November 2026**

Use the existing VONTA wordmark, Inter, navy hierarchy, warm-orange actions, neutral surfaces, visible keyboard focus, and real dark-mode tokens. Use the existing UI language. The examples below use English interface copy with the operational terms **Alfa** and **Izin**. Display a short definition the first time the term appears.

## Attendance in the selected project

| Surface | Place and behavior |
| --- | --- |
| Worker’s attendance | Under the existing Attendance destination, show work date, shift, project timezone, cutoff, current attendance, and a separate request status. Give the eligible worker a primary Check in or Request izin action, as appropriate. Keep a visible Request izin action after Alfa. |
| Before cutoff | Example for an 08:00 shift: “Check in before 09:00 project time.” Count time from the server and display it in the project zone. At the boundary, refresh the roster or derive the same result on the server. Give the screen-reader announcement once when the status changes. |
| Alfa | “Alfa · Absent. No check-in was recorded before 09:00. You can request izin and attach a photo.” Preserve a link to the worker’s own status history. |
| Request form | Show project, worker, and scheduled shift as fixed context. Include a reason and photo input. Accept a camera photo or an existing image. Show a preview, remove/replace, retry, and submit. Keep the typed reason if upload fails. Validate the photo and reason before completing submission. |
| Review pending | Display “Awaiting Mandor review” beside the effective attendance status. An approved request shows Izin with reviewer and time. A rejected request shows the reviewer’s reason to the requester. Follow any existing resubmission process without duplicating a pending request. |
| Mandor review | Add a pending queue to the existing Attendance or User Management team surface. Each row identifies the worker, division, work date, shift, status, submitted time, and a restricted evidence action. The decision screen offers Approve and Reject. Require a reason for rejection. Identify the target shift in the confirmation. |
| No eligible Mandor | Keep the submitted request visible to its worker. Show “Awaiting Mandor assignment” to the authorized coordinator. Refresh the queue after a valid assignment is established. |
| History | The private attendance detail shows the chronological sequence from the initial status to a reviewed outcome. Team summaries only show information that the viewer can read. Keep photos, filenames, and medical details out of department charts and Workspace outputs. |

### Department dashboard

Keep one block per real department. The department filter applies to both charts. The donut counts approved work Pins / all eligible Pins, for example 9/10. Limit the recent list to the seven most recent distinct Pins total after filtering. An eighth Pin increases the total and can enter the list.

Show the daily attendance line with project-local dates. For a day whose attendance cutoffs have passed and whose roster is complete, show the counts for Present, Alfa, and Izin. Display the presence denominator and coverage in a text equivalent. For a department with 6 Present, 2 Alfa, and 2 approved Izin, display **6/8 present · 2 excused**. A pending request on an Alfa record keeps that worker in the denominator until approved. Recalculate the original work date when an approval or correction arrives.

Use individual people per department per day for the daily line. Use the existing roster’s primary attendance assignment for that worker-day. If a multi-shift setup lacks a single authoritative daily result, show it as unresolved. Keep its shift records separate. Compare the same finalized days for all departments in a period. Compute each department’s rate from summed counts. Show ties and zero-denominator states. Label incomplete current-day data. Exclude incomplete days from comparative rankings and disclose the comparison dates.

## Workspace drawings

Put **Drawing tools** in a small independently collapsible toolbar inside the 3D viewport. Place it away from the model dock, inspector, and sidebar. Make the active tool readable in both themes. The toolbar appears only for eligible project roles.

1. The user opens Drawing tools. Show “Private on this device” and brief help: “Saved for this account in this browser. Excluded from downloads and shared links.”
2. The user picks Pan, Brush, Line, Arrow, Circle, Ellipse, Square, or Rectangle. Expose stroke thickness when a drawing tool is active. Use accessible control names and an active-state indicator.
3. On a valid surface, show a preview. Commit the finished mark locally. Escape cancels the incomplete stroke. Pan, Add pin, and Draw use separate input modes. Existing model navigation returns on exit.
4. Allow the user to remove an accidental mark of their own. Collapsing the toolbar preserves marks. After a refresh, restore only the same account’s marks for this project, area, and model version.
5. If storage is unavailable or full, explain that the current drawing is temporary. If the user switches accounts, projects, or loses access, clear rendered marks immediately. Reuse the existing viewer for people who can view the project but cannot annotate.

## Workspace download and share

Place **Download view** and **Share view** in the Workspace header or its compact actions menu. Keep them within the Workspace and separate from Add pin, drawing tools, and original blueprint files. In a narrow viewport, keep authorized actions reachable through a labeled menu. Provide a brief description at each action.

| Action | Interaction | Result or recovery |
| --- | --- | --- |
| Download view | Authorize the current project, then capture the permitted model view at the current camera and visible project layers. Keep any demo or unverified-model notice in the output. | Deliver a PNG with a readable project-based filename. Exclude private marks, open inspectors, account controls, evidence photos, and app navigation. Show capture errors with Retry. Never offer an empty or stale-project PNG as success. |
| Share view | Explain “People with access to this project can open this view.” Create a project-scoped reference to permitted view state. Offer Copy link and the native share sheet when available. | Show “Link copied” only after clipboard success. If clipboard access is unavailable, show a selectable URL. Cancelling the native sheet returns to the Workspace. |
| Open shared link | A signed-out visitor signs in, then returns to the referenced view after access checks. Existing members see only the model and layers they may open. | An unauthorized or revoked recipient sees the existing access-denied screen. An unavailable revision shows a clear message and a safe authorized route back. A link never adds membership. |
| Manage permissions | Reuse the existing member-access form. Show independent Download workspace view and Share workspace view grants for eligible non-default members. | Changing one permission leaves the other unchanged. Explain the role-based entitlement for active Owners and Contractors. Reflect revocations in open sessions on the next protected action. |

## Integrate the eleven earlier screenshot changes

| Reference | Required surface after this revision |
| --- | --- |
| 1 · Projects | Sign in → Projects → full Project Overview → explicit Open workspace. Keep Projects without a left rail or reserved gutter. Keep search, creation, edit/delete actions, and profile. |
| 2 · Workspace sidebar | Building areas at the top, All areas, selectable area rows, authorized Add area. Footer order: Pin list, divider, Model info, divider, Project settings. Click or keyboard toggles the rail. |
| 3–4 · Model dock and Pin editor | Remove the visible Fit Model action from the model dock. Keep Overall View, Rooms, Pin Focus, disciplines, and Add pin. All restores the full authorized project Pin list. Show compatible markers on the loaded model and require explicit navigation for other models. Save per-Pin colors with named swatches. |
| 5 · Settings | A dedicated project settings page uses one left section navigation. Include Back to Project Overview, General, Project access, Blueprints, and Danger zone. Preserve old-password verification and existing project deletion confirmation. |
| 6 and 8 · Blueprint | Render the same clear viewer in Overview and Settings. Keep blueprint Fit and the existing detail dropdown. Add Browse blueprints for switching files. Below Settings preview, show the original source and authorized file actions. Remove the misplaced History card and shortcuts. Keep the actual audit records. |
| 7 and 10 · Overview | Project summary left, large source blueprint right, operational metrics below. Add department blocks, the seven-Pin preview, and the attendance trend defined above. |
| 9–10 · Profile and time | Account opens full Account Settings. Light, Dark, and System work after refresh. Project timezone lives in Project Settings. The in-project profile shortcut opens the same picker. Show project weekday, date, time to seconds, and zone immediately before the profile. Support worldwide IANA zones, UTC, DST, and fractional offsets. |
| 11 · Workspace | Retain the current 3D viewport, selectable geometry, camera, inspector, and bottom dock. Add private drawing tools and the two authorized output actions. Protect labels and drawing legibility in both themes. |

Use a provisional increase of 3–4 CSS px for existing small text. Enlarge control height and available content width to fit. Review the 3D canvas with the sidebar and inspector both open. Light, dark, keyboard, touch, loading, empty, denied, expired-session, and retry states belong to the same flow. Keep the earlier approved landing layout, project modules, and five MVP workflows.
