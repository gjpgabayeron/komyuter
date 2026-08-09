import { describe, expect, it } from "vitest";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import {
  connectionsFromStops,
  edgeId,
  hasEdge,
  pathFromConnections,
  removeEdge,
  setStopLink,
  type Connection,
} from "@/lib/connections";
import type { DraftStop } from "@/lib/plottingStore";

const stop = (id: string, location: CoordinatePair): DraftStop => ({
  id,
  name: id,
  type: "major_stop",
  location,
});

/** Builds the consecutive-pair edges of a stop chain (replaces the removed
 *  manual linkStops helper in tests). */
const chain = (...ids: string[]): Connection[] => {
  const edges: Connection[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({
      id: edgeId(ids[i], ids[i + 1]),
      from: ids[i],
      to: ids[i + 1],
    });
  }
  return edges;
};

describe("removeEdge", () => {
  it("removeEdge removes either direction", () => {
    expect(removeEdge([{ id: "x", from: "b", to: "a" }], "a", "b")).toEqual([]);
  });
});

describe("setStopLink (forced connection dropdowns)", () => {
  it("sets the predecessor ('connected from') for a chain end", () => {
    const ab = chain("a", "b");
    const next = setStopLink(ab, "b", "from", "c", "a", null);
    expect(hasEdge(next, "a", "b")).toBe(false);
    expect(hasEdge(next, "c", "b")).toBe(true);
  });

  it("clears the predecessor when set to null", () => {
    const ab = chain("a", "b");
    expect(setStopLink(ab, "b", "from", null, "a", null)).toEqual([]);
  });

  it("is a no-op when the value is unchanged", () => {
    const ab = chain("a", "b");
    expect(setStopLink(ab, "b", "from", "a", "a", null)).toEqual(ab);
  });

  it("reverses the connection when set to its own successor", () => {
    const ab = chain("a", "b", "c");
    const next = setStopLink(ab, "b", "from", "c", "a", "c");
    // the old predecessor edge drops; the c—b edge survives (now b's "from")
    expect(hasEdge(next, "a", "b")).toBe(false);
    expect(hasEdge(next, "c", "b")).toBe(true);
    // path now runs b—c, with a stranded off-path (walk starts at the
    // earlier-placed end stop)
    expect(
      pathFromConnections(next, [
        { id: "a", location: [122.5, 10.6] },
        { id: "b", location: [122.51, 10.61] },
        { id: "c", location: [122.52, 10.62] },
      ]).stopIds,
    ).toEqual(["b", "c"]);
  });

  it("closes the loop when wiring an end stop's 'to' onto the other end", () => {
    // chain a—b—c; wire c's 'to' to a — both are degree-1 ends → loop closes
    const abc = chain("a", "b", "c");
    const next = setStopLink(abc, "c", "to", "a", "b", null);
    expect(hasEdge(next, "a", "c")).toBe(true);
    expect(hasEdge(next, "a", "b")).toBe(true);
    expect(hasEdge(next, "b", "c")).toBe(true);
    expect(
      pathFromConnections(next, [
        { id: "a", location: [122.5, 10.6] },
        { id: "b", location: [122.51, 10.61] },
        { id: "c", location: [122.52, 10.62] },
      ]).closed,
    ).toBe(true);
  });

  it("never closes a cycle when wiring an interior stop across the chain", () => {
    // chain a—b—c—d; wire c's 'to' to a
    const abcd = chain("a", "b", "c", "d");
    const next = setStopLink(abcd, "c", "to", "a", "b", "d");
    expect(hasEdge(next, "c", "d")).toBe(false);
    expect(hasEdge(next, "c", "a")).toBe(true);
    expect(hasEdge(next, "a", "b")).toBe(true);
    for (const id of ["a", "b", "c", "d"]) {
      expect(
        next.filter((e) => e.from === id || e.to === id).length,
      ).toBeLessThanOrEqual(2);
    }
  });
});

