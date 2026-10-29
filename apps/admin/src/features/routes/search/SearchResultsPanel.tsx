import { useEffect, useRef } from "react";
import type { GeocodeHit } from "@komyuter/shared";
import { Plate } from "@/components/shared/Plate";
import { usePlottingStore, type PoiSearchStatus } from "@/lib/plottingStore";
import { poiMetaLine } from "./formatPoiMeta";

/** Hover preview waits a beat, so sweeping the list does not thrash the camera. */
const HOVER_PREVIEW_MS = 90;

const EMPTY_COPY: Record<Exclude<PoiSearchStatus, null>, string> = {
  no_token:
    "Place search is off — no Mapbox token is configured on the server.",
  upstream_error: "Search is unavailable right now. Try again.",
  request_failed: "Search is unavailable right now. Try again.",
  // Mapbox answered, but every hit was outside the area in view.
  out_of_area: "No places here — pan out, or use Search this area.",
};

/**
 * Right-hand plate for a search session: the ambiguous results list.
 *
 * It takes the properties column's place while `searchActive` is true, so the
 * plotter keeps one list rather than a dropdown *and* a panel. Candidates come
 * from `poiCandidates` — the same array the map pins are drawn from — so the
 * panel and the map can never disagree.
 *
 * Hovering previews a row (highlight + a debounced camera move); choosing one
 * marks the place and opens its popup, which is where a stop gets added. The
 * session stays open until the plotter closes it, so browsing several hits does
 * not mean re-typing the query.
 */
export function SearchResultsPanel() {
  const candidates = usePlottingStore((s) => s.poiCandidates);
  const query = usePlottingStore((s) => s.poiQuery);
  const status = usePlottingStore((s) => s.poiStatus);
  const hoverId = usePlottingStore((s) => s.poiHoverId);
  const setPoiHoverId = usePlottingStore((s) => s.setPoiHoverId);
  const setPoi = usePlottingStore((s) => s.setPoi);
  const setPoiSelection = usePlottingStore((s) => s.setPoiSelection);
  const requestPoiFocus = usePlottingStore((s) => s.requestPoiFocus);
  const clearSearchSession = usePlottingStore((s) => s.clearSearchSession);
  const hoverTimerRef = useRef<number | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // A pending hover preview must not fire after the plate unmounts.
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    },
    [],
  );

  /** Highlights a row and, after a beat, moves the camera to its place. */
  const previewOn = (hit: GeocodeHit) => {
    setPoiHoverId(hit.id);
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      requestPoiFocus({ kind: "point", location: hit.location });
    }, HOVER_PREVIEW_MS);
  };

  /** Leaving the list drops the highlight and re-frames the whole answer. */
  const previewOff = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPoiHoverId(null);
    if (candidates.length > 0) {
      requestPoiFocus({
        kind: "bounds",
        locations: candidates.map((hit) => hit.location),
      });
    }
  };

  /** Marks the place and opens its popup — the surface that can add a stop. */
  const select = (hit: GeocodeHit) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPoi(hit.location, hit.name);
    requestPoiFocus({ kind: "point", location: hit.location });
    setPoiSelection(hit);
  };

  const activeIndex = candidates.findIndex((hit) => hit.id === hoverId);

  /** Arrow keys walk the rows; focusing one runs the same preview as hovering. */
  const focusRow = (index: number) => {
    if (candidates.length === 0) return;
    const clamped = Math.max(0, Math.min(index, candidates.length - 1));
    rowRefs.current[clamped]?.focus();
  };

  return (
    <aside
      aria-label="Search results"
      className="flex min-h-0 w-full flex-col overflow-hidden"
    >
      <Plate
        padded="md"
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      >
        <header className="flex shrink-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-foreground text-sm font-semibold">
              Search results
            </h2>
            <p className="text-muted-foreground truncate text-xs">
              {query === "" ? "Nothing searched yet" : `“${query}”`}
            </p>
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {candidates.length}
          </span>
        </header>

        {/* Rule between the header and the rows: the query line and the count are
            context, the list is content — they should not read as one block. */}
        <div aria-hidden className="border-border mt-2 border-t" />

        {candidates.length === 0 ? (
          <p className="text-muted-foreground mt-2 px-1 text-xs">
            {status === null ? "No places found." : EMPTY_COPY[status]}
          </p>
        ) : (
          <ul
            onMouseLeave={previewOff}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusRow(activeIndex + 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                focusRow(activeIndex - 1);
              } else if (event.key === "Enter") {
                const hit = candidates[activeIndex];
                if (hit) {
                  event.preventDefault();
                  select(hit);
                }
              } else if (event.key === "Escape") {
                // The workspace's own `esc` hotkey closes the route editor for
                // any non-input focus, so this one must not reach it. Return the
                // caret to the pill: the session is over, but the plotter is
                // still searching, not editing the map.
                event.stopPropagation();
                event.preventDefault();
                clearSearchSession();
                document
                  .querySelector<HTMLInputElement>("[data-poi-search-input]")
                  ?.focus();
              }
            }}
            className="overlay-scrollbar mt-2 min-h-0 flex-1 overflow-x-clip overflow-y-auto"
          >
            {candidates.map((hit, index) => {
              const meta = poiMetaLine(hit);
              return (
                <li key={hit.id}>
                  <button
                    ref={(element) => {
                      rowRefs.current[index] = element;
                    }}
                    type="button"
                    onClick={() => select(hit)}
                    onMouseEnter={() => previewOn(hit)}
                    onFocus={() => previewOn(hit)}
                    className={
                      hoverId === hit.id
                        ? "bg-muted flex w-full flex-col rounded-sm px-1 py-1.5 text-left"
                        : "hover:bg-muted focus:bg-muted flex w-full flex-col rounded-sm px-1 py-1.5 text-left"
                    }
                  >
                    <span className="text-foreground block truncate text-sm font-medium">
                      {hit.name}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {hit.description}
                    </span>
                    {meta !== "" && (
                      <span className="text-muted-foreground block truncate text-[11px]">
                        {meta}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Plate>
    </aside>
  );
}
