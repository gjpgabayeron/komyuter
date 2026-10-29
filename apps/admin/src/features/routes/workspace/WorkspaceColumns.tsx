import { type ReactNode } from "react";
import type { WorkspaceUiState } from "@/lib/plottingStore";
import { deriveWorkspaceLayout } from "./geometry";

interface WorkspaceColumnsProps {
  mode: WorkspaceUiState;
  /** Left plate — route list / stops (overview, focus, edit). */
  left: ReactNode;
  /** Right plate — FocusPlate (focus), properties (edit), or the search
   *  results while a search session is active. `null` collapses the track. */
  right: ReactNode;
  /** When true the left track fills the cell height (pins a bottom card);
   *  otherwise it stays content-adaptive (ADR-0015 short plates). */
  leftPinned?: boolean;
  /** Empty-state plate; rendered in the center track over the warm map. */
  empty: ReactNode;
  /** Floating chrome (search, status, action bar) anchored to the center
   *  track's edges — the track itself is transparent and click-through. */
  chrome: ReactNode;
}

/**
 * The three-column shell over the full-bleed map backdrop (ADR-0015 revision):
 * a 5-track grid `240 | 16 | transparent map region | 16 | 336` laid out ON
 * TOP of the map. Plates are **content-adaptive**: each track's inner wrapper
 * is a capped flex column (`flex max-h-full flex-col`) and the plate root is
 * `min-h-0`, so a short route list or a compact properties panel renders a
 * short plate with the map visible around it, while long content fills the
 * workspace and scrolls inside the plate (its own `overflow-y-auto`). The
 * center track is transparent and `pointer-events: none`: clicks fall through
 * to the map; only the chrome it hosts (and the empty plate) opt back in.
 *
 *   empty    → 0 0 map 0 0            (map full-width under the empty plate)
 *   overview → 240 16 map 0 0
 *   focus    → 240 16 map 16 336      (FocusPlate)
 *   edit     → 240 16 map 16 336      (properties)
 *
 * The grid is identity-stable: the same five items render in the same order
 * in every state, each pinned to its own track by an explicit `gridColumn`,
 * so the map (a sibling backdrop) is never touched by state changes — it
 * never resizes or remounts (SC-002) — and hiding a track can never renumber
 * the ones after it (GH #14).
 *
 * The single row is `minmax(0, 1fr)` — the full cell height acts as the cap
 * for each plate's `max-h-full`, so a long plate list can never stretch the
 * grid (or the plate) past the workspace bottom; it scrolls internally
 * instead.
 */
export function WorkspaceColumns({
  mode,
  left,
  right,
  empty,
  chrome,
  leftPinned = false,
}: WorkspaceColumnsProps) {
  const showLeft = mode !== "empty";
  // The plate decides, as well as the state: a search session can hold the
  // right track open with results, or hold it empty while a confident hit is
  // being shown on the map alone. Collapsing the track (rather than rendering
  // an empty plate) keeps the map full-bleed and the grid columns honest.
  const showRight =
    (mode === "focus" || mode === "edit") && right !== null && right !== false;
  // The plate configuration is derived, not spelled out here: the same value
  // feeds the camera padding and the search scope (ADR-0024), so the grid can
  // never disagree with them about where the map is.
  const layout = deriveWorkspaceLayout({ state: mode, rightPlate: showRight });

  const gridTemplateColumns = layout.tracks.template;

  return (
    <div
      // `relative` (positioned) so this grid paints ABOVE the positioned
      // map backdrop (`main absolute inset-0`) — in-flow static content
      // would otherwise render beneath it. `pointer-events: none` on the
      // CONTAINER itself is what lets mouse events reach the map: the box
      // would otherwise capture every click in the free region (and on the
      // basemap/polylines) before the canvas beneath ever sees it. Only the
      // opt-in descendants (plate faces, chrome) stay interactive.
      className="pointer-events-none relative grid h-full w-full"
      style={{ gridTemplateColumns, gridTemplateRows: "minmax(0, 1fr)" }}
      data-workspace-mode={mode}
      role="region"
      aria-label={`Route workspace — ${mode} mode`}
    >
      {/* Each cell names its track explicitly. Hiding a cell with
          `display: none` removes it from auto-placement, which would slide
          the centre cell into column 1 — a 0 px track in empty mode — and
          squeeze the empty plate against the left edge (GH #14). */}
      <div
        className="pointer-events-none min-h-0 min-w-0 p-3"
        style={{
          gridColumn: 1,
          display: showLeft ? undefined : "none",
        }}
      >
        {/* Content-adaptive: the wrapper is a capped flex column (max-h-full),
            so short content renders a short plate with the map visible around
            it; long content caps at the cell height and the plate's internal
            overflow-y-auto scrolls (plate root is min-h-0 — flex items cap
            against the container's max-height, percentage heights against a
            fit-content parent do not). */}
        <div
          className={`pointer-events-auto flex w-full flex-col ${
            leftPinned ? "h-full" : "max-h-full"
          }`}
        >
          {left}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none"
        style={{
          gridColumn: 2,
          display: showLeft ? undefined : "none",
        }}
      />
      <div
        className="pointer-events-none relative min-h-0 min-w-0"
        style={{ gridColumn: 3 }}
      >
        {chrome}
        {mode === "empty" && (
          <div className="absolute inset-0 z-10">{empty}</div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none"
        style={{
          gridColumn: 4,
          display: showRight ? undefined : "none",
        }}
      />
      <div
        className="pointer-events-none min-h-0 min-w-0 p-3"
        style={{
          gridColumn: 5,
          display: showRight ? undefined : "none",
        }}
      >
        {/* Content-adaptive: same capped-flex-column contract as the left track. */}
        <div
          className={`pointer-events-auto flex w-full flex-col ${
            leftPinned ? "h-full" : "max-h-full"
          }`}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
