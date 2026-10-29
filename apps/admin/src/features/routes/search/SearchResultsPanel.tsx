import { useRef } from "react";
import type { GeocodeHit } from "@komyuter/shared";
import { Plate } from "@/components/shared/Plate";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlottingStore, type PoiSearchStatus } from "@/lib/plottingStore";
import {
  insertionAnchorLabel,
  poiAnchorFor,
  poiMetaLine,
} from "./formatPoiMeta";
import { searchPanelState } from "./panelState";

const EMPTY_VALID_COPY = "Nothing in this area. Move the map and search again.";

const UNAVAILABLE_COPY: Record<
  Exclude<PoiSearchStatus, "out_of_area" | null>,
  string
> = {
  no_token:
    "Place search is off — no Mapbox token is configured on the server.",
  upstream_error:
    "Search is unavailable — the place service returned an error.",
  request_failed: "Search failed — the request could not be completed.",
};

/** Three skeleton rows while a query is in flight (no pill spinner). */
function LoadingRows() {
  return (
    <div className="mt-2 flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-1 px-1 py-1.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Right-hand plate for a search session: the ambiguous results list.
 *
 * It takes the properties column's place while `searchActive` is true, so the
 * plotter keeps one list rather than a dropdown *and* a panel. Candidates come
 * from `poiCandidates` — the same array the map pins are drawn from — so the
 * panel and the map can never disagree.
 *
 * Five states, all decided by `searchPanelState`: loading (skeleton rows),
 * results, empty but valid (`Nothing in this area`), unavailable (one line
 * naming the cause), and absent on a confident hit — where the component
 * renders nothing because the map marker and popup are the answer.
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
  const poiLoading = usePlottingStore((s) => s.poiLoading);
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
  const state = searchPanelState({
    loading: poiLoading,
    candidateCount: candidates.length,
    status,
  });

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

  // A confident single hit is shown by the map marker and its popup; the plate
  // is deliberately absent (frame spec, five states).
  if (state === "absent") return null;

  const countLabel = `${candidates.length} result${
    candidates.length === 1 ? "" : "s"
  }`;

  return (
    <aside
      aria-label="Search results"
      aria-busy={state === "loading"}
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
          {/* The visible count changes with the answer; announce it politely
              once the query has settled, never as a "0" while loading. */}
          <span className="sr-only" aria-live="polite">
            {state === "loading" ? "" : countLabel}
          </span>
        </header>

        {/* Rule between the header and the rows: the header is context, the
            list is content — they should not read as one block. */}
        <div aria-hidden className="border-border mt-2 border-t" />

        {state === "loading" ? (
          <>
            <span className="sr-only" role="status">
              Searching for places…
            </span>
            <LoadingRows />
          </>
        ) : state === "results" ? (
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
        ) : state === "empty" ? (
          <p className="text-muted-foreground mt-2 px-1 text-xs">
            {EMPTY_VALID_COPY}
          </p>
        ) : (
          status !== null &&
          status !== "out_of_area" && (
            <p className="text-muted-foreground mt-2 px-1 text-xs">
              {UNAVAILABLE_COPY[status]}
            </p>
          )
        )}
      </Plate>
    </aside>
  );
}
