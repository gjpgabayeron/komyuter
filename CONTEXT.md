# Komyuter

A public transit navigation system for Iloilo City PUJ jeepneys: multi-criteria Dijkstra pathfinding, admin-managed route data, and location-based Geo-AR wayfinding.

## Language

**Commuter**:
A person who uses the mobile app to plan or execute a journey.
_Avoid_: Passenger, rider, user

**Account**:
An authenticated identity permitted to sign in to the desktop admin dashboard. Every Account holds exactly one Role, and Accounts are created by invitation only — there is no self-signup.
_Avoid_: User, login, credential, member

**Role**:
A named, ordered set of Permissions. It bounds what the Accounts holding it may do. An Account holding the role-management Permission may compose Roles below its own Role Position and within its own Permission set; the Super Admin is the ceiling.
_Avoid_: Group, level, tier

**Permission**:
A single capability a Role grants — for example deleting a Route, or managing Accounts. Permission, not Role, is what an authorization decision is made on.
_Avoid_: Privilege, scope, capability flag

**Effective Permission Set**:
What an Account may actually do: the Permissions of its Role. The Super Admin is the exception — its effective set is every declared Permission, regardless of the Role it holds, so no Role edit can weaken it.
_Avoid_: Capability set, granted scopes, bitmask

**Role Position**:
The ordering value on a Role. It is presentation order and a security boundary at once: an Account may only create, change, delete or assign Roles positioned strictly below its own. The Super Admin sits above every Role.
_Avoid_: Rank, level, tier, priority

**Super Admin**:
The single, permanent owner Account. It cannot be demoted, deactivated or deleted by anyone, including itself. It is the ceiling for Role management: it may compose or assign any Role, and only it may touch the top.
_Avoid_: Owner account, root, master admin, system account

**Administrator**:
The name of one seeded Role — the one holding every Permission. It is not a term for a person: a person is an Account. The other seeded Roles are Plotter, which may edit transit data, and Viewer, which is read-only. Seeded Roles are defaults rather than fixed vocabulary, since Roles are data and can be composed.
_Avoid_: Admin, user, operator (as terms for a person)

**Route**:
A single PUJ franchise: the full bidirectional entity comprising two directions, terminal stops, base polyline, detours, and fare configuration.
_Avoid_: Line, jeepney line, corridor

**Stop**:
A formal, admin-curated, named boarding/alighting point along a route (terminal, major stop, or waiting area). Permanent node in the transit graph; AR marker target.
_Avoid_: Point (when meaning a non-stop boarding location)

**Boarding Point**:
Any position along a route's valid polyline where boarding or alighting may occur — including non-stop positions reached by hail-and-ride. A derived position, not a stored entity.
_Avoid_: Hail-and-ride point

**Leg**:
One ride on a single vehicle, from boarding to alighting. The unit of fare computation (cumulative distance over the whole leg).
_Avoid_: Boarding segment, trip segment

**Step**:
One element of navigation output: walk, board, ride, alight, or transfer.
_Avoid_: Route segment, trip segment, segment

**Detour**:
A demand-triggered, direction-specific loop that departs from and returns to a route's base polyline, serving stops not reachable on the base path.
_Avoid_: Detour segment

**Restriction**:
A portion of a route's polyline where boarding or alighting is not permitted. Affects boarding-point eligibility only; never part of the transit graph.
_Avoid_: Restricted segment, no-stopping zone

**Direction**:
A directed service of a route — the "To City Proper" or "To Calaparan" journey. Each direction has its own polyline and ordered stop list; graph edges run only in the direction of travel. A physical stop served in both directions is referenced by each direction's list.
_Avoid_: Forward, reverse, inbound, outbound (as model entities)

**Draft**:
The client-only, unsaved working state of a plotted path on the Route Plotting Page — placed stops, the applied polyline, and undo/redo history. Held in localStorage per Account with a 24-hour time-to-live, never sent to the server, and offered for restore when that Account returns. A Draft remembers the Direction Version it was loaded from; that is the base a Save Conflict is resolved against.
_Avoid_: Working copy, pending route

