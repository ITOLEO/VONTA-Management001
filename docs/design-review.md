# VONTA design review

## Source inspection

The 150 tracked files at baseline commit 43ae475 match the supplied project ZIP byte for byte. The ZIP also contains AI Studio session artifacts and a generated README. The live product has separate sample and private route trees. Its drawing pipeline calibrates a sheet, proposes geometry, and requires human review. The demonstration has an A-03 model, field Pins, materials, evidence, attendance, and a department ledger. Some live warehouse routes display an implementation notice.

## Landing content

| Evidence | Decision | Check |
| --- | --- | --- |
| The Ethereum homepage pairs a wide illustration with a short central introduction. Its walkthrough lets the visitor examine one operation at a time. | Open with an original Indonesian construction panorama. Follow it with three steps from the actual A-03 sample. | Each step opens its drawing, model, or Pin in the sample project. |
| Supabase groups product capabilities by function and gives sign-in and product exploration distinct actions. | Group VONTA links under Product and Workflows. Separate live sign-in from the role demo. | Open each menu with the keyboard. Close with Escape. |
| The sample model and the dimensioned A-03 sheet already exist. | Use the actual sheet and model export in the product tour. Use a caption that identifies the sample. | Compare the tour with the sample drawing register and spatial workspace. |
| Construction teams need evidence for a specific location. | Lead with the relation between a drawing, a Pin, and a QC decision. Show spending and attendance after that relation is clear. | Follow the wall preparation Pin from the tour to its work record. |

Use white space, full-width sections, and a single reading order. Keep the VONTA navy, orange, Inter and Manrope. Use visible field labels, platform autofill, standard keyboard navigation, and inline validation in authentication. The editorial illustrations and copy belong to VONTA.

## Access decisions

Keep the project role and platform authority separate. Verify the Supabase session before reading the official directory. Read developer status from server-controlled app metadata. Restrict the sample admin to sample accounts. Protect the finance tables with project membership and RLS. Record the authenticated user on each budget entry. Use project membership to limit access to private source drawings.

## CAD and Google decisions

Use the supported CAD handoff. SketchUp can export a 2D graphic to DWG or DXF. AutoCAD can plot the dimensioned layout to PDF. VONTA accepts a calibrated PDF, JPEG, or PNG. Keep the native drawing intact. Return the exported sheet to the existing review process.

Use the Google consent flow for a user-initiated action. Put the project name and workspace links in a draft or Drive text file. Let the user inspect the recipients and send the message in Gmail. Keep blueprint extraction on the server. Read the model name from the Vercel environment. The available free quota depends on the Google project.

## Sources

- [Ethereum homepage](https://ethereum.org/)
- [Supabase homepage](https://supabase.com/)
- [Apple text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
- [SketchUp CAD import and export](https://help.sketchup.com/en/sketchup/importing-and-exporting-cad-files)
- [AutoCAD layout PDF export](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-E4AF00FC-E219-4D0D-AA4D-1BF5AC04D806.htm)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Google OAuth token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Gmail drafts](https://developers.google.com/workspace/gmail/api/guides/drafts)
- [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
