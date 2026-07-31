# Komyuter: Project Summary

> **Thesis Title:** "Komyuter: A Distance and Fare-Optimized Dijkstra's Algorithm with Augmented Reality Wayfinding for Public Transit Navigation in Iloilo City"  
> **Institution:** Iloilo Science and Technology University (ISATU)  
> **Level:** Undergraduate Thesis  
> **Field:** Computer Science / Data Science  
> **Team Size:** 3 members  
> **Timeline:** 1 academic semesters

---

## 1. Project Identity

| Field | Detail |
|-------|--------|
| **Project Name** | Komyuter |
| **Research Type** | Developmental Research with Usability Evaluation |
| **SDLC Model** | Incremental and Iterative Development |
| **Evaluation Instrument** | PSSUQ (Post-Study System Usability Questionnaire) |
| **Target Location** | Iloilo City Proper + Oton, Pavia, Leganes |
| **Target Users** | Public transit commuters (students, workers, tourists) |

---

## 2. Panel Objectives (Scored)

| # | Objective | Implementation |
|---|-----------|----------------|
| **Obj 1** | Manage PUJ routes and fares | Admin web dashboard with CRUD operations for route polylines, stops, and LTFRB fare structures |
| **Obj 2** | Provide best route based on distance and fare | Multi-criteria pathfinding with distance-based fare computation and user preference profiles |
| **Obj 3** | Provide AR navigation to commuters | Location-based Geo-AR with 3D markers at stop locations during walking/transfer segments |
| **Obj 4** | Evaluate usability using PSSUQ | 16-item standardized questionnaire with 25–30 respondents after task-based evaluation |

### Panel Constraints

| Constraint | Detail |
|------------|--------|
| **Trust scoring** | Preserved as informational badges on route cards — does NOT affect Dijkstra's weight function |
| **Fare model** | Distance-based: `fare = base_fare + max(0, distance - base_distance) × rate_per_km` |
| **AR expectation** | Location-Based Geo-AR using GPS + compass + device sensors — NOT ARCore/ARKit |

### The Distance-Fare Redundancy Argument
LTFRB fare is a direct function of distance. To enable meaningful multi-criteria routing for multi-modal journeys requiring transfers, the team includes **transfer penalty** and **walking distance** as supplementary weights.

**Final Weight Function:**
```
Cost(e) = α·norm(distance) + β·norm(fare) + γ·norm(transfer) + δ·norm(walk)
Where: α + β + γ + δ = 1.0
```

---

## 3. Problem Statement

### Problem 1: The Transit Data Vacuum
No digitized, structured, algorithmically usable map of public transit routes exists for Iloilo City. LPTRP (25 routes, 1,767 authorized PUVs) exists only as paper/PDF records. Google Maps, Waze, and other platforms provide zero PUJ transit directions.

### Problem 2: The Multi-Criteria Routing Problem
Filipino commuters are constrained to fixed franchise routes and simultaneously weigh distance, fare cost, and the inconvenience of transfers and walking. No existing tool supports multi-criteria, multi-modal pathfinding for Iloilo City's PUJ network.

### Problem 3: The Last-Meter Wayfinding Problem
PUJ stops lack visible signage, platforms, or markings. 2D maps fail to bridge the gap between digital directions and physical reality — especially for tourists (2,533 daily airport arrivals, +19.97% YoY).

### Supporting Statistics
- **Daily economic loss (NCR traffic):** PhP 3.5 Billion
- **Annual economic loss:** PhP 1.27 Trillion (~5% GDP)
- **Public transit share of urban trips:** 80%
- **Annual hours lost to traffic (per driver):** 117 hours
- **Average daily commuter transport cost:** PhP 108
- **Commuters citing work-life impact:** 72%
- **Iloilo City population density:** 6,518/km²

---

## 4. Research Objectives

### General Objective
To develop and evaluate a mobile public transit navigation system for Iloilo City that employs a multi-criteria Dijkstra's algorithm for distance and fare optimization with Augmented Reality wayfinding for stop location assistance.

### Specific Objectives (mapped to Panel Objectives)

| SO | Specific Objective | Panel Obj | Problem |
|----|-------------------|-----------|---------|
| SO1 | Design and implement an admin management system for PUJ route data | Obj 1 | Problem 1 |
| SO2 | Implement multi-criteria Dijkstra's algorithm with distance, fare, transfer, and walk weights | Obj 2 | Problem 2 |
| SO3 | Develop Location-Based Geo-AR wayfinding for stop location assistance | Obj 3 | Problem 3 |
| SO4 | Evaluate system usability using PSSUQ with 25–30 respondents | Obj 4 | All |