**Save Conflict**:
The state in which a plotter's Draft is based on a version of a Direction that the server has since replaced, so the save is refused rather than applied. "The version" here is the Direction Version. It is resolved over the ordered anchors — Stops today, Waypoints under ADR-0028 — and the descriptive fields; the polyline is never merged — one side is chosen, and the workspace re-snaps on request.
_Avoid_: Merge conflict, stale write, overwrite

**Virtual Node**:
A temporary graph node inserted per navigation request for a non-stop boarding or alighting position on a direction's polyline. Connected to the two nearest stops via board edges. Never persisted.
_Avoid_: Virtual stop, pseudo-node

**Board Edge**:
A request-time graph edge linking a virtual node to its adjacent stops on the same direction, carrying along-polyline distance. Boarding itself is not a node of the permanent graph.
_Avoid_: Boarding edge

**Trace**:
A recorded GPS ride submitted by a commuter, always tagged with a route and direction. Tagged automatically from an active navigation step, or by explicit commuter selection otherwise.
_Avoid_: Trip, GPS log, recording

**Trust Score**:
A route reliability metric derived from comparing traces against the route's polyline via MHD. Informational only — displayed as a badge, never used in routing.
_Avoid_: Trust, reliability score

**Sign-in Attempt**:
One `POST /api/auth/login` request from an Account (email + password), independent of outcome. Failures are counted per account and per source IP for throttling; a successful attempt clears both counters.
_Avoid_: Login, login attempt, sign-in (when meaning the flow rather than one request)

**Security Event**:
A structured, grep-able pino log line emitted by the server for authentication outcomes: `security.sign_in_success`, `security.sign_in_failure`, `security.sign_in_throttled`, or `security.sign_out`. Carries `account`, `source` (request IP), and `outcome`; denial reasons appear ONLY here, never in HTTP responses.
_Avoid_: Audit trail, event log, auth log

**Deactivated Account**:
An Account whose identity and Role are kept but whose access is refused: it cannot sign in, and its live session is refused on its next request. Reactivation restores the same Role; nothing is deleted.
_Avoid_: Disabled user, banned account, deleted account

**Temporary Password**:
A server-generated password issued when an Account is created or forced to reset, shown to the manager once and valid only until the Account replaces it with its own.
_Avoid_: Default password, initial password

**Forced Password Change**:
The state in which an Account may reach only its own identity and the password-change endpoint until it replaces a Temporary Password. Enforced by the server, not by the screen that asks for it.
_Avoid_: Password reset, must-change flag, first-login flow

