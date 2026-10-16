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
A named, ordered set of Permissions, created and assigned by the Super Admin. It bounds what the Accounts holding it may do.
_Avoid_: Group, level, tier

**Permission**:
A single capability a Role grants — for example deleting a Route, or managing Accounts. Permission, not Role, is what an authorization decision is made on.
_Avoid_: Privilege, scope, capability flag

**Super Admin**:
The single, permanent owner Account. It cannot be demoted, deactivated or deleted by anyone, including itself, and it is the only Account permitted to create, change or remove Roles.
_Avoid_: Owner account, root, master admin, system account

**Administrator**:
The name of one seeded Role — the one holding every Permission. It is not a term for a person: a person is an Account. The other seeded Roles are Plotter, which may edit transit data, and Viewer, which is read-only. Seeded Roles are defaults rather than fixed vocabulary, since the Super Admin composes Roles freely.
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
The client-only, unsaved working state of a plotted path on the Route Plotting Page — placed stops, the applied polyline, and undo/redo history. Held in localStorage with a 24-hour time-to-live, never sent to the server, and offered for restore when the Account returns.
_Avoid_: Working copy, pending route

**Save Conflict**:
The state in which a plotter's Draft is based on a version of a Direction that the server has since replaced, so the save is refused rather than applied. It is resolved over the stop list and the descriptive fields; the polyline is never merged — one side is chosen, and the workspace re-snaps on request.
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