---

## 5. Scope and Delimitations

### Scope
| Dimension | Coverage |
|-----------|----------|
| **Geographic Area** | Iloilo City Proper + Oton, Pavia, Leganes |
| **Transit Modes** | Traditional PUJs, Modern PUVs, authorized city buses |
| **Route Count** | 10–12 of 25 rationalized LPTRP routes |
| **Route Data Management** | Admin web dashboard with geospatial CRUD |
| **Fare Model** | LTFRB distance-based (base fare + P/km) |
| **Core Algorithm** | Multi-criteria Dijkstra's (distance, fare, transfer, walk) |
| **AR Navigation** | Location-based Geo-AR during walking/transfer segments |
| **Mobile Platform** | Expo React Native (Android primary) |
| **Admin Platform** | React.js + Vite web application |
| **Evaluation** | PSSUQ with 25–30 respondents, 5 task scenarios |

### Delimitations
| Exclusion | Justification |
|-----------|---------------|
| Real-time vehicle tracking | Requires GPS hardware on vehicles |
| Live detour detection | Requires critical mass of simultaneous users |
| AR during ride segments | Commuter seated inside vehicle — camera obstructed |
| Indoor AR navigation | GPS unreliable indoors |
| ARCore/ARKit surface detection | Geo-AR sufficient for outdoor stops |

---

## 6. System Architecture

### High-Level Architecture
```
Mobile App (Expo) ←→ API (Express) ←→ Database (PostgreSQL + PostGIS)
       ↑                    ↑
       │                    │
 Admin Dashboard (React) ←→ Shared Types Package
```

### Component Responsibilities

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Map Rendering | Mobile App | Display routes, stops, navigation results (Mapbox GL) |
| GPS Recording | Mobile App | Foreground + background location traces (expo-location) |
| AR Wayfinding | Mobile App | Camera + sensor overlay with 3D markers (expo-camera, expo-sensors) |
| Route Drawing | Admin Dashboard | Polyline creation via map clicks (Leaflet Draw) |
| Stop Placement | Admin Dashboard | Click-to-place stops along routes |
| Fare Configuration | Admin Dashboard | LTFRB fare structure CRUD |
| Route CRUD | Backend API | Create, read, update, delete routes with PostGIS |
| Graph Construction | Backend | Build transit graph from routes + stops + transfers |
| Pathfinding | Backend | Multi-criteria Dijkstra's algorithm |
| Fare Computation | Shared Package | LTFRB distance-based fare formula |
| Trust Scoring | Backend | MHD computation + incremental trust update |
| Spatial Queries | Database (PostGIS) | Distance calculations, proximity detection |

---

## 7. Technology Stack

### Mobile Application (apps/mobile)
| Technology | Purpose |
|------------|---------|
| Expo SDK ~52+ | React Native managed workflow |
| Expo Router v3+ | File-based navigation |
| @rnmapbox/maps | Mapbox GL map rendering |
| expo-location | Foreground + background GPS |
| expo-camera | Camera feed for AR overlay |
| expo-sensors (Magnetometer) | Compass heading for AR |
| expo-sensors (DeviceMotion) | Device pitch/tilt for AR |
| react-native-reanimated v3+ | Smooth AR marker animation |
| expo-sqlite | Offline GPS trace caching |
| Axios | HTTP client for API calls |

### Admin Dashboard (apps/admin)
| Technology | Purpose |
|------------|---------|
| React 18+ | UI library |
| Vite 5+ | Build tool / dev server |
| TypeScript 5.5+ | Type safety |
| Leaflet.js + React-Leaflet | Interactive maps |
| Leaflet Draw | Route polyline drawing tool |
| Shadcn/ui | Component library |
| Tailwind CSS | Utility-first styling |
| TanStack Table | Data grids for route/stop lists |
| React Hook Form + Zod | Form management + validation |
| Axios | HTTP client for API calls |

