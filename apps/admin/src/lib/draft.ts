import type { GeoLineString } from "@komyuter/shared";
import type { Connection } from "./connections";
import type { DraftStop, RouteMetaDraft } from "./plottingStore";
import type { HistoryStack } from "./plottingHistory";

/**
 * Client-local draft persistence (FR-014).
 *
 * Unsaved plotting work is written to localStorage under
 * `komyuter.draft.{routeId}.{directionId}` with a 24 h TTL and debounced
 * ~500 ms writes. The draft is NEVER sent to the server — it exists so an
 * admin who navigates away (or closes the tab) can pick the route back up
 * exactly where they left it, including the undo/redo history.
 *
 * Storage is injectable so the module is unit-testable in Node (no
 * localStorage); the app uses the browser's localStorage by default.
 */

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_KEY_PREFIX = "komyuter.draft";
const DEBOUNCE_MS = 500;

export interface DraftPayload {
  savedAt: number;
  routeId: string | null;
  directionId: string | null;
  stops: DraftStop[];
  polyline: GeoLineString | null;
  connections: Connection[];
  history: HistoryStack;
  routeMeta: RouteMetaDraft | null;
  /** Ordered stop ids the saved polyline was derived for. */
  pathStopIds: string[] | null;
}

export type DraftDraft = Omit<DraftPayload, "savedAt">;

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

/** `komyuter.draft.{routeId}.{directionId}` — a null direction means a
 *  not-yet-saved route (drafts for new directions use "new"). */
export function draftKey(
  routeId: string | null,
  directionId: string | null,
): string {
  return `${DRAFT_KEY_PREFIX}.${routeId ?? "no-route"}.${directionId ?? "new"}`;
}

export function isDraftExpired(
  payload: DraftPayload,
  now = Date.now(),
): boolean {
  return now - payload.savedAt > DRAFT_TTL_MS;
}

/** Persists the draft (timestamped now). Returns the key written, or null if
 *  the payload is empty (nothing to recover). */
export function saveDraft(
  payload: DraftDraft,
  storage: StorageLike = defaultStorage(),
): string | null {
  if (payload.stops.length === 0 && !payload.polyline) return null;
  const key = draftKey(payload.routeId, payload.directionId);
  storage.setItem(key, JSON.stringify({ ...payload, savedAt: Date.now() }));
  return key;
}

/** Loads a draft for the route/direction, honouring the 24 h TTL. An expired
 *  draft is removed and never returned, so nothing stale is ever silently
 *  restored (FR-014). Returns null when absent or expired. */
export function loadDraft(
  routeId: string | null,
  directionId: string | null,
  storage: StorageLike = defaultStorage(),
  now = Date.now(),
): DraftPayload | null {
  const key = draftKey(routeId, directionId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DraftPayload>;
    // Normalize older draft shapes (missing fields) so restore never crashes
    // on undefined history/connections/routeMeta.
    const payload: DraftPayload = {
      savedAt: parsed.savedAt ?? now,
      routeId: parsed.routeId ?? routeId,
      directionId: parsed.directionId ?? directionId,
      stops: parsed.stops ?? [],
      polyline: parsed.polyline ?? null,
      connections: parsed.connections ?? [],
      history: parsed.history ?? { past: [], future: [] },
      routeMeta: parsed.routeMeta ?? null,
      pathStopIds: parsed.pathStopIds ?? null,
    };
    if (isDraftExpired(payload, now)) {
      storage.removeItem(key);
      return null;
    }
    return payload;
  } catch {
    // Corrupt JSON — treat as absent and drop it.
    storage.removeItem(key);
    return null;
  }
}

export function clearDraft(
  routeId: string | null,
  directionId: string | null,
  storage: StorageLike = defaultStorage(),
): void {
  storage.removeItem(draftKey(routeId, directionId));
}

/**
 * Detour draft persistence (US4) — the same 24 h TTL + injectable storage as
 * the plotting draft, but keyed per direction under its own prefix, because a
 * detour composition is a separate mini-draft from the base-route draft. The
 * payload is whatever the detour store serializes (DetourDraftSnapshot); the
 * storage layer stays generic.
 */
export const DETOUR_DRAFT_KEY_PREFIX = "komyuter.detour-draft";

export function detourDraftKey(directionId: string): string {
  return `${DETOUR_DRAFT_KEY_PREFIX}.${directionId}`;
}

export function saveDetourDraft<T>(
  directionId: string,
  payload: T,
  storage: StorageLike = defaultStorage(),
): void {
  storage.setItem(
    detourDraftKey(directionId),
    JSON.stringify({ savedAt: Date.now(), directionId, detour: payload }),
  );
}

/** Loads the direction's detour draft honouring the 24 h TTL; expired or
 *  corrupt drafts are dropped and never surfaced (same contract as the
 *  plotting draft, FR-014). Returns null when absent. */
export function loadDetourDraft<T>(
  directionId: string,
  storage: StorageLike = defaultStorage(),
  now = Date.now(),
): T | null {
  const key = detourDraftKey(directionId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      savedAt: number;
      detour: T;
    };
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed.detour;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function clearDetourDraft(
  directionId: string,
  storage: StorageLike = defaultStorage(),
): void {
  storage.removeItem(detourDraftKey(directionId));
}

/**
 * Debounced draft writer (FR-014: ~500 ms writes). `save` coalesces rapid
 * edits into the latest payload; `flush` writes immediately (before unload /
 * save); `cancel` drops a pending write.
 */
export function createDebouncedDraftWriter(
  storage: StorageLike = defaultStorage(),
  delayMs = DEBOUNCE_MS,
): {
  save: (payload: DraftDraft) => void;
  flush: () => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: DraftDraft | null = null;
  return {
    save(payload) {
      pending = payload;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (pending) {
          saveDraft(pending, storage);
          pending = null;
        }
      }, delayMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pending) {
        saveDraft(pending, storage);
        pending = null;
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
