# Feature Specification: Route Plotting Page

**Feature Branch**: `007-route-plotting-page`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Read the docs/ADMIN.md document for context. Let's implement the Route Plotting Page for admin dashboard. I'm going to describe my vision for the UI layout on the next prompt."

## Clarifications

### Session 2026-08-06 (resolved)

Three layout decisions were open pending the Administrator's UI vision; all three are now resolved:

- **Q1 — Overall page layout**: **Overlay-driven** — the map fills the page (full-bleed), and the navigation (route list / ordered stops) plus the element-editing area are floating overlays (panels/sheets) on top of the map; there are no fixed side columns that shrink the map.
- **Q2 — Plotting tool placement**: **Centered floating action bar below the map** for the plot-mode toggle, snap Apply/Revert, undo/redo, and layer toggles; keyboard shortcuts complement the visible controls.
- **Q3 — Element editing presentation**: **Right-side contextual properties panel** that appears only when an element (stop, polyline) is selected and hides when nothing is selected.

All non-layout requirements are specified from `docs/ADMIN.md` §5.3, §6.1, §7, §8, and ADR-0011.

### Session 2026-08-06 (clarify)

- Q: When the Administrator saves a plotted route, how should the base direction and its stops be persisted? → A: **Single atomic Save** — one action persists the base direction plus all placed stops together, then derives the return direction; no per-stop or per-direction saves.
- Q: How should a newly placed stop get its required name? → A: **Auto-default name** — a click places the stop with a generated default name ("Stop 1", "Stop 2", … in placement order), editable later in the right-side properties panel; plotting is never blocked for naming.
- Q: Should an already-placed stop be repositionable? → A: **Yes, drag to reposition** — any placed stop can be dragged to a new position; the connecting path re-snaps, the drag is undoable, and the new position persists with the next Save.
- Q: What should the page show when no Route is selected? → A: **Map + guidance overlay** — the map stays visible with a guidance overlay offering "Create new route" and "Import JSON dataset (coming soon)" buttons (ADMIN.md empty-state baseline).

## User Scenarios & Testing _(mandatory)_

The **Administrator** is the only actor in this feature. The Route Plotting Page is the map-first surface where the Administrator draws the base path of a PUJ Route: placing stops in order, having the connecting path follow the real road network, and saving the direction (with the return direction derived automatically, per ADR-0011). Today the page is a placeholder ("No route selected" empty state); this feature replaces it with a working plotting surface.

### User Story 1 - Plot a route's base path on the map (Priority: P1)

An authenticated Administrator opens the Route Plotting Page, picks (or creates) a Route, switches to plot mode, and clicks along the street to place stops. Each click adds a stop and a connecting line that follows the roads; the Administrator previews the snapped path, applies it, and saves. The return direction is derived automatically.

**Why this priority**: Drawing the base path is the heart of the admin's job — every other capability (stops, detours, restrictions, fare linkage) hangs off a plotted Route. Without this story, the page delivers no value.

**Independent Test**: A reviewer can open the page, plot a multi-stop route on the map, see the stops in the order placed with the path following roads, and save it — no other capability required.

**Acceptance Scenarios**:

1. **Given** the Administrator is on the Route Plotting Page with a Route selected, **When** they place a first stop on the map, **Then** the stop appears at the exact location clicked and is marked as the start of the route.
2. **Given** the Administrator places additional stops, **When** each new stop is placed, **Then** a connecting line is drawn from the previous stop and a road-following version is offered as a preview the Administrator can Apply or Revert.
3. **Given** the Administrator applies the road-snapped path, **When** the polyline is confirmed, **Then** every placed stop sits on the polyline (no floating stops).
4. **Given** the Administrator tries to save a path that does not start on a stop or does not end on a stop, **When** they save, **Then** the save is blocked with a clear explanation; a path that ends on its starting stop (a loop) is allowed.
5. **Given** the Administrator saves a plotted base path, **When** the direction is persisted, **Then** the return direction is derived automatically from the base path and remains a distinct, editable direction (ADR-0011).
6. **Given** the Administrator reloads the page after saving, **When** they reopen the Route, **Then** the plotted stops and path are still there in the order they were placed.

### User Story 2 - Plot manually, then connect (Priority: P2)

The Administrator prefers to drop all stops first and review the sequence before any connecting lines appear. They switch to Manual mode, drop stops freely, then choose Connect to link them in placement order into the route path.

**Why this priority**: Automatic mode serves the common case, but Administrators who plan the stop sequence first need a mode that does not draw lines until they say so; it is a distinct workflow, not a variant.