### Backend Server (apps/server)
| Technology | Purpose |
|------------|---------|
| Node.js 20 LTS | Server runtime |
| Express.js 4.x | REST API framework |
| TypeScript 5.5+ | Type safety |
| tsx | Zero-config TypeScript runner |
| Drizzle ORM | Type-safe SQL with PostGIS escape hatch |
| node-postgres (pg) | PostgreSQL driver |
| Zod | Request validation (shared with admin) |
| jsonwebtoken + bcrypt | JWT authentication |
| helmet + cors | Security middlewares |
| swagger-jsdoc + swagger-ui-express | Auto-generated API documentation |
| Vitest | Unit testing framework |

### Database
| Technology | Purpose |
|------------|---------|
| PostgreSQL 16+ | Relational database |
| PostGIS 3.4+ | Spatial extension for geographic queries |
| Supabase (Local) | Local development (unlimited, free) |
| Supabase (Cloud) | Production deployment (free tier for defense) |

### Shared Package (packages/shared)
| Module | Purpose |
|--------|---------|
| types.ts | Shared TypeScript interfaces (Route, Stop, NavigationRequest, etc.) |
| constants.ts | Shared constants (preference profiles, thresholds, Iloilo center coords) |
| fareCalculator.ts | LTFRB fare formula + haversine distance + bearing calculation |
| schemas.ts | Zod validation schemas (shared between admin forms + server API) |

### Infrastructure
| Tool | Purpose |
|------|---------|
| Turborepo | Monorepo build orchestration |
| pnpm 9+ | Package manager with workspace support |
| Docker | Local PostgreSQL + PostGIS via Supabase CLI |
| Git + GitHub | Version control + code review |
| Husky + lint-staged | Pre-commit code quality hooks |
| commitlint | Conventional commit message enforcement |
| ESLint + Prettier | Code linting and formatting |
| Swagger UI | Interactive API documentation at /api/docs |

### Deployment
| Service | Component | Cost |
|---------|-----------|------|
| Expo EAS Build | Mobile APK | Free (30 builds/month) |

---

## 8. Algorithms

### Layer 1: Data Preprocessing

| # | Algorithm | Purpose | Input | Output |
|---|-----------|---------|-------|--------|
| 1 | Moving Average Filter | Smooth GPS noise | Raw GPS trace | Filtered trace |
| 2 | Trace Validity Filter | Reject unusable traces | Filtered trace | Accept/Reject |

**Trace Validity Rules:**
- Speed: 5–40 km/h (rejects walking and private cars)
- Duration: >3 minutes (rejects accidental recordings)
- Coverage: ≥60% of route length (rejects partial rides)

### Layer 2: Trust Scoring (Informational Only)

| # | Algorithm | Purpose | Input | Output |
|---|-----------|---------|-------|--------|
| 3 | Haversine Formula | Geographic distance between coordinates | Two coordinate pairs | Distance in meters |
| 4 | Modified Hausdorff Distance (MHD) | Spatial similarity between trace and route | Trace + Route polyline | Average distance in meters |
| 5 | Similarity Normalization | Convert MHD to 0–1 score | MHD value | Similarity score |
| 6 | Trust Score Update | Incrementally update route reliability | Similarity + current trust | New trust score |

**MHD Formula:**
```
MHD(T,R) = (1/|T|) × Σ min distance(t,R)
```

**Similarity Normalization:**
```
similarity = clamp(1 - (MHD / 100), 0.0, 1.0)
```

**Trust Update Rule:**
```
Δ = η × (similarity - threshold), η = 0.10, threshold = 0.70
S_new = clamp(S_old + Δ, 0.0, 1.0)
```

**Status Transitions:**
- Pending (initial, trust = 0.50)
- Verified (trust ≥ 0.75 AND traces ≥ 3)
- Unverified (trust ≤ 0.40)

> **Critical Note:** Trust scoring is an additional, non-scored feature. Trust does NOT affect Dijkstra's weight function. It is displayed as informational badges on route cards only.

### Layer 3: Pathfinding (Core Contribution)

| # | Algorithm | Purpose | Input | Output |
|---|-----------|---------|-------|--------|
| 7 | Graph Construction | Build transit network graph | Routes + Stops | Graph G = (V, E, W) |
| 8 | Min-Max Normalization | Scale weights to [0, 1] | Raw weight values | Normalized weights |
| 9 | Multi-Criteria Dijkstra's | Find optimal multi-modal path | Graph + origin + dest + profile | Optimal path + directions |

**Graph Model:** G = (V, E, W)
- **Stop Nodes:** Each stop on each route
- **Route Edges:** Between consecutive stops on the same route (carry distance, fare, trust)
- **Transfer Edges:** Between stops of different routes within 300m (carry walking distance, transfer penalty = 1)

