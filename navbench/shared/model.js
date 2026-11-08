"use strict";
/**
 * Canonical navigation model (shared by oracle generator + Node baseline).
 *
 * This is the authoritative semantics for the three workloads. Rust and Go
 * MUST reproduce its outputs EXACTLY (FR-010 / SC-005) — any divergence is a
 * port bug, never a reason to change this file (Principle III).
 *
 * Coordinate order is [lng, lat] everywhere.
 *
 * Determinism rules that make 3-way parity possible:
 *  - distances are rounded before they enter any cost/decision;
 *  - Dijkstra ties break lexicographically on (routeId, stopId);
 *  - fare compared to the cent.
 */

/** Haversine distance in kilometres between two [lng,lat] points. */
function haversineKm(a, b) {
  const R = 6371.0088;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Round to `decimals`; used everywhere so cross-language floats agree. */
function round(x, decimals) {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/**
 * Build the route-expanded, direction-aware graph used by route_optimization
 * and detour_pathfinding.
 *
 * Vertices are (stopId) — stops are shared across routes. Edges:
 *  - ride edges between consecutive stops on a direction polyline
 *    (cost = base_on_board + 1.8 * distance_km, per ADR-0001 internal cost);
 *  - transfer edges between two stop-in-direction memberships of the same stop
 *    when they belong to different routes (cost = small constant, distance 0).
 */
function buildGraph(graph) {
  const stopById = new Map(graph.stops.map((s) => [s.id, s]));
  const byStop = new Map(); // stopId -> [{routeId, dirId}]
  const rideEdges = new Map(); // "a|b" -> [{routeId, dirId, km}]
  const stopRide = new Map(); // stopId -> [{routeId, dirId, km, to}]
  for (const rt of graph.routes) {
    for (const dir of rt.directions) {
      const ids = dir.stopIds;
      for (let i = 0; i < ids.length; i++) {
        const sid = ids[i];
        if (!byStop.has(sid)) byStop.set(sid, []);
        byStop.get(sid).push({ routeId: rt.id, dirId: dir.id });
        if (i + 1 < ids.length) {
          const a = ids[i],
            b = ids[i + 1];
          const pa = stopById.get(a);
          const pb = stopById.get(b);
          const km = round(haversineKm(pa, pb), 4);
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          if (!rideEdges.has(key)) rideEdges.set(key, []);
          rideEdges.get(key).push({ routeId: rt.id, dirId: dir.id, km });
          for (const [from, to] of [
            [a, b],
            [b, a],
          ]) {
            if (!stopRide.has(from)) stopRide.set(from, []);
            stopRide.get(from).push({ routeId: rt.id, dirId: dir.id, km, to });
          }
        }
      }
    }
  }
  return { byStop, rideEdges, stopRide };
}

const BASE_ON_BOARD = 13; // ADR-0001 internal on-board base
const MARGINAL_PER_KM = 1.8; // ADR-0001 marginal
const TRANSFER_COST = 2.0; // tiny constant; transfer distance = 0 (ADR-0002)
const RESTRICT_COST = 1e9; // effectively removes an edge

/**
 * Multi-criteria Dijkstra (shortest by internal cost; transports used just to
 * reject disconnected). Path is a list of legs; each leg is a maximal run on
 * one (route, direction). Returns the route result object (see contract) or
 * { found:false }.
 *
 * `restrictedSegments`: array of "a|b" keys to remove (detour workload).
 * `detourWaypoints`: array of stopIds that MUST be visited (detour workload) —
 *   implemented as forced passes (run a via point, re-split on it).
 */
function computeRoute(opts) {
  const {
    graph,
    origin,
    destination,
    base_fare,
    base_dist_km,
    rate_per_km,
    profile,
    restrictedSegments,
    detourWaypoints,
  } = opts;

  const { byStop, rideEdges } = buildGraph(graph);

  const o = nearestStop(graph, origin);
  const d = nearestStop(graph, destination);
  if (!o || !d) return { found: false };

  const banned = new Set(restrictedSegments || []);
  const toVisit = detourWaypoints
    ? detourWaypoints.filter((w) => w !== o && w !== d)
    : [];

  // Run Dijkstra over a "via chain": start -> waypoints... -> dest.
  const via = [o, ...toVisit, d];
  let fullLegs = [];
  let totalDist = 0;
  let totalFare = 0;
  let transfers = 0;
  for (let i = 0; i + 1 < via.length; i++) {
    const seg = dijkstraSegment(
      graph,
      via[i],
      via[i + 1],
      banned,
      base_fare,
      base_dist_km,
      rate_per_km,
    );
    if (!seg) return { found: false };
    fullLegs.push(...seg.legs);
    totalDist += seg.distKm;
    totalFare += seg.fare;
    transfers += seg.transfers;
  }
  // Transfers across via-chain seams are counted by the segment boundaries
  // already; if the last leg of one segment and first of the next share the
  // same route+direction they were NOT merged here — recompute below instead.

  // Merge adjacent legs that share the same route+direction.
  const legs = [];
  for (const leg of fullLegs) {
    const last = legs[legs.length - 1];
    if (
      last &&
      last.route_id === leg.route_id &&
      last.direction_id === leg.direction_id
    ) {
      last.stop_ids.push(...leg.stop_ids.slice(1));
    } else {
      legs.push({
        route_id: leg.route_id,
        direction_id: leg.direction_id,
        stop_ids: [...leg.stop_ids],
      });
    }
  }

  // Recompute transfers as leg-boundary route changes after merging.
  transfers = 0;
  for (let i = 0; i + 1 < legs.length; i++) {
    if (legs[i].route_id !== legs[i + 1].route_id) transfers += 1;
  }

  // Per-leg fare totals (exact per-leg LTFRB) used for display.
  const legsFare = legs.map((leg) =>
    legFare(leg, graph, base_fare, base_dist_km, rate_per_km),
  );
  const total = round(
    legsFare.reduce((s, f) => s + f, 0),
    2,
  );

  return {
    found: true,
    legs,
    transfers,
    walk_m: 0, // origin/dest snapped to stops; hail-ride walk not modeled
    distance_km: round(totalDist, 3),
    fare: { total, legs: legsFare, discounted: false },
  };
}

function legFare(leg, graph, base_fare, base_dist_km, rate_per_km) {
  // Sum haversine over the leg's consecutive stops.
  let km = 0;
  for (let i = 0; i + 1 < leg.stop_ids.length; i++) {
    const pa = graph.stops.find((s) => s.id === leg.stop_ids[i]);
    const pb = graph.stops.find((s) => s.id === leg.stop_ids[i + 1]);
    km += haversineKm(pa, pb);
  }
  km = round(km, 3);
  // LTFRB formula: base_fare + max(0, dist_km - base_dist_km) * rate_per_km.
  return round(base_fare + Math.max(0, km - base_dist_km) * rate_per_km, 2);
}

/** Small deterministic binary min-heap on (cost, seq). Replaces the O(V) scan. */
class MinHeap {
  constructor() {
    this.h = [];
  }
  push(cost, seq, key) {
    this.h.push({ cost, seq, key, idx: this.h.length });
    this._up(this.h.length - 1);
  }
  pop() {
    if (!this.h.length) return null;
    const top = this.h[0];
    const last = this.h.pop();
    if (this.h.length) {
      this.h[0] = last;
      this._down(0);
    }
    return top;
  }
  get size() {
    return this.h.length;
  }
  _less(a, b) {
    return a.cost < b.cost || (a.cost === b.cost && a.seq < b.seq);
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._less(this.h[i], this.h[p])) {
        this._swap(i, p);
        i = p;
      } else break;
    }
  }
  _down(i) {
    const n = this.h.length;
    while (true) {
      let l = 2 * i + 1;
      let r = 2 * i + 2;
      let smallest = i;
      if (l < n && this._less(this.h[l], this.h[smallest])) smallest = l;
      if (r < n && this._less(this.h[r], this.h[smallest])) smallest = r;
      if (smallest !== i) {
        this._swap(i, smallest);
        i = smallest;
      } else break;
    }
  }
  _swap(a, b) {
    [this.h[a], this.h[b]] = [this.h[b], this.h[a]];
  }
}

