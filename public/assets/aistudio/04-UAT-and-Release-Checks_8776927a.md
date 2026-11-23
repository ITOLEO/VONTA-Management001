# VONTA Management | User acceptance tests

**Attendance, drawings, download, and share · 20 November 2026**

This is a test plan. Record observed results after implementation. Use disposable test accounts, projects, and clearly labeled photos. Run clock-boundary tests using a controllable backend clock or the existing test clock adapter. Test the scheduled job with the browser closed. Mark a missing facility **Unverified** and name the dependency.

## Fixture

- Project Bali uses Asia/Makassar. Project Jakarta uses Asia/Jakarta. A worker can belong to both. Enable attendance only on explicitly scheduled work periods. Use a normal shift in Bali starting at 08:00 and one overnight shift starting at 23:30.
- Use an Owner, Contractor, two Mandors from the same division with different assigned teams, a worker assigned to each Mandor, and a non-member. Give one additional regular member download-only permission and another share-only permission. Test a Mandor with neither grant.
- Use two browser profiles or real devices and two different accounts in the same browser profile. Include a user with different roles in the two projects. Use an authorized view-only member as a link recipient.
- Use one known wall on two separate model versions, two Pins on one wall, at least eight recent distinct Pins across two departments, and two source blueprints. Use a conspicuous private circle for the PNG exclusion test.

## A. Attendance and Mandor review

| ID | Action | Expected result |
| --- | --- | --- |
| A01 | At 08:59:59 Bali time, accept a complete valid check-in, then run the cutoff job twice. | Present. Both job executions preserve the same accepted record. |
| A02 | Leave a separate worker unchecked. Read the roster just before and exactly at 09:00:00. Attempt first self check-in at 09:00:00. | No record yet before the cutoff. Alfa at equality. First self check-in at the boundary does not overwrite Alfa. |
| A03 | Close all clients before the cutoff. Let the scheduler run. Inspect persisted events, then reopen. Repeat with a temporarily delayed job. | Automatic Alfa exists after a normal job run. The effective time is 09:00. During a job delay the first read resolves Alfa immediately. Catch-up leaves one effective transition. |
| A04 | Submit a request at 08:30 with a reason and a valid photo. Leave it pending until 09:05. | Before cutoff display No record yet + Pending. At cutoff display Alfa + Pending. |
| A05 | From an Alfa record, submit a valid photo and reason. The assigned Mandor approves. Refresh the worker roster, history, and chart. | One request. Effective status becomes Izin. History retains automatic Alfa and approval. The original workday’s department counts update. |
| A06 | The assigned Mandor rejects a pending request after cutoff. Try another rejection without a reason. | Valid rejection preserves Alfa and displays the reason. An empty reason cannot complete rejection. |
| A07 | Approve one request before cutoff. For a second person, reject before cutoff and let them check in at 08:59. | First person remains Izin after the job. Second person becomes Present. |
| A08 | Submit with a missing reason, missing photo, failed upload, or a file belonging to another worker. Retry after a legitimate upload. | No invalid submission reaches the queue. Preserve form input on recoverable failure. Retry creates one reviewable request. |
| A09 | Have the other same-division Mandor try to review. Test self-review, a Mandor assignment that ended before the work date, a wrong project, and an ordinary Worker. | Each attempt is refused. No status change or private photo is disclosed. |
| A10 | Keep a request with no eligible reviewer. Assign a valid Mandor, then reopen their queue. | Worker sees Awaiting Mandor assignment. After proper assignment, only an eligible reviewer gets the request. |
| A11 | Race a pre-cutoff accepted receipt against the timer. Retry the job. Submit competing approve/reject actions. Approve a request after the worker already checked in. | One authoritative result per obligation. Valid earlier receipt wins. Only one review decision commits. A confirmed Present/leave conflict goes to correction. |
| A12 | Compare a night shift, an off-day, a cancelled shift, attendance disabled, a missing schedule, and a worker with two project memberships. | Night-shift Alfa takes effect at 00:30 on its original work period. Others follow their own eligibility and timezone. Missing configuration yields an unavailable state. |
| A13 | Evaluate ten eligible worker-days with 6 Present, 2 Alfa, 2 approved Izin. Mark one Alfa as pending leave. Then approve it. | Initially 6/8 present, 2 excused. Pending alone has zero effect. After approval, 6/7 present, 3 excused. Empty or incomplete coverage gets no misleading rank. |
| A14 | Give a user aggregate attendance read access only. Open the dashboard and inspect a generated Workspace output. | Department counts remain available. Private leave photos and medical details stay restricted. |
| A15 | Activate the rule today on a project with earlier unscheduled dates. Change the project timezone after an existing cutoff. | No historical blanket Alfa assignment. The recorded work date and original cutoff stay traceable. |

