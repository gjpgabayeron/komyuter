# Feature Specification: Admin Route Workspace Refactor

**Feature Branch**: `008-admin-route-workspace-refactor`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Context from REFACTOR.md"

## Overview

The Administrator's Route Workspace — the map-first page where PUJ Routes are plotted and managed — is rebuilt as a **three-layer, three-column, four-state desktop workspace**. Today the page is overlay-style: floating panels sit on top of a full-bleed map, which a design critique scored 30/40 (Nielsen) with the layout as its weakest system (fixed-width panels collide below ~964 px; the shell rail hover-expands over the route list; the draft-restore and conflict banners share one slot and collide; POI search is coupled to panel width by a magic number; save feedback is under-communicated; accessibility landmarks are missing).

The refactor replaces the overlay approach with one persistent map and chrome columns that mount **around** the map, driven by four explicit modes. It is a **presentation-only** change: all plotting behavior, the draft safety net, undo/redo, snapping, and save logic are preserved exactly and only re-homed in the new structure. The page is **desktop-only by declaration** — minimum viewport 1024 px, mouse-first, no responsive system.

The architecture decisions (desktop-only constraint, three-layer / three-column / four-state model) are already recorded in ADR-0014 and are binding.

## User Scenarios & Testing _(mandatory)_

The **Administrator** is the only actor. The Route Workspace is where the Administrator browses existing PUJ Routes, inspects one route, plots new routes, and edits stops — all on one map. This refactor changes how the workspace is _presented and navigated_, never what it can _do_.

### User Story 1 - Browse, inspect, and edit routes on one stable map (Priority: P1)

An Administrator opens the workspace with existing routes. The map fills the surface as a constant; a left column lists the routes; clicking a route in the list opens it for editing directly, while clicking a route's line on the map opens a focus plate (lightweight inspection of that route). Closing the plate returns to overview. Throughout, the map never flickers, reloads, or loses its place.

**Why this priority**: A persistent, non-colliding map is the page's core promise ("the map is the board"). Every other capability depends on the layout never getting in the way.

**Independent Test**: A reviewer can open the workspace, browse the route list, click a route in the list (edit) and click a route on the map (inspect), close the plate, and confirm the map never reloaded or shifted — no other capability required.

**Acceptance Scenarios**:

1. **Given** one or more saved routes, **When** the Administrator opens the workspace, **Then** the map shows the routes and a left column lists them without overlapping the map.
2. **Given** overview mode, **When** the Administrator clicks a route in the left list, **Then** the workspace opens that route for editing directly.
3. **Given** overview mode, **When** the Administrator clicks a route's line on the map, **Then** a focus plate for that route appears without entering edit mode.
4. **Given** focus mode, **When** the Administrator presses Esc or closes the plate, **Then** the workspace returns to overview with the map and camera unchanged.
5. **Given** any mode, **When** the Administrator resizes the window (at widths ≥ 1024 px), **Then** the columns never overlap and the map keeps its camera.

---

### User Story 2 - Create the first route from an empty workspace (Priority: P1)

An Administrator with no saved routes sees a calm "fresh board" veil over the warm map canvas with one clear create action (already focused). Creating lifts the veil, mounts the editing chrome, and puts stop-adding immediately active.

**Why this priority**: The empty state is the first impression and the entry point to all route data. Its current guidance overlay must survive the refactor and become clearer.

**Independent Test**: A reviewer can reach the workspace with zero routes, see the veil with an autofocused create action, create a route, and immediately place stops — no other capability required.

**Acceptance Scenarios**:

1. **Given** no routes exist, **When** the Administrator opens the workspace, **Then** a full-screen veil with a create-route action appears over the map, and the action is already focused.
2. **Given** the empty veil, **When** the Administrator presses Enter or clicks create, **Then** the veil lifts, the editing chrome mounts, and stop-adding is immediately active.
3. **Given** a workspace with routes, **When** the Administrator deletes the last remaining route, **Then** the workspace returns to the empty veil.

