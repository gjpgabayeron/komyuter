# Feature Specification: Alternative Route (Detour) Plotting

**Feature Branch**: `012-alternative-route-plotting`

**Created**: 2026-08-27

**Status**: Implemented (2026-08-27 — reconciled with the shipped branching-node model)

**Input**: User description: "Let's implement a feature where admin is able to plot an alternative route from the main route."

> **Canonical language note (Principle IV)**: The requested "alternative route from the main route" is the canonical **Detour** (`docs/CONTEXT.md`): _a demand-triggered, direction-specific loop that departs from and returns to a route's base polyline_. Detours belong to a **Direction** of a **Route**, never to the Route as a whole (ADR-0008).

> **Revisions since Draft (2026-08-27)**: The shipped model is the **branching-node** flow: the Administrator drops two free-form **split/merge nodes** anywhere along the main route, then clicks to add **detour stops** (real stops, full base-stop parity, scoped to the detour) along the alternative path between them. Entry point: a dedicated **Alternative routes sidebar** at the bottom-left (the action-bar Detour _tool_ was removed). Notable stops were **removed entirely** (no consumer; see Clarifications). Detour lines use the **complement** of the main route's color, dashed, with per-piece **visibility toggles** under Map Layers → Markers; **inactive** detours fade and hide their nodes. **Activation** moved into the detour's properties (the list switch was removed). Deleting a detour is **permanent** (soft-delete removed). The integration test suite runs on a **dedicated test database** destroyed after each run.

## Clarifications

### Session 2026-08-27

- Q: Where do the Detour's notable stops come from — only existing Stops, or can the editor create new detour-only Stops on the loop? → A: Existing Stops only … _(superseded 2026-08-27: the notable-stops feature was removed by product decision — no consumer existed; passenger messaging lives in label + commuter_instruction. Replaced by **detour stops**: points created by the detour tool are REAL stops with full base-stop parity, scoped to their detour only.)_
- Q: Should the server add structural validation for detour invariants (entry/exit on base polyline, loop endpoints, additional distance) or is UI-only enforcement enough? → A: Minimal server-side validation — the existing detour endpoints MUST reject, with the standard error envelope and nothing persisted, a Detour whose entry/exit lie off the owning Direction's base polyline (beyond tolerance), whose loop does not begin at entry / end at exit, or whose `additional_distance_meters` is negative; server tests cover these cases. No new endpoints. _(Implemented: `assertDetourLoopEndpoints` / `assertPointOnLine` on POST+PUT, FR-023; detour labels are additionally unique per Direction.)_
- Q: How should detour stops be modelled and managed? → A (product decision): dedicated `detour_stops` rows (ordered, cascade with the detour); splitting/merging is expressed as free-form nodes; the stops live in the left stops sidebar while a detour is focused and are fully editable.

## User Scenarios & Testing _(mandatory)_

The **Administrator** is the only actor. With a Direction's base path open, the Administrator creates an alternative route from the **Alternative routes sidebar** (bottom-left): **Add alternative route** → click the **split node** on the main route → click the **merge node** ahead of it → click to add **detour stops** along the path between them → label + instruction → **Save**. The main route stays solid and always visible as the reference; detours are dashed in the route color's complement.

### User Story 1 - Plot a detour from the main route (Priority: P1)

With a Direction that already has a plotted base path open, the Administrator adds an alternative route from the sidebar, drops the split and merge nodes on the main route, places detour stops between them, and saves. The Detour persists under the Direction and survives a reload.

**Independent Test**: Open a Direction with a plotted base path → **Add alternative route** → click split node → click merge node → add ≥1 detour stop → save → the Detour appears in the Alternative routes sidebar and on the map after a reload.

**Acceptance Scenarios**:

1. **Given** a Direction with a plotted base path is open, **When** the Administrator chooses **Add alternative route** in the Alternative routes sidebar, **Then** the editor opens with step-by-step instructions (split → merge → stops) and the base path fully rendered as the reference.
2. **Given** the editor is open, **When** the Administrator clicks the **split node** position on the main route, **Then** the node is placed at the clicked position **snapped onto the base polyline** with the snap result shown; off-corridor clicks are refused with a recovery message.
3. **Given** the split node is placed, **When** the Administrator clicks the **merge node** position, **Then** it is snapped onto the base polyline; placing the merge **before** the split (out of travel order) is refused with a **Swap split/merge** action; a merge within 30 m of the split (degenerate) is refused.
4. **Given** valid nodes, **When** the Administrator clicks along the alternative path, **Then** each click adds a **detour stop** (a real stop with full base-stop parity, detour-scoped), and the loop is road-followed through `split → detour stops → merge`.
5. **Given** the composition, **When** the Administrator saves, **Then** one atomic save persists the Detour (nodes, loop, detour stops) under the Direction; after reload everything is still rendered.
6. **Given** the Administrator is focused on a Detour, **When** they tap the map on the **Select** tool (or the sidebar's back button), **Then** they return to the main route; detour placement only ever happens on the **Add** tool.

### User Story 2 - Describe the detour precisely (Priority: P2)

The Administrator gives the Detour its identity and rider-facing content: an auto-labeled title, the required commuter instruction, an optional driver instruction, and its **detour stops** (renamed/typed/dragged like base stops). The system shows the exact additional distance over the replaced base segment.

**Why this priority**: A Detour is only usable by commuters if its instruction text is truthful and its stops are known; the exact additional distance is part of the fare/distance model (ADR-0008).

**Independent Test**: Open a Detour editor, change label/commuter/driver instruction and a detour stop's name/type, save, and confirm every value persists unchanged after a reload.

**Acceptance Scenarios**:

1. **Given** a new Detour is being drawn, **When** it is first created, **Then** it receives an auto-generated default label (e.g. "Detour 1", "Detour 2", … in creation order within the Direction), editable at any time.
2. **Given** the Administrator intends to save, **When** the label or the commuter instruction is empty, **Then** the save is blocked with a clear explanation naming the missing field.
3. **Given** nodes and a loop, **When** the editor is shown, **Then** the additional distance (loop length − replaced base-segment length) is computed exactly from geometry and displayed, ≥ 0.
4. **Given** detour stops change (added, removed, or dragged), **When** the composition updates, **Then** the additional distance is recomputed exactly from the new geometry.
5. **Given** the Detour's detour stops, **When** the Administrator clicks one on the map (or its row in the left stops sidebar), **Then** its properties editor opens (name, type, guaranteed service, landmark hint, notes) and it can be dragged to a new position.
6. **Given** a saved Detour, **When** the Administrator reloads the workspace, **Then** the label, instructions, detour stops, and additional distance are all still present and unchanged.

### User Story 3 - Manage a direction's detours (Priority: P2)

Every Detour of the current Direction is listed in the **bottom-left Alternative routes sidebar** (pinned below the stops sidebar). Focusing one (row click or a stop-marker click) loads it into the editor; while focused, the stops sidebar **swaps to that detour's stops** with matching marker designs. Activation is toggled in the detour's properties; removal is **permanent** with a styled confirm.

**Independent Test**: List the Detours of a Direction, focus one, change its stops/text, save; toggle its active state from the properties; permanently delete another with a styled confirm — testable with two saved Detours.

**Acceptance Scenarios**:

1. **Given** a Direction has saved Detours, **When** the Administrator views it, **Then** all Detours appear in the bottom-left sidebar (label + visibility eye + active indicator), pinned to the bottom regardless of stops-list height.
2. **Given** a Detour in the list (or on the map), **When** the Administrator focuses it, **Then** the editor loads with nodes, loop, detour stops, and text ready to edit, the base path is shown as reference, and the left stops sidebar shows that detour's stops.
3. **Given** the Administrator edits a saved Detour, **When** they change geometry or any field and save, **Then** the update is a single atomic action and the reloaded workspace shows the update.
4. **Given** the Administrator removes a Detour, **When** they confirm the styled prompt, **Then** the Detour is **permanently deleted** (row removed; label freed; other Detours unaffected) — no soft-delete tier exists.
5. **Given** two Detours on the same Direction, **When** both are visible, **Then** they are distinguishable from each other and from the base path (complement-family colors, dashed, per-detour variation).
6. **Given** an inactive Detour, **When** rendered, **Then** its line renders at lowered opacity and its split/merge nodes are hidden; the **active** switch lives in the Detour's properties panel.

### User Story 4 - Fix mistakes and keep work safe (Priority: P3)

Undo/Redo steps through every node/stop/text action; unfinished Detours are kept as 24 h client drafts and offered on return; concurrent-save conflicts surface without losing local work.

**Independent Test**: Undo/redo detour-plotting steps (split, merge, stop adds, text), confirm restore is offered after navigating away, and see a clear conflict message on a simulated save conflict.

**Acceptance Scenarios**:

1. **Given** placed nodes/stops or edited text, **When** the Administrator invokes Undo, **Then** the most recent detour action is reversed (including the placement phase); Redo re-applies it.
2. **Given** an unfinished Detour with unsaved changes, **When** the Administrator leaves, **Then** a beforeunload warning fires and the in-progress composition is kept as a draft and offered for restore on return.
3. **Given** a save against a concurrently changed list, **When** attempted, **Then** a clear conflict message is shown, the list is refetched, and the local work is not silently discarded.

### Edge Cases

- The Direction has **no plotted base path** — **Add alternative route** is explained as unavailable; the base path must be plotted first.
- The merge node is placed **before** the split (out of travel order) — refused with a **Swap split/merge**; nothing is saved.
- Split and merge are **too close** (< 30 m) — refused with a clear explanation.
- A node click lands far off the route — refused with a visible recovery message ("place the split/merge node near it"); a corridor cap (~5 km) guards sanity.
- **No detour stops yet** — the save gate requires ≥1: "click along the path between the split and merge nodes".
- Road-following is unavailable — the loop degrades to a straight line with a visible warning; saving still works (best-effort, never blocking).
- **Select tool** while a Detour is focused — map taps return to the main route; placement only happens on the **Add** tool (no stray stops).
- The loop crosses the base path or another Detour — allowed; every path renders distinctly.
- The Direction/base path changed while editing — load/save surfaces a clear error with a retry path; local work retained.
- The commuter instruction references travel time — never displayed anywhere (ADR-0009): the editor shows distances only.
- Coordinate-order regression ("ocean" points) — release-blocking; points appear exactly where clicked (nodes, stops, loop, export).
- A malformed payload (entry/exit off the polyline, loop endpoints drift, negative distance) reaches the server — rejected with the standard envelope, nothing persisted (FR-023); duplicate detour labels within a Direction are also rejected.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Administrator MUST be able to start plotting a Detour for the open Direction of a Route via an **Add alternative route** action in the **bottom-left Alternative routes sidebar**; the action MUST be unusable, with a clear explanation, until that Direction has a plotted base polyline. (The action-bar Detour _tool_ was removed in favor of the sidebar.)
- **FR-002**: A Detour MUST be nested under exactly one Direction of a Route; the owning Direction MUST be explicit while plotting.
- **FR-003**: The Administrator MUST place the Detour's **split** and **merge** nodes on the map, each **snapped onto the base polyline** with the snapped result visibly shown (ADR-0008 geometry-point model — not stop references); nodes are freely placeable anywhere along the route.
- **FR-004**: The **merge** node MUST be ahead of the **split** along the polyline (direction of travel); an out-of-order pair MUST be refused with a clear explanation and a **Swap split/merge** action.
- **FR-005**: The alternative loop MUST begin exactly at the split node and end exactly at the merge node; a degenerate pair (nodes < 30 m apart) MUST be refused.
- **FR-006**: The loop MUST be road-followed through `split → detour stops → merge` (same best-effort engine as the base path); when unavailable it MUST degrade to a straight line with a visible warning and MUST never block finishing the Detour.
- **FR-007**: Saving MUST be a single atomic action persisting the label, split/merge nodes, loop, instructions, detour stops, and computed additional distance; after reload the Detour MUST appear under its Direction.
- **FR-008**: A new Detour MUST receive an auto-generated default label in creation order within the Direction ("Detour 1", "Detour 2", …); editable and non-empty at save time.
- **FR-009**: The **commuter instruction** MUST be non-empty at save time; the **driver instruction** MUST be optional.
- ~~**FR-010**~~ **REMOVED (2026-08-27)**: notable stops (no consumer; migration `0004_drop_detour_notable_stops`). Replaced by **detour stops** (below).
- **FR-010a (detour stops)**: Points created by the detour tool MUST be real stops with full base-stop parity (name, type, guaranteed service, landmark hint, notes), stored as dedicated `detour_stops` rows scoped to their Detour only — never part of the base chain; ordered; draggable; editable via the stops sidebar and properties rail.
- **FR-011**: The additional distance (loop length − replaced base-segment length) MUST be computed exactly from geometry, displayed exactly, recomputed on any geometry change, and never hand-entered or rounded-into-plausibility (ADR-0008).
- **FR-012**: Detour lines MUST be visually distinct: **dashed** and colored as the **complement** of the owning route's color (with a small per-detour variation), so they contrast the solid base path while remaining distinguishable from one another. **Inactive** Detours render at lowered opacity with their nodes hidden. Every piece — detour lines, detour stop markers, detour stop names, split/merge nodes — has an independent visibility toggle (Map Layers → Markers → Alternative routes, all on by default); selection MUST never be conveyed by color alone.
- **FR-013**: The workspace MUST show a **nested list of the Direction's Detours** in the bottom-left **Alternative routes sidebar** (loading/empty/error states); focusing one (row or stop-marker click) loads it into the editor, and while focused the **left stops sidebar swaps to that Detour's stops** with matching marker designs.
- **FR-014**: Removing a Detour MUST be a **permanent delete** behind a styled confirm (soft-delete removed by product decision); other Detours must be unaffected and the removed label becomes reusable.
- **FR-015**: Detour-plotting edits (split placement, merge placement, stop add/move/remove, text) MUST support **Undo/Redo** like the base editor (including the placement phase).
- **FR-016**: An unfinished Detour MUST be kept as a **draft** (client-local, 24 h TTL), a warning shown on leaving, and an offer to restore made on return.
- **FR-017**: A save conflict MUST surface clearly and MUST NOT silently discard local work (list refetched, message shown).
- **FR-018**: Loading, empty, and error-with-retry states MUST exist for the Alternative routes sidebar and the editor.
- **FR-019**: No travel-time estimate MUST be displayed anywhere in the Detour workflows (ADR-0009).
- **FR-020**: Placed nodes, stops, and loop vertices MUST appear exactly at the intended map positions — a coordinate-order misplacement ("ocean") is release-blocking (also enforced in the export contract).
- **FR-021**: The Detour surfaces MUST be keyboard-operable and meet WCAG AA contrast/focus, matching the workspace.
- **FR-022**: All displayed distances (loop, replaced segment, additional distance) MUST be exact and legible.
- **FR-023**: The **server** MUST validate the structural invariants on the existing detour endpoints (no new endpoints): reject with the standard envelope and nothing persisted a Detour whose entry/exit lie off the base polyline, whose loop does not start/end at entry/exit, whose `additional_distance_meters` is negative, or whose **label duplicates an existing detour label in the Direction** (POST and PUT).

### Key Entities

- **Detour**: nested under one Direction (`direction_id`), defined by `label`, `entry`/`exit` (split/merge nodes — geometry on the base polyline), `detour_polyline` (the loop through `detour_stops`), `additional_distance_meters` (exact), `commuter_instruction` (required), `driver_instruction` (optional), `detour_stops[]`, and `is_active` (activation; no soft-delete).
- **Detour Stop** (`detour_stops`): a real stop owned by a Detour — `detour_stop_id`, `detour_id` (cascade), `stop_order`, `name`, `location` (Point), `type` (`terminal`/`major_stop`/`waiting_area`), `is_guaranteed_service`, `landmark_hint`, `notes`. Never part of the base chain.
- **Direction**: the directed service the Detour is nested under; `base_polyline` is the reference path and the replaced segment between split and merge.
- **Draft** (client-only): the unsaved working state of an unfinished Detour — nodes, stops, loop, history — kept locally for 24 h and offered for restore.
- **Layer visibility** (client-only): per-piece toggles for detour lines, detour stop markers, detour stop names, and split/merge nodes, plus per-detour eye toggles (session-scoped).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of reviewers (≥ 5) can plot a Detour (split node, merge node, ≥1 stop, save) on a Direction with a plotted base path in under 5 minutes without guidance.
- **SC-002**: 100% of reviewers confirm a saved Detour still appears under its Direction after reload, with nodes, loop, detour stops, and text unchanged.
- **SC-003**: 100% of reviewers confirm the loop road-follows through the nodes and stops (with the visible straight-line fallback when unavailable) and that both nodes sit on the base polyline.
- **SC-004**: 100% of reviewers confirm a Detour is visually distinct from the base path and from other Detours, and that inactive Detours are visibly faded with nodes hidden.
- **SC-005**: The displayed additional distance matches an independent geodesic measurement of (loop − replaced segment) for 100% of plotted Detours.
- **SC-006**: 100% of reviewers can add, rename, retype, drag, and remove detour stops, and confirm they persist after reload and render with the distinct hollow-dashed marker style.
- **SC-007**: 100% of reviewers can undo/redo detour steps and confirm restore is offered after leaving.
- **SC-008**: 100% of reviewers can permanently delete a Detour with the styled confirm and confirm the other Detours are untouched.
- **SC-009**: Attempting **Add alternative route** without a plotted base path shows a clear explanation instead of an unusable editor.
- **SC-010**: 100% of reviewers confirm out-of-order or degenerate split/merge is refused with a clear explanation and nothing is saved.
- **SC-011**: On a simulated concurrent-save conflict, 100% of reviewers see a clear message and their local work remains.
- **SC-012**: No travel-time estimate is displayed anywhere in the Detour workflows (ADR-0009).
- **SC-013**: 100% of reviewers confirm every placed node/stop/vertex appears exactly where intended — no coordinate-swapped point (admin rendering and server export contract).
- **SC-014**: Hand-crafted payloads violating the invariants (entry/exit off polyline, loop endpoints drift, negative distance, duplicate label) are rejected by the server with the standard envelope and nothing persisted.

## Assumptions

- "Alternative route from the main route" is the canonical **Detour**; this spec uses canonical language and the "Add alternative route" label.
- **Scope**: Detour plotting only. Restriction editing and ADR-0012 conditional triggers remain out of scope.
- The detour data layer + server CRUD are consumed as-is; FR-023 adds minimal structural validation on the existing endpoints plus per-Direction label uniqueness. **No new server endpoints**.
- A Detour requires an already-plotted base polyline.
- Split/merge are **geometry points** on the base polyline (ADR-0008), not stop references; **detour stops are real rows** scoped to the Detour (this replaces the removed notable-stop annotation).
- **Additional distance** is computed exactly from geometry by the system and is ≥ 0; never hand-entered.
- The Detour editor **reuses the workspace's safety behaviors** (24 h drafts, undo/redo, styled confirms, conflict handling, keyboard paths, WCAG AA) extended to Detours.
- **Visual style**: solid main route vs dashed/complement-colored detour lines; the exact design tokens follow DESIGN.md (The Route Sign); visibility toggles are on by default; node/stop indicators show as distinct plates.
- Multiple Detours per Direction are allowed and always rendered distinctly; no activation semantics are evaluated at data-editing time (R2, ADR-0012).
- No ETA anywhere (ADR-0009).
- The workspace remains desktop-only (≥ 1024px, ADR-0014); mobile out of scope.
- The integration test suite runs against a **dedicated `komyuter_test` database** (schema replayed from migrations, destroyed on teardown) with a main-DB sweep safeguard — CRUD tests never touch the live dev database.
