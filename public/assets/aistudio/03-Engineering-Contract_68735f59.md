# VONTA Management | Engineering contract

**Implementation and data boundaries · 20 November 2026**

Inspect the current project first. Map each logical record below to an existing table, service, hook, or component. The names in this document describe responsibilities. Preserve current identifiers and public routes when their behavior fits. Prepare reviewed migrations when required. Run changes on disposable test data before any live release.

## Four distinct data paths

| Data | Authority and lifetime | Readers |
| --- | --- | --- |
| Attendance, izin, decision history | Project backend. Durable records and effective timestamps. | The worker and users with scoped team or administrative rights. Use separate evidence access. |
| Photo evidence | Private object storage. Bind an uploaded, validated photo to the requester and the work period. Apply existing retention rules. | Requester and authorized reviewers under the evidence policy. A roster viewer does not automatically get the photo. |
| Personal surface marks | Account-scoped IndexedDB on the originating browser profile. Memory fallback with explicit temporary-state messaging. | Only the same eligible account in that profile. The project backend receives no stroke data. |
| Workspace outputs | Download delivers a clean file to the requester. Share saves only a permitted view reference or reuses an equivalent protected deep link. | Check download/share entitlements for the actor. Check current read access independently for each recipient. |

## Attendance model and transitions

Use the existing roster or shift assignment as the source of obligation. Resolve a unique work period from project, worker, and shift instance. Preserve a single open attendance session per worker in a project. Store UTC instants, original project-local work date, and the IANA zone used by the scheduled shift. Resolve the shift's start once, including any ambiguous or missing local times using the scheduling system's existing policy. Quarantine unresolved schedules for correction.

| Logical record | Minimum information |
| --- | --- |
| Scheduled obligation | Project, worker, assignment, shift instance, relevant division and Mandor assignment, zone, original work date, start instant, cutoff instant, enabled/cancelled state. Freeze the cutoff for that occurrence, subject to explicit audited rescheduling. |
| Attendance result | Obligation identity, effective status, effective time, source (self, auto cutoff, approved leave, authorized manual correction), accepted check-in receipt if any, revision. |
| Izin request | Obligation, applicant, reason, private photo reference, submission time, review state, reviewer, decision time, rejection reason, revision. Keep one unresolved request per obligation. |
| Audit event | Project, obligation or request, actor or system identity, event type, old and new state, effective time, recorded time, and correction reason when applicable. Keep secret URLs and private evidence bodies out of logs. |

1. Calculate cutoff as the scheduled start instant plus 3,600 elapsed seconds. Use backend time. The time comparison is strictly before for valid self check-in. Equality belongs to the Alfa rule. Keep the receipt from the trusted intake path even if later processing is slow. If the check-in requires evidence, use the receipt time for the first complete valid submission. Device wall time and an offline draft alone cannot backdate attendance.
2. Use a scheduled server job to materialize due Alfa records. Run a catch-up scan after downtime. In reads and writes, resolve an overdue obligation against the same rule so an open page or a delayed job cannot show “No record yet” past the cutoff. Set effective time to the cutoff and recorded time to the actual write. A job polling interval can delay row creation. It never changes the effective cutoff.
3. Serialize writes by obligation with transactions, revisions, or equivalent locking. Job retries, duplicate clicks, and simultaneous requests must converge to one current result and one event per transition. A previously accepted pre-cutoff check-in wins over a concurrent timeout. An accepted leave decision wins over automatic Alfa. If a valid earlier receipt becomes available after a timeout write, append a reconciliation event and restore the correct result.
4. A request awaiting review has its own lifecycle. Validate the worker, scope, reason and photo before making the request pending. Allow requests before and after the cutoff. An unanswered request never suppresses the cutoff. A pre-cutoff rejection leaves an eligible worker able to check in until the cutoff. A post-cutoff rejection preserves Alfa for that absence.
5. On approval, lock the obligation and request together. Recheck reviewer membership, assignment, division, private review access, and self-review exclusion. An unambiguous approval changes the effective status to Izin and completes the request in the same transaction. If a valid check-in already made the worker Present, surface the conflict to the reviewer and route any change through the existing correction workflow. Handle competing approve/reject decisions once. Resubmitting or refreshing shows the recorded outcome.
6. Handle photo selection, upload validation, request submission, and retry as separate states. Keep uploaded files private. Verify that the object exists, is an allowed image under existing file limits, and belongs to this worker, project, and request. Recover from interruption and clean orphaned uploads under the existing file policy. Deliver private evidence through authorized, temporary access or a checked download.
7. Recompute affected department aggregates from effective records for the original work date. Keep partial coverage visible. Assign historical membership by effective date. Use distinct worker-days and the denominator in document 02. Backfill only from trustworthy schedules and evidence for the configured policy period. Apply the new automatic rule prospectively from activation unless an explicit historical correction is authorized.

## Private drawing implementation

