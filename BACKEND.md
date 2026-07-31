# Komyuter: Backend Concepts

> A technical summary of spatial databases, graph theory, algorithms, and system design for the Komyuter public transit navigation system.

---

## 1. Spatial Databases — Why PostgreSQL + PostGIS

### The Core Problem
Komyuter deals with geographic data — route polylines, stop coordinates, GPS traces, and distance calculations. A regular relational database has no concept of spatial relationships like "this point is 300 meters from that point" or "how long is this route in kilometers."

### What PostGIS Adds
PostGIS is a PostgreSQL extension that adds:
- **Spatial data types:** `POINT`, `LINESTRING`, `POLYGON`, `MULTIPOINT`, etc.
- **Spatial functions:** distance calculations, containment checks, intersection detection, length computation
- **Spatial indexes:** R-tree indexes (via GiST) that make geographic queries fast
- **Coordinate reference systems:** proper handling of lat/lng on a curved Earth

**Without PostGIS:** You'd store lat/lng as separate `FLOAT` columns and write all distance/spatial logic in application code — slow, error-prone, and unindexable.

### Geometry vs. Geography

| Type | What It Does | Units | Accuracy for Iloilo |
|------|--------------|-------|---------------------|
| `geometry` | Flat-plane math (Cartesian) | Depends on SRID | Slightly inaccurate |
| `geography` | Spherical math (geodesic) | Always meters | Accurate for real-world distances |

**Storage:** `geometry(Point, 4326)` or `geometry(LineString, 4326)` (WGS84 coordinates)

**Distance & length:** Cast to `geography` for spherical math:
```sql
-- Returns distance in meters
SELECT ST_Distance(stop_a.location::geography, stop_b.location::geography);

-- Returns route length in meters
SELECT ST_Length(route.polyline::geography);
```

> ⚠️ **Without `::geography`**, `ST_Distance` returns results in degrees — meaningless for real-world distances.

---

### The Coordinate Order Trap
**This is the single most dangerous pitfall in any spatial project.**

| System | Order | Example for Iloilo City |
|--------|-------|-------------------------|
| Human conversation | latitude, longitude | 10.7202, 122.5621 |
| GeoJSON standard | **longitude, latitude** | **[122.5621, 10.7202]** |
| PostGIS `ST_MakePoint()` | **longitude, latitude** | `ST_MakePoint(122.5621, 10.7202)` |
| Google Maps URL | latitude, longitude | `@10.7202,122.5621` |
| Leaflet.js | latitude, longitude | `L.latLng(10.7202, 122.5621)` |
| Mapbox GL | **longitude, latitude** | `[122.5621, 10.7202]` |

**Rule:** Everything in your backend must use `[longitude, latitude]` because GeoJSON, PostGIS, and Mapbox all expect this. Leaflet (admin dashboard) is the odd one out — handle conversion at its boundary.

### Spatial Indexing
```sql
CREATE INDEX idx_stops_location ON stops USING GiST (location);
```
For your scale (10–12 routes, ~100–200 stops), performance isn't critical, but it's good practice and essential for scaling to more cities.

---

## 2. GeoJSON — The Language of Geographic Data

### What It Is
GeoJSON is a standardized JSON format for encoding geographic features. It's what your admin dashboard sends, what your database stores, and what your API returns.

### Key Structures for Komyuter
**A stop location (Point):**
```json
{ "type": "Point", "coordinates": [122.5621, 10.7202] }
```

**A route polyline (LineString):**
```json
{
  "type": "LineString",
  "coordinates": [
    [122.5501, 10.7150],
    [122.5523, 10.7168],
    [122.5561, 10.7190],
    [122.5621, 10.7202]
  ]
}
```