**Composite Weight Function:**
```
Cost(e) = α·norm(distance) + β·norm(fare) + γ·norm(transfer) + δ·norm(walk)
Subject to: α + β + γ + δ = 1.0
```

**Preference Profiles:**

| Profile | α (Distance) | β (Fare) | γ (Transfer) | δ (Walk) |
|---------|--------------|----------|--------------|----------|
| Shortest | 0.50 | 0.15 | 0.20 | 0.15 |
| Cheapest | 0.15 | 0.50 | 0.20 | 0.15 |
| Least Transfers | 0.15 | 0.15 | 0.55 | 0.15 |
| Balanced | 0.25 | 0.25 | 0.25 | 0.25 |

**LTFRB Fare Formula:**
```
IF distance ≤ base_distance_km:
    fare = base_fare
ELSE:
    fare = base_fare + (distance - base_distance_km) × rate_per_km

Default LTFRB Modernized PUJ (2024):
    base_fare = P13.00
    base_distance_km = 4.0 km
    rate_per_km = P1.80
    student_discount = 20%
    senior_discount = 20%
```

**Optimality Guarantee:** All normalized weights ∈ [0,1] and all coefficients ≥ 0, so all composite edge costs are non-negative. Dijkstra's algorithm guarantees optimal solutions for non-negative edge weights.

---

## 9. AR Implementation

### Approach: Location-Based Geo-AR
Uses GPS + compass + device motion sensors to project markers onto the camera feed. Does NOT use ARCore, ARKit, or any surface detection technology.

### When AR Activates
| Segment Type | AR Available? | Reason |
|--------------|---------------|--------|
| Walking to stop | ✅ Yes | User needs to find the physical stop |
| Transfer (walking between stops) | ✅ Yes | Most valuable — "where do I go next?" |
| Riding in vehicle | ❌ No | User is seated inside — camera sees ceiling |
| Route overview | ❌ No | Standard map view is better for overview |

### AR Technical Pipeline
**Inputs (all available in Expo):**
- User GPS position ← expo-location
- Compass heading ← expo-sensors (Magnetometer)
- Device tilt/pitch ← expo-sensors (DeviceMotion)
- Camera feed ← expo-camera
- Target stop coords ← from navigation step data

**Computation:**
```
1. Bearing = atan2(sin(Δlng) × cos(lat2), cos(lat1) × sin(lat2) - sin(lat1) × cos(lat2) × cos(Δlng))
2. Relative angle = bearing - compass_heading
3. Screen X = center_x + (relative_angle / FOV) × screen_width
4. Distance = haversine(user, target)
5. Scale marker based on distance (closer = larger)
```

**Output:** Camera feed with:
- Floating marker at stop location
- Direction arrow pointing toward stop
- Distance indicator ("85m away")
- Stop info card (name, route, trust badge)

### Sensor Smoothing
- **Compass:** Low-pass filter to reduce jitter
- **GPS:** Moving average to prevent marker jumping
- **Marker position:** Interpolated animation via react-native-reanimated

### Known Limitations
- GPS accuracy (5–15m) causes slight marker wobble
- Compass accuracy varies by device
- Works best outdoors (GPS unreliable indoors)
- Requires device with gyroscope

---

## 10. Database Schema

### Tables
| Table | Purpose | Spatial Column |
|-------|---------|----------------|
| users | User accounts (admin, commuter) | None |
| fare_configs | LTFRB fare structures | None |
| routes | PUJ route definitions | polyline (LINESTRING, 4326) |
| stops | Transit stops along routes | location (POINT, 4326) |
| traces | GPS trace metadata | None |
| trace_points | Individual GPS points in traces | location (POINT, 4326) |
| graph_nodes | Transit graph nodes | location (POINT, 4326) |
| graph_edges | Transit graph edges | None |
| trust_history | Trust score change log | None |

### Key PostGIS Operations
| Function | Where Used |
|----------|------------|
| ST_GeomFromGeoJSON() | Storing route polylines from admin |
| ST_AsGeoJSON() | Returning routes to mobile/admin |
| ST_Length(geography) | Auto-computing route distance |
| ST_Distance(geography) | MHD computation, transfer detection |
| ST_DWithin(geography) | Finding nearby stops for transfer edges |
| ST_MakePoint() | Creating stop point geometries |
| ST_SetSRID() | Setting coordinate reference system (4326 = WGS84) |