/** Dijkstra between two stop ids within the route-expanded graph. */
function dijkstraSegment(
  graph,
  fromId,
  toId,
  banned,
  base_fare,
  base_dist_km,
  rate_per_km,
) {
  const { byStop, stopRide } = buildGraph(graph);
  const INF = Infinity;

  const dist = new Map(); // "stop|route|dir" -> cost
  const prev = new Map();
  const pq = new MinHeap();
  let seq = 0;

  // Prime all memberships of `from`.
  for (const m of byStop.get(fromId) || []) {
    const key = `${fromId}|${m.routeId}|${m.dirId}`;
    if (!dist.has(key)) {
      dist.set(key, BASE_ON_BOARD);
      pq.push(BASE_ON_BOARD, seq++, key);
    }
  }

  let steps = 0;
  while (pq.size) {
    const top = pq.pop();
    const cur = top.key;
    const cc = top.cost;
    if (cc > (dist.get(cur) ?? INF)) continue; // stale
    if (steps++ > 2_000_000) return null;
    const [cStop, cRoute, cDir] = cur.split("|");

    // Goal reached: first time we pop any membership of toId.
    if (cStop === toId) {
      const rec = reconstruct(graph, cur, prev);
      return {
        legs: rec.legs,
        distKm: rec.distKm,
        fare: soFarFare(rec, graph, base_fare, base_dist_km, rate_per_km),
      };
    }

    // Transfers: other memberships of the same stop on different routes/dirs.
    for (const m of byStop.get(cStop) || []) {
      if (m.routeId === cRoute && m.dirId === cDir) continue;
      const nk = `${cStop}|${m.routeId}|${m.dirId}`;
      const nc = cc + TRANSFER_COST;
      if (nc < (dist.get(nk) ?? INF)) {
        dist.set(nk, nc);
        prev.set(nk, cur);
        pq.push(nc, seq++, nk);
      }
    }

    // Ride: consecutive stops via incident ride edges on THIS direction.
    const incident = stopRide.get(cStop) || [];
    for (const e of incident) {
      const segKey = cStop < e.to ? `${cStop}|${e.to}` : `${e.to}|${cStop}`;
      if (banned.has(segKey)) continue;
      if (e.routeId !== cRoute || e.dirId !== cDir) continue;
      const nStop = e.to;
      const nk = `${nStop}|${e.routeId}|${e.dirId}`;
      const cost = cc + BASE_ON_BOARD + MARGINAL_PER_KM * e.km;
      if (cost < (dist.get(nk) ?? INF)) {
        dist.set(nk, cost);
        prev.set(nk, cur);
        pq.push(cost, seq++, nk);
      }
    }
  }
  return null;
}

