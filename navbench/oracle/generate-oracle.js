"use strict";
/**
 * Parity oracle generator (T007, R3, FR-010).
 *
 * Runs the CANONICAL model (navbench/shared/model.js) over representative
 * inputs and writes {input, expected_output} pairs to navbench/fixtures/oracle/.
 * Every runtime's test suite MUST reproduce expected_output exactly; a
 * divergence is a port bug (Principle III).
 */
const fs = require("fs");
const path = require("path");
const model = require("../shared/model.js");

const INPUT_DIR = path.join(__dirname, "..", "fixtures", "inputs");
const OUT_DIR = path.join(__dirname, "..", "fixtures", "oracle");

function loadInputs() {
  const out = {};
  for (const name of ["small", "medium", "large", "rush"]) {
    out[name] = JSON.parse(
      fs.readFileSync(path.join(INPUT_DIR, `${name}.json`), "utf8"),
    );
  }
  return out;
}

/** Build a route_optimization / detour_pathfinding oracle case set for a fixture. */
function routeCases(fixture, includeDetour) {
  const cases = [];
  const { graph, requests } = fixture;
  // Limit the number of oracle cases (perf: canon runs in JS) but keep the
  // common ones (first few requests) + a spread that parses deterministic.
  const pick = requests
    .filter((_, i) => i % Math.max(1, Math.floor(requests.length / 12)) === 0)
    .slice(0, 12);
  for (const req of pick) {
    const res = model.computeRoute({
      graph,
      origin: req.origin,
      destination: req.destination,
      base_fare: graph.routes[0].fare.base_fare,
      base_dist_km: graph.routes[0].fare.base_dist_km,
      rate_per_km: graph.routes[0].fare.rate_per_km,
      profile: req.profile,
      restrictedSegments: [],
      detourWaypoints: [],
    });
    cases.push({
      input: {
        workload_id: "route_optimization",
        graph: { scale: graph.scale, seed: graph.seed },
        request: req,
      },
      expected_output: res,
    });
    if (includeDetour && res.found) {
      // Detour: restrict the first ride edge of the first leg.
      const leg = res.legs[0];
      let restricted = null;
      if (leg && leg.stop_ids.length >= 2) {
        const a = leg.stop_ids[0],
          b = leg.stop_ids[1];
        restricted = a < b ? `${a}|${b}` : `${b}|${a}`;
      }
      const dRes = model.computeRoute({
        graph,
        origin: req.origin,
        destination: req.destination,
        base_fare: graph.routes[0].fare.base_fare,
        base_dist_km: graph.routes[0].fare.base_dist_km,
        rate_per_km: graph.routes[0].fare.rate_per_km,
        profile: req.profile,
        restrictedSegments: restricted ? [restricted] : [],
        detourWaypoints: [],
      });
      cases.push({
        input: {
          workload_id: "detour_pathfinding",
          graph: { scale: graph.scale, seed: graph.seed },
          request: { ...req, restricted_segment_id: restricted },
        },
        expected_output: dRes,
      });
    }
  }
  return cases;
}

/** Build a polyline_snapping oracle case set (deterministic, no dijkstra). */
function snapCases(fixture) {
  const cases = [];
  // Sample a deterministic subset of stops across all directions; for each,
  // build a query point that sits a few metres "off" the polyline so the snap
  // exercises the projection logic and stays within tolerance.
  const seen = new Set();
  for (const rt of fixture.graph.routes) {
    for (const dir of rt.directions) {
      const step = Math.max(1, Math.floor(dir.polyline.length / 6));
      for (let i = 0; i < dir.polyline.length; i += step) {
        const p = dir.polyline[i];
        const key = `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // ~9m offset east: d(lng) ~ 9 / (111320 * cos(lat)) degrees.
        const lngOff =
          0.0000909 / Math.max(1, Math.cos((p.lat * Math.PI) / 180));
        const query = { lng: p.lng + lngOff, lat: p.lat };
        const snapped = snapPolyline(
          fixture.graph,
          dir.id,
          dir.polyline,
          query,
          30,
        );
        cases.push({
          input: {
            workload_id: "polyline_snapping",
            graph: { scale: fixture.graph.scale, seed: fixture.graph.seed },
            request: {
              direction_id: dir.id,
              point: query,
              tolerance_m: 30,
              candidate_direction_ids: [dir.id],
            },
          },
          expected_output: snapped,
        });
      }
    }
  }
  return cases;
}

/**
 * Deterministic point-on-polyline projection (no external libs). Returns the
 * snapped position (projection onto the nearest segment if within tolerance,
 * or null). Matches the geo semantics in model.js; all runtimes share it.
 */
function snapPolyline(graph, dirId, polyline, query, toleranceM) {
  let bestDist = Infinity;
  let bestProj = null;
  // Vertex distance first (sometimes closer than any interior projection).
  for (const p of polyline) {
    const d = model.haversineKm(query, p) * 1000;
    if (d < bestDist) {
      bestDist = d;
      bestProj = { lng: p.lng, lat: p.lat };
    }
  }
  // Segment projection (the real "snap to network link" computation).
  for (let i = 0; i + 1 < polyline.length; i++) {
    const A = polyline[i];
    const B = polyline[i + 1];
    const proj = projectPointToSegment(query, A, B);
    const d = model.haversineKm(query, proj) * 1000;
    if (d < bestDist) {
      bestDist = d;
      bestProj = proj;
    }
  }
  if (bestDist > toleranceM) return null;
  return {
    direction_id: dirId,
    position_on_polyline: {
      lng: +bestProj.lng.toFixed(5),
      lat: +bestProj.lat.toFixed(5),
    },
    distance_m: model.round(bestDist, 3),
  };
}

/**
 * Orthogonal projection of point P onto segment AB (equirectangular approx on
 * degrees — sufficient at metro scale and fully deterministic across runtimes).
 */
function projectPointToSegment(P, A, B) {
  const abx = B.lng - A.lng;
  const aby = B.lat - A.lat;
  const apx = P.lng - A.lng;
  const apy = P.lat - A.lat;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return { lng: A.lng + t * abx, lat: A.lat + t * aby };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const inputs = loadInputs();
  const summary = {};
  for (const [name, fixture] of Object.entries(inputs)) {
    const route = routeCases(fixture, true);
    const snap = snapCases(fixture);
    const oracle = [...route, ...snap];
    const file = path.join(OUT_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(oracle, null, 2));
    summary[name] = {
      cases: oracle.length,
      routeOrDetour: route.length,
      snaps: snap.length,
      bytes: fs.statSync(file).size,
    };
  }
  console.log("Generated oracle fixtures:");
  console.table(summary);
}

if (require.main === module) main();
module.exports = { routeCases, snapCases };