### Database Triggers
- **update_updated_at:** Auto-updates updated_at timestamp on users, routes, fare_configs
- **compute_route_distance:** Auto-computes total_distance_km when route polyline is inserted/updated

---

## 11. Repository Structure

```
komyuter/
├── apps/
│   ├── mobile/          # Expo React Native (Commuter App)
│   ├── admin/           # React.js + Vite (Admin Dashboard)
│   └── server/          # Node.js + Express (Backend API)
├── packages/
│   └── shared/          # Shared TypeScript types, constants, utilities
├── supabase/
│   ├── config.toml      # Supabase local configuration
│   ├── migrations/      # Database migration SQL files
│   └── seed.sql         # Seed data
├── docs/                # Project documentation
├── .github/             # PR templates, issue templates
├── .vscode/             # VS Code settings, extensions
├── .cursor/             # AI assistant rules
├── turbo.json           # Turborepo pipeline config
├── pnpm-workspace.yaml  # Workspace definition
├── .env.example         # Environment variable template
└── docker-compose.yml   # (Optional fallback — Supabase CLI preferred)
```

### Git Conventions
- **Branch strategy:** main → develop → feature/[app]-[description]
- **Commit format:** `type(scope): description` (enforced by commitlint)
- **Valid scopes:** mobile, admin, server, shared, db, docs, config, ci, deps
- **PR process:** Feature branch → PR to develop → 1 review → merge → delete branch

---

## 12. SDLC — Incremental and Iterative Development

### Phase Overview
| Phase | Duration | Output |
|-------|----------|--------|
| Phase 1: Plan | Weeks 1–2, Sem 1 | Requirements, architecture, timeline |
| Phase 2: Collect | Weeks 2–5, Sem 1 | Ground truth dataset (10–12 routes, 30–36 GPS traces) |
| Phase 3: Build | Weeks 4–14, Both Sems | Working system in 4 increments |
| Phase 4: Test | Weeks 14–16, Sem 2 | Test reports, 40 OD pair benchmarks, AR field tests |
| Phase 5: Evaluate | Weeks 16–18, Sem 2 | PSSUQ results from 25–30 respondents |
| Phase 6: Defend | Weeks 18–20, Sem 2 | Thesis manuscript + defense presentation |

### Development Increments (Phase 3)
| Increment | Duration | Panel Objective | Deliverable |
|-----------|----------|-----------------|-------------|
| Inc 1: Route & Fare Management | Weeks 4–7, Sem 1 | Obj 1 | Admin dashboard with route/stop/fare CRUD |
| Inc 2: Dijkstra's Pathfinding | Weeks 7–10 (cross-semester) | Obj 2 | Multi-criteria pathfinding with preference profiles |
| Inc 3: AR Wayfinding | Weeks 10–13, Sem 2 | Obj 3 | Geo-AR markers during walking/transfer segments |
| Inc 4: Integration + Trust | Weeks 13–15, Sem 2 | Bonus | Complete system + GPS trust scoring |

### Iterative Cycle Within Each Increment
Design (1–2 days) → Implement (5–8 days) → Test (2–3 days) → Review with adviser (1 day) → Iterate (1–2 days) → Deliver (merge to develop)

---

## 13. Evaluation Methodology

### Instrument: PSSUQ (Post-Study System Usability Questionnaire)
- **16 items**, 7-point Likert scale (1 = Strongly Agree, 7 = Strongly Disagree)
- Lower scores = better usability
- **Industry benchmark mean:** 2.82 (Lewis, 2018)
- **Target:** Overall mean ≤ 3.0

### Three Subscales
| Subscale | Items | What It Measures |
|----------|-------|------------------|
| System Usefulness (SYSUSE) | 1–6 | Can users accomplish tasks effectively? |
| Information Quality (INFOQUAL) | 7–12 | Is route/fare/AR information clear? |
| Interface Quality (INTQUAL) | 13–16 | Is the interface pleasant? |

### Task Scenarios
| Task | Objective | Time Limit | Success Criteria |
|------|-----------|------------|------------------|
| T1: Find route from A to B | Obj 2 | 3 min | Correct route displayed |
| T2: Identify fare and transfer count | Obj 1+2 | 2 min | Correct values stated |
| T3: Switch to "Cheapest" profile | Obj 2 | 2 min | Different route/fare noted |
| T4: Use AR to find boarding stop | Obj 3 | 3 min | AR marker visible, correct direction |
| T5: Navigate transfer using AR | Obj 3 | 3 min | Transfer stop found via AR |