- Reuse the existing Three.js view and raycast path. Start on a stable wall or floor reference. Store shape points in the element’s local plane, together with the model version, origin and basis as needed, and the chosen thickness. Use the existing transforms for rendering. Respect depth and avoid flicker on the support surface.
- Distinguish Brush, finite Line, Arrow, Circle, Ellipse, Square, and Rectangle. Compute a circle radius or a square’s equal sides in the surface plane. Keep a stroke on its starting surface. A missed or invalid hit cannot create a mark on another element.
- Use a local key such as environment + account subject + project + model version + area + annotation ID. Add a local format version. Use opaque account IDs. Partition synthetic demo identities from signed-in identities. Unavailable local storage produces a plainly labeled session-only layer.
- Open the local layer only after checking current membership and eligible drawing role. On sign-out, account switch, or loss of access, clear the in-memory layer before rendering the next session. Recheck current authorization before restoring persisted marks. Same account on a different device or in a different browser profile starts empty.
- Exclude marks from API requests, synchronization, realtime messages, file storage, telemetry, shared history, and share payloads. Keep eligible marks on their original model version. An unrelated replacement model starts clean. If a prior build stored shared annotations, stop reading or writing that path for personal marks. Do not copy other users’ marks to local storage or delete someone’s historical data as a side effect.
- Keep the scene and camera stable when opening a menu. Handle pointer cancellation, touch input, Escape, orbit/pan, and switch between drawing and Add pin. A local save error must not report success or alter a Spatial Pin.

## Authorization and clean output

Evaluate capabilities in the target project on every protected operation. Reuse the membership service and any existing project access management. The role labels in these examples map to the current project model.

| Capability | Decision |
| --- | --- |
| Draw locally | Active project member with Owner, Contractor, or Mandor authority. Evaluate before loading the local layer. Download/share grants never imply this role. |
| Download clean view | Active member with Owner or Contractor authority, or active member with the explicit download grant. Check permission in the trusted application path before delivering the export. |
| Create share reference | Active member with Owner or Contractor authority, or active member with the explicit share grant. Use a backend authorization check. |
| Open shared view | Signed-in recipient with active project access and read access to the referenced area and model. Re-evaluate on every open. A pasted URL cannot grant access or expose a thumbnail. |

**Download.** Snapshot the active project, model version, camera, filters, and permitted layers when the user requests output. Gate the export with the current session on the backend. Only capture authorized scene elements. Use an allowlisted render pass or an isolated export scene with the existing camera, not a screenshot of the page or its visible annotation overlay. Include provenance labels for demo and unverified data. Preserve the live drawing and camera. Abort an in-flight delivery on a project or account switch. Detect missing assets, blank capture, and generation failure. Use a stable project-based filename and the PNG media type. Revoke temporary blob URLs when finished. Browser or OS screenshots and onward distribution of a delivered PNG are outside the scope of an app entitlement.

**Share.** Save only a project-scoped view reference. Allowlist model version, permitted area, camera state, and non-sensitive layer options. Validate finite numeric camera values and related project ownership. Keep annotation points, photo URLs, grants, access tokens, and membership invites out of it. Open the shared view with the local annotation layer hidden, including on the author’s device. An eligible recipient can explicitly open their own local layer after entry. Resolve a link against live permissions. If the referenced version is unavailable, report that state. If an optional layer is restricted, omit it. Validate access before showing private titles. A project switch or share action never changes membership.

Use a native share sheet when the browser supports link sharing and an explicit user gesture is available. If link preparation has consumed that gesture, show a ready-to-share action or Copy link. Handle cancellation separately from failure. If clipboard access fails, show a selectable authorized link. User-visible success refers to the completed action (link copied, file prepared, or share sheet opened). Delivery or receipt by another person requires separate evidence.

**Revocation.** Removing download or share grants prevents new operations, including stale-session requests. Decide access on the server as well as in the UI. A current member can open an existing restricted view only while the target project and object remain readable to them. Revoking a recipient's membership blocks further opens. Existing downloaded PNGs cannot be withdrawn. Keep server credentials and private evidence off the client.

## Build sequence and checks

1. Inspect routes, role resolution, attendance scheduling, evidence storage, and any collaborative markup code. Map the current assets and demo limitations.
2. Implement a pure cutoff decision with fixed-time tests. Add the server job, policy activation, durable state transitions, evidence access, and Mandor review. Connect the roster and department chart.
3. Adapt the current 3D drawing tools to account-scoped local storage. Verify identity changes, orbit, and model changes before adding output.
4. Add independent output grants, clean rendering, and protected view references. Verify the exported PNG independently of the viewport.
5. Run the existing build and type checks, boundary tests, role tests, two-browser tests, and the UAT in document 04. Separate observed results for synthetic and live-backed test environments.

## Implementation references

The IANA database provides historical and current local-time rules. Use the shift’s resolved instant during cutoff evaluation. [IANA Time Zone Database](https://www.iana.org/time-zones)

IndexedDB supports local structured records. Each browser profile must also isolate records by VONTA account and project. [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

Native sharing depends on browser support and user activation. [MDN Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)

When the project uses Supabase, its Storage access controls and policies support the private evidence path. [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
