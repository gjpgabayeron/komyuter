import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MapPinned, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlottingStore, type PoiSearchStatus } from "@/lib/plottingStore";
import type { CameraPadding } from "@/features/routes/workspace/geometry";
import { WORKSPACE_GEOMETRY } from "@/features/routes/workspace/geometry";
import { searchPlaces } from "./geocodeApi";
import { isConfident } from "./poiConfidence";
import {
  boundsCentre,
  scopeHits,
  scopeToNearestCluster,
  shouldOfferAreaSearch,
  visibleBounds,
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
export function PoiSearchBar({
  scopePadding,
  shortcutEnabled,
}: {
  /** The edit+search layout's visible-region padding. Answers are scoped to
   *  the area this leaves uncovered, not to the whole canvas. */
  scopePadding: CameraPadding;
  /** False while a dialog owns the keyboard, so `mod+k` stays inert. */
  shortcutEnabled: boolean;
}) {
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
  const poiLoading = usePlottingStore((s) => s.poiLoading);
  const setPoiLoading = usePlottingStore((s) => s.setPoiLoading);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Centre the current answer was produced at — the reference for the area plate.
  const lastSearchRef = useRef<{
    query: string;
    longitude: number;
    latitude: number;
  } | null>(null);
  /** Set when this component ends a session without meaning to clear the text
   *  (deleting back below the minimum query). The `searchActive` effect would
   *  otherwise wipe the characters still under the caret. */
  const preserveQueryRef = useRef(false);

  // ⌘K / Ctrl+K focuses the field while the workspace owns the keyboard.
  // Child dialogs (route/stop delete) are detected in the DOM, the same guard
  // the workspace's Escape uses, so a dialog always keeps the shortcut inert.
  useHotkeys(
    "mod+k",
    () => {
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      ) {
        return;
      }
      inputRef.current?.focus();
    },
    {
      enabled: shortcutEnabled,
      preventDefault: true,
      enableOnFormTags: ["input", "textarea", "select"],
    },
  );

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
    // Scope to the part of the canvas the plates leave uncovered: a row must
    // never name a place hidden behind the results plate or the stops list.
    const region = viewport ? visibleBounds(viewport, scopePadding) : null;
    // First query of a session: keep the cluster nearest the visible centre,
    // because the opening camera is a city view and a viewport filter would
    // hide the place being typed. Later queries narrow what is already on
    // screen.
    const scoped = firstQuery
      ? scopeToNearestCluster(q, hits, region ? boundsCentre(region) : null)
      : scopeHits(q, hits, region);
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
      setPoiLoading(false);
      if (usePlottingStore.getState().searchActive) {
        // Deleting back below the trigger ends the session, but the characters
        // still under the caret stay: only the answer is cleared.
        preserveQueryRef.current = true;
        clearSearchSession();
      }
      return;
    }
    let cancelled = false;
    // One controller per query: the cleanup aborts the in-flight request when
    // the plotter types again, so a slow answer cannot overwrite a newer one.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      // The session starts when the query fires, never on focus: focusing or
      // typing a partial query must not rearrange the workspace.
      setSearchActive(true);
      // A new query replaces the old answer entirely: old rows and any old
      // status go, and the plate shows its loading state until the new answer.
      setPoiCandidates([]);
      setPoiHoverId(null);
      setPoiSearch(q, null);
      setPoiLoading(true);
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
        if (!cancelled) setPoiLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
    // Keyed to the query only: the store actions are stable, and `runQuery`
    // reads the camera at call time, so including their identities would
    // re-run (and re-bill) the search on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // A session ended from outside this component (the panel's Esc, a route
  // switch, a place added as a stop) clears the text with it, so the input
  // never shows a query that is no longer live. When this component ended the
  // session itself to preserve typing, the characters stay.
  useEffect(() => {
    if (searchActive) return;
    lastSearchRef.current = null;
    if (!preserveQueryRef.current) setQuery("");
    preserveQueryRef.current = false;
  }, [searchActive]);

  /** Re-runs the last query at the camera's new centre, without moving the map. */
  const runAreaSearch = async () => {
    const last = lastSearchRef.current;
    if (!last) return;
    // A re-search is still a query in flight: clear the old answer and show the
    // plate's loading state until the new one lands.
    setPoiCandidates([]);
    setPoiHoverId(null);
    setPoiSearch(last.query, null);
    setPoiLoading(true);
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
      setPoiLoading(false);
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
    !poiLoading &&
    shouldOfferAreaSearch(mapViewport, lastSearchRef.current);

  return (
    <div className="pointer-events-auto z-30 ml-2 flex items-start gap-4">
      {/* Field width = context plate width minus its 8 px insets, so when the
          results plate reveals behind it the two edges line up and the field
          reads as the plate's own header row. */}
      <div
        className="bg-background relative"
        style={{ width: WORKSPACE_GEOMETRY.contextCol - 16 }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              exitSearch();
            }
          }}
          placeholder="Search for a place…"
          aria-label="Search for a place"
          aria-keyshortcuts="Meta+K Control+K"
          title="Search for a place (⌘K)"
          data-poi-search-input
          className="h-9 rounded-sm pr-8 pl-8"
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
          className="border-border bg-background hover:bg-muted flex h-9 items-center gap-1.5 rounded-sm border px-3 text-xs font-medium whitespace-nowrap"
        >
          <MapPinned className="size-3.5" />
          Search this area
        </button>
      )}
    </div>
  );
}