### Respondents
| Group | Count | Sampling |
|-------|-------|----------|
| University students | 10–12 | Purposive |
| Working professionals | 8–10 | Purposive |
| Tourists / newcomers | 5–8 | Convenience |
| **Total** | **25–30** | |

### Statistical Treatment
- Descriptive statistics (mean, SD) per PSSUQ subscale and overall
- Task completion rate (%)
- Mean task completion time (seconds)
- Comparison against PSSUQ benchmark (2.82)

---

## 14. Team Structure

| Role | Member | Primary Responsibility |
|------|--------|------------------------|
| Mobile + AR Lead | Member A | Expo app, AR implementation, sensor integration, Mapbox |
| Backend + Algorithm Lead | Member B | Express API, PostgreSQL + PostGIS, Dijkstra's, graph construction, trust scoring |
| Admin + Research Lead | Member C | React admin dashboard, field data coordination, PSSUQ evaluation, thesis writing |

**Shared:** All members participate in field data collection (riding jeepneys), thesis writing, and code reviews.

---

## 15. Key Decisions and Rationale

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SDLC Model | Incremental & Iterative | 4 distinct objectives, AR requires prototyping, adviser demos at each increment |
| Monorepo vs Polyrepo | Monorepo (Turborepo) | 3-person team, shared types between 3 apps, single source of truth |
| Mobile Framework | Expo (React Native) | Team knows React, expo-location for GPS, expo-camera for AR, managed workflow |
| Admin Framework | React + Vite | Team's core skill, fast HMR, complements monorepo |
| Backend Framework | Express.js | Most documented Node.js framework, panel recognition, simple architecture |
| ORM | Drizzle | Type-safe SQL + PostGIS raw SQL escape hatch (Prisma lacks PostGIS support) |
| Database | PostgreSQL + PostGIS via Supabase | Spatial queries essential, Supabase provides free local dev + cloud deployment |
| Map SDK (Mobile) | Mapbox GL (@rnmapbox/maps) | Custom polyline styling, Expo plugin, free tier sufficient |
| Map SDK (Admin) | Leaflet.js + Leaflet Draw | Lightweight, open source, route drawing plugin |
| AR Approach | Location-Based Geo-AR | GPS + compass sufficient for outdoor stops, avoids ARCore/ARKit dependency |
| Auth | Custom JWT (jsonwebtoken + bcrypt) | Simple, full control, easy to document for thesis |
| Testing | Vitest | Faster than Jest, native TypeScript, compatible with Vite |
| Usability Instrument | PSSUQ over SUS | 3 subscales (INFOQUAL directly evaluates route/fare info clarity), more diagnostic |
| Trust as Dijkstra weight | Removed (informational only) | Panel directive — trust displayed as badges, not in weight function |
| Fare model | LTFRB distance-based | Panel specified fare based on distance using LTFRB P/km data |
| Transfer + walk weights | Added beyond panel's "distance + fare" | Technically necessary — fare is f(distance), making 2-factor model redundant |

---

## 16. Concept Evolution History

| Iteration | Core Idea | Outcome |
|-----------|-----------|---------|
| Original Draft | Multi-weighted Dijkstra's + crowdsourcing + detour detection + offline maps | Rejected — 4 theses in one, no research questions |
| Option A | Focused multi-criteria Dijkstra's only | Not submitted — moderate novelty |
| Option B | Focused crowdsourced trust scoring only | Not submitted — strong novelty but no pathfinding |
| Hybrid (A+B) | Trust as a pathfinding weight — novel synthesis | Submitted and accepted by panel |
| Hybrid + Expo | Same concept, Expo for better GPS quality | Refined version |
| Panel-Revised | Panel removed trust from core, added AR, simplified algorithm, added admin CRUD | Current active version |
| Current Strategy | Deliver panel's 4 objectives + embed trust as bonus + argue for transfer/walk weights | What we are building |

### What Was Gained and Lost
- **Proposed:** Algorithm that knows what it doesn't know (trust-aware pathfinding)
- **Panel:** Working app with AR that people can use (practical + demonstrable)
- **Strategy:** Deliver the visible app → embed the depth beneath it

---

## 17. Thesis Document Structure