describe("pathFromConnections", () => {
  it("returns an empty path with no connections", () => {
    const stops = [stop("a", [122.5, 10.6]), stop("b", [122.52, 10.62])];
    expect(pathFromConnections([], stops)).toEqual({
      stopIds: [],
      polyline: null,
      closed: false,
    });
  });

  it("walks a single chain in order and builds the straight polyline", () => {
    const stops = [
      stop("a", [122.5, 10.6]),
      stop("b", [122.51, 10.61]),
      stop("c", [122.52, 10.62]),
    ];
    const connections = chain("a", "b", "c");
    const path = pathFromConnections(connections, stops);
    expect(path.stopIds).toEqual(["a", "b", "c"]);
    expect(path.closed).toBe(false);
    expect(path.polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ]);
  });

  it("reports a closed loop and closes the polyline back on the start", () => {
    const stops = [
      stop("a", [122.5, 10.6]),
      stop("b", [122.51, 10.61]),
      stop("c", [122.52, 10.62]),
    ];
    // close a—b—c back onto a (FR-004)
    const connections = chain("a", "b", "c", "a");
    const path = pathFromConnections(connections, stops);
    expect(path.closed).toBe(true);
    expect(path.stopIds).toEqual(["a", "b", "c"]);
    expect(path.polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
      [122.5, 10.6],
    ]);
  });

  it("picks the longest component as the main path", () => {
    const stops = [
      stop("a", [122.5, 10.6]),
      stop("b", [122.51, 10.61]),
      stop("c", [122.52, 10.62]),
      stop("d", [122.53, 10.63]),
      stop("e", [122.54, 10.64]),
      stop("f", [122.55, 10.65]),
    ];
    const main = chain("a", "b", "c", "d");
    const side = chain("e", "f");
    const path = pathFromConnections([...main, ...side], stops);
    expect(path.stopIds).toEqual(["a", "b", "c", "d"]);
  });

  it("breaks length ties by earliest placement order", () => {
    const stops = [
      stop("a", [122.5, 10.6]),
      stop("b", [122.51, 10.61]),
      stop("c", [122.52, 10.62]),
      stop("d", [122.53, 10.63]),
    ];
    const path = pathFromConnections(
      [...chain("a", "b"), ...chain("c", "d")],
      stops,
    );
    expect(path.stopIds).toEqual(["a", "b"]);
  });
});

describe("connectionsFromStops", () => {
  it("builds consecutive-pair edges from an ordered stop list", () => {
    const stops = [
      stop("a", [122.5, 10.6]),
      stop("b", [122.51, 10.61]),
      stop("c", [122.52, 10.62]),
    ];
    const connections = connectionsFromStops(stops);
    expect(connections).toEqual([
      { id: edgeId("a", "b"), from: "a", to: "b" },
      { id: edgeId("b", "c"), from: "b", to: "c" },
    ]);
  });

  it("returns no edges for fewer than two stops", () => {
    expect(connectionsFromStops([stop("a", [122.5, 10.6])])).toEqual([]);
  });

  it("closes the chain when the given polyline ends on the first stop", () => {
    const stops = [
      stop("a", [122.5, 10.6]),
      stop("b", [122.51, 10.61]),
      stop("c", [122.52, 10.62]),
    ];
    const loopPolyline: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
        [122.52, 10.62],
        [122.5, 10.6],
      ],
    };
    const connections = connectionsFromStops(stops, loopPolyline);
    expect(connections).toEqual([
      { id: edgeId("a", "b"), from: "a", to: "b" },
      { id: edgeId("b", "c"), from: "b", to: "c" },
      { id: edgeId("c", "a"), from: "c", to: "a" },
    ]);
    expect(pathFromConnections(connections, stops).closed).toBe(true);
  });

  it("keeps the chain open when the polyline ends elsewhere", () => {
    const stops = [
      stop("a", [122.5, 10.6]),
      stop("b", [122.51, 10.61]),
      stop("c", [122.52, 10.62]),
    ];
    const openPolyline: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
        [122.52, 10.62],
      ],
    };
    expect(connectionsFromStops(stops, openPolyline)).toHaveLength(2);
  });
});