**Independent Test**: A reviewer can plot a route in Manual mode (no connecting lines while placing stops) and complete it with a single Connect action — testable with the map alone.

**Acceptance Scenarios**:

1. **Given** the Administrator has enabled Manual plotting mode, **When** they place stops, **Then** no connecting lines are drawn between them.
2. **Given** stops have been placed in Manual mode, **When** the Administrator chooses Connect, **Then** the stops are linked in placement order into the route path and the same road-snap preview/Apply/Revert flow applies.
3. **Given** the Administrator switches between Automatic and Manual modes mid-plot, **When** they place further stops, **Then** the behavior matches the newly selected mode and no placed stops are lost.

### User Story 3 - Fix mistakes and keep work safe (Priority: P2)

The Administrator misplaces a stop or rejects a snap, and needs to step back without restarting. They use Undo/Redo for placements, deletions, and snap applications; if they navigate away with unsaved plotted changes, the work is kept as a draft and restored when they return.

**Why this priority**: Plotting is iterative; the cost of a mistake is re-drawing the route. Undo/Redo and draft persistence are what make the page usable for real editing sessions.

**Independent Test**: A reviewer can undo and redo a stop placement, a deletion, and a snap application, and can confirm that unsaved work survives an accidental navigation away — testable without any other capability.

**Acceptance Scenarios**:

1. **Given** the Administrator has placed, deleted, or snapped stops, **When** they press Undo, **Then** the most recent action is reversed; Redo re-applies it.
2. **Given** the Administrator has unsaved plotted changes, **When** they navigate away from the page, **Then** they are warned, and if they leave anyway the work is kept as a draft.
3. **Given** a draft exists from a previous session, **When** the Administrator returns to the page, **Then** the draft is offered for restore, and it is honored until it expires.

### User Story 4 - Understand the plotted route at a glance (Priority: P3)

The Administrator reads the map while plotting: stops are visually distinct by type, the route path is distinguishable from the base map, and map layers can be toggled to reduce clutter.

**Why this priority**: Plotting on a busy street map is only effective when the drawn route is legible; this story makes the previous three usable.

**Independent Test**: A reviewer can identify each stop type by its shape and toggle each map layer on and off — testable on a plotted route alone.

**Acceptance Scenarios**:

1. **Given** a plotted route with different stop types, **When** the Administrator looks at the map, **Then** terminal stops, major stops, and waiting areas are each shown with a distinct shape.
2. **Given** the map shows a plotted route, **When** the Administrator toggles a layer (Stops, Terminals, Routes) off, **Then** only that layer's content disappears; toggling it back restores it.
3. **Given** the Administrator selects a stop, **When** the selection is made, **Then** the stop and its place in the ordered stop list are both clearly highlighted, and the stop's properties are available for editing.

### Edge Cases

