import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoLineString } from "@komyuter/shared";
import {
  clearDetourDraft,
  clearDraft,
  createDebouncedDraftWriter,
  detourDraftKey,
  draftIndexKey,
  draftKey,
  DRAFT_TTL_MS,
  isDraftExpired,
  legacyDraftKey,
  listDrafts,
  loadDetourDraft,
  loadDraft,
  saveDetourDraft,
  saveDraft,
  type DraftDraft,
  type DraftPayload,
  type StorageLike,
} from "@/lib/draft";

const USER = "user-1";
const OTHER = "user-2";

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  get length(): number {
    return this.map.size;
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
}

const polyline: GeoLineString = {
  type: "LineString",
  coordinates: [
    [122.5, 10.7],
    [122.51, 10.71],
  ],
};

const stop = {
  id: "a",
  name: "Stop 1",
  type: "major_stop" as const,
  location: [122.5, 10.7] as [number, number],
};

const basePayload: DraftDraft = {
  schemaVersion: 2,
  routeId: "r1",
  directionId: "d1",
  stops: [stop],
  polyline,
  connections: [],
  history: { past: [], future: [] },
  routeMeta: null,
  pathStopIds: null,
  base: {
    version: 3,
    stops: [stop],
    routeMeta: null,
    polyline,
  },
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("draft keys (FR-014, ADR-0020 §6)", () => {
  it("carries the Account, route and direction", () => {
    expect(draftKey(USER, "r1", "d1")).toBe("komyuter.draft.user-1.r1.d1");
    expect(draftKey(USER, null, null)).toBe(
      "komyuter.draft.user-1.no-route.new",
    );
    expect(draftIndexKey(USER)).toBe("komyuter.draft-index.user-1");
  });

  it("marks drafts older than 24h as expired", () => {
    const fresh = { ...basePayload, savedAt: Date.now() };
    const stale = {
      ...basePayload,
      savedAt: Date.now() - (DRAFT_TTL_MS + 1_000),
    };
    expect(isDraftExpired(fresh)).toBe(false);
    expect(isDraftExpired(stale)).toBe(true);
  });
});

describe("save/load round-trip", () => {
  it("persists the full state, including the base", () => {
    saveDraft(USER, basePayload, storage);
    const loaded = loadDraft(USER, "r1", "d1", storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.stops).toEqual(basePayload.stops);
    expect(loaded?.polyline).toEqual(basePayload.polyline);
    expect(loaded?.connections).toEqual(basePayload.connections);
    expect(loaded?.history).toEqual({ past: [], future: [] });
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.base?.version).toBe(3);
    expect(loaded?.base?.stops).toEqual(basePayload.stops);
    expect(typeof loaded?.savedAt).toBe("number");
  });

  it("keeps two Accounts' drafts apart", () => {
    saveDraft(USER, basePayload, storage);
    saveDraft(
      OTHER,
      { ...basePayload, stops: [{ ...stop, name: "Other's stop" }] },
      storage,
    );

    expect(loadDraft(USER, "r1", "d1", storage)?.stops[0].name).toBe("Stop 1");
    expect(loadDraft(OTHER, "r1", "d1", storage)?.stops[0].name).toBe(
      "Other's stop",
    );
    clearDraft(USER, "r1", "d1", storage);
    expect(loadDraft(OTHER, "r1", "d1", storage)).not.toBeNull();
  });

  it("returns null when no draft exists", () => {
    expect(loadDraft(USER, "r1", "d1", storage)).toBeNull();
  });

  it("never restores an expired draft and removes the stale key", () => {
    storage.setItem(
      draftKey(USER, "r1", "d1"),
      JSON.stringify({
        ...basePayload,
        savedAt: Date.now() - (DRAFT_TTL_MS + 60_000),
      }),
    );
    expect(loadDraft(USER, "r1", "d1", storage)).toBeNull();
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(false);
  });

  it("clearDraft removes only the target slot", () => {
    saveDraft(USER, basePayload, storage);
    saveDraft(USER, { ...basePayload, directionId: "d2" }, storage);
    clearDraft(USER, "r1", "d1", storage);
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(false);
    expect(storage.has(draftKey(USER, "r1", "d2"))).toBe(true);
  });
});