| Chapter | Sections | Pages |
|---------|----------|-------|
| Ch 1: Introduction | Background, Problem Statement, Objectives, Significance, Scope, Definition of Terms | 12–18 |
| Ch 2: Review of Related Literature | PH Transit, Shortest Path Algorithms, Graph Modeling, AR Navigation, Usability Evaluation, Related Systems, Theoretical Framework, Conceptual Framework | 20–30 |
| Ch 3: Methodology | Research Design, Data Collection, System Architecture, Algorithm Design, SDLC, Evaluation Methodology, Ethical Considerations | 18–25 |
| Ch 4: Results and Discussion | Implementation, Algorithm Benchmarks, AR Field Tests, PSSUQ Results, Discussion | 25–35 |
| Ch 5: Conclusions and Recommendations | Summary, Conclusions per Objective, Limitations, Future Work | 6–10 |

---

## 18. Future Work Items
(Explicitly excluded from current scope, documented for Chapter 5)

1. Real-time vehicle tracking with GPS hardware on PUVs
2. Live detour detection via spatio-temporal clustering
3. Trust score integration as a Dijkstra weight factor
4. Expansion to other Philippine cities using the admin scalability feature
5. GTFS feed generation and export for platform compatibility
6. Gamification for sustained community GPS trace contribution
7. Schedule-based routing if PUV schedules are formalized
8. Advanced Bayesian trust modeling
9. Indoor AR navigation for terminals and malls
10. Accessibility features (screen readers, colorblind modes)

---

## 19. Key References

| Reference | Relevance |
|-----------|-----------|
| Dijkstra, E.W. (1959). A Note on Two Problems in Connexion with Graphs. | Foundation — Dijkstra's Algorithm |
| Hart, P.E., Nilsson, N.J., & Raphael, B. (1968). A Formal Basis for Heuristic Determination of Minimum Cost Paths. | A* Search — baseline context |
| Dubuisson, M.P., & Jain, A.K. (1994). A Modified Hausdorff Distance for Object Matching. | MHD — trust scoring metric |
| Goodchild, M.F. (2007). Citizens as Sensors. | VGI framework |
| Haklay, M. (2010). How Good is Volunteered Geographical Information? | Crowdsourced data quality |
| Delling, D., Pajor, T., & Werneck, R.F. (2015). Round-Based Public Transit Routing. | RAPTOR — transit routing context |
| Lewis, J.R. (1992). Psychometric Evaluation of the PSSUQ. | PSSUQ instrument |
| Lewis, J.R. (2018). Measuring Perceived Usability: CSUQ, SUS, and UMUX. | PSSUQ benchmarks |
| Merry, K., & Bettinger, P. (2019). Smartphone GPS Accuracy Study in an Urban Environment. | GPS accuracy assumption |
| Larman, C., & Basili, V.R. (2003). Iterative and Incremental Development: A Brief History. | SDLC model citation |
| Pressman, R.S., & Maxim, B.R. (2020). Software Engineering: A Practitioner's Approach (9th ed.). | SDLC methodology reference |

---

## 20. Instructions for AI Assistants

When providing assistance on this project, follow these guidelines:

1. ✅ Always use TypeScript with strict mode for any code generation
2. ✅ Always use shared types from `@komyuter/shared` — never redefine Route, Stop, etc.
3. ✅ Always use the shared fare calculator — never reimplement the LTFRB formula
4. ✅ GeoJSON uses `[longitude, latitude]` — verify this in every spatial operation
5. ✅ PostGIS `ST_MakePoint` takes `(longitude, latitude)` — NOT `(latitude, longitude)`
6. ✅ Trust scoring is informational only — it does NOT affect Dijkstra's weights
7. ✅ AR is Location-Based Geo-AR — NOT ARCore/ARKit. Uses expo-camera + expo-sensors
8. ✅ AR only activates during walking/transfer segments — not during rides
9. ✅ The four panel objectives are scored — all features must serve these objectives
10. ✅ Fare is distance-based using LTFRB formula, not flat fare
11. ✅ Transfer penalty and walking distance are supplementary Dijkstra weights beyond the panel's minimum of distance + fare
12. ✅ Commit messages must follow `type(scope): description` format
13. ✅ API responses must follow the `{ success, data/error }` format
14. ✅ Database queries must use parameterized SQL — never string concatenation
15. ✅ This is an undergraduate thesis — prioritize clarity and correctness over cleverness
