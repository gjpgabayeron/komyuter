import { describe, expect, it } from "vitest";
import type { OverviewRouteEntity } from "@komyuter/shared";
import {
  clearOverviewCache,
  OVERVIEW_CACHE_KEY,
  OVERVIEW_CACHE_TTL_MS,
  readOverviewCache,
  writeOverviewCache,
  type StorageLike,
} from "@/lib/overviewCache";

/** Minimal in-memory storage fake. */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const route = (id: string): OverviewRouteEntity => ({
  route_id: id,
  name: `Route ${id}`,
  color: "#1B6DB2",
  is_active: true,
  base_polyline: {
    type: "LineString",
    coordinates: [
      [122.5, 10.6],
      [122.51, 10.61],
    ],
  },
  return_polyline: null,
  stops: [
    {
      stop_id: "s1",
      name: "Stop 1",
      type: "major_stop",
      location: { type: "Point", coordinates: [122.5, 10.6] },
    },
  ],
});

describe("overviewCache", () => {
  it("round-trips a payload through write → read", () => {
    const storage = fakeStorage();
    const routes = [route("r1"), route("r2")];
    writeOverviewCache(routes, storage);
    expect(readOverviewCache(storage)).toEqual(routes);
  });

  it("returns null when nothing is stored", () => {
    expect(readOverviewCache(fakeStorage())).toBeNull();
  });

  it("returns null after the TTL expires", () => {
    const storage = fakeStorage();
    writeOverviewCache([route("r1")], storage);
    const savedAt = Date.now();
    // Rewrite with a known timestamp so expiry is deterministic.
    storage.setItem(
      OVERVIEW_CACHE_KEY,
      JSON.stringify({ savedAt, routes: [route("r1")] }),
    );
    expect(
      readOverviewCache(storage, savedAt + OVERVIEW_CACHE_TTL_MS - 1),
    ).toHaveLength(1);
    expect(
      readOverviewCache(storage, savedAt + OVERVIEW_CACHE_TTL_MS + 1),
    ).toBeNull();
  });

  it("falls back to null for corrupt JSON", () => {
    const storage = fakeStorage({ [OVERVIEW_CACHE_KEY]: "{not json!!" });
    expect(readOverviewCache(storage)).toBeNull();
  });

  it("falls back to null for a malformed shape (routes not an array)", () => {
    const storage = fakeStorage({
      [OVERVIEW_CACHE_KEY]: JSON.stringify({
        savedAt: Date.now(),
        routes: "nope",
      }),
    });
    expect(readOverviewCache(storage)).toBeNull();
  });

  it("drops the key when writing an empty payload", () => {
    const storage = fakeStorage();
    writeOverviewCache([route("r1")], storage);
    writeOverviewCache([], storage);
    expect(storage.getItem(OVERVIEW_CACHE_KEY)).toBeNull();
  });

  it("swallows storage failures (quota/disabled) instead of throwing", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(() => writeOverviewCache([route("r1")], storage)).not.toThrow();
  });

  it("clearOverviewCache removes the key", () => {
    const storage = fakeStorage();
    writeOverviewCache([route("r1")], storage);
    clearOverviewCache(storage);
    expect(storage.getItem(OVERVIEW_CACHE_KEY)).toBeNull();
  });
});
