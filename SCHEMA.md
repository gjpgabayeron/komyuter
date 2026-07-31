**KOMYUTER**
 
Route Schema & Design Decisions Reference
 
*For AI Conversation Instances **&** Development Team*
 
Iloilo Science and Technology University (ISATU)
 
Undergraduate Thesis — Computer Science / Data Science
 
Version 1.0  •  April 2026
 
# **1. Project Identity ****&**** Purpose of This Document**
 
This document is the definitive reference for Komyuter's route data model and design decisions. Any Claude conversation instance, team member, or future contributor reading this should be able to understand exactly how routes, stops, polylines, detour segments, and boarding points are structured — and why each decision was made.
 
| **Field** | **Detail** |
| --- | --- |
| Project Name | Komyuter |
| Thesis Title | Komyuter: A Distance and Fare-Optimized Dijkstra's Algorithm with AR Wayfinding for Public Transit Navigation in Iloilo City |
| Institution | Iloilo Science and Technology University (ISATU) |
| Target Location | Iloilo City Proper + Oton, Pavia, Leganes |
| Backend Stack | Node.js + PostgreSQL + PostGIS (Drizzle ORM) |
| Coordinate Standard | GeoJSON: [longitude, latitude] — WGS84 / SRID 4326 |
 
| **⚠️  Coordinate Order Rule (Critical)** ALL coordinate pairs in this system follow GeoJSON standard: [longitude, latitude]. PostGIS ST_MakePoint(), GeoJSON, and Mapbox all expect [lng, lat]. Leaflet.js is the only exception — it uses [lat, lng]. Convert at the admin dashboard boundary. Swapping coordinates places stops in the ocean. This is the single most dangerous pitfall in this codebase. |
| --- |
 
# **2. Core Concepts: What Each Entity Represents**
 
## **2.1 Routes**
 
A route represents a single PUJ franchise corridor — the fixed path a jeepney is authorized to travel. Routes have a canonical direction (e.g., terminal A to terminal B) and may have a return path. Each route has exactly one base polyline and zero or more detour segments.
 
## **2.2 Polylines**
 
A polyline is the actual geometric path of the jeepney on the road network, stored as a PostGIS LINESTRING(4326). It is the source of truth for:
 
- Where the jeepney physically travels
 
- Which coordinates are eligible for hail-and-ride boarding
 
- Distance calculations between stops (via ST_Length / ST_Distance)
 
- Trust scoring — GPS traces are compared against the polyline using Modified Hausdorff Distance
 
The polyline is NOT just a display layer. It is a functional data structure that drives boarding eligibility, ETA computation, and route-trace similarity scoring.
 
## **2.3 Stops**
 
Stops are formal, named points along the route where:
 
- The jeepney is guaranteed to service passengers (terminals, major waiting areas)
 
- The graph algorithm uses as nodes in the transit network
 
- AR markers are displayed to help commuters locate boarding points
 
**Stops are NOT the only boarding points.** They are high-confidence sub-regions of the boardable polyline corridor. A commuter can hail and board anywhere along the valid polyline, not just at formal stops.
 
## **2.4 The Two-Layer Boarding Model**
 
| **Layer** | **What It Represents** | **Source of Truth** |
| --- | --- | --- |
| Formal Stops | Guaranteed service points, terminals, known waiting areas | Manually curated by admin |
| Hail-and-Ride Corridor | Entire polyline minus restricted segments | Derived from polyline + restrictions data |
 
A first-time rider benefits from being guided to a formal stop. A regular commuter who knows their usual spot on Molo Boulevard should be able to use the app to flag the passing jeepney — the app must support both behaviors.
 
# **3. The Route Schema**
 
## **3.1 Top-Level Route Object**
 
Each route in the database maps to the following structure. The canonical JSON representation used in API responses follows GeoJSON conventions throughout.
 
{
 
  "route_id": "calaparan-calumpang-iloilo-city",
 
  "name": "Calaparan-Calumpang-Iloilo City Proper",
 
  "short_name": "Calaparan-City",
 
  "color": "#E8550A",                     // display color on map
 
  "direction_label": {
 
    "forward": "To City Proper",
 
    "reverse": "To Calaparan"
 
  },
 
  "terminals": {
 
    "origin": "stop_plaza_villa_001",
 
    "destination": "stop_plaza_libertad_001"
 
  },
 
  "base_polyline": {                       // GeoJSON LineString
 
    "type": "LineString",
 
    "coordinates": [                       // [longitude, latitude] pairs
 
      [122.5312, 10.6891],
 
      [122.5334, 10.6907],
 
      ...
 
    ]
 
  },
 
  "restricted_segments": [...],            // see Section 3.3
 
  "detour_segments": [...],               // see Section 4
 
  "stops": [...],                         // see Section 3.2
 
  "fare_config_id": "ltfrb_puj_2024",
 
  "trust_score": 0.87,                    // informational only, never in Dijkstra
 
  "is_active": true
 
}
 
