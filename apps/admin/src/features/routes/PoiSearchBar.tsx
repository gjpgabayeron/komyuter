import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  buildNominatimUrl,
  parseNominatimResults,
  type PoiResult,
} from "@/lib/poiSearch";
import { useMap } from "react-map-gl/maplibre";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

/**
 * Floating POI search bar on the top of the map, adjacent to the left panel.
 * Geocodes via Nominatim (keyless, biased to the Iloilo region), flies the map
 * to the selected place, and places a temporary marker (store.poi) that every
 * other map interaction dismisses.
 */
export function PoiSearchBar() {
  const setPoi = usePlottingStore((s) => s.setPoi);
  // Stable ref-like object from react-map-gl; `current` is read at event
  // time (never captured at render) so a late-mounted map still flies.
  const mapRef = useMap();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoiResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(buildNominatimUrl(q));
        if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
        const json = (await res.json()) as unknown;
        if (cancelled) return;
        setResults(parseNominatimResults(json));
        setOpen(true);
      } catch {
        if (!cancelled) {
          setResults([]);
          setFailed(true);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const select = (result: PoiResult) => {
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
    setFailed(false);
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
            if (results.length > 0 || failed) setOpen(true);
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
          {!loading && failed && (
            <li className="text-muted-foreground px-3 py-2 text-xs">
              Search is unavailable right now. Try again.
            </li>
          )}
          {!loading && !failed && results.length === 0 && (
            <li className="text-muted-foreground px-3 py-2 text-xs">
              No places found.
            </li>
          )}
          {!loading &&
            !failed &&
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