- The Route has no directions yet — the page starts in a clean plotting state for the first (base) direction.
- The Administrator tries to save with fewer than two stops — blocked with a clear explanation (a path needs a start and an end stop).
- The path does not start or end on a stop — blocked; a loop ending on the start stop is allowed.
- A click lands on water, off the road network, or outside the service region — the stop is still placed at the clicked location and the connecting line degrades to a straight line with a warning; placement is never blocked.
- The road-snapping service is unavailable, slow, or has no token configured — the straight-line fallback is used and the next point can still be placed (best-effort, never blocking).
- The path has more waypoints than the mapping service accepts — the preview request is split into chunks and still offers a single Apply/Revert decision.
- A snap preview is pending while the Administrator places another stop or tries to save — the pending preview is resolved (applied, reverted, or replaced) before the polyline is committed.
- The Administrator deletes a stop in the middle of the sequence — the path reconnects across the gap and the remaining stops keep their order; Undo restores the deleted stop.
- The Administrator navigates away with unsaved changes and dismisses the warning — the draft is kept (local, 24h TTL); after expiry, no draft is offered and nothing is silently restored.
- The Administrator saves while another Administrator is editing the same Route — the save surfaces a clear conflict message and the local work is not silently discarded.
- A plotted stop appears displaced from the clicked location — never; a coordinate-order error that lands stops "in the ocean" is treated as a release-blocking defect.
- The Administrator edits a stop's name or type — the change persists through save and survives a reload; stop type changes are reflected in the map shape.
- A stop placed by click is auto-named in placement order (e.g. "Stop 2") — it can be renamed in the properties panel at any time, and no stop is ever unnamed at save time.
- A stop is dragged to a new position — the path re-snaps across the affected segments; if the snapping service is unavailable, the straight-line fallback applies with a warning, and Undo restores the previous position.
- No Route is selected (page opened directly) — the map is shown with the guidance overlay and both action buttons; the element-editing panel remains hidden and no plotting controls are active.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Route Plotting Page MUST use an **overlay-driven layout**: the map MUST fill the page (full-bleed), with the route/stop navigation and the element-editing area presented as floating overlay panels on top of the map; the page MUST NOT use fixed side columns that shrink the map.
- **FR-002**: The Administrator MUST be able to select which Route to plot, or create a new Route to plot, through the floating navigation overlay; selecting a Route that already has a plotted path MUST load its existing stops and path into the plotting surface.
- **FR-003**: The Administrator MUST be able to plot the Route as a single connected base path by placing stops on the map in chronological order.
- **FR-004**: The plotted path MUST start on a stop and MUST end on a stop; it MAY end on the starting stop (a loop).
- **FR-005**: The Administrator MUST be able to choose between **Automatic** and **Manual** plotting modes via a clear toggle.
- **FR-006**: In **Automatic** mode, each placed stop MUST immediately draw a connecting line from the previous stop.
- **FR-007**: In **Manual** mode, placed stops MUST show no connecting lines until the Administrator performs a **Connect** action, which links them in placement order into the route path.
- **FR-008**: The connecting path MUST be offered as a road-following preview the Administrator can **Apply** or **Revert** as a whole; the preview MUST respect one-way roads.
- **FR-009**: Road following MUST be best-effort: when the snapping service is unavailable or not configured, the connecting line MUST degrade to a straight line with a visible warning, and placing the next stop MUST never be blocked.
- **FR-010**: Stops MUST be shown in the chronological order the Administrator placed them, and the order MUST be preserved through save and reload.
- **FR-011**: Every stop MUST be connected to the plotted polyline (a stop is never a floating point).
- **FR-012**: When the base path is saved, the return direction's polyline MUST be derived automatically from the base path and MUST remain a distinct, editable direction (ADR-0011).
- **FR-013**: The page MUST provide **Undo** and **Redo** for stop placement, stop deletion, and snap applications, across both plotting modes.
- **FR-014**: Unsaved plotted changes MUST be kept as a draft (client-local, 24h time-to-live) and offered for restore when the Administrator returns; navigating away with unsaved changes MUST require an explicit confirmation.
- **FR-015**: Terminal stops, major stops, and waiting areas MUST each have a distinct shape on the map, and selection MUST never be conveyed by shape or color alone.
- **FR-016**: The map MUST expose **Stops**, **Terminals**, and **Routes** layers, each with a visibility toggle; **Terminals** MUST be a sub-filter of Stops by type.
- **FR-017**: Saving MUST be refused with a clear explanation when the path has fewer than two stops or does not start and end on a stop; a loop ending on the start stop is valid.
- **FR-018**: A selected stop's properties (name, type, and related fields) MUST be editable in a **right-side contextual properties panel** that appears only when an element is selected and hides when nothing is selected; edits MUST persist through save and survive a reload.
- **FR-019**: The plotting controls (plot-mode toggle, snap Apply/Revert, undo/redo, layer toggles) MUST sit in a **centered floating action bar below the map**; keyboard shortcuts MUST complement, not replace, the visible controls.
- **FR-020**: All page controls MUST be keyboard-operable, and the page MUST provide keyboard shortcuts for the most frequent actions (save, undo); all controls MUST meet WCAG AA contrast and focus visibility.
- **FR-021**: The page MUST NOT display any travel-time estimate for the plotted route (ADR-0009 regression guard).
- **FR-022**: A plotted stop MUST appear exactly at the map position the Administrator clicked — no coordinate-order misplacement ("a stop in the ocean") is acceptable.
- **FR-023**: The page MUST show loading, empty, and error states so the Administrator always understands the state of the data (e.g. no routes yet, load failure with retry, save conflict).
- **FR-024**: All displayed distances MUST be exact and legible; the page MUST NOT fabricate or round-into-plausibility any value.
- **FR-025**: The page MUST follow the established admin visual language (pure white ground, cerulean identity, amber reserved for attention, ≤4px corners, no shadows) and MUST NOT introduce a new visual system.
- **FR-026**: The page MUST be reachable only by an authenticated Administrator; unauthenticated access MUST redirect to sign-in.
- **FR-027**: Saving MUST be a single atomic action: one Save MUST persist the base direction and all of its placed stops together, and then derive the return direction; there is no separate per-stop or per-direction save step.
- **FR-028**: A newly placed stop MUST receive an auto-generated default name immediately on placement (e.g. "Stop 1", "Stop 2", … in placement order); the Administrator MUST be able to rename it in the properties panel at any time, and plotting MUST never be blocked for naming.
- **FR-029**: The Administrator MUST be able to reposition an already-placed stop by dragging it on the map; the connecting path MUST re-snap to the roads for the affected segments, the reposition MUST be undoable, and the new position MUST persist with the next Save.
- **FR-030**: When no Route is selected, the page MUST show the map with a guidance overlay offering **Create new route** and **Import JSON dataset** actions; the import action MAY show a "coming soon" placeholder (actual import is out of scope), and the element-editing panel MUST stay hidden until a Route is selected and an element is chosen.

