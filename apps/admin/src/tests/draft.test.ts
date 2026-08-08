import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoLineString } from "@komyuter/shared";
import {
  clearDraft,
  createDebouncedDraftWriter,
  draftKey,
  DRAFT_TTL_MS,
  isDraftExpired,
  loadDraft,
  saveDraft,
  type DraftPayload,
  type StorageLike,
} from "@/lib/draft";

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
  has(key: string): boolean {
    return this.map.has(key);
  }
}

const basePayload: Omit<DraftPayload, "savedAt"> = {
  routeId: "r1",
  directionId: "d1",
  stops: [
    { id: "a", name: "Stop 1", type: "major_stop", location: [122.5, 10.7] },
  ],
  polyline: {
    type: "LineString",
    coordinates: [
      [122.5, 10.7],
      [122.51, 10.71],
    ],
  } as GeoLineString,
  connections: [],
  history: { past: [], future: [] },
  routeMeta: null,
  pathStopIds: null,
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("draft key + TTL (FR-014)", () => {
  it("builds the localStorage key per route and direction", () => {
    expect(draftKey("r1", "d1")).toBe("komyuter.draft.r1.d1");
    expect(draftKey(null, null)).toBe("komyuter.draft.no-route.new");
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

describe("save/load round-trip (FR-014)", () => {
  it("persists and parses the full draft state", () => {
    saveDraft(basePayload, storage);
    const loaded = loadDraft("r1", "d1", storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.stops).toEqual(basePayload.stops);
    expect(loaded?.polyline).toEqual(basePayload.polyline);
    expect(loaded?.connections).toEqual(basePayload.connections);
    expect(loaded?.history).toEqual({ past: [], future: [] });
    expect(typeof loaded?.savedAt).toBe("number");
  });

  it("returns null when no draft exists", () => {
    expect(loadDraft("r1", "d1", storage)).toBeNull();
  });

  it("never restores an expired draft and removes the stale key", () => {
    storage.setItem(
      draftKey("r1", "d1"),
      JSON.stringify({
        ...basePayload,
        savedAt: Date.now() - (DRAFT_TTL_MS + 60_000),
      }),
    );
    expect(loadDraft("r1", "d1", storage)).toBeNull();
    expect(storage.has(draftKey("r1", "d1"))).toBe(false);
  });

  it("clearDraft removes only the target key", () => {
    saveDraft(basePayload, storage);
    saveDraft({ ...basePayload, directionId: "d2" }, storage);
    clearDraft("r1", "d1", storage);
    expect(storage.has(draftKey("r1", "d1"))).toBe(false);
    expect(storage.has(draftKey("r1", "d2"))).toBe(true);
  });
});

describe("debounced draft writer (FR-014)", () => {
  it("writes only the latest payload after the debounce delay", () => {
    vi.useFakeTimers();
    const writer = createDebouncedDraftWriter(storage, 500);
    writer.save(basePayload);
    writer.save({ ...basePayload, stops: [] });
    expect(storage.has(draftKey("r1", "d1"))).toBe(false);
    vi.advanceTimersByTime(499);
    expect(storage.has(draftKey("r1", "d1"))).toBe(false);
    vi.advanceTimersByTime(2);
    expect(storage.has(draftKey("r1", "d1"))).toBe(true);
    const loaded = loadDraft("r1", "d1", storage);
    expect(loaded?.stops).toEqual([]);
  });

  it("flush writes immediately without waiting", () => {
    vi.useFakeTimers();
    const writer = createDebouncedDraftWriter(storage, 500);
    writer.save(basePayload);
    writer.flush();
    expect(storage.has(draftKey("r1", "d1"))).toBe(true);
  });

  it("cancel drops a pending write", () => {
    vi.useFakeTimers();
    const writer = createDebouncedDraftWriter(storage, 500);
    writer.save(basePayload);
    writer.cancel();
    vi.advanceTimersByTime(600);
    expect(storage.has(draftKey("r1", "d1"))).toBe(false);
  });
});

describe("older draft shapes (normalization)", () => {
  it("loads a draft missing history/routeMeta with safe defaults", () => {
    // A draft written before those fields existed (e.g. mid-refactor).
    storage.setItem(
      draftKey("r1", "d1"),
      JSON.stringify({
        savedAt: Date.now(),
        routeId: "r1",
        directionId: "d1",
        stops: basePayload.stops,
        polyline: basePayload.polyline,
        connections: [],
      }),
    );
    const loaded = loadDraft("r1", "d1", storage);
    expect(loaded?.history).toEqual({ past: [], future: [] });
    expect(loaded?.routeMeta).toBeNull();
    expect(loaded?.connections).toEqual([]);
    expect(loaded?.stops).toEqual(basePayload.stops);
  });
});
