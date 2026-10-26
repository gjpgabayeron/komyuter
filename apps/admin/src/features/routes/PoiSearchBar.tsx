import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { GeocodeHit } from "@komyuter/shared";
import { Input } from "@/components/ui/input";
import { usePlottingStore } from "@/lib/plottingStore";
import { searchPlaces } from "./geocodeApi";
import { isConfident } from "./poiConfidence";

const SEARCH_DEBOUNCE_MS = 350;
/** Hover preview waits a beat, so sweeping the list does not thrash the camera. */
const HOVER_PREVIEW_MS = 90;
const MIN_QUERY_LENGTH = 3;

/** Why the dropdown is empty — the proxy's warning codes plus transport failure. */
type EmptyReason = "no_token" | "upstream_error" | "request_failed" | null;

const EMPTY_COPY: Record<Exclude<EmptyReason, null>, string> = {
  no_token:
    "Place search is off — no Mapbox token is configured on the server.",
  upstream_error: "Search is unavailable right now. Try again.",
  request_failed: "Search is unavailable right now. Try again.",
};

/** A superseded keystroke aborts its request; that is not a user-facing failure. */
function isAbort(error: unknown): boolean {
  const problem = error as { code?: string; name?: string } | null;
  return problem?.code === "ERR_CANCELED" || problem?.name === "CanceledError";
}

/** One billing session per mounted pill, as Mapbox's Search Box expects. */
function createSessionId(): string {
  const maybeCrypto = globalThis.crypto as Crypto | undefined;
  if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
    return maybeCrypto.randomUUID();
  }
  return `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Floating POI search bar on the top of the map, adjacent to the left panel.
 *
 * One call to the admin Mapbox proxy returns located candidates, so search stays
 * cheap while typing: nothing is requested under three characters, a keystroke
 * waits 350 ms before it is sent, and the previous request is aborted rather
 * than allowed to race its successor.
 *
 * The map itself is moved by `PoiFocuser`, which lives inside `<Map>`: this
 * component renders in the workspace chrome, where `useMap()` resolves to
 * nothing, so it requests the camera through the store instead.
 */
export function PoiSearchBar() {
  const setPoi = usePlottingStore((s) => s.setPoi);
  const requestPoiFocus = usePlottingStore((s) => s.requestPoiFocus);
  const setPoiCandidates = usePlottingStore((s) => s.setPoiCandidates);
  const setPoiHoverId = usePlottingStore((s) => s.setPoiHoverId);
  const poiHoverId = usePlottingStore((s) => s.poiHoverId);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emptyReason, setEmptyReason] = useState<EmptyReason>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string>(createSessionId());
  const hoverTimerRef = useRef<number | null>(null);
  // Picking a row writes its name into the input; that must not re-run a search
  // and re-open the list the pick just closed.
  const suppressNextSearchRef = useRef(false);

  useEffect(() => {
    const q = query.trim();
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      setEmptyReason(null);
      return;
    }
    let cancelled = false;
    // One controller per query: the cleanup aborts the in-flight request when
    // the plotter types again, so a slow answer cannot overwrite a newer one.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setEmptyReason(null);
      try {
        const { results: hits, warning } = await searchPlaces(
          q,
          sessionRef.current,
          controller.signal,
        );
        if (cancelled) return;
        setResults(hits);
        setEmptyReason(warning);
        if (isConfident(q, hits)) {
          // One unambiguous answer — mark it and move, without asking. The list
          // stays shut, so the plotter sees the place, not a menu of one.
          setPoiCandidates([]);
          setPoiHoverId(null);
          setPoi(hits[0].location);
          requestPoiFocus({ kind: "point", location: hits[0].location });
          setOpen(false);
        } else {
          // A real choice: put every candidate on the map, frame them all, and
          // let hovering narrow it down.
          setPoiCandidates(hits);
          setPoiHoverId(null);
          requestPoiFocus({
            kind: "bounds",
            locations: hits.map((hit) => hit.location),
          });
          setOpen(true);
        }
      } catch (error) {
        if (cancelled || isAbort(error)) return;
        setResults([]);
        setEmptyReason("request_failed");
        setOpen(true);
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

  // A pending hover preview must not fire after the pill unmounts.
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    },
    [],
  );

  const select = (hit: GeocodeHit) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // Picking ends the search: one marker and a flight, no candidate dots, no
    // highlight. Placing an actual stop stays a deliberate map click.
    setPoiCandidates([]);
    setPoiHoverId(null);
    setPoi(hit.location);
    requestPoiFocus({ kind: "point", location: hit.location });
    suppressNextSearchRef.current = true;
    setQuery(hit.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  /** Highlights a row and, after a beat, flies the map to its candidate. */
  const previewOn = (hit: GeocodeHit) => {
    setPoiHoverId(hit.id);
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      requestPoiFocus({ kind: "point", location: hit.location });
    }, HOVER_PREVIEW_MS);
  };

  /** Leaving the list drops the highlight and re-frames the whole candidate set. */
  const previewOff = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPoiHoverId(null);
    if (results.length > 0) {
      requestPoiFocus({
        kind: "bounds",
        locations: results.map((hit) => hit.location),
      });
    }
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setEmptyReason(null);
    setPoi(null);
    inputRef.current?.focus();
  };

  const firstResult = results[0];
  const currentIndex = results.findIndex((hit) => hit.id === poiHoverId);

  /** Arrow keys walk the list, wrapping at both ends; hover preview follows. */
  const stepHighlight = (delta: number) => {
    if (results.length === 0) return;
    const next =
      currentIndex === -1
        ? delta > 0
          ? 0
          : results.length - 1
        : (currentIndex + delta + results.length) % results.length;
    previewOn(results[next]);
  };

  return (
    <div className="pointer-events-auto z-30 w-72">
      <div className="bg-background relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length > 0 || emptyReason) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              stepHighlight(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              stepHighlight(-1);
            } else if (event.key === "Enter") {
              const hit = results[currentIndex] ?? firstResult;
              if (hit) {
                event.preventDefault();
                select(hit);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
              setPoiHoverId(null);
              inputRef.current?.blur();
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
            onClick={clear}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <ul
          onMouseLeave={previewOff}
          className="overlay-scrollbar mt-1 max-h-80 overflow-y-auto rounded-lg border bg-white"
        >
          {loading && (
            <li className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs">
              <Loader2 className="size-3 animate-spin" />
              Searching…
            </li>
          )}
          {!loading && emptyReason !== null && (
            <li className="text-muted-foreground px-3 py-2 text-xs">
              {EMPTY_COPY[emptyReason]}
            </li>
          )}
          {!loading && emptyReason === null && results.length === 0 && (
            <li className="text-muted-foreground px-3 py-2 text-xs">
              No places found.
            </li>
          )}
          {!loading &&
            results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => select(result)}
                  onMouseEnter={() => previewOn(result)}
                  onFocus={() => previewOn(result)}
                  className={
                    poiHoverId === result.id
                      ? "bg-muted flex w-full items-center gap-2 px-3 py-2 text-left"
                      : "hover:bg-muted focus:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left"
                  }
                >
                  <span className="min-w-0">
                    <span className="text-foreground block truncate text-sm font-medium">
                      {result.name}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {result.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