### Key Entities

- **Route**: the single bidirectional entity being plotted — identified by a route code (slug), with a name, short name, color, active status, and fare configuration reference. One Route yields exactly two Directions.
- **Direction**: a directed service with its own polyline and ordered stop list. The Administrator plots one base path; the return Direction's polyline is auto-derived (reversed) from it and remains distinct and editable (ADR-0011).
- **Stop**: an admin-curated named boarding/alighting point (terminal, major stop, or waiting area) placed on the map, with a chronological order within its Direction and a point location on the plotted polyline.
- **Draft** (client-only, not persisted): the unsaved working state of a plotted path — placed stops, polyline, and plotting history — kept locally for 24h and offered for restore.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of reviewers (≥ 5) can plot a multi-stop route and confirm the stops appear in the chronological order they placed them, starting and ending on a stop (a loop ending on the start stop is allowed).
- **SC-002**: 100% of reviewers confirm the plotted path follows the road network via a preview they can Apply or Revert.
- **SC-003**: 100% of reviewers can complete a route in both Automatic and Manual modes without guidance.
- **SC-004**: 100% of reviewers can use Undo and Redo to reverse and reapply a stop placement, a deletion, and a snap application without starting over.
- **SC-005**: After saving a plotted base path, the return direction exists, is distinct from the base path, and remains editable — confirmed by 100% of reviewers after a reload.
- **SC-006**: 100% of reviewers correctly identify each stop type by its map shape (terminal, major stop, waiting area).
- **SC-007**: 100% of reviewers can toggle each of the Stops, Terminals, and Routes layers and confirm only that layer's content is shown or hidden.
- **SC-008**: 100% of reviewers who navigate away with unsaved plotted changes are warned, and the work is restored from the draft when they return.
- **SC-009**: 100% of plotted stops appear exactly where clicked; no reviewer observes a misplaced (coordinate-swapped) stop.
- **SC-010**: No travel-time estimate is displayed anywhere on the page (ADR-0009 regression guard).
- **SC-011**: 100% of reviewers confirm the page uses the overlay-driven layout: a full-bleed map with a floating navigation overlay, a right-side contextual properties panel that appears on selection, and a centered floating action bar below the map.
- **SC-012**: 100% of reviewers complete the plot-and-save cycle (from opening the page to a saved direction) in under 5 minutes on their first attempt.
- **SC-013**: 100% of reviewers confirm that one Save action persists the base direction and all placed stops together — after saving and reloading, either the whole plotted direction is present or nothing of it is (no partial save).
- **SC-014**: 100% of reviewers can drag a placed stop to a new position and, after Save and reload, confirm the stop is at the new position with the connecting path re-snapped.
- **SC-015**: 100% of reviewers who open the page with no Route selected see the map with the guidance overlay and both the "Create new route" and "Import JSON dataset" actions.

## Assumptions

- The layout decisions are resolved: overlay-driven layout with a full-bleed map (Q1), a centered floating action bar below the map for plotting controls (Q2), and a right-side contextual properties panel appearing on selection (Q3). "Full-bleed" means the map fills the dashboard's content area below the app shell header/nav rail — not the entire browser viewport.
- The existing admin APIs for Routes, Directions, and Stops (ADMIN.md Appendix G) are complete and correct; this feature consumes them and adds no new server behavior.
- Detours (alternate routes) and restrictions (no-stop segments) are separate features and are OUT of scope for the Route Plotting Page; the page's scope is the base path and its stops.
- Road following is best-effort via the documented mapping-service proxy; without a configured service it degrades to straight lines with a warning and never blocks plotting (dev-mode friendly).
- The return direction is always auto-derived from the plotted base path on save (ADR-0011); the Administrator does not plot the return manually.
- Drafts are client-local, survive navigation within the dashboard, and expire after 24 hours; they are never sent to the server.
- The page targets desktop browsers (the admin dashboard is a desktop web app); mobile layout is not a goal.
- Visual implementation follows the existing admin design tokens and component conventions; no new design system is introduced (FR-025).
- The route list / route creation entry points that lead into the page may already exist (routes feature); this feature focuses on the plotting surface itself and the minimal navigation needed to reach it.
