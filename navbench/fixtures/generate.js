"use strict";
/**
 * Deterministic graph fixture generator (T006).
 *
 * Produces the route-expanded graph (two directions per route, ordered stop
 * lists, fare configs) as checked-in JSON inputs, seeded so every runtime reads
 * the SAME fixtures. Coordinate order is ALWAYS [lng, lat] (constitution).
 *
 * Sizes per research.md R1:
 *  - small  : few routes, few stops   (smoke / fast)
 *  - medium : realistic neighborhood
 *  - large  : city scale
 *  - rush   : large expanded with peak-direction weightings (stretch)
 */

const fs = require("fs");
const path = require("path");

// Mulberry32 — small, deterministic PRNG.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIZES = {
  small: { routes: 8, stopsPerRoute: [6, 12], crosspoint: 0.15 },
  medium: { routes: 30, stopsPerRoute: [10, 20], crosspoint: 0.25 },
  large: { routes: 90, stopsPerRoute: [12, 30], crosspoint: 0.3 },
  rush: { routes: 120, stopsPerRoute: [12, 30], crosspoint: 0.35, peak: true },
};

const CENTER = { lng: 122.55, lat: 10.7 }; // Iloilo City Proper area

function genScale(seed, opts) {
  const rand = mulberry32(seed);
  const routes = [];
  const stops = [];
  // Stop pool keyed by "lng,lat" rounded to ~5 decimals so routes can share
  // stops (transfers). crosspoint controls how often a new stop reuses an
  // existing near one.
  const stopIndex = new Map();
  let stopSeq = 0;

  const stopFor = (lng, lat) => {
    // Snap to ~10m grid for determinism and to enable cross-route sharing.
    const k = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    let id = stopIndex.get(k);
    if (id === undefined) {
      id = `stop_${stopSeq++}`;
      stopIndex.set(k, id);
      stops.push({ id, lng: +lng.toFixed(5), lat: +lat.toFixed(5) });
    }
    return id;
  };

  for (let r = 0; r < opts.routes; r++) {
    const routeId = `route_${r}`;
    const nMin = opts.stopsPerRoute[0];
    const nMax = opts.stopsPerRoute[1];
    const n = nMin + Math.floor(rand() * (nMax - nMin + 1));
    // A walking-ish path: each next stop offset by a small random vector.
    let lng = CENTER.lng + (rand() - 0.5) * 0.3;
    let lat = CENTER.lat + (rand() - 0.5) * 0.3;
    const stopIds = [];
    for (let i = 0; i < n; i++) {
      // Sometimes jump onto an existing stop (crosspoint) => transfer point.
      const reuse =
        stopIndex.size > 5 &&
        rand() < opts.crosspoint &&
        Array.from(stopIndex.values())[Math.floor(rand() * stopIndex.size)];
      let id;
      if (reuse !== false) id = reuse;
      else {
        lng += (rand() - 0.5) * 0.02;
        lat += (rand() - 0.5) * 0.02;
        id = stopFor(lng, lat);
      }
      stopIds.push(id);
    }
    const polyline = stopIds.map((id) => stops.find((s) => s.id === id));
    routes.push({
      id: routeId,
      directions: [
        { id: `${routeId}-1`, stopIds: [...stopIds], polyline },
        // ADR-0008: the return direction has its OWN polyline/order, never a
        // reversal of direction 1's polyline. Here we derive a distinct order.
        {
          id: `${routeId}-2`,
          stopIds: [...stopIds].reverse(),
          polyline: [...polyline].reverse(),
        },
      ],
    });
  }

  // Fare config per route, LTFRB fields (base_fare, base_dist_km, rate_per_km).
  for (const rt of routes) {
    rt.fare = {
      base_fare: 13,
      base_dist_km: 4,
      rate_per_km: 1.8,
    };
  }

  return {
    scale: opts.peak ? "stretch" : "baseline",
    seed,
    center: CENTER,
    stops,
    routes,
  };
}

// Deterministic query set shared across runtimes for route/detour workloads.
function genRequests(graph, seed, count) {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const ids = graph.stops.map((s) => s.id);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = ids[Math.floor(rand() * ids.length)];
    const b = ids[Math.floor(rand() * ids.length)];
    const sa = graph.stops.find((s) => s.id === a);
    const sb = graph.stops.find((s) => s.id === b);
    out.push({
      origin: { lng: sa.lng, lat: sa.lat },
      destination: { lng: sb.lng, lat: sb.lat },
      profile: "balanced",
    });
  }
  return out;
}

function main() {
  const outDir = path.join(__dirname, "..", "fixtures", "inputs");
  fs.mkdirSync(outDir, { recursive: true });
  const SEED = 1337; // fixed across the study (benchmark-format.md graph.seed)
  const summary = {};
  for (const [name, opts] of Object.entries(SIZES)) {
    const graph = genScale(SEED + SIZES_OFFSET[name], opts);
    const requests = genRequests(graph, SEED, N_REQUESTS[name]);
    const fixture = { graph, requests };
    const file = path.join(outDir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(fixture, null, 2));
    summary[name] = {
      stops: graph.stops.length,
      routes: graph.routes.length,
      directions: graph.routes.reduce((n, r) => n + r.directions.length, 0),
      requests: requests.length,
      bytes: fs.statSync(file).size,
    };
  }
  console.log("Generated fixtures:");
  console.table(summary);
}

const SIZES_OFFSET = { small: 0, medium: 1000, large: 2000, rush: 3000 };
const N_REQUESTS = { small: 80, medium: 150, large: 200, rush: 200 };

if (require.main === module) main();
module.exports = { genScale, genRequests, SIZES, SEED: 1337 };
