# Komyuter — Tech Stack Reference

> Monorepo: **Turborepo + pnpm workspaces**

---

## Repository Structure

```
komyuter/
├── apps/
│   ├── mobile/          # Expo React Native
│   ├── admin/           # React + Vite
│   └── server/          # Fastify + Node.js
│       └── src/
│           └── graph/   # Dijkstra + graph construction (server-only)
├── packages/
│   └── shared/          # Zod schemas, TS types, fareCalculator only
├── supabase/
│   └── migrations/      # SQL + PostGIS schema
└── .github/
    └── workflows/       # CI pipeline
```

---

## Mobile — `apps/mobile`

| Technology                | Version | Purpose                                                      |
| ------------------------- | ------- | ------------------------------------------------------------ |
| Expo SDK                  | ~53     | Managed React Native workflow                                |
| Expo Router               | v3+     | File-based navigation                                        |
| React Native              | latest  | UI framework                                                 |
| `@rnmapbox/maps`          | latest  | Mapbox GL map rendering + route overlays                     |
| `expo-location`           | latest  | Foreground + background GPS                                  |
| `expo-camera`             | latest  | Camera feed for AR overlay                                   |
| `expo-sensors`            | latest  | Magnetometer (compass) + DeviceMotion (pitch/tilt)           |
| `react-native-reanimated` | v3+     | Smooth AR marker animation                                   |
| `expo-sqlite`             | latest  | Offline GPS trace caching                                    |
| `react-native-mmkv`       | latest  | Fast key-value store for last-route cache (offline fallback) |
| `@tanstack/react-query`   | v5      | Server state management, caching, offline retry              |
| Axios                     | latest  | HTTP client                                                  |
| TypeScript                | ~5.9    | Type safety                                                  |

---

## Admin Dashboard — `apps/admin`

| Technology                             | Version | Purpose                                                        |
| -------------------------------------- | ------- | -------------------------------------------------------------- |
| React                                  | 18+     | UI library                                                     |
| Vite                                   | 5+      | Build tool / dev server                                        |
| TypeScript                             | ~5.9    | Type safety                                                    |
| MapLibre GL JS + react-map-gl          | latest  | Interactive map rendering (native `[lng, lat]`, no conversion) |
| Custom polyline drawing (react-map-gl) | —       | Route polyline drawing tool                                    |
| `@tanstack/react-query`                | v5      | Server state, optimistic CRUD updates                          |
| Zustand                                | latest  | Lightweight global state (route-building wizard)               |
| Zod                                    | latest  | Form + API response validation                                 |
| React Router                           | v6+     | Client-side routing                                            |

> **Coordinate convention:** the entire system uses `[lng, lat]` — GeoJSON, PostGIS, and MapLibre GL JS all consume it natively. There is no conversion layer (ADR-0013). A swapped pair puts stops in the ocean.

---

## Backend — `apps/server`

| Technology            | Version | Purpose                                                               |
| --------------------- | ------- | --------------------------------------------------------------------- |
| Node.js               | 20 LTS  | Runtime                                                               |
| Fastify               | v5      | HTTP framework (schema validation, plugin ecosystem)                  |
| Supabase Auth         | latest  | All authentication (admin + optional commuter); no DIY JWT (ADR-0006) |
| `@fastify/rate-limit` | latest  | Rate limiting on navigation endpoint                                  |
| `@fastify/cors`       | latest  | CORS handling                                                         |
| Drizzle ORM           | latest  | Type-safe DB access + raw SQL escape hatch for PostGIS                |
| `drizzle-kit`         | latest  | Migration generation + schema diffing                                 |
| Zod                   | latest  | Runtime input validation                                              |
| TypeScript            | ~5.9    | Type safety                                                           |

### Graph & Algorithm (`apps/server/src/graph/`)

| Module                                          | Responsibility                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `graph.service.ts`                              | Route + direction → weighted directed graph construction                         |
| `dijkstra.service.ts`                           | Multi-criteria Dijkstra pathfinding                                              |
| `fareCalculator.ts` _(re-exported from shared)_ | LTFRB fare formula (exact per-leg fare for display)                              |
| `virtualNodes.service.ts`                       | Request-time virtual node + board edge insertion for non-stop boarding/alighting |
| `normalize.service.ts`                          | Per-edge-type min-max normalization preprocessing (ADR-0002)                     |

---

## Database — Supabase

| Technology         | Purpose                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| PostgreSQL 15+     | Relational database                                                             |
| PostGIS            | Spatial data types + functions (POINT, LINESTRING, ST_DWithin, ST_ClosestPoint) |
| Supabase Auth      | User auth (admin role gating + optional commuter sign-in)                       |
| Supabase Storage   | GPS trace file storage (optional)                                               |
| GiST Spatial Index | Fast geographic queries on stop locations + route polylines                     |