## B. Private drawing

| ID | Action | Expected result |
| --- | --- | --- |
| D01 | Open the same Workspace as Owner, Contractor, Mandor, and regular Worker. Give the Worker a download grant. | Only the first three have drawing tools. The download grant adds no drawing access. |
| D02 | Draw on a wall as one eligible user, reload, then open another browser profile or device with the same account. | Reload in the original profile restores the drawing. The other profile/device opens clean. |
| D03 | In the original browser profile, sign out and sign in as a different eligible user. Switch projects and models. | No mark is visible in another account, project, or revision. Returning to the original authorized context restores it. |
| D04 | Draw a circle, oval, square, rectangle, arrow, straight line, and strokes of two widths. Orbit, pan, resize, and toggle the toolbar. | Shapes remain on the intended surface. Circle and square retain their plane geometry. Two widths are distinguishable. Collapse retains existing marks. Model picking and Add pin still work. |
| D05 | Start a mark, cancel with Escape, draw into empty space, then remove one completed own mark. | No unwanted record. Other marks, Pins, materials, QC totals, and model geometry remain correct. |
| D06 | Inspect the app’s network and project activity during drawing. Block local storage or simulate quota failure. Revoke Mandor access mid-session. | No strokes, coordinates, thumbnails, or mark events leave the browser. Storage failure is labeled temporary. On access revalidation the layer closes and marks disappear. |
| D07 | Remove site storage in a disposable test browser, then reopen. | An empty private layer loads. The help text accurately described device-local storage. Shared project data stays available. |

## C. Authorized Workspace outputs

| ID | Action | Expected result |
| --- | --- | --- |
| E01 | Open Workspace as Owner and Contractor with no optional grants. Use each action. | Both can download the clean PNG and create an authenticated share link. |
| E02 | Compare a Mandor with zero grants, a download-only member, and a share-only member. Try each operation through normal UI and authorization tests. | Mandor can draw only. The other two receive exactly the granted output. Unauthorized operations fail in the trusted path. |
| E03 | Draw a bright private circle on a wall. Download with the inspector open, a known model label, and a distinctive camera angle. Open the actual PNG separately. | PNG is nonblank, has the correct camera and permitted content, and retains required provenance. Private circle, inspector, attendance evidence, and profile are absent. Mark is still visible to its author in the live view. |
| E04 | Share the same view. Open a fresh browser signed out, sign in as an existing authorized recipient, then repeat as a non-member. | Authorized recipient returns to the intended clean view. The non-member receives access denied without private preview. No memberships or grants are created. |
| E05 | Copy a link, then revoke the recipient’s membership. Revoke an issuer’s optional grants in an already-open tab. | Recipient loses future access. Issuer cannot start a new export or share. A previously delivered PNG remains an external file. |
| E06 | Use native sharing, cancel it, then use a browser without native sharing. Deny clipboard access. | Cancellation leaves Workspace usable. Copy link is available. Clipboard failure offers a selectable link and does not say Link copied. |
| E07 | Start export, then switch to a different project before completion. Open a share reference to a removed model version. | No wrong-project file is delivered. The link explains that the version is unavailable and offers a permitted path back. |
| E08 | Use a synthetic project and a live test project in separate sessions. | Demo output carries its demo label. No demo link poses as a protected live link. A simulated capability is identified as demo-only. |

## D. Earlier layout regressions

| ID | Test | Expected |
| --- | --- | --- |
| L01 | Sign in with one project, open it, enter Workspace, and return to Overview from Settings. | Directory appears first and has no left rail. Overview occupies its own page. Settings provides a direct return. |
| L02 | Select Building areas, All, and a Pin on another model. Compare model dock with blueprint controls. | Areas stay in the Workspace rail. All lists permitted project Pins. Only relevant markers appear. Model Fit action is removed and blueprint Fit works. |
| L03 | Choose two different blueprint files and two pages in one PDF. Check the original file shown under the Settings preview. | Drawing, metadata, and original download match. Browsing does not publish a model. |
| L04 | Add the eighth Pin and refresh the department filter. Review a new day with incomplete attendance. | Seven recent rows maximum across departments. Donuts use full counts. Incomplete attendance cannot produce a false high/low ranking. |
| L05 | Test both themes and System, change projects across zones, and inspect a narrow viewport with the inspector open. | Profile and project clock are reachable. Seconds and zone stay clear. Action buttons and toolbar labels can be reached by keyboard or touch. |

## Result record

For each test, record ID, build/version, environment, actor and project alias, observed outcome, evidence reference, and Pass / Fail / Unverified. Use redacted test evidence. Note whether the result came from a demo or a backend-connected environment. Release claims for background Alfa, private evidence, and output access controls require actual backend observations. A scenario written here is not proof of a passing result.
