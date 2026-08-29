# Feature Specification: Route Workspace Quality of Life

**Feature Branch**: `013-route-workspace-qol`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Improve the route workspace by implementing quality of life changes to standardize and enhance admin experience."

> **Scope note (grounding)**: This feature is a **standardization and parity** pass over the route workspace as it stands after the Detour (alternative route) feature shipped. It targets the concrete inconsistencies found in an audit of the workspace surfaces: two different save models with different labels and conflict copy, drifting field vocabulary, per-panel state treatments, missing interaction parity between base stops and detour stops, duplicated color values, and controls that look actionable but do nothing. It introduces **no new capabilities** (no route import implementation, no new tools, no data-model changes); where a finding conflicts with `PRODUCT.md`/`DESIGN.md`, DESIGN wins on visual matters and PRODUCT on voice. (Per clarification 2026-08-29: an **open lane** exists — new capabilities the Administrator names during planning are evaluated there, but this spec itself requires none.)

## Clarifications

### Session 2026-08-29

- Q: Scope of "quality of life" — standardization & parity only (audit-derived), or also new capabilities? → A: Standardization & parity as written, plus an open lane: new capabilities the Administrator names during planning are evaluated in the plan's Complexity Tracking (per the Constitution), not folded into this spec's FRs/SCs.
- Q: Disposition of the non-functional "Import" control → A: Keep it, visibly disabled with a short reason ("Coming soon" style); neither remove nor implement it within this feature.

## User Scenarios & Testing _(mandatory)_

The **Administrator** is the only actor. All stories are independent slices of the same standardization goal; each is testable on its own.

### User Story 1 - Know exactly how to save, and what the workspace is doing (Priority: P1)

The Administrator always knows how to save what they are editing and what the workspace is doing while it saves. Base-route edits and Detour edits present the same primary save control (same label and placement), the same in-flight and success feedback, and the same conflict recovery — never two mechanisms speaking different words.

**Why this priority**: Saving is the highest-stakes, highest-frequency action in the workspace. Today the base editor and the Detour editor use different save controls, different button labels, different success wording, and different conflict copy — the single largest source of Administrator uncertainty.

**Independent Test**: Open a Direction in the base editor and note the save control; open a Detour and note the save control; save from both and compare the feedback; simulate a conflict in both and compare the recovery dialog.

**Acceptance Scenarios**:

1. **Given** the base editor is active with unsaved changes, **When** the Administrator looks for the save action, **Then** exactly one primary save control is present, labeled and placed the same as in the Detour editor.
2. **Given** a save is in flight (base or Detour), **When** the Administrator observes the workspace, **Then** the status surface and any notification use the same wording ("Saving…") — never contradictory text.
3. **Given** a save succeeds, **When** it completes, **Then** the feedback is the same wording and duration on both surfaces ("Saved just now").
4. **Given** the data was changed elsewhere concurrently, **When** a save fails as a conflict, **Then** the same recovery dialog appears whether the conflict is on a base-route or a Detour save: local work is retained and the latest saved data is offered.
5. **Given** there is nothing to save (focus mode, or no unsaved changes), **When** the Administrator looks at the save control, **Then** it is absent or disabled using the same rule in both editing surfaces.

### User Story 2 - One vocabulary, one label style (Priority: P1)

The same field carries the same label everywhere it appears, section headings and field labels share one typographic style, and list counts render in one badge style. No spelling drift and no synonym drift between surfaces.

**Why this priority**: Consistent vocabulary is the cheapest trust-builder: an Administrator who learned a label in one dialog must never re-learn it in another. The audit found "Colour" vs "Color", "Route code" vs "Short name", two label styles, and mixed count renderings.

**Independent Test**: Open the new-route dialog, the route properties panel, the stops editor, and the Detour properties; compare the labels of shared fields, the heading/label styles, and the count renderings.

**Acceptance Scenarios**:

1. **Given** the same field appears in more than one surface (e.g., new-route dialog and route properties), **When** the Administrator compares, **Then** it carries the identical label in every surface (one canonical label per field; British/American and synonym variants resolved).
2. **Given** any grouped editor (route, stop, Detour), **When** read, **Then** section headings and field labels use one typographic style across every panel.
3. **Given** any list with a count (stops, Detours), **When** viewed, **Then** counts render in one badge style — never a mix of badges and plain numbers for the same kind of count.
4. **Given** a list search or filter box appears in more than one list, **When** compared, **Then** its label and placeholder wording match.

### User Story 3 - One set of list and panel states (Priority: P2)

Loading, empty, error-with-retry, and loaded states behave identically in every list and panel; a value that is absent reads as explicitly "Not set", never as a bare dash that is indistinguishable from loading.