## **3.2 Stop Object**
 
Each stop is stored as a PostGIS POINT(4326) with metadata. The stop_order field determines sequence along the route for graph edge construction.
 
{
 
  "stop_id": "stop_plaza_villa_001",
 
  "route_id": "calaparan-calumpang-iloilo-city",
 
  "name": "Plaza Villa",
 
  "stop_order": 1,                        // sequence along route (1-indexed)
 
  "type": "terminal",                     // terminal | major_stop | waiting_area
 
  "location": {
 
    "type": "Point",
 
    "coordinates": [122.5312, 10.6891]    // [longitude, latitude]
 
  },
 
  "is_guaranteed_service": true,          // jeepney will stop here
 
  "landmark_hint": "In front of Arevalo Elementary School",
 
  "ar_marker_enabled": true,
 
  "notes": "Main terminus — jeepney waits here before departure"
 
}
 
**is_guaranteed_service** — this flag is the key distinction between a formal stop and a hail-and-ride point. When true, the app presents this stop with high confidence to the commuter. When false, the stop is a reference node for the graph but may not have a physically waiting jeepney.
 
## **3.3 Restricted Segments**
 
Some portions of the polyline where boarding or alighting is not permitted (no-stopping zones, one-way contraflow, pedestrian-hostile segments). These are stored as indexed references into the base_polyline coordinate array.
 
"restricted_segments": [
 
  {
 
    "segment_id": "rstr_ledesma_nopark_001",
 
    "from_coord_index": 47,               // index into base_polyline.coordinates
 
    "to_coord_index": 53,
 
    "reason": "no_stopping_zone",
 
    "affects": "both",                    // "boarding" | "alighting" | "both"
 
    "note": "Ledesma Street approach to Iznart intersection"
 
  }
 
]
 
# **4. Detour Segments (Alternative Routes)**
 
## **4.1 What a Detour Segment Is**
 
A detour segment is a conditional sub-route that activates only when a specific trigger condition is met. It is NOT an alternative route in the sense of a different path to the same destination — it is a demand-triggered loop that departs from and returns to the main base polyline.
 
| **Property** | **Description** |
| --- | --- |
| Demand-triggered | Only activates when ≥1 passenger explicitly requests it |
| Fixed geometry | The detour path is always the same set of streets |
| Direction-dependent | Inbound and outbound detour paths differ (different streets) |
| Loop structure | Departs from base polyline and returns to same corridor |
| Opt-in, not opt-out | Default behavior skips it; passenger request unlocks it |
 
| **📌  Real-World Example: Iloilo Terminal Market (Super) Detour** Route: Calaparan-Calumpang-Iloilo City Proper Trigger: Passenger requests to alight at Iloilo Terminal Market ('Super') Inbound detour (Breakthrough → City): Turn at Ledesma-Jalandoni corner, loop through Super, return via Fuentes to Ledesma Outbound detour (City → Breakthrough): Turn at Ledesma-Mabini (Robinsons side), pass Mabini-J.De Leon-Fuentes, rejoin Ledesma If nobody says 'Super', the jeepney skips this entirely and continues straight on Ledesma. |
| --- |
 
## **4.2 Detour Segment Schema**
 
