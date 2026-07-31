# Komyuter — Project Overview

**Undergraduate Thesis** | Iloilo Science and Technology University (ISATU)
**Thesis Title:** Komyuter: A Distance and Fare-Optimized Dijkstra's Algorithm with Augmented Reality Wayfinding for Public Transit Navigation in Iloilo City
**Coverage:** Iloilo City Proper + Oton, Pavia, Leganes
**Transit Mode:** Public Utility Jeepneys (PUJ) — LTFRB-franchised fixed routes

---

## What It Is

Three-layer mobile navigation system that solves three problems Filipino commuters face in secondary cities:

1. **Transit Data Vacuum** — No digitized PUJ route map exists for Iloilo. LPTRP (25 routes, 1,767 PUVs) lives only as PDFs.
2. **Multi-Criteria Routing** — Commuters weigh distance, fare, transfers, and walking simultaneously. Standard Dijkstra can't model this.
3. **Last-Meter Wayfinding** — PUJ stops have no signage. Tourists (2,533 daily airport arrivals) can't find physical boarding points.

---

## System Layers

| Layer                                 | What It Does                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Route & Fare Management**           | Admin CRUD for routes, stops, polylines, LTFRB fare structures                              |
| **Multi-Criteria Dijkstra's**         | Pathfinding weighted by distance + fare + transfer penalty + walk distance                  |
| **AR Wayfinding**                     | Location-based Geo-AR overlays 3D stop markers on camera during walking/transfer segments   |
| **Community Trust Scoring** _(bonus)_ | GPS traces vs. route polylines via Modified Hausdorff Distance → informational trust badges |

---

## Actors & Features

### 1. Admin (Web Dashboard)

Authorized administrator managing route data for the transit system.

**Route Management**

- Draw PUJ route polylines directly on map (Leaflet + Leaflet Draw + snap-to-road)
- Set route metadata: name, short name, color, direction labels, terminal stops
- Activate/deactivate routes
- Configure detours (demand-triggered, direction-dependent)
- Define restrictions (no-stopping zones)
  **Stop Management**
- Place stops along direction polylines
- Set stop type: `terminal` | `major_stop` | `waiting_area`
- Toggle `is_guaranteed_service` flag (distinguishes formal stops from boarding corridor points)
- Add landmark hints and AR marker toggle per stop
- Manage stop ordering within each direction
  **Fare Configuration**
- Set LTFRB fare structure per route: base fare, base distance (km), rate per km
- Apply student/senior discount rates (20%)
- Update fare configs without code changes — rate changes handled through dashboard

---

### 2. Commuter (Mobile App)

Primary user: students, workers, tourists navigating Iloilo's PUJ network.

**Route Discovery**

- Browse all active PUJ routes on map
- View route details: stops, color-coded polyline, fare structure, trust badge
  **Navigation (Core Feature)**
- Input origin + destination via map pin or GPS
- Select preference profile:
  - **Shortest** — minimize travel distance
  - **Cheapest** — minimize fare cost
  - **Least Transfers** — minimize vehicle switches
  - **Balanced** — equal weight across all factors
- Receive step-by-step directions with per-segment fare, distance, and transfer info
- Hail-and-ride support — system snaps GPS position to nearest valid polyline point (25–50m tolerance), not just formal stops; boarding at non-stop positions enters the graph via request-time virtual nodes
- Multi-route disambiguation when multiple routes share a road corridor
  **AR Wayfinding** _(activates during walking/transfer segments only)_
- Camera view with floating 3D markers at stop locations
- Real-time bearing + distance computation from device GPS + compass
- Markers reposition dynamically as commuter walks/rotates phone
- Distance indicator ("85m away") + stop info card (name, route, fare)
- Enlarges when within 50m of target stop
- Helps tourists find unmarked, unsignposted PUJ boarding points
  **Fare Display**
- LTFRB distance-based fare: `₱13 base + ₱1.80/km beyond 4km`
- Cumulative fare per boarding segment
- Student/senior discount applied when applicable
  **Trust Badges** _(informational only)_
