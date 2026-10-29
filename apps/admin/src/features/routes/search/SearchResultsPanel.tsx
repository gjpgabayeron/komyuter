import { useRef } from "react";
import type { GeocodeHit } from "@komyuter/shared";
import { Plate } from "@/components/shared/Plate";
import { usePlottingStore, type PoiSearchStatus } from "@/lib/plottingStore";
import {
  insertionAnchorLabel,
  poiAnchorFor,
  poiMetaLine,
} from "./formatPoiMeta";

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
 * Hovering or keyboard-focusing a row only highlights its pin: the camera
 * stays exactly where the plotter put it, so sweeping a list never yanks the
 * view. Choosing a row marks the place, flies to it and opens its popup, which
 * is where a stop gets added. The session stays open until the plotter closes
 * it, so browsing several hits does not mean re-typing the query.
 */
export function SearchResultsPanel() {
  const candidates = usePlottingStore((s) => s.poiCandidates);
  const status = usePlottingStore((s) => s.poiStatus);
  // The insertion anchor is the current stop selection; subscribing to both
  // keeps the header line and every row's distance in step when it changes.
  const selection = usePlottingStore((s) => s.selection);
  const stops = usePlottingStore((s) => s.stops);
  const hoverId = usePlottingStore((s) => s.poiHoverId);
  const setPoiHoverId = usePlottingStore((s) => s.setPoiHoverId);
  const setPoi = usePlottingStore((s) => s.setPoi);
  const setPoiSelection = usePlottingStore((s) => s.setPoiSelection);
  const requestPoiFocus = usePlottingStore((s) => s.requestPoiFocus);
  const clearSearchSession = usePlottingStore((s) => s.clearSearchSession);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const anchor = poiAnchorFor(selection, stops);

  /** Highlights the row's pin — no camera request. */
  const previewOn = (hit: GeocodeHit) => {
    setPoiHoverId(hit.id);
  };

  /** Drops the highlight — and still no camera request. */
  const previewOff = () => {
    setPoiHoverId(null);
  };

  /** Marks the place, flies to it and opens its popup — the surface that can add a stop. */
  const select = (hit: GeocodeHit) => {
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
        <header className="shrink-0">
          <h2 className="font-display text-foreground text-sm font-semibold">
            Search results · {candidates.length}
          </h2>
          <p className="text-muted-foreground truncate text-xs">
            {insertionAnchorLabel(anchor)}
          </p>
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
              const meta = poiMetaLine(hit, anchor);
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
