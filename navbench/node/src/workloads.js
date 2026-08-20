"use strict";
/**
 * Node reference workloads (T011) — the canonical model reused directly, since
 * this IS the reference implementation. Each workload is a pure function of a
 * single query so the runner can time it per-query.
 */
const model = require("../../shared/model.js");

/** route_optimization: multi-criteria Dijkstra for one request. */
function routeOptimization(fixture, req) {
  return model.computeRoute({
    graph: fixture.graph,
    origin: req.origin,
    destination: req.destination,
    base_fare: fixture.graph.routes[0].fare.base_fare,
    base_dist_km: fixture.graph.routes[0].fare.base_dist_km,
    rate_per_km: fixture.graph.routes[0].fare.rate_per_km,
    profile: req.profile,
    restrictedSegments: [],
    detourWaypoints: [],
  });
}

/** detour_pathfinding: same as route but with one restricted segment. */
function detourPathfinding(fixture, req) {
  // Restrict the first ride edge of the computed route (mirrors the oracle).
  const base = routeOptimization(fixture, req);
  if (
    !base ||
    !base.found ||
    !base.legs[0] ||
    base.legs[0].stop_ids.length < 2
  ) {
    return base;
  }
  const a = base.legs[0].stop_ids[0];
  const b = base.legs[0].stop_ids[1];
  const restricted = a < b ? `${a}|${b}` : `${b}|${a}`;
  return model.computeRoute({
    graph: fixture.graph,
    origin: req.origin,
    destination: req.destination,
    base_fare: fixture.graph.routes[0].fare.base_fare,
    base_dist_km: fixture.graph.routes[0].fare.base_dist_km,
    rate_per_km: fixture.graph.routes[0].fare.rate_per_km,
    profile: req.profile,
    restrictedSegments: [restricted],
    detourWaypoints: [],
  });
}

/**
 * polyline_snapping: snap a query point to the nearest position across ALL
 * direction polylines (the realistic multi-candidate scan) — one query = one
 * full scan. Mirrors snapPolyline in the oracle generator.
 */
function polylineSnapping(fixture, point) {
  const graph = fixture.graph;
  let best = null;
  for (const rt of graph.routes) {
    for (const dir of rt.directions) {
      const snapped = snapOnce(dir.id, dir.polyline, point, 50);
      // Keep the closest across candidates (distance only; tie-break by dirId).
      if (
        snapped &&
        (!best ||
          snapped.distance_m < best.distance_m ||
          (snapped.distance_m === best.distance_m &&
            dir.id < best.direction_id))
      ) {
        best = { ...snapped };
      }
    }
  }
  return best;
}

function snapOnce(dirId, polyline, query, toleranceM) {
  let bestDist = Infinity;
  let bestLng = null,
    bestLat = null;
  // Seed with nearest vertex.
  for (const p of polyline) {
    const d = model.haversineKm(query, p) * 1000;
    if (d < bestDist) {
      bestDist = d;
      bestLng = p.lng;
      bestLat = p.lat;
    }
  }
  // Segment projection.
  for (let i = 0; i + 1 < polyline.length; i++) {
    const A = polyline[i];
    const B = polyline[i + 1];
    const abx = B.lng - A.lng,
      aby = B.lat - A.lat;
    const apx = query.lng - A.lng,
      apy = query.lat - A.lat;
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : (apx * abx + apy * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const plng = A.lng + t * abx;
    const plat = A.lat + t * aby;
    const d = model.haversineKm(query, { lng: plng, lat: plat }) * 1000;
    if (d < bestDist) {
      bestDist = d;
      bestLng = plng;
      bestLat = plat;
    }
  }
  if (bestDist > toleranceM) return null;
  return {
    direction_id: dirId,
    position_on_polyline: {
      lng: +bestLng.toFixed(5),
      lat: +bestLat.toFixed(5),
    },
    distance_m: model.round(bestDist, 3),
  };
}

module.exports = { routeOptimization, detourPathfinding, polylineSnapping };