**Why this priority**: Inconsistent states make the workspace feel unfinished and force the Administrator to guess whether an empty panel is broken. Today the Detour list, the route list, the focus plate, and the properties panels each use different loading/empty/error treatments.

**Independent Test**: Trigger a loading state, an empty list, and a load failure in each of the route list, stops sidebar, Detour list, and properties panel; verify the same treatment and wording everywhere, and that absent fields say "Not set".

**Acceptance Scenarios**:

1. **Given** a panel is loading, **When** the Administrator views it, **Then** it uses the workspace's single loading treatment (identical across all panels, including the focus plate).
2. **Given** a list has nothing to show, **When** viewed, **Then** it shows the standard empty state with a meaningful next action when one exists (e.g., "Add alternative route" when a Direction has no Detours).
3. **Given** a load failure in any panel, **When** viewed, **Then** the standard error-with-retry state appears, with the same wording and behavior in every panel.
4. **Given** a field whose value is absent (e.g., no last-updated time, no landmark hint), **When** read, **Then** it displays an explicit "Not set" label — never a "—" that could be mistaken for a loading placeholder.

### User Story 4 - Same interactions for the same kind of content (Priority: P2)

Detour stops behave exactly like base stops: drag reorder, ArrowUp/ArrowDown reorder, and click-to-select work the same in both lists. Keyboard shortcuts act on whichever editor is active and are never silently ignored.

**Why this priority**: Parity is what "standardized" means to a working Administrator — an interaction learned once must work everywhere. Today base stops reorder by drag and ArrowUp/ArrowDown, while detour stops support neither; and the save shortcut is silently disabled while the Detour editor is open.

**Independent Test**: Focus a Detour, drag and ArrowUp/ArrowDown its stops; then repeat the same gestures on base stops; confirm identical behavior. Press the save shortcut in the base editor, then in the Detour editor, then in focus mode, and observe consistent behavior.

**Acceptance Scenarios**:

1. **Given** a Detour is focused, **When** the Administrator drags a detour stop or uses ArrowUp/ArrowDown, **Then** it reorders exactly as a base stop does, with the same list and map results.
2. **Given** the Detour editor is active, **When** the Administrator presses the save shortcut, **Then** it saves the Detour with the same outcome and feedback as pressing the visible save control.
3. **Given** the base editor is active, **When** the Administrator presses the save shortcut, **Then** it saves the route edits — the shortcut behaves the same in kind as in the Detour editor.
4. **Given** no editor is active (focus mode), **When** the Administrator presses the save shortcut, **Then** nothing visible happens (there is nothing to save) — no error and no partial behavior.
5. **Given** any dialog is open, **When** the Administrator presses a shortcut, **Then** the dialog keeps focus and the underlying editor is never triggered.

### User Story 5 - One color source, no near-miss shades (Priority: P2)

Each semantic color used by the workspace (active route state, the loop/draft indication, attention accents, split/merge nodes, waiting-area markers) is defined exactly once and renders identically everywhere it is used. Selection is never conveyed by color alone.

**Why this priority**: The audit found the same meanings rendered from several copied values (e.g., a "Loop" badge, the draft line, and map markers each carrying their own color), which drifts into near-miss shades over time and erodes the workspace's "The Route Sign" precision (DESIGN.md).

**Independent Test**: Render each pair of surfaces that share a semantic color and compare; attempt to interpret a selection state with color channels muted.

**Acceptance Scenarios**:

1. **Given** two surfaces that use the same semantic color, **When** rendered side by side, **Then** they match exactly — no near-miss shades.
2. **Given** the active-route line and the loop badge, **When** compared, **Then** they are the same color (one shared active-state color, per DESIGN.md signboard green-blue).
3. **Given** any selected or active item on the map, **When** the Administrator identifies it, **Then** selection is confirmed by shape, border, or halo in addition to color.
4. **Given** per-route colors chosen by the Administrator for user data, **When** two routes legitimately use different colors, **Then** that data-driven color difference is unaffected by this feature (only fixed semantic colors are standardized).

### User Story 6 - No dead or confusing controls; one confirmation pattern (Priority: P3)

Every control that looks actionable does something; controls that are not yet functional are removed or visibly disabled with a reason; help and status text matches the controls that actually exist; destructive and leave/conflict confirmations share one visible pattern.

**Why this priority**: Dead affordances (a map marker icon that does nothing, a "Coming soon" button that still looks enabled, a comment describing a save button that moved) read as broken and undermine trust; a single confirmation pattern means the Administrator never re-learns a destructive flow.

**Independent Test**: Inspect every marker and control on the map and panels for interactivity; hover/click each; open the delete-stop, delete-Detour, delete-route, leave-with-unsaved, and conflict dialogs and compare their structure.

