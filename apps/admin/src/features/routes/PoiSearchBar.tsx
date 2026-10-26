import { useEffect, useRef, useState } from "react";
import { MapPinned, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlottingStore, type PoiSearchStatus } from "@/lib/plottingStore";
import { searchPlaces } from "./geocodeApi";
import { isConfident } from "./poiConfidence";
import {
  scopeHits,
  scopeToNearestCluster,
  shouldOfferAreaSearch,
} from "./poiScope";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

/** A superseded keystroke aborts its request; that is not a user-facing failure. */
function isAbort(error: unknown): boolean {
  const problem = error as { code?: string; name?: string } | null;
  return problem?.code === "ERR_CANCELED" || problem?.name === "CanceledError";
}

/** The camera centre in Mapbox's `lng,lat` form, or undefined when unknown. */
function proximityOf(
  viewport: { longitude: number; latitude: number } | null,
): string | undefined {
  return viewport ? `${viewport.longitude},${viewport.latitude}` : undefined;
}

/**
 * Map search input — the entry point to the search session.
 *
 * The pill owns the query and the request; the *results* are the right-hand
 * plate's job (`SearchResultsPanel`), so nothing here opens a dropdown. What the
 * pill does decide is the shape of the answer: a confident hit marks the place
 * and flies, an ambiguous one publishes candidates for the plate and the map
 * pins, an empty one publishes why.
 *
 * Search follows the camera: the centre rides along as `proximity` (Mapbox ranks
 * near it) and the answer is filtered to the visible area on our side, because
 * Mapbox ignores `radius` and `bbox` on `/forward` — measured. A hit whose name
 * *is* the query is exempt, so a stop across town stays findable.
 *
 * Focusing the input starts the session (`searchActive`), which is what hides
 * the properties plate; `Esc` ends it. The camera is read through the store and
 * moved by `PoiFocuser`, because this component sits in the workspace chrome,
 * outside `<Map>`.
 */
