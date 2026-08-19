# Feature Specification: Fare Configuration Page

**Feature Branch**: `006-fare-configuration-page`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Implement the Fare Configuration Page using the context from docs/ADMIN.md."

## Clarifications

### Session 2026-08-06

- Q: Should this feature also guard against deactivating a fare configuration still referenced by active Routes? → A: Yes — page + server guard (server returns CONFLICT; the page disables delete for referenced rows).
- Q: What should happen when an Administrator sets an inactive configuration as default? → A: Block until reactivated (inline error; the default remains active).
- Q: Should duplicate fare configuration labels be prevented? → A: Yes — block duplicates with inline validation.

## User Scenarios & Testing _(mandatory)_

The **Administrator** is the only actor in this feature. The Fares section of the admin dashboard is where the Administrator maintains the fare configurations that Routes reference. Today the section is a placeholder ("Fare configuration management arrives in a later milestone"); this feature replaces it with a working list, create, edit, and guarded-delete surface backed by the existing fare-configuration API.

### User Story 1 - See all fare configurations at a glance (Priority: P1)

An authenticated Administrator opens the Fares section. They see every fare configuration the transit network uses — label, base fare, base distance, rate per kilometre, student and senior discounts, the default indicator, and active status — in one scannable list.

**Why this priority**: Reading the current fare state is the entry point for every other fare action. Without a truthful list, the Administrator cannot know what exists, what is default, or what Routes depend on.

**Independent Test**: A reviewer can open the Fares section, see all stored fare configurations with their parameters, and identify which one is the default — no other capability required.

**Acceptance Scenarios**:

1. **Given** at least one fare configuration exists, **When** the Administrator opens the Fares section, **Then** every configuration is listed with label, base fare, base distance, rate per kilometre, student discount, senior discount, default indicator, and active status.
2. **Given** the list is still loading, **When** the section opens, **Then** a loading state is shown rather than a blank or flickering page.
3. **Given** the list request fails (e.g. server unreachable), **When** the section opens, **Then** a clear error state is shown with a way to retry, and no partial or stale data is presented as current.
4. **Given** no fare configurations exist, **When** the section opens, **Then** an empty state explains that no fare configurations exist and invites the Administrator to create one.
5. **Given** the list is shown, **When** the Administrator looks at any row, **Then** the default configuration is identifiable by text (not color alone) and deactivated configurations are visibly distinct from active ones.

### User Story 2 - Create a fare configuration (Priority: P1)

The Administrator creates a new fare configuration (e.g. the standard LTFRB rate, a special rate, a promotional rate). They enter a label and the fare parameters in a form; the system validates the values, persists the configuration, and shows it in the list.

**Why this priority**: Creation is the core value of the page — without it the Administrator cannot introduce new fare types, and every Route must keep using whatever already exists.

**Independent Test**: A reviewer can create a fare configuration with valid values and immediately see it appear in the list — testable without any other feature.

**Acceptance Scenarios**:

1. **Given** the Fares section, **When** the Administrator chooses to create a new fare configuration, **Then** a form opens with fields for label, base fare, base distance, rate per kilometre, student discount percentage, senior discount percentage, and an optional set-as-default choice.
2. **Given** the Administrator submits valid values, **When** the configuration is saved, **Then** it appears in the list with the entered values exactly as entered and a success message is shown.
3. **Given** the Administrator submits invalid values (empty label, negative fare, discount above 100%), **When** the form is submitted, **Then** the invalid fields are rejected inline with clear messages and nothing is persisted.
4. **Given** the Administrator chooses set-as-default on creation, **When** the configuration is saved, **Then** it becomes the single default and any previously default configuration loses default status.
5. **Given** the save fails (network or server rejection), **When** the Administrator submits, **Then** a clear non-technical error is shown, the entered values are preserved, and nothing appears in the list.

### User Story 3 - Edit a fare configuration (Priority: P2)

The Administrator corrects or updates an existing fare configuration — adjusting the rate, changing a discount, marking it default, or deactivating it.

**Why this priority**: Fare parameters change in practice (LTFRB rate adjustments, route-specific rates). Editing is the day-to-day maintenance action; creation covers the introduction case.

**Independent Test**: A reviewer can open an existing configuration, change a parameter, save, and confirm the change is still shown after a reload — testable with the list alone.

**Acceptance Scenarios**:

1. **Given** an existing fare configuration, **When** the Administrator opens it for editing, **Then** the form is pre-filled with its current values, including its default and active status.
2. **Given** the Administrator changes one or more parameters, **When** they save, **Then** the list reflects the new values and a success message is shown.
3. **Given** the Administrator marks a different configuration as default, **When** they save, **Then** it becomes the single default and the previous default loses default status (server-enforced).
4. **Given** the Administrator edits a configuration to invalid values, **When** they save, **Then** the invalid fields are rejected inline with clear messages and the previous values remain intact.
5. **Given** an edit is saved, **When** the Administrator reloads the page, **Then** the saved values are still shown (the list reflects persisted server state, not local-only edits).
6. **Given** a fare configuration is inactive, **When** the Administrator tries to mark it as default, **Then** the action is rejected inline with a clear explanation that the configuration must be reactivated first.

### User Story 4 - Deactivate a fare configuration safely (Priority: P2)

The Administrator removes a fare configuration from use. The system requires confirmation, deactivates (rather than destroys) the configuration, and refuses to leave the network without a default fare.

**Why this priority**: Fare configurations may be referenced by Routes; an unsafe delete could silently break fare computation. A guarded deactivation keeps the network's fare state valid while letting the Administrator clean up obsolete rates.

**Independent Test**: A reviewer can deactivate a non-default configuration after a confirmation step and see it marked inactive in the list; the sole default cannot be deactivated — testable with the list alone.

**Acceptance Scenarios**:

1. **Given** a fare configuration that is not the sole default, **When** the Administrator chooses to delete it, **Then** they are asked to confirm and, on confirmation, the configuration is deactivated and shown as inactive in the list.
2. **Given** a fare configuration is the sole default, **When** the Administrator tries to delete it, **Then** the action is prevented with a clear explanation that the network must keep a default fare configuration.
3. **Given** the server rejects a deactivation (e.g. conflict), **When** the Administrator confirms, **Then** a clear error is shown, the list is unchanged, and the configuration remains active.
4. **Given** the Administrator cancels the confirmation, **When** the delete flow is dismissed, **Then** nothing changes.
5. **Given** a fare configuration is referenced by an active Route, **When** the Administrator tries to delete it, **Then** the delete action is unavailable for that configuration with a clear explanation that Routes depend on it.

### Edge Cases