"detour_segments": [
 
  {
 
    "detour_id": "super-detour-inbound",
 
    "label": "Iloilo Terminal Market (Super) via Ledesma-Jalandoni",
 
    "direction": "to_city",              // "to_city" | "to_origin" | "both"
 
    "trigger_type": "passenger_request", // see Section 4.3
 
    "trigger_condition": {
 
      "type": "destination_landmark",
 
      "landmark_ids": ["landmark_super_001"],
 
      "geofence_radius_meters": 150
 
    },
 
    "entry_node": {                      // where detour diverges from base polyline
 
      "description": "Ledesma-Jalandoni corner (frontline murals / block after Tanza Church)",
 
      "coordinates": [122.5471, 10.7214] // [lng, lat]
 
    },
 
    "exit_node": {                       // where detour rejoins base polyline
 
      "description": "Ledesma-Fuentes rejoining point (Socorro Drug / Iznart Arc side)",
 
      "coordinates": [122.5488, 10.7228]
 
    },
 
    "detour_polyline": {
 
      "type": "LineString",
 
      "coordinates": [...]               // [lng, lat] pairs tracing the detour loop
 
    },
 
    "notable_stops": [
 
      {
 
        "stop_id": "stop_super_001",
 
        "name": "Iloilo Terminal Market (Super)",
 
        "is_detour_only": true           // this stop only served via detour
 
      }
 
    ],
 
    "additional_distance_meters": 480,   // approximate extra distance
 
    "passenger_instruction": "Tell the driver 'Super' before or upon boarding.",
 
    "driver_instruction": "Turn at Ledesma-Jalandoni. Return via Fuentes."
 
  },
 
  {
 
    "detour_id": "super-detour-outbound",
 
    "label": "Return via Mabini-J.De Leon-Fuentes",
 
    "direction": "to_origin",
 
    "entry_node": {
 
      "description": "Ledesma-Mabini corner (Robinsons Place Iloilo side entrance)",
 
      "coordinates": [122.5495, 10.7231]
 
    },
 
    "exit_node": {
 
      "description": "Ledesma main rejoining after Fuentes",
 
      "coordinates": [122.5477, 10.7218]
 
    },
 
    "detour_polyline": { "type": "LineString", "coordinates": [...] },
 
    "notable_stops": [
 
      { "stop_id": "stop_super_001", "name": "Iloilo Terminal Market (Super)", "is_detour_only": true }
 
    ]
 
  }
 
]
 
## **4.3 Trigger Types**
 
The trigger_type field controls how the detour is activated. Three options are supported, with a recommended combination:
 
| **Trigger Type** | **How It Works** | **Recommendation** |
| --- | --- | --- |
| passenger_request (explicit) | Passenger selects detour-tagged stop in destination picker | ✅ Primary mechanism — most reliable |
| destination_proximity | App auto-flags if destination pin falls within geofence of detour stop | ✅ Secondary validator — improves UX |
| landmark_selection | Curated stop list; 'Super' is tagged as detour-dependent | ✅ Best for structured route apps |
 
| **🔑  Recommended Approach** Use landmark_selection (Option C) as the primary mechanism. Use destination_proximity (Option B) as a fallback validator when a passenger drops a free-form pin near a detour stop. Always surface a UI message: 'This destination requires a detour. Tell the driver [stop name] when boarding.' Never silently assume the detour is active — always confirm with the passenger. |
| --- |
 
## **4.4 Fare ****&**** ETA Implications of Detours**
 
Because detours add measurable distance to the trip, the fare and ETA calculations must account for them separately:
 
- **Fare: **Compute the detour segment's additional distance using ST_Length(detour_polyline::geography). Apply LTFRB formula to the cumulative distance (base trip + detour extra). Even if current regulations don't charge extra, the model should capture it — rates change.
 
- **ETA: **The detour only affects passengers boarding before the entry_node. Passengers boarding after the exit_node (downstream) are unaffected. Do NOT propagate detour delay to the full route ETA.
 
- **Loop awareness: **The detour is a loop back to the same corridor. The routing engine should apply the detour polyline only to the trip segment before the exit_node rejoining point.
 
# **5. Hail-and-Ride: Boarding Along the Polyline**
 
## **5.1 The Core Principle**
 
PUJs operate on a hail-and-ride model. The jeepney follows a fixed corridor (the base_polyline), but boarding and alighting can happen anywhere along that corridor as long as it is physically and legally safe. The app must model this reality rather than forcing commuters to use only formal stops.
 
## **5.2 Polyline Snapping**
 
When a passenger sets a pickup location, the raw GPS coordinate from their phone will likely not sit exactly on the polyline due to signal drift (typically 5–30 meters in urban Iloilo). The app must:
 
- Project the passenger's raw GPS onto the nearest polyline segment (point-to-segment projection)
 
- Confirm the snapped point is on the correct route — not a parallel street served by a different jeepney
 
- Check the snapped point against restricted_segments before confirming boarding eligibility
 
- If restricted — nudge to the nearest valid boarding point upstream or downstream
 
// Snap-to-polyline query in PostGIS
 