---

### User Story 3 - Never lose work: the safety net is preserved (Priority: P1)

Everything that protects the Administrator's work today — debounced draft auto-save (24-hour retention), the draft-restore banner, undo/redo, leave/reload guards, and one-atomic-action save — behaves **exactly as before**. This feature only re-homes that behavior in the new layout.

**Why this priority**: The critique called the draft/undo/save safety net a strength. Breaking it would be a regression, not a refactor.

**Independent Test**: A reviewer can create an unsaved draft, leave, return, restore it; undo and redo edits; attempt to leave with unsaved changes and get the styled confirmation; and save — comparing each step against the current page's behavior.

**Acceptance Scenarios**:

1. **Given** an unsaved draft from a previous session, **When** the Administrator opens the workspace, **Then** the restore banner appears in the status slot and restoring brings the draft back exactly — followed by a transient "Draft restored" confirmation that auto-dismisses (no manual dismissal).
2. **Given** edits in progress, **When** the Administrator triggers undo and redo repeatedly, **Then** each step reverts and restores exactly as before the refactor.
3. **Given** unsaved changes, **When** the Administrator tries to leave or reload, **Then** a styled in-app confirmation asks to keep or discard — the browser's default dialog is never used.
4. **Given** a valid plotted route, **When** the Administrator saves, **Then** the direction and all its stops persist together in one atomic action.

---

### User Story 4 - Read workspace mode and save status at a glance (Priority: P2)

While editing, a status slot sits at the top of the editing chrome and shows the save lifecycle (unsaved → saving → "Saved just now"). It is **context-sensitive**: the lifecycle plate renders only while there is something to say — a save in flight, an unsaved change, or a just-completed save (the "Saved just now" state is transient and auto-dismisses). Draft-restore and conflict notices share that slot one at a time — they never stack. The mode (overview / focus / edit) is always legible from the chrome that is mounted.

**Why this priority**: The critique flagged banner collision and under-communicated save feedback as P2 issues; they directly affect whether the Administrator trusts that work is safe.

**Independent Test**: A reviewer can make an edit, watch the status move through unsaved → saving → saved, and force a draft-restore and a conflict at the same time to confirm they never overlap.

**Acceptance Scenarios**:

1. **Given** unsaved edits, **When** the Administrator changes a value, **Then** the status slot immediately shows the unsaved state.
2. **Given** a save in progress, **When** it completes, **Then** the status shows a transient "Saved just now" (auto-dismisses) and the saved route is framed and highlighted.
3. **Given** a draft-restore condition and a conflict condition at the same time, **When** both hold, **Then** the notices appear one at a time in the single status slot, never overlapping.

---

### User Story 5 - Operate the workspace with keyboard and screen reader (Priority: P2)

Desktop-only does not waive accessibility: named regions announce the route list and the properties plate, Esc dismisses or steps back, Ctrl/Cmd+S saves in edit mode, and the primary action is autofocused in the empty state. Hover affordances (mouse-first) always have a keyboard equivalent.

**Why this priority**: A11y is a stated invariant of the workspace and a critique finding (missing landmarks); it must not regress during restructuring.

**Independent Test**: A reviewer can complete the whole route-editing workflow using only the keyboard and confirm the two named regions via a screen reader.

**Acceptance Scenarios**:

1. **Given** focus mode, **When** the Administrator presses Esc, **Then** the workspace returns to overview.
2. **Given** edit mode with unsaved changes, **When** the Administrator presses Esc or Back, **Then** a styled confirmation appears (never the browser dialog).
3. **Given** edit mode, **When** the Administrator presses Ctrl/Cmd+S, **Then** the route saves.
4. **Given** any mode, **When** a screen reader inspects the page, **Then** the route list and the properties plate are announced as named regions, and every core action is keyboard-reachable.

