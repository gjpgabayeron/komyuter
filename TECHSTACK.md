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
 
| Technology | Version | Purpose |
|---|---|---|
| Expo SDK | ~53 | Managed React Native workflow |
| Expo Router | v3+ | File-based navigation |
| React Native | latest | UI framework |
| `@rnmapbox/maps` | latest | Mapbox GL map rendering + route overlays |
| `expo-location` | latest | Foreground + background GPS |
| `expo-camera` | latest | Camera feed for AR overlay |
| `expo-sensors` | latest | Magnetometer (compass) + DeviceMotion (pitch/tilt) |
| `react-native-reanimated` | v3+ | Smooth AR marker animation |
| `expo-sqlite` | latest | Offline GPS trace caching |
| `react-native-mmkv` | latest | Fast key-value store for last-route cache (offline fallback) |
| `@tanstack/react-query` | v5 | Server state management, caching, offline retry |
| Axios | latest | HTTP client |
| TypeScript | ~5.9 | Type safety |
 
---
 
## Admin Dashboard — `apps/admin`
 
| Technology | Version | Purpose |
|---|---|---|
| React | 18+ | UI library |
| Vite | 5+ | Build tool / dev server |
| TypeScript | ~5.9 | Type safety |
| Mapbox GL JS | latest | Map rendering |
| `@mapbox/mapbox-gl-draw` | latest | Route polyline drawing with snap-to-road |
| `@tanstack/react-query` | v5 | Server state, optimistic CRUD updates |
| Zustand | latest | Lightweight global state (route-building wizard) |
| Zod | latest | Form + API response validation |
| React Router | v6+ | Client-side routing |
 
---
 
## Backend — `apps/server`
 
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| Fastify | v5 | HTTP framework (schema validation, plugin ecosystem) |
| `@fastify/jwt` | latest | JWT auth |
| `@fastify/rate-limit` | latest | Rate limiting on navigation endpoint |
| `@fastify/cors` | latest | CORS handling |
| Drizzle ORM | latest | Type-safe DB access + raw SQL escape hatch for PostGIS |
| `drizzle-kit` | latest | Migration generation + schema diffing |
| Zod | latest | Runtime input validation |
| `ioredis` | latest | Redis client (graph cache) |
| TypeScript | ~5.9 | Type safety |
 
### Graph & Algorithm (`apps/server/src/graph/`)
 
| Module | Responsibility |
|---|---|
| `graph.service.ts` | Route → weighted directed graph construction |
| `dijkstra.service.ts` | Multi-criteria Dijkstra pathfinding |
| `fareCalculator.ts` *(re-exported from shared)* | LTFRB fare formula |
| `cache.service.ts` | Redis graph serialization + invalidation |
| `normalize.service.ts` | Min-Max normalization preprocessing |
 
---
 
## Database — Supabase
 
| Technology | Purpose |
|---|---|
| PostgreSQL 15+ | Relational database |
| PostGIS | Spatial data types + functions (POINT, LINESTRING, ST_DWithin, ST_ClosestPoint) |
| Supabase Auth | User auth (admin role gating) |
| Supabase Storage | GPS trace file storage (optional) |
| GiST Spatial Index | Fast geographic queries on stop locations + route polylines |
 
---
 
## Cache — Upstash Redis
 
| Technology | Purpose |
|---|---|
| Upstash Redis | Serverless Redis (free tier) |
| `ioredis` | Client in server app |
 
**Strategy:**
- Graph built once on startup → serialized → stored in Redis
- Hydrated from Redis on process restart (eliminates cold-rebuild risk)
- Invalidated via dirty flag when admin mutates routes, stops, or fare configs
- Rebuild: eager (immediate on mutation) or lazy (on next `/api/navigate` request)
---
 
## Shared Package — `packages/shared`
 
| Export | Type |
|---|---|
| Zod schemas | Input validation contracts shared between server + clients |
| TypeScript types | `Route`, `Stop`, `GraphEdge`, `NavigationRequest`, `NavigationResponse`, etc. |
| `fareCalculator.ts` | LTFRB fare formula (used by server for routing, mobile for fare display) |
 
> **Rule:** No server-only logic (graph, Dijkstra, DB access) in shared. Only pure, framework-agnostic code.
 
---
 
## CI/CD — GitHub Actions
 
```yaml
# Runs on every PR to main/develop
jobs:
  ci:
    steps:
      - typecheck      # tsc --noEmit across all apps
      - lint           # ESLint
      - test           # Vitest smoke tests (navigation endpoint)
      - migration-lint # drizzle-kit check (no broken migrations)
```
 
---
 
## Coordinate Convention
 
| Context | Format | Note |
|---|---|---|
| GeoJSON / PostGIS / Mapbox | `[lng, lat]` | Standard GeoJSON spec |
| expo-location / geopy | `{ latitude, longitude }` | Named object |
| Haversine (internal) | `(lat, lng)` | Conversion at boundary only |
 
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
 
| Profile | α (Distance) | β (Fare) | γ (Transfer) | δ (Walk) |
|---|---|---|---|---|
| Shortest | 0.50 | 0.15 | 0.20 | 0.15 |
| Cheapest | 0.15 | 0.50 | 0.20 | 0.15 |
| Least Transfers | 0.15 | 0.15 | 0.55 | 0.15 |
| Balanced | 0.25 | 0.25 | 0.25 | 0.25 |
 
### LTFRB Fare Formula
 
```
fare = base_fare                                              if dist_km ≤ base_dist_km
fare = base_fare + (dist_km - base_dist_km) × rate_per_km   otherwise
 
Defaults (Modernized PUJ 2024):
  base_fare      = ₱13.00
  base_dist_km   = 4.0 km
  rate_per_km    = ₱1.80
  student/senior = 20% discount
```
 
> Fare is computed **per boarding** on cumulative segment distance — not summed per edge.
 
### Graph Node Convention
 
```
Node ID: stop_{stopId}_route_{routeId}
```
 
### Edge Types
 
| Type | Connects | Carries |
|---|---|---|
| Route edge | Consecutive stops, same route | distance, fare |
| Transfer edge | Stops of different routes within 300m | walk distance, transfer penalty = 1 |
 
### Trust Scoring (MHD)
 
- Modified Hausdorff Distance between GPS trace and reference polyline
- **Informational only** — never enters Dijkstra cost computation
- Displayed as trust badge in mobile UI
---
 
## Runtime Versions
 
| Tool | Version |
|---|---|
| Node.js | 20 LTS |
| pnpm | 10.12+ |
| TypeScript | ~5.9 |
| Supabase CLI | latest |