**Acceptance Scenarios**:

1. **Given** the map renders route and Detour markers, **When** the Administrator inspects each one, **Then** none looks clickable and does nothing; any marker that is purely decorative is visibly non-interactive.
2. **Given** a control that is not yet functional (e.g., the "Import" button), **When** viewed, **Then** it is visibly disabled with a short reason ("Coming soon" style) — never an active-looking control that does nothing.
3. **Given** help or status text anywhere in the workspace, **When** read, **Then** it accurately describes the controls that exist (no text referencing a missing or renamed control).
4. **Given** any destructive confirmation (delete stop, delete Detour, delete route), **When** compared, **Then** all share one visible pattern with action buttons in the same place.
5. **Given** the leave-with-unsaved and save-conflict dialogs, **When** compared with the destructive confirmations, **Then** they follow the same structural pattern (consistent title, message, and action placement).

### Edge Cases

- **No unsaved changes**: the save control is absent/disabled using one rule in both editors; the save shortcut does nothing visible in focus mode.
- **A save conflict while editing a Detour vs while editing base route stops**: identical recovery dialog, local work retained, latest data offered.
- **A Direction with no Detours yet**: standard empty state with the "Add alternative route" action — same pattern as an empty filtered route list.
- **A field that has no value vs a field still loading**: "Not set" must be distinguishable from the loading treatment.
- **A value that is legitimately zero** (e.g., zero additional meters, zero meters walked): must display as `0`, not as "Not set".
- **Two user-chosen route colors happen to be near-identical**: data-driven, out of scope; only the workspace's fixed semantic colors are standardized.
- **A keyboard shortcut pressed while a dialog is open**: the dialog keeps focus; the editor is never triggered underneath.
- **Detour without a plotted base path**: the "Add alternative route" surface keeps its existing explained-unavailable behavior; the empty-state wording follows the standard pattern.
- **British/American label collision on the same field** (e.g., "Colour"/"Color"): resolved to exactly one canonical label across all surfaces.
- **No travel-time estimate anywhere** (ADR-0009): none of these changes may introduce one.
- **Coordinate-order regression** ([lng, lat], ADR-0013): release-blocking — points must appear exactly where clicked after the changes.

## Requirements _(mandatory)_

### Functional Requirements

**Save & status**

- **FR-001**: The workspace MUST present exactly one primary save control per active editing surface (base editor or Detour editor), with the same label wording and placement in both; a secondary control that duplicates or appears to duplicate save MUST NOT exist.
- **FR-002**: Save feedback MUST be identical in wording and presentation across both surfaces: "Saving…" while in flight, "Saved just now" on success, same duration; the status surface and any notification MUST NOT contradict each other.
- **FR-003**: A save conflict on a base-route save and on a Detour save MUST surface through the same recovery dialog, MUST retain all local work, and MUST offer the latest saved data.
- **FR-004**: The save keyboard shortcut MUST act on the active editing surface with the same effect as its visible control; it MUST NEVER be silently ignored while an editor is open, MUST do nothing visible when nothing is editable, and MUST NOT fire while a dialog has focus.

**Vocabulary & labels**

- **FR-005**: Every field MUST carry one canonical label across all surfaces (new-route dialog, route properties, stops editor, Detour properties); synonym and spelling variants MUST be eliminated; help, tooltips, and status text MUST describe the controls that actually exist.
- **FR-006**: Section headings and field labels in all panels MUST share one typographic style.
- **FR-007**: List counts (stops, Detours) MUST render in one badge style across all lists.

**Panel states**

- **FR-008**: Loading, empty, error-with-retry, and loaded states MUST follow one consistent treatment across the route list, stops sidebar, Detour list, properties panels, and focus plate: same visuals, same wording, same retry behavior.
- **FR-009**: A field with no value MUST display an explicit "Not set" state distinguishable from the loading treatment; a value of zero MUST display as `0`.

**Interaction parity**

- **FR-010**: Detour stops MUST support the same interactions as base stops: click-to-select, drag reorder, and ArrowUp/ArrowDown reorder, with identical list and map results.
- **FR-011**: Keyboard shortcuts (save, undo/redo, escape) MUST behave by the same rules regardless of which editor is active, and MUST yield to open dialogs.

**Visual consistency**

- **FR-012**: Every fixed semantic color (active route state, loop/draft indication, attention accents, split/merge nodes, waiting-area markers) MUST be defined exactly once and render identically across all surfaces; no duplicated or drifted values.
- **FR-013**: Selection and active state MUST never be conveyed by color alone (shape, border, or halo MUST always accompany it).

**Affordances & confirmations**

