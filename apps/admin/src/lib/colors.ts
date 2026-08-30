/**
 * THE single color source (contracts/ui-colors.md §1, FR-012/SC-007):
 * every fixed semantic color in the route workspace is defined exactly
 * once here and consumed through `semanticColor(key)` or the named
 * exports below. Never inline a raw hex or an amber-* class anywhere else
 * — `tests/colors.test.ts` audits the whole tree and fails on duplicates.
 *
 * Coordinate note: values are Adobe #hex as DESIGN.md specifies; OKLCH
 * equivalents are kept in DESIGN.md frontmatter (DESIGN.md wins on visual
 * values). Route-sign grammar: signboard green-blue + signal amber on
 * pure white, ≤4px corners, no shadows.
 */

/** Semantic color tokens — the only sanctioned hex literals in the app. */
export const SEMANTIC_COLORS = {
  /** Signboard green-blue: active/committed route line, brand accents. */
  activeRoute: "#1B6DB2",
  /** Vivid orange: transient connecting line (straight fallback). */
  previewLine: "#FF5C00",
  /** Signal amber: live detour composition + road-follow warnings. */
  attentionAmber: "#D97706",
  /** Near-black ink: split/merge node markers, labels. */
  nodeInk: "#0F172A",
} as const;

export type SemanticColorKey = keyof typeof SEMANTIC_COLORS;

/** Resolve a semantic color token. A misspelled key fails typecheck. */
export function semanticColor(key: SemanticColorKey): string {
  return SEMANTIC_COLORS[key];
}

/**
 * Stop-type identity colors (pair with shape — never color alone, FR-015).
 * Terminal = signboard green-blue, major = read green, hail-and-ride = amber.
 */
export const STOP_COLORS = {
  terminal: "#1B6DB2",
  major_stop: "#008554",
  waiting_area: "#C98A1B",
} as const;

/** Base route line token (solid) — semantic name consumers read. */
export const activeRoute = SEMANTIC_COLORS.activeRoute;
/** Node ink token for the split/merge markers. */
export const nodeInk = SEMANTIC_COLORS.nodeInk;
/** Attention amber token (detour live line, warnings). */
export const attentionAmber = SEMANTIC_COLORS.attentionAmber;
/** Preview/orange token (transient connecting line). */
export const previewLine = SEMANTIC_COLORS.previewLine;
