import { type ReactNode } from "react";
import type { WorkspaceUiState } from "@/lib/plottingStore";
import { WORKSPACE_GEOMETRY } from "./geometry";

interface WorkspaceColumnsProps {
  mode: WorkspaceUiState;
  /** Left plate — route list / stops (overview, focus, edit). */
  left: ReactNode;
  /** Right plate — FocusPlate (focus) or properties (edit). */
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
 * in every state, so the map (a sibling backdrop) is never touched by state
 * changes — it never resizes or remounts (SC-002).
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
  const showRight = mode === "focus" || mode === "edit";
  const { leftCol, rightCol, gutter } = WORKSPACE_GEOMETRY;

  const gridTemplateColumns =
    mode === "empty"
      ? `0px 0px minmax(0, 1fr) 0px 0px`
      : showRight
        ? `${leftCol}px ${gutter}px minmax(0, 1fr) ${gutter}px ${rightCol}px`
        : `${leftCol}px ${gutter}px minmax(0, 1fr) 0px 0px`;

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
      <div
        className="pointer-events-none min-h-0 min-w-0 p-3"
        style={{ display: showLeft ? undefined : "none" }}
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
        style={{ display: showLeft ? undefined : "none" }}
      />
      <div className="pointer-events-none relative min-h-0 min-w-0">
        {chrome}
        {mode === "empty" && (
          <div className="absolute inset-0 z-10">{empty}</div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none"
        style={{ display: showRight ? undefined : "none" }}
      />
      <div
        className="pointer-events-none min-h-0 min-w-0 p-3"
        style={{ display: showRight ? undefined : "none" }}
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