- Routes display community verification status: `Pending` / `Verified` / `Unverified`
- Badge shows trace count: "Verified by 15 traces"
- Does **not** affect route recommendations — display only
  **GPS Trace Recording** _(bonus feature)_
- Record ride as GPS trace in background
- Trace is tagged with a route + direction — automatically from the active navigation step, or by explicit commuter selection
- Auto-uploaded when back online
- Offline caching via SQLite until upload
- Contributes to route trust scoring
- Optional sign-in attributes traces to a commuter (per-commuter counts); anonymous traces count as raw submissions

---

## Algorithm Summary

### Multi-Criteria Dijkstra's

```
Cost(e) = α·norm(distance) + β·norm(fare) + γ·norm(transfer) + δ·norm(walk)
Constraint: α + β + γ + δ = 1.0
```

| Profile         | α Distance | β Fare | γ Transfer | δ Walk |
| --------------- | ---------- | ------ | ---------- | ------ |
| Shortest        | 0.50       | 0.15   | 0.20       | 0.15   |
| Cheapest        | 0.15       | 0.50   | 0.20       | 0.15   |
| Least Transfers | 0.15       | 0.15   | 0.55       | 0.15   |
| Balanced        | 0.25       | 0.25   | 0.25       | 0.25   |

### LTFRB Fare Formula

```
fare = base_fare                                             if dist_km ≤ 4.0 km
fare = base_fare + (dist_km − 4.0) × ₱1.80/km              otherwise
```

### Graph Model

- **Nodes:** `stop_{stopId}_direction_{directionId}` — route- and direction-expanded (same physical stop = different node per route direction)
- **Route edges:** consecutive stops, same direction — carry distance + marginal fare
- **Transfer edges:** stops of different routes within 300m — carry walk distance + transfer penalty (1)
- **Board edges:** request-time virtual nodes connecting a non-stop boarding/alighting position to its adjacent stops on the same direction (see SCHEMA §5.2)
- **Detour nodes:** inserted temporarily only when a commuter triggers the detour; the detour loop replaces the base segment between entry and exit nodes for that request
- Fare on route edges = one-time base fare at boarding + marginal ₱1.80/km thereafter (internal ranking cost); the fare displayed to the commuter is always recomputed exactly from the leg's true cumulative distance (ADR-0001)
- No ETA anywhere — navigation output is distances, fare, transfers, and walk distance only (ADR-0009)

### Trust Scoring (MHD)

```
MHD(T, R) = (1/|T|) × Σ min_distance(tᵢ, R)
similarity = clamp(1 − MHD/100, 0.0, 1.0)
```

Trust is **never** used as a Dijkstra weight. Informational only.

---

## Tech Stack Summary

| Layer    | Stack                                               |
| -------- | --------------------------------------------------- |
| Mobile   | Expo React Native + Mapbox GL + expo-sensors/camera |
| Admin    | React + Vite + Leaflet                              |
| Backend  | Node.js + Fastify + Drizzle ORM + Supabase Auth     |
| Database | PostgreSQL 15+ + PostGIS via Supabase               |
| Cache    | None — in-memory graph, eager rebuild (ADR-0005)    |
| Monorepo | Turborepo + pnpm workspaces                         |

---

## Evaluation

- **Instrument:** PSSUQ (16-item, 7-point Likert)
- **Target:** Overall mean ≤ 3.0 (industry benchmark: 2.82)
- **Respondents:** 25–30 (students, workers, tourists)
- **Tasks:** Route finding, fare identification, preference switching, AR stop location, AR transfer navigation

---

## Scope

- 10–12 of 25 rationalized LPTRP routes
- Iloilo City Proper + Oton, Pavia, Leganes
- Android primary (Expo managed workflow)
- No real-time vehicle tracking (out of scope — requires GPS hardware on PUVs)
- No schedule-based routing (PUJs operate on "full-then-go" basis)
