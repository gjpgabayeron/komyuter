# Feature Specification: Admin Application Shell

**Feature Branch**: `005-admin-appshell`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Read the ADMIN.md for context. Let's build an admin web dashboard appshell mainly using Shadcn Base UI starting from a Vite+React Template. Use CLI install script and avoid manually creating the files if an install command is available. Use impeccable skill for tasteful UI design implementation while adhering to react's best practices."

## Clarifications

### Session 2026-08-03

- Q: Scope of this appshell step → A: Shell + working login; all four sections as designed placeholder/empty-state pages.
- Q: Sign-in method → A: Email + password.
- Q: Connection banner detection → A: Browser network events only (online/offline).
- Q: Auth integration → A: Route Administrator sign-in through the existing backend API; add a small login endpoint to the backend; the admin web app does not talk to the identity service directly.

## User Scenarios & Testing _(mandatory)_

The **Administrator** is the only actor in this feature. The shell is the frame of the admin dashboard — the sign-in gate, the persistent navigation, the header, and the content area that every section (Overview, Routes, Fares, Export) mounts into. This feature delivers that frame plus sign-in/sign-out; the sections themselves are minimal, swappable placeholders.

### User Story 1 - Sign in and land in the dashboard shell (Priority: P1)

A signed-out Administrator opens the admin dashboard. They are shown a sign-in screen. After authenticating, they land on the main dashboard shell: a persistent navigation rail (Overview, Routes, Fares, Export), a header with the current section title and a sign-out control, and a content area rendering the selected section.

**Why this priority**: Without authentication and a shell, no other admin capability can be reached. Everything else in the rebuild hangs off this frame.

**Independent Test**: A reviewer can open the dashboard, sign in, and reach a shell with four navigable sections and a header — fully testable without any other feature present.

**Acceptance Scenarios**:

1. **Given** a signed-out Administrator, **When** they open the dashboard, **Then** they see a sign-in screen and are not shown any section content.
2. **Given** valid credentials, **When** they submit the sign-in form, **Then** they land on the shell and the Overview section is shown.
3. **Given** invalid credentials, **When** they submit the sign-in form, **Then** they remain on the sign-in screen and see a clear, non-technical error message.

### User Story 2 - Navigate between sections (Priority: P1)

An authenticated Administrator moves between the Overview, Routes, Fares, and Export sections using the navigation rail. The active section is clearly indicated, the header title updates to match, and the content area swaps without a full page reload.

**Why this priority**: Navigation is the core job of a shell; the four sections are the fixed set of destinations this product provides.

**Independent Test**: A reviewer can click through all four sections and confirm the active state, header title, and content all update — testable with placeholder sections.

**Acceptance Scenarios**:

1. **Given** the Administrator is on any section, **When** they select a different section in the navigation rail, **Then** the content area shows that section without a full reload.
2. **Given** any section, **When** it is selected, **Then** the navigation rail marks it as active and the header shows the section title.
3. **Given** the Administrator opens a direct link to a section (e.g. the Routes section), **When** they are already signed in, **Then** that section renders directly.

### User Story 3 - Sign out (Priority: P2)

An authenticated Administrator signs out from the header. The session ends, protected sections become inaccessible, and the Administrator is returned to the sign-in screen.

**Why this priority**: Session hygiene is a security baseline; sign-out must work from anywhere in the shell.

**Independent Test**: A reviewer can sign out from any section and confirm they can no longer reach section content without signing in again.

**Acceptance Scenarios**:

1. **Given** an authenticated Administrator on any section, **When** they choose sign-out, **Then** they are returned to the sign-in screen.
2. **Given** a signed-out session, **When** they try to open a protected section, **Then** they are redirected to the sign-in screen and do not see section content.
3. **Given** the Administrator signs out, **When** the sign-out completes, **Then** a non-blocking confirmation notification appears and the session ends.
4. **Given** the Administrator was signed out, **When** they sign back in, **Then** they are returned to the section they had originally requested (deep-link return).

### User Story 4 - Work reliably with degraded connectivity (Priority: P3)

While signed in, the browser loses its internet connection. A visible banner appears at the top of the shell telling the Administrator they are offline; the current view stays usable and nothing crashes. When the connection returns, the banner disappears.