### Storage and Retrieval Flow
```
Admin draws polyline on Leaflet map
  ↓ (Leaflet outputs GeoJSON — already [lng, lat])
POST /api/routes with GeoJSON in request body
  ↓
Backend calls ST_GeomFromGeoJSON(geojson_string)
  ↓
PostgreSQL stores as binary PostGIS geometry
  ↓
On retrieval: ST_AsGeoJSON(polyline) → returns GeoJSON string
  ↓
Mobile app renders with Mapbox (expects [lng, lat] ✓)
```

This pipeline is clean because GeoJSON, PostGIS, and Mapbox all agree on `[lng, lat]`. Only Leaflet's `[lat, lng]` needs conversion at the admin boundary.

---

## 3. Graph Theory — Modeling the Transit Network

### Why a Graph
Your transit network is fundamentally a graph problem. Each stop is a node, each connection between stops is an edge. Dijkstra's algorithm operates on graphs, so you transform your relational route/stop data into a graph structure.

### Graph Components: G = (V, E, W)

**V (Vertices/Nodes):** Every stop on every route becomes a node.

> **Important:** If the same physical location is served by two routes (e.g., SM City Iloilo on Route 1 and Route 5), it becomes **two separate nodes** — one for each route. Being at "SM City on Route 1" is a different state than being at "SM City on Route 5" (you're on a different vehicle).

**Node ID format:** `stop_{stopId}_route_{routeId}`

**E (Edges):** Two types:

| Edge Type | Connects | What It Represents |
|-----------|----------|-------------------|
| **Route Edge** | Consecutive stops on the same route | Riding the PUJ from one stop to the next |
| **Transfer Edge** | Stops of different routes within 300m | Walking to board a different route |

- **Route edges** are directional (PUJ goes Stop A → Stop B → Stop C)
- **Transfer edges** are typically bidirectional

**W (Weights):**

| Weight | Route Edge | Transfer Edge |
|--------|------------|---------------|
| `distance` | Haversine distance between stops (meters) | Walking distance between stops (meters) |
| `fare` | Fare for this segment (LTFRB formula) | 0 (walking is free) |
| `transfer` | 0 (no transfer needed) | 1 (you must switch vehicles) |
| `walk` | 0 (you're riding) | Walking distance (meters) |

### Why Separate Route-Specific Nodes Matter
```
Route 1: A → B → C → D
Route 5: X → Y → C → Z
```
Both routes pass through physical stop **C**. If C is a single node, the algorithm might think it can seamlessly switch from Route 1 to Route 5 without a transfer. By creating separate nodes (`C_route1` and `C_route5`), you force the algorithm to traverse a transfer edge — which carries a transfer penalty and walking distance.

> This is a **route-expanded graph** (or label-based graph) — a standard technique in transit graph modeling.

### Graph Construction: From Database to Memory
```typescript
// Conceptual adjacency list structure
type Graph = Map<string, Edge[]>;

interface Edge {
  target: string;          // target node ID
  distance: number;        // meters
  fare: number;           // pesos
  transferPenalty: number; // 0 or 1
  walkDistance: number;   // meters
  routeId: string;        // which route this edge belongs to
}
```

**Build process:**
1. Query all routes with their stops (ordered by `stop_order`)
2. For each route, create nodes for each stop
3. For each pair of consecutive stops, create a route edge with distance and fare
4. Find all stop pairs across different routes within 300m (using `ST_DWithin`)
5. Create transfer edges with walk distance and penalty
6. Store as an adjacency list in memory

The graph is rebuilt when route/stop data changes and cached in memory between requests.

---

## 4. Dijkstra's Algorithm — The Core Pathfinding

### Standard Dijkstra's
Dijkstra's algorithm finds the shortest path from a source node to all other nodes in a weighted graph with **non-negative** edge weights:
1. Start at source with cost 0; all others ∞
2. Visit the unvisited node with the lowest known cost
3. For each neighbor, calculate cost through current node; update if lower
4. Mark current node as visited
5. Repeat until destination is visited or all nodes processed

**Key data structure:** Priority queue (min-heap)

### Multi-Criteria Extension for Komyuter
Standard Dijkstra uses a single weight per edge. Your system uses **four weights** combined into a single composite cost:

```
Cost(e) = α·norm(distance) + β·norm(fare) + γ·norm(transfer) + δ·norm(walk)
```

This is **single-objective Dijkstra** — you're combining multiple criteria into one scalar cost through a weighted linear combination. This preserves Dijkstra's optimality guarantee because:
- All raw values are non-negative
- Min-Max normalization maps them to [0, 1]
- All coefficients (α, β, γ, δ) are ≥ 0
- Therefore all composite edge costs are **≥ 0**

### Min-Max Normalization
Before combining weights, normalize them to the same scale:
```
norm(x) = (x - min) / (max - min)
```
Where `min` and `max` are the minimum and maximum values of that weight across all edges in the graph.

**Edge case:** If `min == max` (e.g., all transfer penalties are 0), set `norm(x) = 0` to avoid division by zero.

### Preference Profiles

| Profile | α (Distance) | β (Fare) | γ (Transfer) | δ (Walk) |
|---------|--------------|----------|--------------|----------|
| **Shortest** | 0.50 | 0.15 | 0.20 | 0.15 |
| **Cheapest** | 0.15 | 0.50 | 0.20 | 0.15 |
| **Least Transfers** | 0.15 | 0.15 | 0.55 | 0.15 |
| **Balanced** | 0.25 | 0.25 | 0.25 | 0.25 |

> Even non-dominant weights are never 0 — this prevents degenerate solutions. For example, "Cheapest" still considers distance at 0.15, so it won't suggest a wildly indirect route just to save ₱1.

### The Distance-Fare Redundancy Problem
Fare is a direct function of distance (LTFRB formula). On single-route trips, optimizing for distance and optimizing for fare will always produce the same result.

The multi-criteria approach only produces meaningfully different results on **multi-modal journeys** where:
- Route A is shorter but requires a transfer (extra base fare)
- Route B is longer but direct (one fare payment)

The transfer penalty and walking distance weights are what make the algorithm non-trivial. Without them, "distance + fare" optimization is mathematically redundant.

---

## 5. LTFRB Fare Model

### The Formula
```
IF distance ≤ base_distance_km:
    fare = base_fare
ELSE:
    fare = base_fare + (distance - base_distance_km) × rate_per_km
```

### Default 2024 Modernized PUJ Values

| Parameter | Value |
|-----------|-------|
| `base_fare` | ₱13.00 |
| `base_distance_km` | 4.0 km |
| `rate_per_km` | ₱1.80 |
| `student_discount` | 20% |
| `senior_discount` | 20% |

### How Fare Applies to Edges
Fare is computed **per route segment**, not per edge. When a commuter rides Route 1 from Stop A through Stop B to Stop C, they pay one fare based on the total distance (A→B→C), not two separate fares.

**Implementation subtlety:** The fare on each individual edge (A→B, B→C) must be the marginal fare for that segment within the overall route trip. In practice, for simplicity, you compute the fare per edge as `fare_for_distance(edge_distance)`. This slightly overapproximates fare for multi-stop rides on the same route (each segment independently charges a base fare), but it correctly penalizes transfers (each new route starts a new fare computation).

### Why This is Stored in the Database
LTFRB periodically adjusts fare rates. Different vehicle types may have different rate structures. The `fare_configs` table stores these as editable records so admins can update them without code changes — this directly serves **Panel Objective 1** (manage PUJ routes and fares).

---

## 6. Haversine Formula — Distance on a Sphere

### Why Not Euclidean Distance
The Earth is (approximately) a sphere. The Pythagorean theorem gives wrong results because a degree of latitude ≠ a degree of longitude (except at the equator), and both vary with location.

### The Formula
The haversine formula computes the great-circle distance between two points on a sphere:

```
a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)
c = 2 × atan2(√a, √(1-a))
d = R × c
```

Where:
- `R` = Earth's radius (6,371,000 meters mean)
- `Δlat`, `Δlng` = differences in latitude and longitude (in radians)
- `d` = distance in meters

### Where It's Used in Komyuter

| Use Case | Computed By |
|----------|-------------|
| Distance between consecutive stops (route edge weight) | PostGIS `ST_Distance(::geography)` or shared `haversine()` |
| Transfer detection (stops within 300m) | PostGIS `ST_DWithin(::geography, 300)` |
| MHD computation (trace-to-route similarity) | Server-side `haversine()` in trust scoring |
| AR marker distance display ("85m away") | Mobile-side `haversine()` from shared package |
| Route total length | PostGIS `ST_Length(::geography)` |

---

## 7. Modified Hausdorff Distance (MHD) — Trust Scoring

### The Concept
MHD measures how similar two shapes are by computing the **average** minimum distance from each point in one shape to the closest point in the other shape.

For Komyuter:
- **T** = GPS trace (sequence of recorded lat/lng points)
- **R** = Official route polyline (as defined by the admin)

```
MHD(T,R) = (1/|T|) × Σ min distance(tᵢ, R)
```

For each point `tᵢ` in the trace, find the closest point on the route polyline and measure the distance. Average all these minimum distances.

- **Low MHD** (e.g., 15m) = trace closely follows the route → high similarity
- **High MHD** (e.g., 200m) = trace deviates significantly → low similarity

### Why "Modified" Hausdorff
Standard Hausdorff Distance uses the **maximum** of minimum distances (worst-case deviation). The modified version uses the **average**, which is more robust to occasional GPS outliers.

### Conversion to Trust Score
```
similarity = clamp(1 - (MHD / 100), 0.0, 1.0)
```
- MHD = 0m → similarity = 1.0 (perfect match)
- MHD = 50m → similarity = 0.5
- MHD = 100m → similarity = 0.0

The 100m threshold is chosen because urban GPS accuracy is 5-15m, so deviations beyond 100m almost certainly indicate the vehicle is on a different road.

### Incremental Trust Update
Each new trace nudges the route's trust score:
```
Δ = η × (similarity - threshold),  η = 0.10, threshold = 0.70
S_new = clamp(S_old + Δ, 0.0, 1.0)
```
- If similarity > 0.70: trust goes up (trace confirms the route)
- If similarity < 0.70: trust goes down (trace contradicts the route)
- Learning rate `η = 0.10` means each trace has a small effect, preventing wild swings

> **Remember:** Trust is **informational only**. It appears as badges on route cards but **never enters the Dijkstra weight function**.

---

## 8. Data Preprocessing — Trace Quality Control

### Why Traces Need Filtering
Raw GPS traces from smartphones are noisy. A phone might report a position 20 meters off, or briefly lose GPS signal and jump.

### Moving Average Filter
Smooth GPS noise by replacing each point with the average of its neighbors:
```
smoothed_lat[i] = average(lat[i-k] ... lat[i+k])
smoothed_lng[i] = average(lng[i-k] ... lng[i+k])
```
Where `k` is the window size (typically 2-3 points). This reduces jitter without distorting the overall path shape.

### Trace Validity Filter
After smoothing, reject traces that aren't usable:

| Rule | Threshold | Rationale |
|------|-----------|-----------|
| Average speed | 5–40 km/h | Below 5 = walking, above 40 = private car |
| Duration | > 3 minutes | Shorter = accidental recording |
| Coverage | ≥ 60% of route length | Rejects partial rides |

These filters run on the server when a trace is uploaded via `POST /api/traces`.

---

## 9. Transit Network vs. Road Network

### Key Distinction
- **Road network (Google Maps, Waze):** Every intersection is a node, every road segment is an edge. Vehicles can turn anywhere.
- **Transit network (Komyuter):** Vehicles follow fixed franchise routes. A PUJ on Route 1 cannot turn onto Route 5's path — it must complete its franchise route.

The only way for a commuter to switch routes is to **get off, walk, and board a different vehicle**.

### Implications for Komyuter
- Nodes are **route-specific** (stop + route combination)
- Transfer edges represent **physical walking** between stops
- The graph is much **sparser** than a road network
- You don't need road network data (OpenStreetMap, etc.) — just your route polylines and stop locations

---

## 10. API Design for Geospatial Applications

### The Navigation Request
The core interaction: commuter provides origin and destination, server returns optimal path.

**`POST /api/navigate`**

**Request:**
```typescript
interface NavigationRequest {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  profile: 'shortest' | 'cheapest' | 'least_transfers' | 'balanced';
}
```

**Response:**
```typescript
interface NavigationResponse {
  success: boolean;
  data: {
    totalDistance: number;      // meters
    totalFare: number;          // pesos
    totalTransfers: number;     // count
    totalWalkDistance: number;  // meters
    segments: RouteSegment[];   // step-by-step directions
  };
}
```

### Snap-to-Nearest-Stop
The commuter's GPS position likely isn't exactly at a stop. The backend finds the nearest stop(s) using a **k-nearest-neighbor spatial query**:

```sql
SELECT id, name, route_id,
  ST_Distance(location::geography, ST_MakePoint($lng, $lat)::geography) as dist
FROM stops
ORDER BY location <-> ST_MakePoint($lng, $lat)::geometry
LIMIT 5;
```

The `<->` operator uses the GiST index for fast nearest-neighbor lookups.

---

## 11. ORM + PostGIS — The Drizzle Strategy

### Why Not Prisma
Prisma has no native PostGIS support. You can't define a `geometry(Point, 4326)` column in a Prisma schema, and you can't call `ST_Distance` in a Prisma query without raw SQL.

### Why Drizzle
Drizzle ORM gives you:
- Type-safe query building for standard CRUD operations
- A `sql` tagged template literal for raw SQL escape hatch — essential for PostGIS functions
- Schema defined in TypeScript (your migration source of truth)
- Lightweight, no query engine overhead

**Strategy:** For standard operations (user auth, fare config CRUD), use Drizzle's type-safe API. For spatial operations (route storage, distance queries, graph construction), drop to raw SQL with parameterized queries.

---

## 12. Graph Caching and Invalidation

### The Problem
Building the transit graph requires:
1. Querying all routes and stops from the database
2. Computing distances between all stop pairs for transfer detection
3. Constructing the adjacency list

This is **expensive** relative to a single pathfinding query. You don't want to rebuild the graph on every `POST /api/navigate` request.

### The Strategy
1. **Build once on server startup** — query the database and construct the graph
2. **Cache in memory** — store the adjacency list as a JavaScript `Map`
3. **Invalidate on admin changes** — when any route, stop, or fare config is created/updated/deleted, mark the graph as dirty
4. **Rebuild lazily or eagerly** — either rebuild immediately after admin changes (eager) or rebuild on the next navigation request (lazy)

For your scale (10–12 routes, ~100–200 stops), eager rebuilding is fine — it takes milliseconds.

The `GET /api/graph/status` endpoint exposes graph statistics (node count, edge count, last rebuild timestamp) for debugging and demo purposes.

---

## Summary — How It All Connects

```
Admin draws routes + places stops (GeoJSON)
  ↓
PostGIS stores spatial data (LINESTRING, POINT, SRID 4326)
  ↓
Graph Construction reads routes + stops
  - Creates route-expanded nodes
  - Creates route edges (with haversine distance + LTFRB fare)
  - Finds transfer pairs via ST_DWithin(300m)
  - Creates transfer edges (with walk distance + penalty)
  ↓
Min-Max Normalization scales all edge weights to [0, 1]
  ↓
Commuter requests navigation (origin, destination, profile)
  - Snap origin/destination to nearest stops
  - Run Multi-Criteria Dijkstra's with profile coefficients
  - Return optimal path as segments with directions
  ↓
Mobile app renders route on Mapbox + activates AR for walking segments
```