---

### User Story 6 - Get clear, honest editing feedback (Priority: P3)

Editing affordances are explicit: Add/Select mode is visibly indicated, invalid color values and empty stop names show inline validation hints instead of silent behavior, and all copy is plain operational language free of developer jargon.

**Why this priority**: These are the critique's P3 / heuristic items; they determine whether the page feels finished and trustworthy.

**Independent Test**: A reviewer can switch between Add and Select modes and see the state, enter an invalid color and an empty stop name and see field-level hints, and confirm no developer jargon remains visible.

**Acceptance Scenarios**:

1. **Given** edit mode, **When** the Administrator toggles Add vs Select, **Then** the active mode is visibly indicated.
2. **Given** a properties field, **When** the Administrator enters an invalid color value, **Then** the field shows a validation hint instead of silently ignoring the input.
3. **Given** a stop with an empty name, **When** the Administrator tries to proceed, **Then** an inline hint prompts for a name.
4. **Given** the full workspace, **When** the Administrator reads any message, **Then** no developer jargon (e.g., "MAPBOX_SECRET_TOKEN", "out of sync") appears.

---

### Edge Cases

- **Narrow window**: viewport below 1024 px → a single "wider window" notice plate; no broken or partially usable layout.
- **Expanded shell rail at the floor**: the notice gate keys off the **map region** staying ≥ 400 px wide, not off a viewport class — so it correctly guards both rail states.
- **Canvas resize moments**: zero — the map spans the full workspace as a backdrop in every state (ADR-0015), so plate mounting never changes the canvas size.
- **Simultaneous restore + conflict**: both conditions true at once → the status slot sequences them; they never stack.
- **Dirty exits**: Esc / Back / leave-navigation with unsaved changes → styled confirmation, never the browser dialog.
- **Last route deleted**: columns unmount and the empty veil remounts over the warm canvas.
- **Reduced motion**: all mounts are decisive snaps; the veil fade is ≤ 120 ms and framing ≤ 400 ms, both gated behind the user's reduced-motion preference.
- **Hover-only traps**: no core action is reachable _only_ by hover — a keyboard path always exists.
- **Value fidelity**: nothing displayed changes meaning — stop names, colors, and distances render identically to the current page.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The map MUST be a single persistent surface across all four modes — it MUST NOT reload, remount, or reset its camera except on explicit framing actions (inspecting a route, saving).
- **FR-002**: The workspace MUST present exactly four distinct modes — empty, overview, focus, edit (overview = browsing all routes, focus = inspecting one route) — and MUST derive the current mode automatically from what the Administrator is doing.
- **FR-003**: At every viewport width ≥ 1024 px the layout columns MUST NOT overlap or collide; below 1024 px the workspace MUST show a single "wider window" notice plate instead of a broken layout.
- **FR-004**: The map region MUST never be narrower than 400 px; when the shell's navigation rail is expanded and would push the map below that, the notice gate MUST appear.
- **FR-005**: Clicking a route in the left list MUST open edit mode ("list-click = act"); clicking a route's line on the map MUST open focus mode ("map-click = peek").
- **FR-005a**: The route/stop search MUST remain available in edit mode, anchored consistently to the workspace regardless of window width — its positioning MUST NOT depend on panel width.
- **FR-006**: The workspace MUST show the save lifecycle in a fixed status slot (unsaved → saving → "Saved just now") and the slot MUST be context-sensitive — the lifecycle plate appears only on an actual status change (saving, dirty, or a transient just-completed save that auto-dismisses); draft-restore, draft-restored, and conflict notices MUST share that slot one at a time and MUST NOT display overlapping.
- **FR-007**: All confirmations for destructive or data-loss actions (discard, delete last route, leave with unsaved changes) MUST use the application's styled dialog — the browser's native dialog MUST NOT be used.
- **FR-008**: Keyboard operation MUST cover the full workflow: Esc dismisses in focus / steps back in edit (styled confirm when dirty), Ctrl/Cmd+S saves in edit, and the primary action autofocuses in the empty mode.
- **FR-009**: Accessibility MUST be preserved: named regions for the route list and the properties plate, every core action keyboard-reachable, focus management across mode transitions, and AA text sizes.
- **FR-010**: The draft safety net MUST behave exactly as before: debounced auto-save with 24-hour retention, restore banner, undo/redo, and leave/reload guards.
- **FR-011**: The visual identity MUST remain the Route Sign grammar: white plates, 1 px borders, corners ≤ 4 px, no shadows, 16 px gutters; mounts are decisive snaps, veil fade ≤ 120 ms, framing ≤ 400 ms, honoring the reduced-motion preference.
- **FR-012**: Displayed values MUST be unchanged by the refactor: route/stop names, colors, and distances render identically to the current page.
- **FR-013**: Editing feedback MUST be explicit: Add/Select mode visibly indicated; invalid color values and empty stop names show inline validation hints instead of silent behavior; all copy uses plain operational language without developer jargon.

