import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import { polylineClosesOn } from "./coords";

/**
 * Stop-chain helpers for the plotting draft. Single-mode (auto) plotting
 * keeps the chain as consecutive stop pairs in placement order; these helpers
 * derive path order, loop closure (FR-004: when the last stop connects back to
 * the first, the derived polyline ends on the start stop), and the forced
 * from/to rewiring used by the stop property dropdowns.
 */

export interface Connection {
  id: string;
  from: string;
  to: string;
}

/** Stops only need `id` + `location` here (no import cycle with the store). */
interface StopLike {
  id: string;
  location: CoordinatePair;
}

export function edgeId(from: string, to: string): string {
  return `${from}--${to}`;
}

export function hasEdge(
  connections: readonly Connection[],
  a: string,
  b: string,
): boolean {
  return connections.some(
    (c) => (c.from === a && c.to === b) || (c.from === b && c.to === a),
  );
}

export function removeEdge(
  connections: readonly Connection[],
  a: string,
  b: string,
): Connection[] {
  return connections.filter(
    (c) => !((c.from === a && c.to === b) || (c.from === b && c.to === a)),
  );
}

function degreeAt(connections: readonly Connection[], stopId: string): number {
  return connections.filter((c) => c.from === stopId || c.to === stopId).length;
}

function removeFirstEdgeAt(
  connections: readonly Connection[],
  stopId: string,
): Connection[] {
  const index = connections.findIndex(
    (c) => c.from === stopId || c.to === stopId,
  );
  if (index === -1) return [...connections];
  return [...connections.slice(0, index), ...connections.slice(index + 1)];
}

function adjacency(
  connections: readonly Connection[],
): Map<string, { next: string; edge: Connection }[]> {
  const adj = new Map<string, { next: string; edge: Connection }[]>();
  for (const edge of connections) {
    const a = adj.get(edge.from) ?? [];
    a.push({ next: edge.to, edge });
    adj.set(edge.from, a);
    const b = adj.get(edge.to) ?? [];
    b.push({ next: edge.from, edge });
    adj.set(edge.to, b);
  }
  return adj;
}

/** True when `a` and `b` sit in the same connected component. */
function sameComponent(
  connections: readonly Connection[],
  a: string,
  b: string,
): boolean {
  if (a === b) return true;
  const adj = adjacency(connections);
  const visited = new Set<string>([a]);
  const queue = [a];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const { next } of adj.get(current) ?? []) {
      if (visited.has(next)) continue;
      if (next === b) return true;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

/** First edge on the unique chain path from `from` to `to` (adjacent to `from`). */
function firstEdgeOnPath(
  connections: readonly Connection[],
  from: string,
  to: string,
): Connection | null {
  if (from === to) return null;
  const adj = adjacency(connections);
  const visited = new Set<string>([from]);
  const queue = [from];
  const parent = new Map<string, { prev: string; edge: Connection }>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) break;
    for (const { next, edge } of adj.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, { prev: current, edge });
      queue.push(next);
    }
  }
  if (!parent.has(to)) return null;
  let node = to;
  while (parent.get(node)?.prev !== from) {
    const step = parent.get(node);
    if (!step) return null;
    node = step.prev;
  }
  return parent.get(node)!.edge;
}

export function connectionsFromStops(
  stops: readonly { id: string; location?: CoordinatePair }[],
  polyline?: GeoLineString | null,
): Connection[] {
  const result: Connection[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = stops[i].id;
    const to = stops[i + 1].id;
    result.push({ id: edgeId(from, to), from, to });
  }
  const firstLocation = stops[0]?.location;
  if (
    polyline &&
    firstLocation &&
    stops.length >= 3 &&
    polylineClosesOn(polyline, firstLocation)
  ) {
    const from = stops[stops.length - 1].id;
    const to = stops[0].id;
    result.push({ id: edgeId(from, to), from, to });
  }
  return result;
}

export interface ChainPath {
  /** Main-path stop ids, in route order. */
  stopIds: string[];
  /** Straight polyline through the main-path stops (null when < 2). */
  polyline: GeoLineString | null;
  /** True when the main path is a closed loop (FR-004): the last stop links
   *  back to the first, so the polyline ends on the start stop. */
  closed: boolean;
}

/**
 * Forces a stop's connection on one side ("from" = predecessor, "to" =
 * successor) — used by the stop property dropdowns. NOT a toggle: the previous
 * edge on that side is always replaced by the requested one (or removed when
 * `otherId` is null). Chain invariants (degree ≤ 2, no cycles) are preserved.
 *
 * `currentFrom`/`currentTo` are the stop's current chain neighbours (from
 * `pathFromConnections`) — edge orientation is click-order dependent, so the
 * caller passes the canonical neighbours rather than relying on stored
 * from/to direction.
 */
