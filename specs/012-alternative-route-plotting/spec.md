# Feature Specification: Alternative Route (Detour) Plotting

**Feature Branch**: `012-alternative-route-plotting`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "Let's implement a feature where admin is able to plot an alternative route from the main route."

> **Canonical language note (Principle IV)**: The requested "alternative route from the main route" is the canonical **Detour** (`docs/CONTEXT.md`): _a demand-triggered, direction-specific loop that departs from and returns to a route's base polyline_. This spec uses Detour (and the ADMIN.md action label "Add alternative route") throughout. Detours belong to a **Direction** of a **Route**, never to the Route as a whole (ADR-0008).

## Clarifications

### Session 2026-08-27

- Q: Where do the Detour's notable stops come from — only existing Stops, or can the editor create new detour-only Stops on the loop? → A: Existing Stops only — the Administrator marks already-created Stops (search by name, or pick from the Stops near the loop); `stop_id` always references a real Stop row and the Detour editor never creates new Stops.
- Q: Should the server add structural validation for detour invariants (entry/exit on base polyline, loop endpoints, additional distance) or is UI-only enforcement enough? → A: Minimal server-side validation — the existing detour endpoints MUST reject, with the standard error envelope and nothing persisted, a Detour whose entry/exit lie off the owning Direction's base polyline (beyond tolerance), whose loop does not begin at entry / end at exit, or whose `additional_distance_meters` is negative; a few server tests cover these cases. No new endpoints.

## User Scenarios & Testing _(mandatory)_

The **Administrator** is the only actor in this feature. Today the admin workspace plots the base path of each Direction and can manage Routes, Directions, Stops, and fare configuration — but there is **no way to add a Detour**: the "Add alternative route" action in the floating action bar is documented but not built (ADMIN.md FR-010, §5.10), and the detour data layer + server CRUD are already complete (`GET/POST /api/admin/directions/:directionId/detours`, `PUT/DELETE /api/admin/detours/:detourId`, ADMIN.md Appendix G). This feature delivers the Detour plotting surface in the workspace: the Administrator picks entry and exit points on a Direction's plotted base path, draws the alternative loop between them (road-following), describes it (label, instructions, notable stops), and saves — the Detour then appears nested under that Direction with a visually distinct style.

### User Story 1 - Plot a detour from the main route (Priority: P1)

With a Direction that already has a plotted base path open in the workspace, the Administrator starts the **Add alternative route** action, places the entry point and the exit point on the base path, draws the loop between them, and saves. The Detour is persisted under the Direction and survives a reload.

**Why this priority**: Drawing the alternative path is the heart of this feature — every other capability (instructions, notable stops, management) hangs off a saved Detour. Without this story the feature delivers nothing, matching ADMIN.md SC-009 ("Create a nested detour").

**Independent Test**: A reviewer can open a Direction with a plotted base path, mark entry and exit on it, draw an alternative loop between them, save, and confirm the Detour appears nested under the Direction after a reload — no other capability required.

**Acceptance Scenarios**:

1. **Given** a Direction with a plotted base path is open in the workspace, **When** the Administrator chooses **Add alternative route**, **Then** the workspace enters Detour-plotting mode with instructions visible and the base path still fully rendered as the reference.
2. **Given** Detour-plotting mode is active, **When** the Administrator places the entry point, **Then** the point is placed on the map at the clicked position and snapped onto the Direction's base polyline with the snapped result clearly shown.
3. **Given** the entry point is placed, **When** the Administrator places the exit point, **Then** the exit point is likewise snapped onto the base polyline, and the system tells the Administrator whether the two points are in the correct travel order (entry before exit along the direction of travel) or whether they must be swapped.
4. **Given** valid entry and exit points, **When** the Administrator draws the alternative loop, **Then** the loop is routed from the entry point to the exit point following the road network (same best-effort road-following used for the base path) and is offered as the detour path.
5. **Given** the drawn loop, **When** the Administrator saves, **Then** one atomic save persists the Detour under the Direction, and after reload the Detour's loop, entry, and exit are still shown in the workspace.
6. **Given** the Administrator tries to save an entry point that does not precede the exit point along the direction of travel, or a degenerate loop (entry at exit, zero-length), **When** they save, **Then** the save is refused with a clear explanation and nothing is saved.

### User Story 2 - Describe the detour precisely (Priority: P2)

After (or while) drawing the loop, the Administrator gives the Detour its identity and rider-facing content: a label, the commuter instruction (required), an optional driver instruction, and any notable stops served by the alternative path — each marked detour-only or not. The system shows the exact additional distance the Detour adds over the replaced base segment.