SELECT
 
  ST_ClosestPoint(r.base_polyline, ST_MakePoint($lng, $lat)::geometry) AS snapped_point,
 
  ST_Distance(
 
    r.base_polyline::geography,
 
    ST_MakePoint($lng, $lat)::geography
 
  ) AS distance_from_polyline
 
FROM routes r
 
WHERE r.route_id = $route_id
 
  AND ST_DWithin(
 
    r.base_polyline::geography,
 
    ST_MakePoint($lng, $lat)::geography,
 
    50   -- 50m tolerance for snapping
 
  );
 
## **5.3 Multi-Route Disambiguation**
 
When multiple routes share a road corridor (e.g., several jeepney lines that all pass through Ledesma Street), the snap-to-polyline operation may match multiple routes. The app must help the passenger confirm which specific route they are waiting for. This can be done by:
 
- Showing a route selector when multiple routes snap within tolerance
 
- Using the commuter's destination to filter to only routes that serve it
 
- Displaying the route color and name prominently so the commuter recognizes the correct jeepney
 
## **5.4 ETA Along the Polyline**
 
For hail-and-ride pickup, ETA is the time for the jeepney to travel from its current GPS position along the polyline to the passenger's snapped boarding point — not the time to the nearest formal stop and then walk. The snapped coordinate IS the destination for ETA purposes.
 
| **📐  Snapping Tolerance Recommendation** Snap tolerance: 25–50 meters (accounts for urban GPS drift without matching wrong roads) Rejection threshold: >50m from polyline → passenger is not on this route's corridor → show nearest route suggestion For Iloilo's dense urban grid, 25m is usually sufficient. Increase to 50m for narrower residential streets with less GPS signal. |
| --- |
 
# **6. How Routes Feed the Transit Graph**
 
The route schema described above is the input to the transit graph that powers Dijkstra's pathfinding. Here is how each schema element maps to graph components:
 
| **Schema Element** | **Graph Component** | **Notes** |
| --- | --- | --- |
| Stop (per route) | Node: stop_{stopId}_route_{routeId} | Route-expanded — same physical stop = different node per route |
| Consecutive stops on same route | Route Edge (directed) | Weight: distance + LTFRB fare |
| Stops on different routes within 300m | Transfer Edge (bidirectional) | Weight: walk distance + transfer penalty (1) |
| Detour entry/exit nodes | Conditional Route Edges | Only added to graph when detour is triggered |
| restricted_segments | Not modeled in graph | Used only for hail-and-ride boarding validation, not pathfinding |
 
Detour stops (is_detour_only: true) are NOT included in the graph by default. They are inserted as temporary nodes and edges only when a navigation request includes a detour-flagged destination, for that request only.
 
## **6.1 Cost Function**
 
Cost(e) = α · norm(distance) + β · norm(fare) + γ · norm(transfer) + δ · norm(walk)
 
// Preference Profiles:
 
// Shortest:        α=0.50, β=0.15, γ=0.20, δ=0.15
 
// Cheapest:        α=0.15, β=0.50, γ=0.20, δ=0.15
 
// Least Transfers: α=0.15, β=0.15, γ=0.55, δ=0.15
 
// Balanced:        α=0.25, β=0.25, γ=0.25, δ=0.25
 
# **7. Implementation Checklist for AI Instances**
 
When assisting with Komyuter development, any AI conversation instance should follow these rules:
 
| **✅  Always** Use [longitude, latitude] coordinate order in all GeoJSON, PostGIS queries, and API responses Cast to ::geography when computing distances or lengths (never use raw geometry for meter-based math) Treat the base_polyline as the boarding eligibility surface, not just a display layer Keep detour_segments separate from base_polyline — never merge them into the main polyline Model detour stops as is_detour_only: true and exclude from the default graph Distinguish is_guaranteed_service stops from hail-and-ride corridor points Compute fare based on cumulative distance, not per-edge distance independently |
| --- |
 
| **❌  Never** Do not store detour geometry inside base_polyline — it breaks ETA and fare calculations for non-detour passengers Do not treat formal stops as the only valid boarding points Do not use raw geometry (without ::geography) for distance/length calculations — results will be in degrees Do not let trust_score affect the Dijkstra cost function — it is informational only (panel constraint) Do not snap passengers to stops — snap to the polyline directly, then validate the snapped point Do not assume a detour is active unless a passenger explicitly triggers it |
| --- |
