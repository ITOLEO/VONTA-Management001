# VONTA Management

VONTA connects a dimensioned drawing, its reviewed 3D model, and the field Pins for that project. Use the A-03 Paviliun Kerja sample to inspect the workflow.

## Run locally

Use Node 24 and npm. Run `npm ci`, then `npm run dev`. Run `npm run lint`, `npm test`, and `npm run build` before release. The development server serves the application and its Express API.

## Connect Vercel and Supabase

1. Use this repository as the source for the existing Vercel project. Keep the root directory at the repository root. Use the Vite preset and Node 24.
2. Apply the SQL files in `supabase/migrations` in filename order. For an existing database, apply pending migrations only. The migrations create a private blueprint bucket, project roles, the budget policies, and the demo activity table.
3. Set the following Vercel environment variables. Redeploy after changing a public build value.

| Name | Use |
| --- | --- |
| SUPABASE_URL | Browser and server project URL |
| SUPABASE_PUBLISHABLE_KEY | Browser access under row-level security |
| SUPABASE_SECRET_KEY | Server verification, private storage, and the developer directory |
| GEMINI_API_KEY | Server-side blueprint extraction |
| GEMINI_MODEL | Blueprint model ID. The default is gemini-3.5-flash-lite |
| GOOGLE_CLIENT_ID | Optional public web OAuth client ID for Gmail drafts and Drive exports |

4. In Supabase Auth, set the site URL to the deployed origin. Allow that origin with `/auth/callback` and `/auth/reset-password`. Configure email delivery for verification and recovery.
5. For the Google connection, enable the Gmail and Drive APIs. Configure the OAuth consent screen and the deployed origin under authorized JavaScript origins. Request `gmail.compose` for a draft and `drive.file` for a new handoff file. A workspace administrator or Google may require app verification. Users approve each connection in the browser. The application keeps Google access tokens in memory.
6. Assign the official developer to a verified Supabase Auth account. In a trusted administrator session, set `app_metadata.vonta_platform_role` to `developer` for that account. Preserve existing metadata. Refresh the session. The Administration link appears in the landing page footer. The official route is `/admin`. Its API verifies the bearer token and the server-controlled claim on every directory request.

## Demo accounts

Open `/demo/access`. All six sample accounts use the public demo password `demo123123`. A sample login creates an HTTP-only cookie scoped to `/api/demo`. Each account opens its role dashboard. The sample uses the existing project fixtures. The developer directory lists all six accounts and their last recorded sign-in after the migrations are applied.

| Account | Email |
| --- | --- |
| worker-demo | worker-demo@demo.vonta.example |
| accounting-demo | accounting-demo@demo.vonta.example |
| contractor-demo | contractor-demo@demo.vonta.example |
| architect-demo | architect-demo@demo.vonta.example |
| owner-demo | owner-demo@demo.vonta.example |
| admin-demo | admin-demo@demo.vonta.example |

A demo cookie grants access to sample data only. Production accounts use Supabase Auth and active project memberships. Set the server secret in Vercel to keep sample sessions valid across function instances. Local development without a database uses a temporary signer.

## Project workflows

- **CAD**. Open Integrations. Install the SketchUp RBZ through Extension Manager. Prepare the top parallel view. Export 2D DWG or DXF at full scale. Add dimensions and configure a paper-space layout in AutoCAD. Load the Windows AutoLISP routine with APPLOAD and run VONTAPDF. The macOS workflow uses the native PDF plot. Upload the PDF in project setup or the project settings blueprint uploader. Calibrate a known length. Review the geometry before publication.
- **Gmail**. Open Integrations inside a project. Inspect the handoff. Create a draft and review the recipients in Gmail. When the OAuth client is absent, Compose in Gmail opens the same handoff in the Gmail composer.
- **Google Workspace**. Save the handoff as a text file in the consenting user's Drive. Project links still require project membership.
- **Access**. A contractor or architect can manage their project, drawings, members, and ledger. An owner can inspect the ledger. Accounting members can post dated charges and additional allocations. The Team page can issue an in-app invitation to a registered and verified email. The recipient accepts it in Projects.
- **Deployment boundary**. Warehouse subpages and some live field operations in the starting version are incomplete. The sample includes broader attendance, purchasing, and field demonstrations. The original Express attendance and workspace-sharing addendum holds operational state in process memory. These flows require durable storage adapters for multi-instance production use.

See [design and implementation notes](docs/design-review.md) for the evidence behind the changes.
