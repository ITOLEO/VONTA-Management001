# Spatial Workspace and PIN

## Tools in the viewport

Keep the current selectable 3D meshes, camera, source labels, inspector, and bottom dock. Put a second compact tools rail beside the existing project rail, inside the viewport. Use a vertical stack with downward-opening groups. A group stays within the viewport, opens with click or keyboard, and can collapse independently of the project rail. Show the active tool, thickness and color. Hide tool groups that require the private drawing role when the member lacks that role. Keep navigation and any permitted read-only orientation UI usable.

| Group | Control | Operation |
| --- | --- | --- |
| Cursor | Default pointer and explicit red prohibition icon labeled **Stop drawing** | Exit drawing and restore existing camera/select controls. Escape cancels a draft before returning. The icon indicates an action. It must not look disabled. Remove the old Pan label from this button. |
| Freehand | Pencil, Marker, Brush | Pencil makes a fine controlled stroke. Marker uses a broader translucent stroke. Brush uses a solid continuous stroke with the chosen width. Save the tool type. |
| Rulers | Straight ruler, Right-angle ruler; optional angle ruler where the active model supports it | Pick two calibrated points for distance. For a right angle, select a surface/reference plane and constrain the second leg perpendicular to the first. Display both legs and units. An angle ruler, when available, reports the included angle. Support cancel/reset and distinguish a measurement from a source dimension. |
| Shapes | Straight line, arrow, circle, ellipse/oval, square, rectangle | Anchor shapes in the selected wall or floor plane. A circle uses one radius. A square uses equal local side lengths. Other shapes allow independent axes. Render correctly during orbit. |
| Edit | Eraser, Fill | Eraser removes only the author’s selected private mark or private fill. Fill applies a private visual overlay to the selected wall element. It must not change the published material, its quantities, other walls using the same material, or another user’s view. |
| Stroke | Width and line style | Show current numeric width. Allow keyboard input and preset dropdown (for example 1, 2, 4, 8 and 12 preview pixels). Validate a defined positive range, e.g. 1–32. Expose Solid, Dashed and Dotted. Keep tool-specific style, unit and rendering consistent on reload. |
| Color | Presets, editable hex, color wheel, eyedropper | Synchronize all inputs to one value. Normalize #RGB or #RRGGBB to #RRGGBB. Show validation without committing an incomplete edit. Supply a wheel with draggable controls plus keyboard/numeric input. Use a user-triggered native eyedropper when supported. Provide a local swatch or rendered-canvas sampler when unavailable. Handle cancellation and cross-origin canvas restrictions. |

Use VONTA’s existing surface picking and input ownership. At a time, one tool receives a pointer gesture. Pointer movement while drawing must not orbit the scene, place a Pin, or select a second wall. Capture points in the starting element’s local coordinates with area, stable element ID and model version. Honor depth and the starting plane. Reuse the account- and device-specific IndexedDB namespace. Adapt earlier Pan/Brush/width data with safe defaults when reading older entries. Storage failure shows “Temporary on this device.” Clean outputs render only the allowed scene layers.

Use a verified calibration before showing physical lengths. Expose units (mm/m or configured units) and measurement endpoints. For uncalibrated geometry, show “Scale not verified” and disable dimensional claims. Preserve the known A-03 regression: the sample Ruang Rapat cross-check is 2,875 mm. A schematic or rotated screen projection cannot be presented as a field measurement.

## Dual compass

Place a compact compass below Download/Share at the top right. Provide **Ground compass** to toggle arrows on the ground grid. Mark at least N/E/S/W; use intercardinal arrows for the requested compass directions when space permits. Both controls use the same audited model-to-project orientation. Ground arrows stay anchored to the correct ground directions as the camera orbits. The corner north indicator rotates relative to the camera. Test a model whose verified north is 90 degrees from its local grid axis. Never infer geographic north from a wall name, device heading, or the scene’s positive Z axis. If the project has only a local grid reference, label it “Grid orientation” or show “North not set.” Do not label it geographic north.

## Building areas and dock

The Workspace sidebar shows All areas and distinct physical areas derived from the project register. Many sheets may describe one physical area. Pending model builds display a real status; published areas open the corresponding area/model. Keep Pin list and Model info in their footer positions above Project settings. Opening a department/room popover or the floating project rail preserves camera and selection.

Make Department look and operate like the adjacent Rooms control. The popover lists the project’s actual departments and clearly marks the choice. The control filters visible work Pins. Preserve technical model-layer visibility as an independent model setting. **All** clears all active Pin filtering, including department, room, Pin focus, and any other Pin list conditions. Expose all authorized project Pins and all areas for listing. On the current model render only its compatible anchors. A Pin from another model offers explicit Locate in 3D. All is active only when the Pin filter set is empty. Selecting a department deactivates All. Retain Add pin at the bottom. Remove the demo identity button shown in screenshot 12.

## Department and custom Pin colors

Project Settings includes **Department Pin colors**. Show one named preset per active department, starting with Civil, Electrical, Plumbing and Finishing. Use distinguishable existing VONTA colors. The authorized project administrator for department setup can name/edit the department color entry, select an approved department, and apply its color through the same hex/wheel/eyedropper picker. A preset is a reusable department style. Creating one does not create a work Pin or another department. Add department in Overview creates its catalog entry and matching editable color entry. If the product supports custom named styles, scope them to the chosen department and keep them inside the manual picker so the initial four presets remain clear.

In Create/Edit Pin, retain the swatch button pattern from screenshot 14. The initial palette shows four department defaults. Show a Manual color disclosure underneath with hex, wheel and eyedropper. Save an optional explicit override on that Pin. Compute display color as explicit override → department default → compatible legacy default. Preserve earlier explicit custom colors. Changes to a department default update inheriting Pins and leave explicit overrides intact. A color choice never changes department assignment, technical layer, work status or QC. Use text and accessible selected states independently of color.

## PIN module

Name the top destination, page heading, navigation and accessible labels **PIN**. An individual record is a **Pin**. Support existing /work and detail deep links. Use one data query keyed by project, authorized scope, department, status/exception chip, room, search and project-local date/range. The department rail and in-page status chips each control one dimension. Keep the left rail free of the old duplicate status filters.

| Region | Contract |
| --- | --- |
| Left rail | All departments, then catalog departments. Selecting a department keeps status and date selections. |
| In-page toolbar | All Pins, Open, In progress, Pending QC, Approved and established exception chips. Material exceptions is a condition, not a work-cycle state. Keep search, room, date/range, and List / Kanban together. Label date basis, e.g. **Updated**, and use it in both views. |
| List | Reuse row identity, work title, department, worker, room, status, detail and Locate in 3D. Use the full available width with a stable empty state. |
| Kanban | Columns follow open → in_progress → pending_review → approved. Cards represent the same Pin IDs as the list. Keep department, search, date and status filters on switching view. Counts and detail actions agree. Empty columns keep their headings. |
| Status changes | Use the existing authorized work/QC transitions. A worker can submit the required evidence. An authorized reviewer can approve through the defined workflow. A board can be read-only for movement. If drag is enabled, call the same transition service, verify prerequisites/evidence and restore the card on refusal. Feed no separate task lifecycle. |

Pin detail retains the Foreman actions to edit eligible work and create a material request/order tied to this project, area and Pin. Store Request and Purchase Request access follows scope. Existing material, attendance, and activity audit destinations stay intact.