**Why this priority**: Transit curators may work from field locations with flaky connectivity; the shell must stay honest and non-destructive (no fabricated status, per the project's Precision Is Trust principle).

**Independent Test**: A reviewer can disconnect the network, confirm the banner appears and the app keeps rendering, then reconnect and confirm the banner clears.

**Acceptance Scenarios**:

1. **Given** an authenticated Administrator, **When** the connection is lost, **Then** a visible offline banner appears and the current view continues to render.
2. **Given** the offline banner is visible, **When** the connection returns, **Then** the banner clears without a reload.

### Edge Cases

- What happens when the session expires or the stored token is invalid while the Administrator is mid-task? They should be returned to sign-in without a crash and without losing the section they were in.
- How does the shell behave when a signed-out Administrator deep-links to a protected section? They should be redirected to sign-in and returned to that exact section after authenticating.
- What happens if the app opens while offline and the Administrator is signed out? The sign-in screen still renders; the connection banner is shown and the inability to reach the auth service is communicated honestly.
- How does the collapse state of the navigation rail behave across section changes and page refreshes within a session? The state should be stable and predictable within the session.
- What happens on sign-out when the request to end the session fails (e.g. offline)? The Administrator is still returned to sign-in and the local session is cleared, with honest feedback if the remote session could not be confirmed.
- What if the signed-in state and the page's expectation disagree (e.g. stale data from another tab)? The shell must not show a partial, half-authenticated view; it should resolve to a consistent signed-in or signed-out state.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST present a sign-in screen to any Administrator who is not authenticated and MUST NOT reveal protected section content in that state.
- **FR-002**: System MUST authenticate the Administrator with an email + password credential pair, routed through the existing backend API (per ADR-0006), and MUST reject invalid credentials with a clear, non-technical message.
- **FR-003**: After successful authentication, System MUST present an application shell composed of a persistent navigation rail, a header, and a content area.
- **FR-004**: The navigation rail MUST provide access to at least four sections: **Overview**, **Routes**, **Fares**, and **Export**.
- **FR-005**: The header MUST show the title of the currently active section and MUST expose a sign-out control.
- **FR-006**: The navigation rail MUST visually indicate the currently active section, and active state MUST be conveyed by more than color alone (accessible to color-blind users).
- **FR-007**: Switching sections MUST NOT reload the whole application (client-side navigation).
- **FR-008**: Accessing a protected section while signed out MUST redirect the Administrator to the sign-in screen, and after successful sign-in MUST return them to the section they originally requested.
- **FR-009**: The Administrator MUST be able to sign out from any section; after sign-out, protected sections MUST be inaccessible until the next sign-in.
- **FR-010**: The navigation rail MUST be collapsible, and the collapsed/expanded state MUST be stable across section changes and refreshes within a session.
- **FR-011**: System MUST detect loss of connectivity via browser network events and MUST display a visible connection banner while offline; when connectivity returns, the banner MUST clear.
- **FR-012**: Section content in this feature is delivered as designed placeholder/empty-state pages for Overview, Routes, Fares, and Export that follow the Route Sign grammar; these pages can be swapped out for the fully built sections later without changing the shell.
- **FR-013**: All shell controls (navigation items, sign-out, collapse toggle, sign-in form fields) MUST be fully operable by keyboard, with a visible focus indicator.
- **FR-014**: The shell's visual design MUST follow the product's "Route Sign" grammar: pure white ground, signboard green-blue plus signal amber, sharp corners of at most 4px, no shadows, and pill-shaped controls.
- **FR-015**: System MUST surface the outcome of shell-level actions (sign-in, sign-out) as non-blocking toast notifications, in addition to inline feedback where appropriate.

### Key Entities _(include if feature involves data)_

- **Administrator**: the authenticated person operating the dashboard. Authenticated by the existing identity service; the shell distinguishes only signed-in from signed-out states in this feature.
- **Application Section**: a named destination in the dashboard (Overview, Routes, Fares, Export). Each has a title, a navigation entry, and a content slot. The Routes section includes both the route list and the route workspace views.
- **Session**: the authenticated state that gates access to protected sections and is ended by sign-out or expiry.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of reviewers (≥ 5) can sign in and reach the dashboard shell within 2 minutes without guidance.
- **SC-002**: 100% of reviewers can navigate to each of the four sections (Overview, Routes, Fares, Export), and 100% can correctly identify which section is active.
- **SC-003**: 100% of reviewers can sign out and confirm that section content is no longer accessible afterwards.
- **SC-004**: 100% of reviewers who deep-link to a protected section while signed out are taken to sign-in and, after signing in, land on that same section.
- **SC-005**: 100% of reviewers can collapse and expand the navigation rail, and the state persists across section changes and a refresh within the session.
- **SC-006**: With the network disconnected, 100% of reviewers see a connection banner and the app continues to render without crashing; the banner clears on reconnection.
- **SC-007**: 100% of reviewers can operate every shell control with the keyboard alone and see a visible focus indicator on every control.
- **SC-008**: The shell passes automated WCAG AA contrast checks, and 100% of reviewers confirm no control communicates its state by color alone.
- **SC-009**: 100% of reviewers confirm the shell matches the Route Sign design language (pure white ground, green-blue/amber palette, ≤ 4px corners, no shadows).
- **SC-010**: A reviewer with no backend or map services available can still see the shell, sign in flow, navigation, and connection banner functioning (development-mode fallback).

## Assumptions

- The existing project authentication system (Supabase Auth) is reused; no new identity solution is introduced (ADR-0006).
- Administrator sign-in is proxied through the existing backend API — a small login endpoint is added to the backend; the admin web app does not talk to the identity service directly (confirmed in Clarifications, Session 2026-08-03).
- The canonical set of dashboard sections is Overview, Routes, Fares, and Export, per the project's admin documentation (`docs/ADMIN.md`); the Routes section spans the route list and the route workspace.
- The application is bootstrapped from a Vite + React + TypeScript template, following the repository's existing conventions (strict TypeScript via the shared config, single root ESLint flat config, repository formatting rules).
- The UI component layer is installed and generated through the official command-line scaffolding tooling (shadcn-style over Base UI primitives), per the project brief's explicit preference for install commands over hand-written files.
- Section pages are delivered as designed placeholder/empty-state pages in this feature; building out the real sections is handled by later features (confirmed in Clarifications, Session 2026-08-03).
- The dashboard must run in development without map services; authentication requires the backend API to be reachable, otherwise sign-in fails honestly with no fabricated session (SC-010).
- Development and validation are performed on this branch with the quality gates in `AGENTS.md` (lint, typecheck, format check) green before merge.
