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