function reconstruct(graph, endKey, prev) {
  const legs = [];
  let cur = endKey;
  let curLeg = null;
  let curRoute = null;
  let curDir = null;
  while (cur) {
    const [stop, route, dir] = cur.split("|");
    if (curRoute !== route || curDir !== dir) {
      if (curLeg) legs.unshift(curLeg);
      curLeg = { route_id: route, direction_id: dir, stop_ids: [stop] };
      curRoute = route;
      curDir = dir;
    } else {
      curLeg.stop_ids.unshift(stop);
    }
    cur = prev.get(cur);
  }
  if (curLeg) legs.unshift(curLeg);

  // Sum the route distance over consecutive stops of the reconstructed path.
  let distKm = 0;
  for (const leg of legs) {
    for (let i = 0; i + 1 < leg.stop_ids.length; i++) {
      const pa = graph.stops.find((s) => s.id === leg.stop_ids[i]);
      const pb = graph.stops.find((s) => s.id === leg.stop_ids[i + 1]);
      distKm += haversineKm(pa, pb);
    }
  }
  return { legs, distKm: round(distKm, 4) };
}

function soFarFare(rec, graph, base_fare, base_dist_km, rate_per_km) {
  // Per-segment fare uses the LTFRB formula on the leg's own distance
  // (deviation allowed only for the parity oracle reference).
  let km = 0;
  for (const leg of rec.legs) {
    for (let i = 0; i + 1 < leg.stop_ids.length; i++) {
      const pa = graph.stops.find((s) => s.id === leg.stop_ids[i]);
      const pb = graph.stops.find((s) => s.id === leg.stop_ids[i + 1]);
      km += haversineKm(pa, pb);
    }
  }
  km = round(km, 3);
  return round(base_fare + Math.max(0, km - base_dist_km) * rate_per_km, 2);
}

/** Nearest network stop within snapping tolerance (polyline_snapping output). */
function nearestStop(graph, point, toleranceKm = 0.05) {
  let best = null;
  let bd = Infinity;
  for (const s of graph.stops) {
    const d = haversineKm(point, s);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (best && bd <= toleranceKm) return best.id;
  return null;
}

module.exports = {
  haversineKm,
  round,
  buildGraph,
  computeRoute,
  nearestStop,
  BASE_ON_BOARD,
  MARGINAL_PER_KM,
  TRANSFER_COST,
};
