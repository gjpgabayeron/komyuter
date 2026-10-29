import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { WorkspaceUiState } from "@/lib/plottingStore";
import { WORKSPACE_GEOMETRY, type WorkspaceLayout } from "./geometry";
import { REVEAL_DURATION_MS, REVEAL_EASING_CSS } from "./motion";

interface WorkspaceColumnsProps {
  mode: WorkspaceUiState;
  /** The workspace's plate configuration, derived once by the page. The grid
   *  renders its tracks; the same value feeds the camera padding and search
   *  scope, so the three cannot drift apart (ADR-0024). */
  layout: WorkspaceLayout;
  /** Left plate — route list / stops (overview, focus, edit). */
  left: ReactNode;
  /** Right plate — FocusPlate (focus) or properties (edit). `null` collapses
   *  the track. Search results never live here (ADR-0024). */
  right: ReactNode;
  /** Context plate — revealed over the free region's left edge while a search
   *  session has something to show. */
  context?: ReactNode;
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
  layout,
  left,
  right,
  context = null,
  empty,
  chrome,
  leftPinned = false,
}: WorkspaceColumnsProps) {
  const contextRef = useRef<HTMLDivElement>(null);
  // The page derived the plate configuration; render exactly those tracks.
  const showLeft = layout.tracks.left > 0;
  const showRight = layout.tracks.right > 0;
  // A session can hold the context column open only in the edit state; the
  // reveal is an overlay, so the plate is mounted but translated away while
  // closed and cannot be reached (inert) until it opens.
  const showContext = layout.context.visible;

  // A collapsed plate must not be tabbable or clickable even though it stays
  // mounted; React 18 warns on the `inert` prop, so it is set on the element.
  useLayoutEffect(() => {
    if (contextRef.current) contextRef.current.inert = !showContext;
  }, [showContext]);

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
        className="pointer-events-none relative z-10 min-h-0 min-w-0 p-3"
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
        {/* Context plate (ADR-0024). Mounted even while closed so reopening is
            instant, translated off the free region's left edge, and animated as
            a transform — the GL canvas behind it is never resized. It starts
            below the chrome's top row so the search pill keeps its place. The
            stops column paints above it (z-10), so a closed plate slides away
            behind that plate instead of across it. */}
        {context !== null && (
          <div
            ref={contextRef}
            aria-hidden={!showContext}
            className="absolute top-[60px] bottom-0 left-0 z-0 p-3 transition-transform motion-reduce:transition-none"
            style={{
              width: WORKSPACE_GEOMETRY.contextCol,
              transform: showContext ? "translateX(0)" : "translateX(-100%)",
              // The plate and the camera share one duration and curve.
              transitionDuration: `${REVEAL_DURATION_MS}ms`,
              transitionTimingFunction: REVEAL_EASING_CSS,
            }}
          >
            <div className="pointer-events-auto flex max-h-[66%] flex-col">
              {context}
            </div>
          </div>
        )}
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