export function PoiSearchBar() {
  const setPoi = usePlottingStore((s) => s.setPoi);
  const requestPoiFocus = usePlottingStore((s) => s.requestPoiFocus);
  const setPoiCandidates = usePlottingStore((s) => s.setPoiCandidates);
  const setPoiSelection = usePlottingStore((s) => s.setPoiSelection);
  const setPoiHoverId = usePlottingStore((s) => s.setPoiHoverId);
  const setPoiSearch = usePlottingStore((s) => s.setPoiSearch);
  const setSearchActive = usePlottingStore((s) => s.setSearchActive);
  const clearSearchSession = usePlottingStore((s) => s.clearSearchSession);
  const searchActive = usePlottingStore((s) => s.searchActive);
  const mapViewport = usePlottingStore((s) => s.mapViewport);
  const candidates = usePlottingStore((s) => s.poiCandidates);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Centre the current answer was produced at — the reference for the area plate.
  const lastSearchRef = useRef<{
    query: string;
    longitude: number;
    latitude: number;
  } | null>(null);

  /**
   * One search: camera bias in, area-scoped hits out.
   *
   * The camera is read at call time rather than through the effect's closure: it
   * changes far more often than the query, and depending on it would re-run
   * (and bill) a search on every pan.
   */
  const runQuery = async (
    q: string,
    signal: AbortSignal,
    firstQuery: boolean,
  ) => {
    const viewport = usePlottingStore.getState().mapViewport;
    const { results: hits, warning } = await searchPlaces(
      q,
      proximityOf(viewport),
      signal,
    );
    // First query of a session: keep the cluster nearest the camera, because the
    // opening camera is a city view and a viewport filter would hide the place
    // being typed. Later queries narrow what is already on screen.
    const scoped = firstQuery
      ? scopeToNearestCluster(q, hits, viewport)
      : scopeHits(q, hits, viewport);
    // Mapbox answered with hits, but none of them survived the scope.
    const status: PoiSearchStatus =
      warning ??
      (scoped.length === 0 && hits.length > 0 ? "out_of_area" : null);
    return { hits: scoped, status, viewport };
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setPoiCandidates([]);
      setPoiHoverId(null);
      return;
    }
    let cancelled = false;
    // One controller per query: the cleanup aborts the in-flight request when
    // the plotter types again, so a slow answer cannot overwrite a newer one.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { hits, status, viewport } = await runQuery(
          q,
          controller.signal,
          lastSearchRef.current === null,
        );
        if (cancelled) return;
        lastSearchRef.current = viewport
          ? {
              query: q,
              longitude: viewport.longitude,
              latitude: viewport.latitude,
            }
          : null;
        setPoiSearch(q, status);
        if (isConfident(q, hits)) {
          // One unambiguous answer — mark it and move, without asking. No
          // candidates, so the results plate stays shut, and the popup opens on
          // the place itself: a one-shot search should land ready to add, not
          // needing a second click on the marker it just flew to.
          setPoiCandidates([]);
          setPoiHoverId(null);
          setPoi(hits[0].location, hits[0].name);
          setPoiSelection(hits[0]);
          requestPoiFocus({ kind: "point", location: hits[0].location });
        } else {
          // A real choice: pins for the map, rows for the plate, framed together.
          setPoiCandidates(hits);
          setPoiHoverId(null);
          requestPoiFocus({
            kind: "bounds",
            locations: hits.map((hit) => hit.location),
          });
        }
      } catch (error) {
        if (cancelled || isAbort(error)) return;
        setPoiCandidates([]);
        setPoiHoverId(null);
        setPoiSearch(q, "request_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // The panel's Esc ends the session from outside this component; the text
  // follows, so the input never shows a query that is no longer live.
  useEffect(() => {
    if (!searchActive) setQuery("");
  }, [searchActive]);

  /** Re-runs the last query at the camera's new centre, without moving the map. */
  const runAreaSearch = async () => {
    const last = lastSearchRef.current;
    if (!last) return;
    setLoading(true);
    const controller = new AbortController();
    try {
      const { hits, status, viewport } = await runQuery(
        last.query,
        controller.signal,
        // "Search this area" is an explicit viewport request, never a cluster.
        false,
      );
      lastSearchRef.current = viewport
        ? {
            query: last.query,
            longitude: viewport.longitude,
            latitude: viewport.latitude,
          }
        : null;
      setPoiSearch(last.query, status);
      setPoiCandidates(hits);
      setPoiHoverId(null);
      // Deliberately no camera request: the plotter is already looking where
      // they want to look, so only the result set moves.
    } catch (error) {
      if (isAbort(error)) return;
      setPoiCandidates([]);
      setPoiSearch(last.query, "request_failed");
    } finally {
      setLoading(false);
    }
  };

  /** Ends the session: no query, no pins, no popup — properties come back. */
  const exitSearch = () => {
    lastSearchRef.current = null;
    setQuery("");
    // One store action, so the panel's Esc and this Esc end the same way.
    clearSearchSession();
    inputRef.current?.blur();
  };

  /**
   * Clearing the input is what ends a session — nothing else.
   *
   * Focus stays in the field, so typing again simply starts a new session; the
   * difference from `exitSearch` is only that the caret stays put.
   */
  const clearQuery = () => {
    lastSearchRef.current = null;
    setQuery("");
    clearSearchSession();
    inputRef.current?.focus();
  };

  const showAreaSearch =
    candidates.length > 0 &&
    !loading &&
    shouldOfferAreaSearch(mapViewport, lastSearchRef.current);

  return (
    <div className="pointer-events-auto z-30 flex items-start gap-2">
      <div className="bg-background relative w-72">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setSearchActive(true);
            setQuery(event.target.value);
          }}
          onFocus={() => setSearchActive(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              exitSearch();
            }
          }}
          placeholder="Search for a place…"
          aria-label="Search for a place"
          className="h-9 pr-8 pl-8"
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearQuery}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {showAreaSearch && (
        <button
          type="button"
          onClick={() => void runAreaSearch()}
          className="border-border bg-background hover:bg-muted flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap shadow-sm"
        >
          <MapPinned className="size-3.5" />
          Search this area
        </button>
      )}
    </div>
  );
}