_No [NEEDS CLARIFICATION] markers remain — all open layout decisions were resolved in conversation and recorded in ADR-0014 (shell rail respects the persisted preference: expanded docks/pushes, hover overlays the content; single right-column width across focus and edit; white veil with `@supports`-gated blur). Terminology normalized to the canonical state names empty / overview / focus / edit (formerly referred to as "browsing" / "inspection")._

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: At 1024, 1440, and 1920 px viewport widths (rail collapsed) the floating plates never overlap and the free map region is ≥ 400 px wide; with the rail expanded, the notice gate appears instead of letting the free map region drop below 400 px. (ADR-0015: the map itself spans the full workspace behind the plates.)
- **SC-002**: The map surface identity and camera survive all four modes — verifiable by a smoke check that the map never re-initializes while the Administrator moves between modes. (ADR-0015: the full-bleed map never resizes across states.)
- **SC-003**: All eight documented mode transitions behave per the transition table; a reviewer can exercise each transition in under 5 seconds.
- **SC-004**: 100% of draft-restore, undo/redo, save-validation, and atomic-save scenarios produce the identical outcome as before the refactor (regression pass against current behavior).
- **SC-005**: Zero browser-native confirmation dialogs and zero developer-jargon strings remain in the workspace.
- **SC-006**: The complete route-plotting workflow is completable with keyboard only, and a screen reader announces named regions for the route list and the properties plate.
- **SC-007**: The project's lint, type-check, and format checks pass; all existing automated tests pass; new unit tests cover the mode-derivation logic, the layout geometry tokens, and the width gate.
- **SC-008**: The five layout-related critique findings (panel collisions below ~964 px, rail swallowing the route list, banner stacking, POI search coupled to panel width, missing landmarks) are not reproducible after the refactor. _Nuance (D1 reversal, 2026-08-16): in hover mode the rail briefly overlays the left plate while hovered — the critique's defect was the rail *shoving* the workspace, which no longer happens; the workspace never shifts._

## Assumptions

- **Desktop-only by declaration**: minimum viewport 1024 px; no responsive breakpoints, no touch design; the "wider window" gate plate is the only width behavior.
- **Presentation-only scope**: no backend, API, shared-package, or data-model changes; no new dependencies are introduced.
- **Behavior freeze**: snapping, draft persistence (24 h), undo/redo, atomic save, and validation are preserved as-is and only re-homed.
- **Decisions recorded**: the desktop-only constraint and the three-layer / three-column / four-state architecture are already recorded in ADR-0014 and are binding.
- **Visual world unchanged**: the Route Sign grammar (DESIGN.md) remains the incumbent world and is binding; the refactor must not introduce a new design system.
- **Quality gates**: the admin workspace continues to be covered by the project's existing lint, type-check, build, and test gates.