**Session Revocation**:
The refusal of a live session at the authorization seam on its next request — for a Deactivated Account or one under Forced Password Change. A Supabase token is not un-issued; the seam, not the token's expiry, is what ends access.
_Avoid_: Logout (that is the Account's own action), token invalidation

**Attribution**:
The Accounts recorded as the creator and the last writer of an entity. Rows that predate attribution read as "not recorded" rather than being assigned an actor the system did not observe.
_Avoid_: Provenance (that is deployment metadata), audit trail, author

**Last-Owner Lockout Guard**:
The schema-level invariant that the Super Admin cannot be deactivated, demoted, deleted or role-changed, so no sequence of Account edits can leave the dataset without an owner. It is structural, not a count of remaining administrators.
_Avoid_: Last-admin check, orphan guard

### Data lifecycle

**Service Area**:
The curated geographic extent Komyuter supports — the Iloilo City Proper, Oton, Pavia and Leganes region
of ADR-0010 — stored as one polygon and published with the dataset. It is the product's "supported" claim.
_Avoid_: Coverage, bbox, service region, service boundary

**Network Coverage**:
The part of the Service Area that published routes actually reach, derived from the published polylines
on each publish. It answers "supported, but no jeepney reaches here" and is never edited by hand.
_Avoid_: Service area, coverage map (when meaning the supported extent)

**Working Set**:
The mutable dataset the admin edits. Never read by commuters.
_Avoid_: Live data, current data, master data

**Proposal**:
An immutable snapshot offered for review before it can be published. It is not a Draft: a Draft is
client-local and unpublished by definition.
_Avoid_: Draft, change request, commit

**Dataset Version**:
An immutable, validated snapshot of the whole dataset — routes, directions, stops, waypoints, detours,
restrictions, fares and the Service Area — with its parent, author and checksum. Addressable by id.
_Avoid_: Data release, snapshot (when naming the concept), commit

**Published Dataset**:
The Dataset Version a given environment currently serves, reached through a single per-environment
pointer. Readers see this and nothing else.
_Avoid_: Live dataset, production data, current version

**Release**:
A versioned artifact of the codebase, promoted between environments by ADR-0021's branch flow. It is a
different axis from a Dataset Version, and neither triggers the other.
_Avoid_: Version (unqualified), deploy

**Direction Version**:
The stamp a Direction carries for optimistic concurrency: the save path refuses a write whose base is
stale. It answers "is my edit based on what I read?", never "what is published?".
_Avoid_: Dataset Version, revision

**Route Version**:
The stamp a Route carries for optimistic concurrency, covering its descriptive fields: name, short
name, colour, active state and fare configuration. It is separate from a Direction Version because the
Route and its Directions are saved by different writes, and either stale base is refused on its own.
_Avoid_: Dataset Version, revision

**Waypoint**:
One ordered anchor of a Direction: either a Stop Waypoint or a Via Point. The sequence is the direction
of travel, and snapping runs between consecutive Waypoints.
_Avoid_: Anchor, control point, node

**Stop Waypoint**:
A Waypoint that references a Stop. The Direction's ordered stop list is the projection of its Stop
Waypoints.
_Avoid_: Stop (when meaning its role in the geometry sequence)

**Via Point**:
A Waypoint that shapes the polyline without being a Stop. It never enters the stop list, the transit
graph, the commuter's stops or the AR marker set.
_Avoid_: Shaping stop, fake stop, waypoint stop

**Auto Snap**:
A segment snapped between its two Waypoints by the routing engine. Road-verified.
_Avoid_: Automatic, default snap

**Pinned Snap**:
A segment snapped **through** an exact Via Point, used when the road is right but the engine would
otherwise choose a parallel one. Road-verified.
_Avoid_: Forced snap, locked point

**Manual Segment**:
A hand-drawn segment permitted only for terminal/depot access or a road absent from the routing data. It
carries a reason, is visible in review, and is exported as manual — never presented as road-verified.
_Avoid_: Eye-traced line, freehand route, unsnapped path

**Road Snap**:
The server operation that turns Waypoints into road-following geometry. The result is the authority; the
client previews it and the mobile app renders it without re-snapping.
_Avoid_: Route trace, path fit, GPS snap

### Mobile and AR

**Geo-AR**:
Location-based augmented reality: a camera feed with markers projected from GPS position, compass
heading and device tilt. It uses no surface detection and no ARCore/ARKit.
_Avoid_: AR navigation, marker overlay, ARCore

**AR-Eligible Step**:
A navigation Step on which Geo-AR may be offered — only `walk` and `transfer`. Eligibility is decided by
the server, never inferred by the client.
_Avoid_: Walking mode, AR segment

### Admin workspace

**Plate**:
A rectangular panel of the workspace's visual grammar — white ground, hairline border, mounted flush over the map backdrop, never a shadow. Plates carry the interface; the map is the page they sit on.
_Avoid_: Card, panel, floating card, surface

**Context Column**:
The route workspace's second left column (320 px), revealed beside the stops list while a search session is live. It hosts the transient surface for the current task — today the search results — and keeps the stops list visible because that list holds the insertion anchor.
_Avoid_: Search sidebar, results panel, drawer, second panel

**Read-only Workspace**:
The Route Workspace as an Account without the editing Permission sees it: map, selection, pan, lists and values, with every mutating affordance absent. It is not a mode the Account toggles and not a Permission of its own — it is the absence of one.
_Avoid_: View mode, viewer mode, read mode

**Search Session**:
The interval between starting a place search and ending it — by `Esc`, by clearing the query, or by adding the place as a stop. It opens a layout variant of edit; it is not a workspace state.
_Avoid_: Search mode, search state, search tab

**Insertion Anchor**:
The stop a searched place is inserted after when it becomes a stop; with no stop selected the place is appended to the end of the chain instead. The search plate's header names it, so the rule is visible before the click.
_Avoid_: Selected stop (when meaning its role in insertion), insertion point, drop position

**Visible Map Region**:
The part of the map not covered by plates, in the current layout variant. Camera fits and the search's in-view test both measure against it, so nothing is framed or answered underneath a plate.
_Avoid_: Free map, viewport (that is the window), safe area
