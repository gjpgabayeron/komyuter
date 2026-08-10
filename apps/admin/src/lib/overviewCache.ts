import type { OverviewRouteEntity } from "@komyuter/shared";

/**
 * Client-local overview cache (smooth-rendering work).
 *
 * The overview's full geometry (every route's base/return polylines + lean
 * stops) is mirrored to localStorage so a warm reload renders the polylines
 * IMMEDIATELY alongside the map — no blank state while
 * `GET /api/admin/routes/overview` refetches. The in-memory react-query
 * cache only lives for the tab session; this mirror is what makes a reload
 * instant. The refetch then replaces the geometry and fades in (Phase 1),
 * so staleness is transient and self-correcting.
 *
 * Storage is injectable so the module is unit-testable in Node (no
 * localStorage); the app uses the browser's localStorage by default. Mirrors
 * the lib/draft.ts pattern (same TTL, same corrupt-data fallback).
 */

export const OVERVIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const OVERVIEW_CACHE_KEY = "komyuter.overview-cache";

/** Minimal storage surface (localStorage in the browser, fake in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const noopStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function defaultStorage(): StorageLike {
  return typeof localStorage !== "undefined" ? localStorage : noopStorage;
}

export interface OverviewCachePayload {
  savedAt: number;
  routes: OverviewRouteEntity[];
}

export function isOverviewCacheExpired(
  payload: OverviewCachePayload,
  now = Date.now(),
): boolean {
  return now - payload.savedAt > OVERVIEW_CACHE_TTL_MS;
}

/** Reads the cached overview payload, or null when absent/expired/corrupt. */
export function readOverviewCache(
  storage: StorageLike = defaultStorage(),
  now = Date.now(),
): OverviewRouteEntity[] | null {
  const raw = storage.getItem(OVERVIEW_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OverviewCachePayload;
    if (!Array.isArray(parsed.routes) || typeof parsed.savedAt !== "number") {
      return null;
    }
    if (isOverviewCacheExpired(parsed, now)) return null;
    return parsed.routes;
  } catch {
    // Corrupt JSON (partial write / manual tampering) — treat as empty.
    return null;
  }
}

/** Writes the cached overview payload, timestamped now. */
export function writeOverviewCache(
  routes: OverviewRouteEntity[],
  storage: StorageLike = defaultStorage(),
): void {
  if (routes.length === 0) {
    storage.removeItem(OVERVIEW_CACHE_KEY);
    return;
  }
  try {
    storage.setItem(
      OVERVIEW_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), routes }),
    );
  } catch {
    // Quota exceeded / storage disabled — the cache is an optimization only.
  }
}

/** Drops the cached overview payload (e.g. when the overview is empty). */
export function clearOverviewCache(
  storage: StorageLike = defaultStorage(),
): void {
  storage.removeItem(OVERVIEW_CACHE_KEY);
}