**Why this priority**: A Detour is only usable by Commuters if its instruction text is truthful and its notable stops are known; the exact additional distance is part of the fare/distance model (ADR-0008). This story makes the plotted Detour complete and consumable.

**Independent Test**: A reviewer can open an existing (or freshly drawn) Detour editor, fill in or change the label, commuter instruction, driver instruction, and notable-stop marking, save, and confirm every value persists unchanged after a reload.

**Acceptance Scenarios**:

1. **Given** a new Detour is being drawn, **When** it is first created, **Then** it receives an auto-generated default label (e.g. "Detour 1", "Detour 2", … in creation order within the Direction) which the Administrator can rename at any time.
2. **Given** the Administrator intends to save, **When** the label or the commuter instruction is empty, **Then** the save is blocked with a clear explanation listing exactly which required field is missing.
3. **Given** a drawn loop with valid entry/exit, **When** the Detour editor is shown, **Then** the additional distance (the alternative loop's length minus the replaced base-path segment's length) is computed from the geometry and displayed exactly — never fabricated, rounded-into-plausibility, or hand-entered — and it is ≥ 0.
4. **Given** the loop geometry changes (re-drawn), **When** the change is applied, **Then** the displayed additional distance is recomputed from the new geometry and stays exact.
5. **Given** notable stops are supported, **When** the Administrator marks an **existing** Stop served by the Detour as notable, **Then** it is added to the Detour's notable-stop list with an explicit **detour-only** flag (default off) that the Administrator can toggle; marking any stop as notable is optional.
6. **Given** a saved Detour, **When** the Administrator reloads the workspace, **Then** the label, instructions, notable stops (with flags), and additional distance are all still present and unchanged.

### User Story 3 - Manage a direction's detours (Priority: P2)

The Administrator sees every Detour of the current Direction in one place, opens any of them into the editor, re-plots or edits them, and removes one (soft) when it is no longer needed — without ever leaving the workspace.

**Why this priority**: A Direction can accrue several alternative paths over time; without a nested list and edit/remove paths the plotted Detours can never be corrected or retired, which makes the whole feature one-way.

**Independent Test**: A reviewer can list the Detours of a Direction, open one in the editor, change its loop or text, save, and soft-delete another with a styled confirm — testable with two saved Detours alone.

**Acceptance Scenarios**:

1. **Given** a Direction has one or more saved Detours, **When** the Administrator views the Direction's data, **Then** all Detours appear in a nested section under the Direction with their labels visible and the active state indicated.
2. **Given** a Detour is shown in the list, **When** the Administrator opens it, **Then** the editor loads with its entry, exit, loop, instructions, and notable stops ready to edit, and the base path is again shown as reference.
3. **Given** the Administrator edits a saved Detour, **When** they change the loop or any text field and save, **Then** the update is a single atomic action and the reloaded workspace shows the updated Detour.
4. **Given** the Administrator removes a Detour, **When** they confirm the styled remove prompt, **Then** the Detour is deactivated softly: it stops appearing in the workspace (map and list), no hard delete occurs, and the other Detours of the Direction are unaffected.
5. **Given** two Detours on the same Direction, **When** both are rendered, **Then** they are visually distinguishable from each other and from the base path.

### User Story 4 - Fix mistakes and keep work safe (Priority: P3)

While drawing or describing a Detour, the Administrator steps back through mistakes with Undo/Redo; if they navigate away with an unfinished Detour, the work is kept and offered on return; if another Administrator saves the same Detour concurrently, the conflict is surfaced without losing local work.

**Why this priority**: Detour plotting is iterative, and ADMIN.md FR-020's safety behaviors (drafts, styled confirms, toasts, undo) already exist for the base path — an editor that dropped them would be the odd one out and would punish real plotting sessions.

**Independent Test**: A reviewer can undo and redo Detour-plotting steps (entry placement, exit placement, loop draw, text changes), confirm an unfinished Detour is offered for restore after navigating away, and see a clear message on a simulated save conflict — no other capability required.

**Acceptance Scenarios**:

1. **Given** the Administrator has placed points, drawn the loop, or edited Detour text, **When** they invoke Undo, **Then** the most recent Detour-plotting action is reversed; Redo re-applies it.
2. **Given** an unfinished Detour with unsaved changes, **When** the Administrator navigates away, **Then** they are warned, and if they leave anyway the in-progress Detour is kept as a draft and offered for restore when they return.
3. **Given** the Administrator saves a Detour another Administrator has concurrently changed, **When** the save is attempted, **Then** a clear conflict message is shown and the local work is not silently discarded.