---

## Graph Cache — In-Memory

No external cache. The graph is built once on server startup, stored as an adjacency list in memory, and **rebuilt eagerly** whenever admin mutations touch routes, stops, directions, detours, or fare configs (ADR-0005).

- At thesis scale (10–12 routes, ~100–200 stops) a full rebuild takes milliseconds
- `GET /api/graph/status` exposes node/edge counts + last-rebuild timestamp for debugging and demos
- Request-time virtual nodes are inserted per navigation request and never persisted or cached

---

## Shared Package — `packages/shared`

| Export              | Type                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| Zod schemas         | Input validation contracts shared between server + clients                    |
| TypeScript types    | `Route`, `Stop`, `GraphEdge`, `NavigationRequest`, `NavigationResponse`, etc. |
| `fareCalculator.ts` | LTFRB fare formula (used by server for routing, mobile for fare display)      |

> **Rule:** No server-only logic (graph, Dijkstra, DB access) in shared. Only pure, framework-agnostic code.

---

## CI/CD — GitHub Actions

```yaml
# Runs on every PR to main/develop
jobs:
  ci:
    steps:
      - typecheck # tsc --noEmit across all apps
      - lint # ESLint
      - test # Vitest smoke tests (navigation endpoint)
      - migration-lint # drizzle-kit check (no broken migrations)
```

---

## Coordinate Convention

| Context                      | Format                    | Note                        |
| ---------------------------- | ------------------------- | --------------------------- |
| GeoJSON / PostGIS / MapLibre | `[lng, lat]`              | Standard GeoJSON spec       |
| expo-location / geopy        | `{ latitude, longitude }` | Named object                |
| Haversine (internal)         | `(lat, lng)`              | Conversion at boundary only |

> Conversions happen **only** at explicit system boundaries. No silent lat/lng swaps inside services.

---

## Algorithm Reference

### Multi-Criteria Dijkstra

```
Cost(e) = α · norm(distance) + β · norm(fare) + γ · norm(transfer) + δ · norm(walk)

Constraint: α + β + γ + δ = 1.0
All normalized weights ∈ [0, 1] → all composite costs ≥ 0 → Dijkstra optimality holds
```

### Preference Profiles

| Profile         | α (Distance) | β (Fare) | γ (Transfer) | δ (Walk) |
| --------------- | ------------ | -------- | ------------ | -------- |
| Shortest        | 0.50         | 0.15     | 0.20         | 0.15     |
| Cheapest        | 0.15         | 0.50     | 0.20         | 0.15     |
| Least Transfers | 0.15         | 0.15     | 0.55         | 0.15     |
| Balanced        | 0.25         | 0.25     | 0.25         | 0.25     |

### LTFRB Fare Formula

```
fare = base_fare                                              if dist_km ≤ base_distance_km
fare = base_fare + (dist_km - base_distance_km) × rate_per_km   otherwise

Defaults (Modernized PUJ 2024):
  base_fare      = ₱13.00
  base_distance_km = 4.0 km
  rate_per_km    = ₱1.80
  student/senior = 20% discount
```

> Fare is computed **per boarding** on cumulative leg distance — the displayed fare is always exact (ADR-0001). Internally, the ranking cost charges a one-time base fare on boarding + marginal ₱1.80/km per route edge.

### Graph Node Convention

```
Node ID: stop_{stopId}_direction_{directionId}
```

### Edge Types

| Type          | Connects                                                     | Carries                                                      |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Route edge    | Consecutive stops, same direction                            | distance, marginal fare                                      |
| Transfer edge | Stops of different routes within 300m                        | walk distance, transfer penalty = 1 (distance = 0, ADR-0002) |
| Board edge    | Request-time virtual node → adjacent stops on same direction | along-polyline distance (hail-and-ride pickup/dropoff)       |

### Normalization (ADR-0002)

Each weight normalizes against its own edge-type pool, clamped to [0,1]:

- **distance** pool: route-edge distances only
- **walk** pool: transfer-edge walks + virtual walk edges
- **fare** pool: boarding base fares + marginal fares
- **transfer** pool: {0, 1}

### Trust Scoring (MHD)

- Modified Hausdorff Distance between GPS trace and reference polyline
- **Informational only** — never enters Dijkstra cost computation
- Displayed as trust badge in mobile UI
- Trace validity: max-speed discriminator (10–45 km/h), duration >3 min, coverage ≥60% of route (ADR-0003)

---

## Runtime Versions

| Tool         | Version                          |
| ------------ | -------------------------------- |
| Node.js      | 20 LTS                           |
| pnpm         | 8.15.6 (per root `package.json`) |
| TypeScript   | ~5.9                             |
| Supabase CLI | latest                           |
