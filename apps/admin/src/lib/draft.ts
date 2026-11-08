import type { GeoLineString } from "@komyuter/shared";
import type { Connection } from "./connections";
import type { DraftStop, RouteMetaDraft } from "./plottingStore";
import type { HistoryStack } from "./plottingHistory";

/**
 * Client-local draft persistence (FR-014, ADR-0020 §6, ADR-0031).
 *
 * Unsaved plotting work is written under
 * `komyuter.draft.{userId}.{routeId}.{directionId}` with a 24 h TTL and
 * debounced ~500 ms writes. The draft is NEVER sent to the server — it exists
 * so an Account who navigates away (or closes the tab) can pick the route back
 * up exactly where it was left, including the undo/redo history.
 *
 * Two things changed in M2c:
 * - the key carries the signed-in **Account**, so two plotters on one route no
 *   longer share a slot;
 * - the payload carries the **base** — the state and Direction Version the
 *   draft was loaded from — because a three-way merge needs an ancestor.
 *
 * Storage is injectable so the module is unit-testable in Node.
 */

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_KEY_PREFIX = "komyuter.draft";
export const DRAFT_INDEX_PREFIX = "komyuter.draft-index";
export const DRAFT_SCHEMA_VERSION = 2;
const DEBOUNCE_MS = 500;

/** The state a Draft was loaded from — the ancestor of a Save Conflict. */
export interface DraftBase {
  /** The Direction Version the base was read at (ADR-0020). */
  version: number;
  stops: DraftStop[];
  routeMeta: RouteMetaDraft | null;
  polyline: GeoLineString | null;
}

export interface DraftPayload {
  schemaVersion: number;
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
  /** Null on a legacy draft, which degrades to the two-way choice. */
  base: DraftBase | null;
}

export type DraftDraft = Omit<DraftPayload, "savedAt">;

/** One row of the restore list. */
export interface DraftSummary {
  routeId: string | null;
  directionId: string | null;
  label: string;
  savedAt: number;
}

/** Minimal storage surface (localStorage in the browser, fake in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Enumeration, used to rebuild a lost index. */
  key?(index: number): string | null;
  readonly length?: number;
}

const noopStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function defaultStorage(): StorageLike {
  return typeof localStorage !== "undefined" ? localStorage : noopStorage;
}

/** `komyuter.draft.{userId}.{routeId}.{directionId}` — a null direction means
 *  a not-yet-saved route (drafts for new directions use "new"). */
export function draftKey(
  userId: string,
  routeId: string | null,
  directionId: string | null,
): string {
  return `${DRAFT_KEY_PREFIX}.${userId}.${routeId ?? "no-route"}.${directionId ?? "new"}`;
}

/** The pre-M2c, account-less key — read once and adopted. */
export function legacyDraftKey(
  routeId: string | null,
  directionId: string | null,
): string {
  return `${DRAFT_KEY_PREFIX}.${routeId ?? "no-route"}.${directionId ?? "new"}`;
}

export function draftIndexKey(userId: string): string {
  return `${DRAFT_INDEX_PREFIX}.${userId}`;
}

export function isDraftExpired(
  payload: { savedAt: number },
  now = Date.now(),
): boolean {
  return now - payload.savedAt > DRAFT_TTL_MS;
}

function normalize(
  parsed: Partial<DraftPayload>,
  routeId: string | null,
  directionId: string | null,
  now: number,
): DraftPayload {
  return {
    schemaVersion: parsed.schemaVersion ?? DRAFT_SCHEMA_VERSION,
    savedAt: parsed.savedAt ?? now,
    routeId: parsed.routeId ?? routeId,
    directionId: parsed.directionId ?? directionId,
    stops: parsed.stops ?? [],
    polyline: parsed.polyline ?? null,
    connections: parsed.connections ?? [],
    history: parsed.history ?? { past: [], future: [] },
    routeMeta: parsed.routeMeta ?? null,
    pathStopIds: parsed.pathStopIds ?? null,
    base: parsed.base ?? null,
  };
}

