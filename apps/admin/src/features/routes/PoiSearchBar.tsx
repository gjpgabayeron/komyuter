import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { GeocodeResult } from "@komyuter/shared";
import { Input } from "@/components/ui/input";
import { usePlottingStore } from "@/lib/plottingStore";
import { searchPlaces } from "./geocodeApi";
import { useMap } from "react-map-gl/maplibre";

const SEARCH_DEBOUNCE_MS = 350;
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

/**
 * Floating POI search bar on the top of the map, adjacent to the left panel.
 *
 * Search goes through the admin Mapbox geocoding proxy (`./geocodeApi`), so the
 * request is same-origin and the production CSP needs no exception (issue #16 —
 * the previous client-side Nominatim call was blocked by `connect-src`). Flies
 * the map to the selected place and places a temporary marker (store.poi) that
 * every other map interaction dismisses.
 */
export function PoiSearchBar() {
  const setPoi = usePlottingStore((s) => s.setPoi);
  // Stable ref-like object from react-map-gl; `current` is read at event
  // time (never captured at render) so a late-mounted map still flies.
  const mapRef = useMap();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emptyReason, setEmptyReason] = useState<EmptyReason>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
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
          controller.signal,
        );
        if (cancelled) return;
        setResults(hits);
        setEmptyReason(warning);
        setOpen(true);
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

  const select = (result: GeocodeResult) => {
    setPoi(result.location);
    mapRef.current?.flyTo({ center: result.location, zoom: 15, duration: 600 });
    setQuery(result.name);
    setOpen(false);
    inputRef.current?.blur();
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
            if (event.key === "Enter" && firstResult) {
              event.preventDefault();
              select(firstResult);
            } else if (event.key === "Escape") {
              setOpen(false);
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
        <ul className="overlay-scrollbar mt-1 max-h-80 overflow-y-auto rounded-lg border bg-white">
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
                  className="hover:bg-muted focus:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left"
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