### Edge Cases

- The Direction has **no plotted base path yet** — the **Add alternative route** action is unavailable (disabled with an explanation): a Detour has nothing to depart from and return to without a base path. The base path must be plotted first.
- Entry and exit are placed **out of travel order** (exit before entry along the polyline) — the save is refused with an explanation and a way to swap the two points; nothing is saved.
- Entry equals exit (or the loop is zero-length) — refused with a clear explanation: an alternative route must add a non-degenerate loop.
- The road-following service is unavailable, slow, or has no token configured — the loop degrades to a straight line with a visible warning and the Administrator can still finish and save (best-effort, never blocking) — consistent with the base-path behavior.
- The loop cannot avoid crossing the base path or another Detour — allowed at the data level (activation semantics are resolved server-side later, ADR-0012); the workspace still renders every path distinctly so nothing becomes ambiguous to read.
- A click for entry or exit lands far off the base polyline — the point is still snapped onto the base polyline at the nearest position with the snapped result shown; a large snap distance is surfaced with a warning so the Administrator can confirm intent.
- The Detour has no notable stops — allowed (notable stops are optional).
- The Direction or its base path was deleted/soft-deactivated while the Administrator was editing — the load or save surfaces a clear error with a retry path and the local work is retained.
- The Administrator starts a Detour and saves while another Administrator deletes the Direction — the save fails with a clear message; no partial Detour is created.
- The commuter instruction references travel time — never displayed anywhere (ADR-0009): the Detour editor shows distances, not durations.
- Coordinate-order regression — a placed entry, exit, or loop vertex appearing "in the ocean" (a swapped `[lng, lat]` pair) is treated as a release-blocking defect; points appear exactly where clicked.
- More than a handful of Detours on one Direction — the list stays ordered and scannable (label + active state), and each loop remains distinguishable on the map.
- A malformed Detour payload (entry/exit off the base polyline, loop not starting/ending at entry/exit, negative additional distance) reaches the server directly — the server rejects it with the standard error envelope and persists nothing (FR-023); the workspace UI already refuses these before sending.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Administrator MUST be able to start plotting a Detour for the currently open Direction of a Route via an **Add alternative route** action in the workspace's floating action bar (ADMIN.md FR-010); the action MUST be unavailable, with a clear explanation, until that Direction has a plotted base polyline.
- **FR-002**: A Detour MUST be nested under exactly one Direction of a Route; the workspace MUST make the owning Direction explicit while plotting and MUST NOT allow saving a Detour against the wrong Direction.
- **FR-003**: The Administrator MUST place the Detour's **entry** and **exit** points on the map; each placement MUST be snapped onto the owning Direction's base polyline with the snapped result visibly shown (ADR-0008 geometry-point model — these are not stop references).
- **FR-004**: The entry point MUST precede the exit point along the Direction's polyline (direction of travel); saving an out-of-order pair MUST be refused with a clear explanation and a swap action.
- **FR-005**: The alternative loop MUST begin exactly at the entry point and end exactly at the exit point; a degenerate loop (entry at exit, or zero-length loop) MUST be refused with a clear explanation.
- **FR-006**: The loop MUST be routed between entry and exit following the road network (the same best-effort road-following used for the base path), honor one-way travel constraints, and be offered as the Detour's path; when road-following is unavailable, the loop MUST degrade to a straight line with a visible warning and MUST never block the Administrator from finishing the Detour (FR-009 behavior of the base path, extended).
- **FR-007**: Saving a Detour MUST be a single atomic action that persists the label, entry, exit, loop, instructions, notable stops (if any), and the computed additional distance together; after reload the Detour MUST appear nested under its Direction.
- **FR-008**: A new Detour MUST receive an auto-generated default label in creation order within the Direction (e.g. "Detour 1", "Detour 2", …); the label MUST be editable and MUST be non-empty at save time.
- **FR-009**: The **commuter instruction** MUST be non-empty at save time; the **driver instruction** MUST be optional.
- **FR-010**: The Administrator MUST be able to mark **existing** Stops served by the Detour as **notable stops**, each with an explicit **detour-only** flag (default off); the notable-stop list MUST reference already-created Stops only (search by name, or pick from the Stops near the loop) — the Detour editor MUST NOT create new Stops; marking notable stops MUST be optional.
- **FR-011**: The system MUST compute the Detour's **additional distance** exactly — alternative-loop length minus the replaced base-segment length — display it exactly, recompute it whenever the loop geometry changes, and never accept or display a hand-entered, estimated, or rounded-into-plausibility value (Principle I; ADR-0008 fare/distance model).
- **FR-012**: The Detour MUST have a **distinct visual style** on the map: clearly different from the Direction's base path and from other Detours, legible even when Detours overlap or cross the base path, and consistent with the established visual language (The Route Sign); selection MUST never be conveyed by color or shape alone (ADMIN.md FR-018/SC-012).
- **FR-013**: The workspace MUST show a **nested list of the Direction's Detours** (label and active state); opening one MUST load it into the editor with entry, exit, loop, instructions, and notable stops ready to edit.
- **FR-014**: The Administrator MUST be able to **remove a Detour** through a styled confirm; removal MUST be a soft deactivation (the Detour stops appearing on the map and in the list, and no other Detour of the Direction is affected), never a hard delete.
- **FR-015**: Detour-plotting edits (entry placement, exit placement, loop draw/re-draw, and text edits) MUST support **Undo** and **Redo** like the base-path editor.
- **FR-016**: An unfinished Detour with unsaved changes MUST be kept as a **draft** (client-local, 24-hour time-to-live) when the Administrator leaves, warned on the way out, and offered for restore on return (the workspace's existing draft behavior, extended to Detours).
- **FR-017**: A save conflict (another Administrator changed the same Detour or Direction) MUST surface a clear conflict message and MUST NOT silently discard the local work.
- **FR-018**: The workspace MUST show loading, empty, and error states for the Detour list and editor (e.g. no Detours yet; load failure with retry; save failure) so the Administrator always understands the state of the data.
- **FR-019**: The page MUST NOT display any travel-time estimate anywhere in the Detour workflows (ADR-0009 regression guard).
- **FR-020**: Placed entry, exit, and loop vertices MUST appear exactly at the map positions the Administrator intended — a coordinate-order misplacement ("in the ocean") is a release-blocking defect.
- **FR-021**: The Detour editor MUST be keyboard-operable and meet WCAG AA contrast and focus visibility, matching the rest of the workspace; shortcuts MUST complement, not replace, visible controls.
- **FR-022**: All displayed distances (loop length, replaced base segment, additional distance) MUST be exact and legible; the workspace MUST NOT fabricate or round-into-plausibility any value (Principle I).
- **FR-023**: The **server** MUST validate the structural Detour invariants on the **existing** detour endpoints (no new endpoints): it MUST reject, with the standard error envelope and nothing persisted, a Detour whose entry or exit lies off the owning Direction's base polyline (beyond a small tolerance), whose loop does not begin exactly at the entry point or end exactly at the exit point, or whose `additional_distance_meters` is negative. The workspace UI refuses these before sending (FR-004/FR-005); the server is the last gate for every consumer.

### Key Entities

- **Detour**: the alternative route entity being plotted — nested under one Direction (`direction_id`), defined by `label`, `entry` and `exit` points (geometry on the base polyline, ADR-0008), `detour_polyline` (the alternative loop), `additional_distance_meters` (exact, computed), `commuter_instruction` (required) and `driver_instruction` (optional), `notable_stops[]` (each `{ stop_id, name, is_detour_only }`), and `is_active` (soft delete). Server schema and CRUD already exist and are consumed as-is (ADMIN.md Appendix G).
- **Direction**: the directed service the Detour is nested under; its `base_polyline` is the reference path and the source of the replaced segment between entry and exit.
- **Notable Stop**: an **existing** Stop served by the Detour, carried as `{ stop_id, name, is_detour_only }`; optional, addable/removable in the editor. `stop_id` always references a real, already-created Stop row — the Detour editor does not create new Stops; pick candidates come from the Stops near the loop or a name search.
- **Draft** (client-only, not persisted): the unsaved working state of an unfinished Detour — placed entry/exit, drawn loop, and editor history — kept locally for 24h and offered for restore, extending the existing base-path draft.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of reviewers (≥ 5) can plot a Detour (entry, exit, loop, save) on a Direction with a plotted base path in under 5 minutes on their first attempt, without guidance.
- **SC-002**: 100% of reviewers confirm a saved Detour still appears nested under its Direction after a page reload, with loop, entry, exit, and all text content unchanged.
- **SC-003**: 100% of reviewers confirm the alternative loop follows the road network between entry and exit (or, when road-following is unavailable, a visible straight-line-fallback warning is shown and the Detour still saves), and that entry and exit sit on the base polyline.
- **SC-004**: 100% of reviewers confirm the Detour is visually distinct from the Direction's base path and from every other Detour on the same Direction, including overlapping/crossing cases.
- **SC-005**: The displayed additional distance matches an independent geodesic measurement of (alternative-loop length − replaced base-segment length) for 100% of plotted Detours — exact, never estimated.
- **SC-006**: 100% of reviewers can add and remove notable stops, toggle the detour-only flag, and write both instructions, and confirm all of it persists after reload.
- **SC-007**: 100% of reviewers can undo and redo Detour-plotting steps, and confirm an unfinished Detour is offered for restore after navigating away and honored until its draft expires.
- **SC-008**: 100% of reviewers can soft-remove a Detour with the styled confirm and confirm it disappears from the workspace while the Direction's other Detours remain untouched.
- **SC-009**: 100% of reviewers who attempt **Add alternative route** on a Direction without a plotted base path see a clear explanation instead of an unusable editor.
- **SC-010**: 100% of reviewers confirm out-of-order or degenerate entry/exit is refused with a clear explanation and that nothing is saved in those cases.
- **SC-011**: On a simulated concurrent-save conflict, 100% of reviewers see a clear conflict message and their local work is still present afterwards.
- **SC-012**: No travel-time estimate is displayed anywhere in the Detour workflows (ADR-0009 regression guard).
- **SC-013**: 100% of reviewers confirm every entry, exit, and loop vertex they placed appears exactly where intended — no reviewer observes a coordinate-swapped ("ocean") point.
- **SC-014**: Hand-crafted Detour payloads that violate the structural invariants (entry or exit off the base polyline, loop not starting/ending at entry/exit, negative additional distance) are rejected by the server with the standard error envelope and nothing persisted — demonstrated for each case via the existing endpoints.

## Assumptions

- "Alternative route from the main route" is the canonical **Detour** (`docs/CONTEXT.md`, ADR-0008); this spec deliberately uses canonical language (Principle IV) and the ADMIN.md action label "Add alternative route".
- **Scope**: Detour (alternative route) plotting UI only. The restriction editor ("Add restriction", no-stop segments) is a separate future feature (ADMIN.md R1/R3 items) and is **out of scope** here, matching the user request and spec-007's precedent that detours and restrictions are separate features.
- **Out of scope (R2)**: Detour conditional triggers — `active_timeframes` and `condition` (ADR-0012) are neither in the shared types nor the server today, so this feature adds no trigger fields, no trigger UI, and no server-side active-detour resolution. The Detour model used is exactly the current one (ADR-0008 fields).
- The detour data layer and server CRUD are **complete and correct** (`apps/server/src/api/detours.ts`, shared zod schemas); this feature consumes them and adds **no new server endpoints**. The existing detour endpoints gain **minimal structural validation** (no new endpoints, no schema change): the server MUST reject, with the standard error envelope and nothing persisted, a Detour whose entry or exit lies off the owning Direction's base polyline (beyond a small tolerance), whose loop does not begin exactly at the entry point or end exactly at the exit point, or whose `additional_distance_meters` is negative — covered by a few server tests. The workspace UI additionally refuses invalid saves with clear explanations before any request is sent (FR-004/FR-005).
- A Detour can only be plotted on a Direction that already has a plotted base polyline; the workspace blocks the action with an explanation otherwise (FR-001) rather than auto-creating a base path.
- Entry and exit are **geometry points on the base polyline** (ADR-0008), not stop references; notable stops are a separate, optional list referencing **existing** Stops (`notableStopSchema`) — the Detour editor never creates new Stops: the Administrator picks from already-created Stops (name search, or candidates near the loop) and marks them with a detour-only flag (FR-010).
- **Additional distance** is computed exactly from geometry by the system (loop length − replaced base-segment length) and included in the save payload; Administrators do not hand-enter it (FR-011). It is ≥ 0 and displayed read-only as an exact value.
- The Detour editor **reuses the workspace's existing safety behaviors** — 24h client-local drafts, Undo/Redo, styled confirms, toasts, conflict handling, keyboard paths, WCAG AA contrast (ADR-0014 non-goals) — extended to Detours, not re-designed.
- **Visual style** follows the established design tokens (DESIGN.md, The Route Sign); the requirement is _distinctness_ from base path and other Detours, while the exact color/pattern treatment (with signal amber reserved for attention) is a design decision made at implementation time, consistent with ADMIN.md FR-018.
- Multiple Detours per Direction are allowed and always rendered distinctly; no activation semantics are evaluated at data-editing time (that is R2 request-time resolution, ADR-0012).
- No ETA anywhere (ADR-0009); the Detour workflows display distances only.
- The workspace remains desktop-only (≥ 1024px), per ADR-0014; mobile is out of scope.
