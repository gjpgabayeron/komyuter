import { useEffect, useRef, useState } from "react";
import type { GeocodeHit } from "@komyuter/shared";
import { Plate } from "@/components/shared/Plate";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePlottingStore, type PoiSearchStatus } from "@/lib/plottingStore";
import {
  insertionAnchorLabel,
  poiAnchorFor,
  poiMetaLine,
  type PoiAnchor,
} from "./formatPoiMeta";
import { searchPanelState } from "./panelState";
import { REVEAL_DURATION_MS } from "../workspace/motion";

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

/** The answer the plate was showing, kept for the closing transition. */
interface SearchSnapshot {
  candidates: GeocodeHit[];
  status: PoiSearchStatus;
  loading: boolean;
  anchor: PoiAnchor | null;
}

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

/** The plate state for an answer, live or retained. */
function panelStateOf(s: SearchSnapshot) {
  return searchPanelState({
    loading: s.loading,
    candidateCount: s.candidates.length,
    status: s.status,
  });
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
  const poiSelection = usePlottingStore((s) => s.poiSelection);
  const setPoiHoverId = usePlottingStore((s) => s.setPoiHoverId);
  const setPoi = usePlottingStore((s) => s.setPoi);
  const setPoiSelection = usePlottingStore((s) => s.setPoiSelection);
  const requestPoiFocus = usePlottingStore((s) => s.requestPoiFocus);
  const clearSearchSession = usePlottingStore((s) => s.clearSearchSession);
  const searchActive = usePlottingStore((s) => s.searchActive);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const anchor = poiAnchorFor(selection, stops);
  const live = { candidates, status, loading: poiLoading, anchor };
  const liveState = panelStateOf(live);
  // Keep the last answer long enough for the plate's 180 ms slide-out. Closing
  // a session clears the store immediately, so without this snapshot the white
  // plate would disappear before it could move. A confident hit clears the
  // snapshot instead: that answer never had a plate to animate.
  const snapshotRef = useRef<SearchSnapshot | null>(null);
  const [, setTransitionTick] = useState(0);
  if (liveState !== "absent") snapshotRef.current = live;
  const closing = !searchActive && snapshotRef.current !== null;
  const view = closing && liveState === "absent" ? snapshotRef.current! : live;
  const state = panelStateOf(view);

  useEffect(() => {
    if (searchActive) return;
    if (snapshotRef.current === null) return;
    const timer = setTimeout(() => {
      snapshotRef.current = null;
      setTransitionTick((tick) => tick + 1);
    }, REVEAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [searchActive]);

  // A confident hit is shown by the marker and popup, not a plate; drop the
  // stale snapshot so closing that session does not replay the skeleton.
  useEffect(() => {
    if (searchActive && state === "absent") snapshotRef.current = null;
  }, [searchActive, state]);

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

  const activeIndex = view.candidates.findIndex((hit) => hit.id === hoverId);

  /** Arrow keys walk the rows; focusing one runs the same preview as hovering. */
  const focusRow = (index: number) => {
    if (view.candidates.length === 0) return;
    const clamped = Math.max(0, Math.min(index, view.candidates.length - 1));
    rowRefs.current[clamped]?.focus();
  };

  // A confident single hit is shown by the map marker and its popup; the plate
  // is deliberately absent (frame spec, five states).
  if (state === "absent") return null;

  const countLabel = `${view.candidates.length} result${
    view.candidates.length === 1 ? "" : "s"
  }`;

  return (
    <aside
      aria-label="Search results"
      aria-busy={state === "loading"}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      <Plate
        padded="md"
        className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-y-0 border-l-0 pt-[60px]"
      >
        <header className="shrink-0">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-foreground text-sm font-semibold">
              Search results
            </h2>
            {state !== "loading" && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {view.candidates.length}
              </span>
            )}
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {insertionAnchorLabel(view.anchor)}
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
                const hit = view.candidates[activeIndex];
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
            {view.candidates.map((hit, index) => {
              const meta = poiMetaLine(hit, view.anchor);
              const picked = poiSelection?.id === hit.id;
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
                    aria-current={picked ? "true" : undefined}
                    className={cn(
                      "flex w-full flex-col rounded-sm border-l px-2 py-1.5 text-left",
                      picked
                        ? "border-destructive bg-destructive/5"
                        : "hover:bg-muted focus:bg-muted border-transparent",
                      hoverId === hit.id && !picked && "bg-muted",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {picked && (
                        <span
                          aria-hidden
                          className="bg-destructive size-1.5 shrink-0 rounded-full"
                        />
                      )}
                      <span className="text-foreground block min-w-0 flex-1 truncate text-sm font-medium">
                        {hit.name}
                      </span>
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
          view.status !== null &&
          view.status !== "out_of_area" && (
            <p className="text-muted-foreground mt-2 px-1 text-xs">
              {UNAVAILABLE_COPY[view.status]}
            </p>
          )
        )}
      </Plate>
    </aside>
  );
}
