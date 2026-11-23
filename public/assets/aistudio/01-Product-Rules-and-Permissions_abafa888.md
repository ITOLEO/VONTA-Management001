# VONTA Management | Product rules and permissions

**Attendance and Spatial Workspace · Implementation addendum · 20 November 2026**

Use this addendum in the existing Google AI Studio project. It updates the VONTA PRD and Layout System for attendance, private drawings, and Workspace output. It also resolves earlier instructions to save drawings in the project. Document 02 covers screens. Document 03 defines implementation behavior. Document 04 supplies acceptance tests. Document 05 starts the implementation.

## Product contract

VONTA connects a source blueprint, reviewed 3D geometry, a work location, an assigned team, materials, QC evidence, and verified progress. A Spatial Pin represents work. A private drawing helps one person inspect a surface. Drawing, downloading, or sharing has zero effect on Pin counts, QC, materials, or model publication.

| Rule | Required outcome |
| --- | --- |
| AT-1 · Cutoff | For each scheduled worker, set the cutoff to the shift start plus 60 elapsed minutes. At the exact cutoff, an eligible worker with no accepted check-in or approved leave becomes **Alfa** (absent). This applies when every browser is closed. |
| AT-2 · Before the cutoff | Show **No record yet** until a valid check-in, approved leave, or the cutoff. A check-in received after shift start and before the cutoff counts as **Present**. Show the real arrival time. Preserve existing punctuality indicators if configured. |
| AT-3 · After the cutoff | Keep Alfa when a worker arrives late or submits an izin request. A late check-in alone cannot replace Alfa. The worker can submit evidence and see the review status. The existing authorized correction workflow can fix a documented recording error. |
| AT-4 · Izin | A worker can request permission for their own scheduled work period, before or after the cutoff. Require a reason and at least one successfully uploaded photo. An authorized Mandor approves or rejects. Approval changes an eligible record to **Izin** (approved leave). Rejection keeps the applicable attendance status. |
| AT-5 · Review scope | Use the assigned Mandor for the worker’s team and division on the relevant work date. Check the reviewer’s current active project access too. Prevent self-approval. If there is no eligible reviewer, retain the request and show **Awaiting Mandor assignment**. |
| AT-6 · Historical truth | Preserve system Alfa, submission, review, and any correction as distinct historical events. Record who acted, the effective time, and the reason. Keep private evidence out of the public project activity feed. |
| WS-1 · Private drawings | Only an active project Owner, Contractor, or Mandor may create or edit their own marks. Marks live in the same account’s browser profile on the device where the user drew them. They never enter shared project records, network messages, workspace exports, or shared links. |
| WS-2 · Download | Every active Owner and Contractor can download the permitted Workspace view. Other active members need an explicit project download grant. |
| WS-3 · Share | Every active Owner and Contractor can share the permitted Workspace view. Other active members need a separate project share grant. The recipient must sign in and pass the project’s existing read checks. |

### Attendance examples

Assume a rostered shift starts at 08:00 in Asia/Makassar. The cutoff is 09:00:00 on the project clock.

| Event | Attendance | Request |
| --- | --- | --- |
| 08:25. Worker has made no entry. | No record yet | None |
| A valid first check-in arrives at 08:59:59. | Present | None |
| In another case, the worker has no accepted entry at 09:00:00. | Alfa | None |
| At 09:05, that worker submits a reason and a photo. | Alfa | Pending Mandor review |
| Mandor approves at 10:12. | Izin | Approved |
| Alternative outcome at 10:12. Mandor rejects with a reason. | Alfa | Rejected |
| Worker submits at 07:50 and Mandor approves at 08:15. | Izin | Approved. The cutoff has no effect. |

Distinguish attendance and the request decision. Display both. Approval must never appear while a photo is uploading. For a worker already recorded Present, show the existing record and direct conflicting changes to the correction process. Do not silently replace confirmed presence with leave. Use the same approach for a conflicting check-in on an already approved leave.

### Who is scheduled

Apply the rule to a person with an active project membership and a confirmed attendance obligation for the work period. Respect a day off, cancelled shift, and attendance-disabled project. A missing or ambiguous schedule produces **Schedule unavailable**. Identify the setup action for the authorized coordinator. The app must never guess a shift start or mark the entire directory absent.

Use the project’s IANA time zone and the shift start date as its work date. A night shift can reach its cutoff on the next calendar day. Preserve the original shift identity after a project timezone or roster change. When a user belongs to two projects, evaluate each project’s schedule independently.

## Permission matrix

Use the repository’s existing membership model. The Product Brief uses Owner/Admin for the project owner and may represent Mandor as a permission on a Worker membership. Resolve these identities in the active project. Do not create a global administrator or grant a capability from a display name.

| Active membership in this project | Submit own izin when rostered | Decide izin | Draw locally | Download Workspace PNG | Share Workspace link |
| --- | --- | --- | --- | --- | --- |
| Owner | Yes | Only with independent, eligible Mandor authority | Yes | Always | Always |
| Contractor | Yes | Only with independent, eligible Mandor authority | Yes | Always | Always |
| Mandor | Yes | Assigned workers in scope, excluding self | Yes | By project grant | By project grant |
| Regular Worker, Warehouse, Accounting, or other member | Yes, if rostered | Only with eligible Mandor authority | Only if also an eligible drawing role | By project grant | By project grant |
| Non-member, former member, signed-out user in a live project | No | No | No | No | No |

Use the existing project access-management authority to issue or revoke the two optional grants. Where the current app uses Contractor for access management, keep that rule. Bind grants to a specific active membership. A member cannot grant themself privileges through the export UI. Owner and Contractor entitlements come from their current role and require no toggles. Losing the role or membership triggers a fresh access check.

## Working decisions for this release

| Topic | Implementation default | Reason |
| --- | --- | --- |
| Meaning of a device | Same account, same browser profile, same project, same model version | Two people using one computer should have separate notes. Another browser starts empty. Clearing site storage may remove the notes. |
| Download format | A clean PNG of the current permitted 3D view | Produces a usable snapshot for a site report. Original drawing download remains a separate blueprint action. |
| Share format | A sign-in-required link to the project view | Recipients can inspect current authorized information. The link carries no permission, evidence attachment, or private drawings. |
| Mark visibility in output | Exclude all private marks from both Download and Share | A user can annotate privately while showing colleagues a clean view. Downloaded files can be forwarded outside VONTA. In-app controls apply up to file delivery. |
| Attendance dashboard | Show Present, Alfa, Izin, and unresolved counts. For finalized records, presence rate = Present / (Present + Alfa). | Approved Izin is excused. Before finalization, label partial coverage and defer comparative ranking. Show the denominator and the number excused. |
| Check-in timestamp | Trusted receipt time for a valid submission | The server can honor pre-cutoff receipt even when processing finishes later. Device time alone cannot establish attendance. |
| Retention of leave photos | Reuse the project’s approved private-evidence retention and access policy | No retention duration was supplied. Surface the missing policy for live operation. Do not invent a deletion period. |

## Release evidence

Use disposable accounts and projects to run document 04. Verify a cutoff while no client is open, a review from the wrong Mandor, a second account in the same browser, and two independent output grants. A project with only a synthetic demo can demonstrate the interface. Claims about live authorization, durable attendance, private photos, and the background job require a connected test backend.