- The list is empty — show an empty state with a call to create the first fare configuration.
- The user attempts to delete the last default — blocked, with an explanation, before any server call.
- A fare configuration referenced by an active Route cannot be deactivated — the server rejects it (CONFLICT) and the page disables the delete action for those rows with a clear explanation.
- An inactive configuration cannot be set as default — the Administrator must reactivate it first; the attempt is rejected inline with no state change.
- A duplicate label is rejected inline on create and edit; labels are unique among fare configurations.
- The save fails mid-edit — entered values must not be lost; the form stays open with an error message.
- Rapid double-submission of a form — must not create duplicate configurations.
- Discounts entered as 0% or 100% — both are valid bounds; values outside 0–100 are rejected.
- A deactivated configuration is edited — it can be reactivated through the same edit flow.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Fares section MUST present a list of all fare configurations; each entry MUST show the label, base fare, base distance, rate per kilometre, student discount percentage, senior discount percentage, a default indicator, and active status.
- **FR-002**: The Administrator MUST be able to create a new fare configuration through a form.
- **FR-003**: The create/edit form MUST provide fields for: label, base fare, base distance in kilometres, rate per kilometre, student discount percentage, senior discount percentage, and a set-as-default choice.
- **FR-004**: The form MUST validate input: label is required and unique among fare configurations (duplicate labels are rejected inline); base fare, base distance, and rate per kilometre are non-negative; student and senior discounts are between 0 and 100 percent inclusive.
- **FR-005**: The system MUST enforce exactly one default fare configuration: setting a configuration as default MUST make it the default and MUST unmark any previously default configuration (enforcement is server-side; the page MUST reflect the server's result).
- **FR-006**: The Administrator MUST be able to edit every field of an existing configuration and toggle its active status; edits MUST persist through the server and survive a page reload.
- **FR-007**: Deleting a fare configuration MUST require an explicit confirmation step, MUST deactivate rather than destroy the configuration, and MUST be refused when the configuration is the sole default or when any active Route references it (server-enforced CONFLICT); for such configurations the delete action MUST be unavailable in the page with a clear explanation.
- **FR-008**: All create, edit, and delete attempts MUST surface a success message on success and a clear, non-technical error on failure (validation, conflict, or network); failed attempts MUST NOT change the list and MUST preserve the Administrator's entered values.
- **FR-009**: The list MUST reflect persisted server state — after any successful mutation, the shown data MUST be the server's current data.
- **FR-010**: Loading, error (with retry), and empty states MUST be provided for the list so the Administrator always understands the current state of the data.
- **FR-011**: All displayed fare and distance values MUST be exact (fares in pesos, two decimal places where fractional; distances in kilometres) — never rounded into plausibility or fabricated.
- **FR-012**: The default indicator and the active/inactive distinction MUST be conveyed with text as well as color (accessibility), and all controls MUST meet WCAG AA contrast and keyboard-operability.
- **FR-013**: The page MUST follow the established admin visual language (pure white ground, cerulean identity, amber reserved for attention, no shadows) and MUST NOT introduce a new visual system.
- **FR-014**: The page MUST prevent duplicate submissions (a single save click must create or update at most one configuration).
- **FR-015**: Setting an inactive fare configuration as default MUST be rejected inline with a clear explanation; the Administrator MUST reactivate it first, and the default configuration MUST always be active.

### Key Entities

- **FareConfiguration**: the fare type a Route references — identified by `fare_config_id`, described by a unique `label`, and defined by the LTFRB parameters `base_fare` (₱), `base_distance_km`, `rate_per_km` (₱/km), `student_discount_pct`, `senior_discount_pct`, plus `is_default` and `is_active` flags. Exactly one configuration is default and the default is always active; deactivating the sole default or a configuration referenced by an active Route is not allowed.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of reviewers (≥ 5) can open the Fares section and correctly read every configuration's label, fare parameters, discounts, default status, and active status without guidance.
- **SC-002**: 100% of reviewers can create a fare configuration with valid values in under 2 minutes and confirm it appears in the list with the exact values entered.
- **SC-003**: 100% of reviewers can edit an existing configuration's parameters and confirm the new values persist after a full page reload.
- **SC-004**: After any sequence of create/edit operations that sets a default, exactly one configuration is default — verified by 100% of reviewers through the list after a reload.
- **SC-005**: 100% of reviewers attempting to delete a fare configuration are asked to confirm; 100% of attempts to deactivate the sole default are prevented with a clear explanation.
- **SC-006**: 100% of invalid submissions (empty label, negative fare, discount above 100%) are rejected inline with clear messages and result in no change to the list.
- **SC-007**: 100% of reviewers see exact fare and distance values (two-decimal pesos, kilometres) with no fabricated or over-rounded numbers.
- **SC-008**: 100% of reviewers can identify the default configuration and the inactive configurations by text alone (color is never the only signal).
- **SC-009**: 100% of reviewers attempting to delete a configuration referenced by an active Route are prevented with a clear explanation and see no change to the list.
- **SC-010**: 100% of attempts to mark an inactive configuration as default are rejected with a clear explanation, and the default configuration remains active — confirmed by 100% of reviewers.
- **SC-011**: 100% of duplicate-label submissions are rejected inline with no change to the list.

## Assumptions

- The existing fare-configuration API (list, get, create, update, delete) is complete and correct; this feature consumes it and adds no server behavior except what is already there.
- "Delete" means **deactivate** (`is_active = false`), matching the existing server behavior; configurations are never hard-deleted.
- Exactly-one-default and last-default protection are enforced server-side; the page's job is to offer the set-as-default choice and to faithfully surface server results and rejections.
- The server rejects deactivation of a fare configuration referenced by any active Route (CONFLICT), and the page disables delete for such rows; this guard is part of this feature's scope and requires a small server change plus server tests.
- Fare configuration labels are unique; the form rejects duplicate labels inline (the server's identifier disambiguation remains for API and seed data only).
- New configuration forms may pre-fill the standard LTFRB defaults (₱13 base fare, 4 km base distance, ₱1.80/km, 20% student and senior discounts) as a convenience; the Administrator can change them.
- The page targets desktop browsers (the admin dashboard is a desktop web app); mobile layout is not a goal.
- Visual implementation follows the existing admin design tokens and component conventions; no new design system is introduced (FR-013).