- **FR-014**: No map marker or control MAY appear interactive without an action; every non-functional control MUST be visibly disabled with a short reason — the "Import" ("Coming soon") control is retained in that disabled style, not removed — and no control MAY look active while doing nothing.
- **FR-015**: Destructive confirmations (delete stop, delete Detour, delete route) and the leave-with-unsaved and save-conflict dialogs MUST share one visible pattern with consistent action placement.

**Guardrails (unchanged standards)**

- **FR-016**: All touched surfaces MUST remain keyboard-operable and meet the workspace's existing accessibility standard (WCAG AA).
- **FR-017**: No travel-time estimate MUST be introduced anywhere (ADR-0009).
- **FR-018**: Coordinate order remains `[longitude, latitude]` everywhere; any coordinate-order regression is release-blocking (ADR-0013).
- **FR-019**: All visible copy MUST use the canonical terms from `docs/CONTEXT.md` ("Administrator", "Route", "Direction", "Stop", "Detour", "Detour Stop"); "alternative route" remains the admin action label for Detour.

### Key Entities _(include if feature involves data)_

- **Route / Direction / Stop / Detour / Detour Stop**: the existing domain entities whose surfaces this feature standardizes; their data semantics are unchanged.
- **Canonical label reference** (new, client-side): the single list of field labels used by every surface — the arbiter for FR-005.
- **Semantic color set** (new, client-side): one definition per fixed semantic color used by all surfaces — the arbiter for FR-012.
- **Panel state pattern** (new, client-side): one treatment for loading / empty / error-with-retry / loaded used by every list and panel.
- **Confirmation pattern** (new, client-side): one visible structure for destructive, leave-with-unsaved, and save-conflict dialogs.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of reviewers (≥ 5) can locate the primary save control and state what happens when saving, for both base-route and Detour edits, in under 30 seconds each without guidance.
- **SC-002**: 100% of reviewers confirm the save feedback wording is identical between a base-route save and a Detour save.
- **SC-003**: On a simulated conflict (route and Detour), 100% of reviewers see the same recovery dialog and confirm their local work is retained.
- **SC-004**: 100% of reviewers confirm the same field carries the same label in every surface that shows it (new-route dialog, route properties, stops editor, Detour properties).
- **SC-005**: 100% of reviewers can tell loading, empty, and error states apart as the same pattern across all panels in a side-by-side inspection.
- **SC-006**: 100% of reviewers can reorder detour stops by drag and by ArrowUp/ArrowDown exactly as they reorder base stops.
- **SC-007**: Reviewer inspection finds zero semantic colors with more than one value across surfaces and zero markers or controls that look interactive but do nothing.
- **SC-008**: Reviewer inspection confirms destructive confirmations and leave/conflict dialogs share one pattern with consistent action placement.
- **SC-009**: No regression: 100% of reviewers complete a full plot → save → reload cycle and a Detour → save → reload cycle without guidance in under 5 minutes each.
- **SC-010**: All touched surfaces pass a keyboard-only walkthrough at the workspace's existing accessibility standard (WCAG AA).

## Assumptions

- **Scope**: standardization and parity only — no new capabilities are required by this spec. Route import/export implementation, new tools, new data fields, server endpoints, and shared-package changes are out of scope. An **open lane** is reserved: capabilities the Administrator names during planning are evaluated in the plan's Complexity Tracking rather than added to this spec's FRs/SCs. The non-functional "Import" affordance is retained, visibly disabled with a short reason.
- **Grounding**: the target inconsistencies come from an audit of the route workspace (base editor, stops sidebar, Detour surfaces, properties panels) in its post-012 state; where an audit finding conflicts with `PRODUCT.md` or `DESIGN.md`, DESIGN wins on visual decisions and PRODUCT on strategic/voice decisions.
- **Canonical success wording**: "Saved just now" is retained as the shared save-confirmation wording.
- **Canonical language**: per `docs/CONTEXT.md` — "Administrator", "Route", "Direction", "Stop", "Detour", "Detour Stop"; "alternative route" stays the admin action label for Detour.
- **Data semantics unchanged**: the Route/Direction/Stop/Detour data model, save endpoints, and draft/conflict behavior are consumed as-is; only their presentation and interaction surface are standardized.
- **Only fixed semantic colors are in scope**; user-chosen route colors are data and may legitimately differ between routes.
- **Keyboard behavior**: the save shortcut acting on the active editor is the intended standard; dialogs always intercept shortcuts.
- **Platform**: the workspace remains desktop-only (≥ 1024px per ADR-0014); the mobile commuter app is untouched.
- **Dependencies**: the existing route workspace including the Detour surfaces (spec 012), the design system in `DESIGN.md` ("The Route Sign": pure white ground, signboard green-blue, signal amber, ≤ 4px corners, no shadows), and the workspace accessibility standard.