describe("the restore list (ADR-0020: the banner becomes a list)", () => {
  it("lists the Account's drafts, newest first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    saveDraft(USER, basePayload, storage);
    vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
    saveDraft(
      USER,
      {
        ...basePayload,
        routeId: "r2",
        directionId: "d3",
        routeMeta: {
          name: "Second Route",
          shortName: "SR",
          color: "#000000",
          isActive: true,
          fareConfigId: null,
        },
      },
      storage,
    );

    const entries = listDrafts(USER, storage);
    expect(entries.map((entry) => entry.routeId)).toEqual(["r2", "r1"]);
    expect(entries[0].label).toBe("Second Route");
  });

  it("drops an entry when its draft is cleared", () => {
    saveDraft(USER, basePayload, storage);
    clearDraft(USER, "r1", "d1", storage);
    expect(listDrafts(USER, storage)).toEqual([]);
  });

  it("rebuilds a lost index from the slots themselves", () => {
    saveDraft(USER, basePayload, storage);
    storage.removeItem(draftIndexKey(USER));

    const entries = listDrafts(USER, storage);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ routeId: "r1", directionId: "d1" });
    expect(storage.getItem(draftIndexKey(USER))).not.toBeNull();
  });
});

describe("legacy drafts (written before M2c)", () => {
  it("adopts an account-less draft once into this Account's slot", () => {
    storage.setItem(
      legacyDraftKey("r1", "d1"),
      JSON.stringify({
        savedAt: Date.now(),
        routeId: "r1",
        directionId: "d1",
        stops: basePayload.stops,
        polyline,
        connections: [],
        history: { past: [], future: [] },
      }),
    );

    const loaded = loadDraft(USER, "r1", "d1", storage);
    expect(loaded?.stops).toEqual(basePayload.stops);
    // A legacy draft has no base, so its conflict degrades to two-way.
    expect(loaded?.base).toBeNull();
    expect(storage.has(legacyDraftKey("r1", "d1"))).toBe(false);
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(true);
    // Another Account does not adopt it a second time.
    expect(loadDraft(OTHER, "r1", "d1", storage)).toBeNull();
  });
});

describe("debounced draft writer (FR-014)", () => {
  it("writes only the latest payload after the debounce delay", () => {
    vi.useFakeTimers();
    const writer = createDebouncedDraftWriter(USER, storage, 500);
    writer.save(basePayload);
    writer.save({ ...basePayload, stops: [] });
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(false);
    vi.advanceTimersByTime(499);
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(false);
    vi.advanceTimersByTime(2);
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(true);
    expect(loadDraft(USER, "r1", "d1", storage)?.stops).toEqual([]);
  });

  it("flush writes immediately without waiting", () => {
    vi.useFakeTimers();
    const writer = createDebouncedDraftWriter(USER, storage, 500);
    writer.save(basePayload);
    writer.flush();
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(true);
  });

  it("cancel drops a pending write", () => {
    vi.useFakeTimers();
    const writer = createDebouncedDraftWriter(USER, storage, 500);
    writer.save(basePayload);
    writer.cancel();
    vi.advanceTimersByTime(600);
    expect(storage.has(draftKey(USER, "r1", "d1"))).toBe(false);
  });
});

describe("older draft shapes (normalization)", () => {
  it("loads a draft missing history/routeMeta/base with safe defaults", () => {
    storage.setItem(
      draftKey(USER, "r1", "d1"),
      JSON.stringify({
        savedAt: Date.now(),
        routeId: "r1",
        directionId: "d1",
        stops: basePayload.stops,
        polyline,
        connections: [],
      }),
    );
    const loaded = loadDraft(USER, "r1", "d1", storage);
    expect(loaded?.history).toEqual({ past: [], future: [] });
    expect(loaded?.routeMeta).toBeNull();
    expect(loaded?.connections).toEqual([]);
    expect(loaded?.stops).toEqual(basePayload.stops);
    expect(loaded?.base).toBeNull();
  });
});

describe("detour drafts (US4)", () => {
  it("keeps each Account's detour draft apart", () => {
    saveDetourDraft(USER, "d1", { label: "Mine" }, storage);
    saveDetourDraft(OTHER, "d1", { label: "Theirs" }, storage);

    expect(detourDraftKey(USER, "d1")).toBe("komyuter.detour-draft.user-1.d1");
    expect(loadDetourDraft<{ label: string }>(USER, "d1", storage)).toEqual({
      label: "Mine",
    });
    clearDetourDraft(USER, "d1", storage);
    expect(loadDetourDraft(USER, "d1", storage)).toBeNull();
    expect(loadDetourDraft<{ label: string }>(OTHER, "d1", storage)).toEqual({
      label: "Theirs",
    });
  });
});

describe("types", () => {
  it("keeps DraftPayload's base optional at runtime for legacy payloads", () => {
    const legacy = { ...basePayload, base: null } as DraftPayload;
    expect(legacy.base).toBeNull();
  });
});
