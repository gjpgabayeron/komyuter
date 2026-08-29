/**
 * Canonical UI labels — the single source of truth for every visible label
 * in the route workspace (contracts/ui-labels.md). Every surface reads labels
 * only through this registry: no inline literal labels, no per-file copies,
 * no variant spellings. This is what SC-004 ("the same field carries the same
 * label in every surface") and FR-005 enforce.
 *
 * Rule: one canonical string per key, and no two keys map to the same string
 * (enforced by tests/labels.test.ts). Add rows here as surfaces are adopted.
 */

export const LABELS = {
  routeCode: "Route code",
  shortName: "Short name",
  color: "Color",
  stops: "Stops",
  sectionStops: "Stops along this route",
  detours: "Alternative routes",
  lastUpdated: "Last updated",
  additionalDistance: "Additional distance",
  commuterInstruction: "Commuter instruction",
  driverInstruction: "Driver instruction",
  notableStops: "Notable stops",
  searchStops: "Search stops…",
  searchRoutes: "Search routes…",
} as const;

export type LabelKey = keyof typeof LABELS;

/** Resolve a canonical label. A misspelled key fails typecheck. */
export function label(key: LabelKey): string {
  return LABELS[key];
}

/**
 * Save-control copy (contracts/ui-patterns.md §1) — ONE shared set for both
 * the base editor and the Detour editor (FR-001/FR-002). A Detour save never
 * invents its own wording ("Save detour" is gone).
 */
export const SAVE_COPY = {
  idle: "Save changes",
  saving: "Saving…",
  saved: "Saved just now",
} as const;

/**
 * Save-conflict copy (FR-003) — ONE shared wording for base-route and Detour
 * save conflicts (the SaveButton surfaces a conflict notice; LoadLatestDialog
 * shows this exact copy). No per-editor variant copy.
 */
export const CONFLICT_COPY = {
  title: "Discard unsaved changes?",
  body: "Loading the latest version replaces your unsaved edits. Your current work is kept as a draft on this device.",
  loadLatest: "Load latest",
  keepLocal: "Keep editing",
} as const;
