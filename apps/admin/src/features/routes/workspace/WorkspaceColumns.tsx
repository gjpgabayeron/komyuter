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
  /** Context plate — docked beside the stops column while a search session has
   *  something to show, revealed by sliding out from behind it. */
  context?: ReactNode;
  /** Empty-state plate; rendered in the center track over the warm map. */
  empty: ReactNode;
  /** Floating chrome (search, status, action bar) anchored to the center
   *  track's edges — the track itself is transparent and click-through. */
  chrome: ReactNode;
}

/**
 * The three-column shell over the full-bleed map backdrop (ADR-0015 revision,
 * re-composed as a docked editor by the search-state frame).
 *
 * The side plates are **docked strips**, not floating cards: each fills its
 * track's height and sits flush against the workspace edge (the old 12 px
 * `p-3` inset is gone), so the map starts at the plate's border and the panels
 * read as one continuous editor. Only the chrome — the search field, the
 * status slot and the bottom toolbar — floats over the map.
 *
 * The center track is transparent and `pointer-events: none`: clicks fall
 * through to the map; only the chrome it hosts (and the empty plate) opt back
 * in. The context plate (the search results) is an overlay anchored to the
 * free region's left edge, not a grid track: the search field is part of that
 * plate's silhouette, so a real track would push the field 280 px sideways the
 * moment results appeared.
 *
 *   empty    → 0 0 map 0 0            (map full-width under the empty plate)
 *   overview → 280 map 0 0
 *   focus    → 280 map 0 280          (FocusPlate)
 *   edit     → 280 map 0 280          (properties)
 *   edit+search → 280 [280 overlay] map 0 0
 *
 * Every side plate is the same 280 px width, so the search results plate
 * replaces the properties plate rather than adding to it: the visible map
 * width is identical before and after a search opens.
 *
 * The grid is identity-stable: the same five items render in the same order
 * in every state, each pinned to its own track by an explicit `gridColumn`,
 * so the map (a sibling backdrop) is never touched by state changes — it
 * never resizes or remounts (SC-002) — and hiding a track can never renumber
 * the ones after it (GH #14).
 *
 * The single row is `minmax(0, 1fr)` — the full cell height is the workspace
 * height, so a docked plate fills it and scrolls internally.
 */
export function WorkspaceColumns({
  mode,
  layout,
  left,
  right,
  context = null,
  empty,
  chrome,
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
        className="pointer-events-none relative z-10 min-h-0 min-w-0"
        style={{
          gridColumn: 1,
          display: showLeft ? undefined : "none",
        }}
      >
        {/* Docked strip: the plate owns the full cell height, so the stops
            column reads as the editor's sidebar rather than a floating card. */}
        <div className="pointer-events-auto flex h-full w-full flex-col">
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
            a transform — the GL canvas behind it is never resized. It spans the
            full workspace height and starts at the very top: the search field
            floats above it with the same width, so the two read as one plate
            (the frame's "field is part of the results plate" illusion). The
            plate's own content starts below the field. The stops column paints
            above it (z-10), so a closed plate slides away behind that plate
            instead of across it. It sits BEFORE the chrome in the DOM, so the
            tab order is stops → result rows → map chrome. */}
        {context !== null && (
          <div
            ref={contextRef}
            aria-hidden={!showContext}
            className="absolute inset-y-0 left-0 z-0 transition-transform motion-reduce:transition-none"
            style={{
              width: WORKSPACE_GEOMETRY.contextCol,
              transform: showContext ? "translateX(0)" : "translateX(-100%)",
              // The plate, the toolbar and the camera share one duration/curve.
              transitionDuration: `${REVEAL_DURATION_MS}ms`,
              transitionTimingFunction: REVEAL_EASING_CSS,
            }}
          >
            <div className="pointer-events-auto h-full">{context}</div>
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
        className="pointer-events-none min-h-0 min-w-0"
        style={{
          gridColumn: 5,
          display: showRight ? undefined : "none",
        }}
      >
        {/* Docked strip, mirroring the left column. */}
        <div className="pointer-events-auto flex h-full w-full flex-col">
          {right}
        </div>
      </div>
    </div>
  );
}