function readIndex(userId: string, storage: StorageLike): DraftSummary[] {
  const raw = storage.getItem(draftIndexKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DraftSummary[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(
  userId: string,
  entries: DraftSummary[],
  storage: StorageLike,
): void {
  storage.setItem(draftIndexKey(userId), JSON.stringify(entries));
}

function upsertIndex(
  userId: string,
  payload: DraftPayload,
  storage: StorageLike,
): void {
  const entries = readIndex(userId, storage).filter(
    (entry) =>
      entry.routeId !== payload.routeId ||
      entry.directionId !== payload.directionId,
  );
  entries.push({
    routeId: payload.routeId,
    directionId: payload.directionId,
    label: payload.routeMeta?.name?.trim() || payload.routeId || "New route",
    savedAt: payload.savedAt,
  });
  writeIndex(userId, entries, storage);
}

function dropFromIndex(
  userId: string,
  routeId: string | null,
  directionId: string | null,
  storage: StorageLike,
): void {
  const entries = readIndex(userId, storage).filter(
    (entry) => entry.routeId !== routeId || entry.directionId !== directionId,
  );
  writeIndex(userId, entries, storage);
}

/** Persists the draft (timestamped now). Returns the key written, or null if
 *  the payload is empty (nothing to recover). */
export function saveDraft(
  userId: string,
  payload: DraftDraft,
  storage: StorageLike = defaultStorage(),
): string | null {
  if (payload.stops.length === 0 && !payload.polyline) return null;
  const key = draftKey(userId, payload.routeId, payload.directionId);
  const stamped: DraftPayload = {
    ...payload,
    schemaVersion: DRAFT_SCHEMA_VERSION,
    savedAt: Date.now(),
  };
  storage.setItem(key, JSON.stringify(stamped));
  upsertIndex(userId, stamped, storage);
  return key;
}

/**
 * Loads the Account's draft for the route/direction, honouring the 24 h TTL.
 * A pre-M2c draft found under the old key is adopted once into this Account's
 * slot, so a deploy does not throw away work in flight.
 */
export function loadDraft(
  userId: string,
  routeId: string | null,
  directionId: string | null,
  storage: StorageLike = defaultStorage(),
  now = Date.now(),
): DraftPayload | null {
  const key = draftKey(userId, routeId, directionId);
  const raw = storage.getItem(key);
  if (!raw) {
    return adoptLegacyDraft(userId, routeId, directionId, storage, now);
  }
  try {
    const payload = normalize(
      JSON.parse(raw) as Partial<DraftPayload>,
      routeId,
      directionId,
      now,
    );
    if (isDraftExpired(payload, now)) {
      storage.removeItem(key);
      dropFromIndex(userId, routeId, directionId, storage);
      return null;
    }
    return payload;
  } catch {
    // Corrupt JSON — treat as absent and drop it.
    storage.removeItem(key);
    dropFromIndex(userId, routeId, directionId, storage);
    return null;
  }
}

function adoptLegacyDraft(
  userId: string,
  routeId: string | null,
  directionId: string | null,
  storage: StorageLike,
  now: number,
): DraftPayload | null {
  const legacy = legacyDraftKey(routeId, directionId);
  const raw = storage.getItem(legacy);
  if (!raw) return null;
  try {
    const payload = normalize(
      JSON.parse(raw) as Partial<DraftPayload>,
      routeId,
      directionId,
      now,
    );
    storage.removeItem(legacy);
    if (isDraftExpired(payload, now)) return null;
    saveDraft(userId, { ...payload, base: payload.base ?? null }, storage);
    return payload;
  } catch {
    storage.removeItem(legacy);
    return null;
  }
}

export function clearDraft(
  userId: string,
  routeId: string | null,
  directionId: string | null,
  storage: StorageLike = defaultStorage(),
): void {
  storage.removeItem(draftKey(userId, routeId, directionId));
  dropFromIndex(userId, routeId, directionId, storage);
}

/** The Account's drafts, newest first. The index is the fast path; when it is
 *  missing or corrupt the slots are enumerated from storage. */
export function listDrafts(
  userId: string,
  storage: StorageLike = defaultStorage(),
  now = Date.now(),
): DraftSummary[] {
  const entries = readIndex(userId, storage);

  if (entries.length === 0 && storage.key && storage.length !== undefined) {
    const prefix = `${DRAFT_KEY_PREFIX}.${userId}.`;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = normalize(
          JSON.parse(raw) as Partial<DraftPayload>,
          null,
          null,
          now,
        );
        entries.push({
          routeId: parsed.routeId,
          directionId: parsed.directionId,
          label:
            parsed.routeMeta?.name?.trim() || parsed.routeId || "New route",
          savedAt: parsed.savedAt,
        });
      } catch {
        // Skip a corrupt slot; it will be dropped on its next load.
      }
    }
    writeIndex(userId, entries, storage);
  }

  return entries
    .filter((entry) => !isDraftExpired(entry, now))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Detour draft persistence (US4) — the same 24 h TTL + injectable storage as
 * the plotting draft, keyed per Account and direction under its own prefix.
 */
export const DETOUR_DRAFT_KEY_PREFIX = "komyuter.detour-draft";

export function detourDraftKey(userId: string, directionId: string): string {
  return `${DETOUR_DRAFT_KEY_PREFIX}.${userId}.${directionId}`;
}

/** A saved detour's own draft key, so switching detours cannot overwrite it. */
export function detourDraftKeyFor(
  userId: string,
  directionId: string,
  detourId: string,
): string {
  return `${detourDraftKey(userId, directionId)}.${detourId}`;
}

function writeDetourDraft<T>(
  key: string,
  directionId: string,
  payload: T,
  storage: StorageLike,
): void {
  storage.setItem(
    key,
    JSON.stringify({ savedAt: Date.now(), directionId, detour: payload }),
  );
}

function readDetourDraft<T>(
  key: string,
  storage: StorageLike,
  now: number,
): T | null {
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

export function saveDetourDraft<T>(
  userId: string,
  directionId: string,
  payload: T,
  storage: StorageLike = defaultStorage(),
): void {
  writeDetourDraft(
    detourDraftKey(userId, directionId),
    directionId,
    payload,
    storage,
  );
}

/** Saves a draft under a saved detour's own key. */
export function saveDetourDraftFor<T>(
  userId: string,
  directionId: string,
  detourId: string,
  payload: T,
  storage: StorageLike = defaultStorage(),
): void {
  writeDetourDraft(
    detourDraftKeyFor(userId, directionId, detourId),
    directionId,
    payload,
    storage,
  );
}

/** Loads the Account's detour draft honouring the 24 h TTL; expired or corrupt
 *  drafts are dropped and never surfaced (same contract as the plotting
 *  draft, FR-014). Returns null when absent. */
export function loadDetourDraft<T>(
  userId: string,
  directionId: string,
  storage: StorageLike = defaultStorage(),
  now = Date.now(),
): T | null {
  return readDetourDraft(detourDraftKey(userId, directionId), storage, now);
}

/** Loads a saved detour's own draft. */
export function loadDetourDraftFor<T>(
  userId: string,
  directionId: string,
  detourId: string,
  storage: StorageLike = defaultStorage(),
  now = Date.now(),
): T | null {
  return readDetourDraft(
    detourDraftKeyFor(userId, directionId, detourId),
    storage,
    now,
  );
}

export function clearDetourDraft(
  userId: string,
  directionId: string,
  storage: StorageLike = defaultStorage(),
): void {
  storage.removeItem(detourDraftKey(userId, directionId));
}

/** Clears a saved detour's own draft. */
export function clearDetourDraftFor(
  userId: string,
  directionId: string,
  detourId: string,
  storage: StorageLike = defaultStorage(),
): void {
  storage.removeItem(detourDraftKeyFor(userId, directionId, detourId));
}

/**
 * Debounced draft writer (FR-014: ~500 ms writes). `save` coalesces rapid
 * edits into the latest payload; `flush` writes immediately (before unload /
 * save); `cancel` drops a pending write.
 */
export function createDebouncedDraftWriter(
  userId: string,
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
          saveDraft(userId, pending, storage);
          pending = null;
        }
      }, delayMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pending) {
        saveDraft(userId, pending, storage);
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
