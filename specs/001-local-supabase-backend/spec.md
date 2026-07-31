# Feature Specification: Admin Backend — Auth, Route CRUD, and Data Collection

**Feature Branch**: `001-local-supabase-backend`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Build the server backend of the application that uses Local Supabase Docker"

## Clarifications

### Session 2026-07-31

- Q: Should this spec be re-scoped to the backend foundation only (Auth + CRUD + data collection/export), deferring journey planning, trace ingestion, and trust scoring to later features? → A: Yes — re-scope to Auth + CRUD + data collection/export; navigation, traces, and trust are deferred.
- Q: Which entities should this delivery's CRUD cover — core (routes/directions/stops/fare) or the full model including detours and restrictions? → A: Full model — routes, directions, stops, detours, restrictions, and fare configurations.
- Q: How should the Collaboratory script receive the collected dataset — HTTP fetch or a file the script reads? → A: File export — the backend generates a downloadable dataset file the script reads from disk (no network reachability assumption).
- Q: How should the admin account be created in the local environment? → A: Seed one admin account with credentials from local configuration; no self-registration or invite flow in this delivery.
- Q: What is the conflict rule for concurrent saves to the same entity? → A: Last-write-wins — the most recent save is accepted, with no version tracking.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Admin signs in and manages route data (Priority: P1)

An admin signs in with their administrator identity and, through the admin dashboard, creates, edits, deactivates, and (where allowed) removes routes, directions, stops, detours, restrictions, and fare configurations. Every change is persisted and immediately available to any consumer of the data. The backend rejects changes that would corrupt the network (e.g., deleting a stop still referenced by a direction) with an understandable message. The dashboard itself is a separate feature; this story prepares the backend it will be built against.

**Why this priority**: This is the explicit goal of the feature — prepare the backend for the admin dashboard, which will be used for manual plotting of routes.

**Independent Test**: Can be fully tested by creating, reading, updating, and deactivating a route with two directions, each with a polyline and ordered stops, through the backend interface. It delivers complete admin control over transit data independent of any other feature.

**Acceptance Scenarios**:

1. **Given** an unauthenticated caller, **When** they attempt any data-management action, **Then** the request is rejected and no data is changed.
2. **Given** an authenticated admin, **When** they create a route with two directions, each with a polyline and an ordered stop list, **Then** the route is persisted and retrievable.
3. **Given** an authenticated admin, **When** they edit a stop's position or a fare configuration, **Then** the next read reflects the change without a server restart.
4. **Given** an authenticated admin, **When** they attempt to delete a stop that a direction still references, **Then** the backend rejects the action with a clear message and leaves the data intact.
5. **Given** an authenticated admin, **When** they deactivate a route, **Then** the route remains stored but is no longer returned as active.

---

### User Story 2 - Team collects plotted route data for the validation script (Priority: P1)

Once admins have manually plotted routes, the collected dataset — all routes with their directions, polylines, ordered stops, detours, restrictions, and fare configurations — is retrievable through a dedicated data-collection interface in a single request. A separate Collaboratory script test consumes this dataset to validate and improve the proposed navigation algorithm. The backend's job is to keep the plotted data complete, consistent, and exportable so that script has everything it needs.

**Why this priority**: The entire purpose of the manual plotting effort is to feed this script. Without a complete, exportable dataset the plotted routes cannot be used to validate the algorithm.

**Independent Test**: Can be fully tested by plotting a route through the admin interface, then requesting the full dataset and confirming the plotted route appears complete and consistent. It delivers the dataset the validation script depends on.

**Acceptance Scenarios**:

1. **Given** plotted routes exist, **When** the full dataset is requested, **Then** all routes with their directions, stop geometry, detours, restrictions, and fare data are returned together in one valid, consistent dataset.
2. **Given** the exported dataset, **When** an external script parses it, **Then** every coordinate follows the project's coordinate ordering rule and every stop reference resolves to a real stop on an existing direction.
3. **Given** no routes plotted yet, **When** the dataset is requested, **Then** a valid empty dataset is returned rather than an error.
4. **Given** a route that was deactivated, **When** the full dataset is requested, **Then** the route is still included and clearly marked inactive so the validation script can choose to include or exclude it.

---

### User Story 3 - Team runs the backend locally (Priority: P2)

