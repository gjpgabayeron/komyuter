# Komyuter

A public transit navigation system for Iloilo City PUJ jeepneys: multi-criteria Dijkstra pathfinding, admin-managed route data, and location-based Geo-AR wayfinding.

## Language

**Commuter**:
A person who uses the mobile app to plan or execute a journey.
_Avoid_: Passenger, rider, user

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