describe("rewire trace (closed loop 1..10, set stop4.to = stop7)", () => {
  const ids = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"];
  const edge = (from: number, to: number) => ({
    id: edgeId(ids[from - 1], ids[to - 1]),
    from: ids[from - 1],
    to: ids[to - 1],
  });

  it("keeps 3→4 and 7's old incoming is replaced, producing [1,2,3,4,7,8,9,10]", () => {
    const next = [
      edge(1, 2),
      edge(2, 3),
      edge(3, 4),
      edge(4, 5),
      edge(5, 6),
      edge(6, 7),
      edge(7, 8),
      edge(8, 9),
      edge(9, 10),
      edge(10, 1),
    ];
    const result = setStopLink(next, ids[3], "to", ids[6], ids[2], ids[4]);
    const key = (c: { from: string; to: string }) =>
      `${c.from.slice(-2)}->${c.to.slice(-2)}`;
    expect(result.map(key)).toContain("s3->s4"); // 3→4 KEPT
    expect(result.map(key)).not.toContain("s6->s7"); // 7's old incoming gone
    expect(result.map(key)).toContain("s4->s7"); // forced edge
    expect(result.map(key)).not.toContain("s4->s5");
  });
});

describe("connectionsFromStops loop closure tolerance (unified 150 m)", () => {
  const stops = [
    { id: "a", location: [122.5, 10.6] as [number, number] },
    { id: "b", location: [122.51, 10.61] as [number, number] },
    { id: "c", location: [122.52, 10.62] as [number, number] },
  ];
  it("closes the chain when the polyline ends ~120 m from the first stop", () => {
    // 0.001 deg lat ~= 111 m; ~120 m from [122.5, 10.6] is ~0.00108 deg.
    const polyline: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
        [122.5, 10.60108],
      ],
    };
    const conns = connectionsFromStops(stops, polyline);
    expect(conns).toHaveLength(3); // a->b, b->c, c->a (closed)
    expect(conns[2]).toMatchObject({ from: "c", to: "a" });
  });
});

describe("None clears only the affected connection (strict spec)", () => {
  const ids = ["s1", "s2", "s3", "s4"];
  const edge = (from: number, to: number) => ({
    id: edgeId(ids[from - 1], ids[to - 1]),
    from: ids[from - 1],
    to: ids[to - 1],
  });
  const key = (c: { from: string; to: string }) => `${c.from}->${c.to}`;

  it("removing the loop-closure C→A leaves [A,B]+[B,C] — the user's exact case", () => {
    const conns = [edge(1, 2), edge(2, 3), edge(3, 1)];
    const result = setStopLink(conns, ids[2], "to", null, ids[1], ids[0]);
    // C is now the route's end: the closure edge is gone, A→B and B→C
    // are completely untouched (linear A→B→C, nothing reconnected).
    expect(result.map(key)).toEqual(["s1->s2", "s2->s3"]);
  });

  it("an interior stop's to=None removes ONLY that side's edge (chain splits)", () => {
    const conns = [edge(1, 2), edge(2, 3), edge(3, 4)];
    const result = setStopLink(conns, ids[1], "to", null, ids[0], ids[2]);
    expect(result.map(key)).toEqual(["s1->s2", "s3->s4"]);
  });

  it("an interior stop's from=None removes ONLY that side's edge", () => {
    const conns = [edge(1, 2), edge(2, 3), edge(3, 4)];
    const result = setStopLink(conns, ids[1], "from", null, ids[0], ids[2]);
    expect(result.map(key)).toEqual(["s2->s3", "s3->s4"]);
  });

  it("disconnecting from a 2-cycle removes both orientations (no self-loop)", () => {
    const conns = [edge(1, 2), edge(2, 1)];
    const result = setStopLink(conns, ids[1], "to", null, ids[0], ids[0]);
    expect(result.map(key)).toEqual([]);
  });

  it("the FIRST stop's to=None removes the first edge", () => {
    const conns = [edge(1, 2), edge(2, 3)];
    const result = setStopLink(conns, ids[0], "to", null, null, ids[1]);
    expect(result.map(key)).toEqual(["s2->s3"]);
  });
});