A developer starts the entire backend locally — the database and the server — with a single documented command, on a machine with only the standard tooling installed and no dependence on hosted services. The local environment provisions the schema automatically; the admin can authenticate locally and begin plotting routes. A health/status check confirms the server and dataset are up and reports basic statistics (route, direction, and stop counts, plus a dataset update timestamp) that double as demo material for the thesis defense.

**Why this priority**: The feature must be demonstrable on a local or disconnected setup, and everything else depends on a reproducible environment. It is P2 because the capability it enables (stories 1–2) is what the panel evaluates; this story makes that evaluation possible on a local machine.

**Independent Test**: Can be fully tested on a clean machine by following the documented setup, starting the environment, authenticating as admin, and confirming a route can be persisted and retrieved. It delivers the reproducible local environment with no external dependency.

**Acceptance Scenarios**:

1. **Given** a clean machine with the standard tooling installed, **When** the documented setup command is run, **Then** the local database and server start successfully with the schema applied and no hosted-service dependency.
2. **Given** a freshly provisioned database, **When** an admin authenticates and plots a route, **Then** the route is persisted and retrievable immediately.
3. **Given** a running server, **When** a status check is requested, **Then** it reports healthy status and current dataset statistics including an update timestamp.
4. **Given** a running local environment, **When** the developer stops and restarts it, **Then** the persisted data remains and the server restores it on startup.
5. **Given** the local environment, **When** an admin authenticates, **Then** admin identity works against the local setup with no external identity service reachable.

---

### Edge Cases

- What happens when an admin deletes a stop still referenced by a direction's ordered stop list? The backend rejects the deletion with a clear message; no data changes.
- What happens when an admin saves a direction with an empty stop list or a polyline that cannot be parsed as a valid path? The backend rejects the write with a clear message.
- What happens when a detour's entry or exit point does not lie on the direction's base path? The backend rejects the write so the dataset cannot become geometrically inconsistent.
- What happens when two admins edit the same route concurrently? The most recent save wins; writes are always applied against the latest committed state, with no version tracking.
- What happens when a fare configuration has no explicit rate structure? The documented default fare parameters apply and the configuration is marked as using defaults.
- What happens when the full dataset is requested while an admin is mid-save? The dataset is always served from a consistent snapshot of committed data, never a half-applied change.
- What happens when the exported dataset file is empty? A valid empty dataset file is returned, never an error, so the validation script always has a parseable input.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The backend MUST authenticate administrators through the shared identity system and MUST gate every data-management action to authenticated administrators; unauthenticated or non-administrator actions MUST be rejected without changing any data.
- **FR-002**: The backend MUST persist the full admin-managed transit data model: routes, directions, ordered stops, detours, restrictions, and fare configurations.
- **FR-003**: The backend MUST support create, read, update, and deactivate operations for routes, directions, stops, detours, restrictions, and fare configurations.
- **FR-004**: The backend MUST validate every write and MUST reject changes that would corrupt the network — deleting a referenced stop, an empty or unordered stop list, an invalid path, or a detour whose entry/exit points are not on the base path — with an understandable error message.
- **FR-005**: The backend MUST enforce the project's coordinate ordering rule for every spatial value in both reads and writes.
- **FR-006**: Every spatial object (direction path, stop position, detour path) MUST be stored and returned as a valid geographic feature using WGS84 coordinates, without loss of geometric fidelity.
- **FR-007**: The backend MUST enforce that each direction has exactly one base path and an ordered, non-empty stop list; stop order within a direction is authoritative and never derived by reversing another direction's list.
- **FR-008**: The backend MUST support activating and deactivating routes and their directions without deleting data.
- **FR-009**: The backend MUST generate a downloadable dataset file containing the complete plotted dataset — all routes (active and inactive) with directions, stop geometry, detours, restrictions, and fare configurations — via a single documented request, using the documented export format.
- **FR-010**: The exported dataset file MUST be machine-readable JSON, MUST contain no navigation or arrival-time data, and MUST be consumable by an external script that reads it from disk, with no backend-specific knowledge beyond the documented export schema.
- **FR-011**: The backend MUST respond to every request with the standard result envelope (`success` plus either `data` or `error`), including structured error explanations a client can present to an admin.
- **FR-012**: The backend MUST expose a health/status check reporting healthy status plus dataset statistics (route, direction, and stop counts and the dataset update timestamp).
- **FR-013**: The entire backend (database and server) MUST run locally through the provided Docker-based development environment, with the schema applied automatically and no dependency on external or hosted services.
- **FR-014**: The backend MUST restore all persisted data on startup, so a restart never serves a stale or missing dataset.
- **FR-015**: Fare configurations MUST store base fare, base distance, per-kilometer rate, and discount parameters; a route without an explicit configuration MUST fall back to the documented default parameters.
- **FR-016**: The local environment MUST seed exactly one administrator account with credentials provided via local configuration; this delivery MUST NOT offer self-registration or an invite flow.