export function setStopLink(
  connections: readonly Connection[],
  stopId: string,
  side: "from" | "to",
  otherId: string | null,
  currentFrom: string | null,
  currentTo: string | null,
): Connection[] {
  if (otherId === stopId) return [...connections];
  const current = side === "from" ? currentFrom : currentTo;
  if (otherId === current) return [...connections]; // no change

  let next = [...connections];
  // 1. Drop the existing edge on this side (either stored orientation).
  if (current) next = removeEdgeBetween(next, stopId, current);
  // 2. Clearing the side is done.
  if (otherId === null) return next;
  // 3. Drop any existing edge to the target (e.g. the other side's neighbour).
  next = removeEdgeBetween(next, stopId, otherId);
  // 4. Never close a sub-cycle: break the edge adjacent to the stop on the
  //    path toward the target first. Linking the two ENDS of the same chain
  //    (both degree 1) instead closes the whole chain into a loop (FR-004).
  if (sameComponent(next, stopId, otherId)) {
    const closesMainChain =
      degreeAt(next, stopId) === 1 && degreeAt(next, otherId) === 1;
    if (!closesMainChain) {
      const edge = firstEdgeOnPath(next, stopId, otherId);
      if (edge) next = next.filter((c) => c.id !== edge.id);
    }
  }
  // 5. Keep every stop at degree ≤ 2.
  if (degreeAt(next, stopId) >= 2) next = removeFirstEdgeAt(next, stopId);
  if (degreeAt(next, otherId) >= 2) next = removeFirstEdgeAt(next, otherId);
  // 6. Add the forced edge with the requested orientation.
  return [
    ...next,
    side === "from"
      ? { id: edgeId(otherId, stopId), from: otherId, to: stopId }
      : { id: edgeId(stopId, otherId), from: stopId, to: otherId },
  ];
}

function removeEdgeBetween(
  connections: readonly Connection[],
  a: string,
  b: string,
): Connection[] {
  return connections.filter(
    (c) => !((c.from === a && c.to === b) || (c.from === b && c.to === a)),
  );
}

/** Ordered stop-id chains for every component with ≥ 2 stops (isolated stops
 *  are not paths and are excluded). A component is either an open chain or a
 *  closed loop (FR-004); `closed` reports the latter. */
function chainComponents(
  connections: readonly Connection[],
  stops: readonly StopLike[],
): { order: string[]; closed: boolean }[] {
  const adj = adjacency(connections);
  const visited = new Set<string>();
  const components: { order: string[]; closed: boolean }[] = [];
  for (const stop of stops) {
    if (visited.has(stop.id) || !adj.has(stop.id)) continue;
    // BFS collect the component.
    const component: string[] = [];
    const queue = [stop.id];
    visited.add(stop.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const { next } of adj.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    if (component.length < 2) continue;
    // Walk from an end (degree-1 stop) for a deterministic route order; a
    // closed loop has no end, so start from its first-placed stop.
    const start =
      component.find((id) => (adj.get(id)?.length ?? 0) === 1) ?? component[0];
    const order: string[] = [];
    let previous: string | null = null;
    let current: string | null = start;
    while (current) {
      order.push(current);
      const links = adj.get(current) ?? [];
      const neighbors: string[] = links
        .map((n) => n.next)
        .filter((n) => n !== previous);
      previous = current;
      // Prefer unvisited neighbours; for a closed loop the only remaining
      // neighbour is the start stop — stop there instead of re-walking it.
      const unvisited = neighbors.filter((n) => !order.includes(n));
      current = unvisited[0] ?? null;
    }
    const closed =
      order.length >= 3 &&
      order.length === component.length &&
      (adj.get(order[order.length - 1]) ?? []).some((n) => n.next === order[0]);
    components.push({ order, closed });
  }
  return components;
}

/**
 * The route path of the chain: the MAIN component (longest; ties keep earliest
 * placement order) with its stops in route order. `polyline` is the straight
 * line through those stops — closed loops (FR-004) re-append the start stop so
 * the line closes back on itself.
 */
export function pathFromConnections(
  connections: readonly Connection[],
  stops: readonly StopLike[],
): ChainPath {
  const main = [...chainComponents(connections, stops)].sort(
    (a, b) => b.order.length - a.order.length,
  )[0] ?? { order: [], closed: false };
  let polyline: GeoLineString | null = null;
  if (main.order.length >= 2) {
    const coordinates = main.order.map((id) => {
      const stop = stops.find((s) => s.id === id)!;
      return stop.location;
    });
    if (main.closed) coordinates.push(coordinates[0]);
    polyline = { type: "LineString", coordinates };
  }
  return { stopIds: main.order, polyline, closed: main.closed };
}