### Key Entities _(include if feature involves data)_

- **Route**: A single PUJ franchise — the full bidirectional entity with two directions, terminals, base paths, detours, and fare configuration. Identified by a stable ID; has a display name, short name, and color; has an active/inactive state.
- **Direction**: A directed service of a route (e.g., "To City Proper"), each with its own base path geometry, ordered stop list, terminals, detours, and restrictions.
- **Stop**: A formal, admin-curated, named boarding/alighting point referenced within a direction's ordered list with a position, type, and guaranteed-service flag.
- **Boarding Point**: Any valid position along a direction's corridor where boarding or alighting may occur. A derived position in the domain model; recorded here because the stored geometry (paths, stops, restrictions) is what makes it computable later.
- **Detour**: A demand-triggered, direction-specific loop departing from and returning to the direction's base path, with entry/exit points, its own geometry, notable stops, and commuter-facing instructions.
- **Restriction**: A portion of a direction's path where boarding or alighting is not permitted.
- **Fare Configuration**: An editable record of fare parameters (base fare, base distance, per-kilometer rate, discounts) attached to routes.
- **Admin**: A recognized administrator identity via the shared identity system; the only role permitted to manage transit data in this delivery.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of unauthenticated or non-administrator data-management attempts are rejected, verified to change no data.
- **SC-002**: 100% of valid create, read, update, and deactivate operations on every managed entity type are reflected in the next read without a server restart.
- **SC-003**: 100% of invalid writes (referenced-stop deletion, empty stop list, invalid path, off-path detour) are rejected with a clear error and leave all data unchanged.
- **SC-004**: 100% of stored and returned coordinates follow the project's coordinate ordering rule, verified by an automated check across all entities in the dataset.
- **SC-005**: The dataset file export contains all plotted routes in a single file, and 100% of its internal references resolve (every stop reference belongs to an existing direction; every direction belongs to an existing route).
- **SC-006**: The local environment can be provisioned and the server brought to a healthy, authenticated, plotting-ready state on a clean machine by following the documented setup, with no hosted-service dependency, in under 15 minutes.
- **SC-007**: 95% of CRUD and export requests complete in under 1 second on the local environment.
- **SC-008**: A valid admin identity can perform all CRUD operations, while an expired or invalid identity is rejected — verified for 100% of tested identity states.

## Assumptions

- "Local Supabase Docker" means the backend's database, identity system, and supporting services run entirely on the developer's machine through a containerized local environment provisioned with a single documented setup command; no hosted or cloud account is required.
- **Out of scope for this delivery** (deferred to separate features): journey planning/navigation, hail-and-ride snapping, trace ingestion, trust scoring, commuter authentication, and the admin dashboard UI itself.
- The network dataset is populated by manual admin plotting through the future dashboard; this delivery ensures the backend can store, validate, and export whatever is plotted. A minimal development seed may exist for local testing but is not the source of the validation dataset.
- The "Collaboratory script test" is an external consumer that reads the exported dataset file from disk on its own schedule; there is no real-time integration and no network reachability requirement between the script and the backend.
- Admin identity uses the documented shared identity system with a single administrator role (ADR-0006); exactly one admin account is seeded from local configuration for this delivery.
- The documented default fare parameters apply wherever a route carries no explicit fare configuration.
- Coordinate correctness (longitude–latitude ordering for all spatial data) is a hard correctness invariant of this feature; every stored or returned position follows it.

## Dependencies

- Requires the documented design decisions for coordinate ordering, direction modeling, fare parameters, and authentication (ADRs 0001–0010) as binding constraints on behavior.
- Requires the documented export schema (established at planning time) so the Collaboratory script and the backend agree on the dataset format.
- Requires shared domain types and the documented canonical terminology when exposing data and messages (Constitution Principles III and IV).
- Requires a local database that supports the spatial data types needed to store paths and point geometry (provisioned by the Docker-based environment).
