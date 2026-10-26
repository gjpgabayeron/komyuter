import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { GeocodeSuggestion } from "@komyuter/shared";
import { Input } from "@/components/ui/input";
import { usePlottingStore } from "@/lib/plottingStore";
import { resolvePlace, suggestPlaces } from "./geocodeApi";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

/** Why the dropdown is empty — the proxy's warning codes plus transport failure. */
type EmptyReason =
  "no_token" | "upstream_error" | "request_failed" | "unresolved" | null;

const EMPTY_COPY: Record<Exclude<EmptyReason, null>, string> = {
  no_token:
    "Place search is off — no Mapbox token is configured on the server.",
  upstream_error: "Search is unavailable right now. Try again.",
  request_failed: "Search is unavailable right now. Try again.",
  unresolved: "Could not place that result. Try another search.",
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
 * Search goes through the admin Mapbox proxy (`./geocodeApi`): `suggest` lists
 * places by name, and the row the plotter picks is resolved into coordinates
 * only then. That two-step split is what makes POI search work at all here —
 * the classic geocoding endpoint this replaced could not find a mall in Iloilo
 * (issue #16 follow-up).
 *
 * The map itself is flown by `PoiFocuser`, which lives inside `<Map>`: this
 * component renders in the workspace chrome, where `useMap()` resolves to
 * nothing, so it requests the focus through the store instead.
 */
export function PoiSearchBar() {
  const setPoi = usePlottingStore((s) => s.setPoi);
  const requestPoiFocus = usePlottingStore((s) => s.requestPoiFocus);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [emptyReason, setEmptyReason] = useState<EmptyReason>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string>(createSessionId());

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
        const { suggestions, warning } = await suggestPlaces(
          q,
          sessionRef.current,
          controller.signal,
        );
        if (cancelled) return;
        setResults(suggestions);
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

  const select = async (suggestion: GeocodeSuggestion) => {
    setResolving(true);
    try {
      const { location, warning } = await resolvePlace(
        suggestion.id,
        sessionRef.current,
      );
      if (!location) {
        setEmptyReason(warning === "no_token" ? "no_token" : "unresolved");
        setOpen(true);
        return;
      }
      setPoi(location);
      requestPoiFocus(location);
      setQuery(suggestion.name);
      setOpen(false);
      inputRef.current?.blur();
    } catch {
      setEmptyReason("request_failed");
      setOpen(true);
    } finally {
      setResolving(false);
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
              void select(firstResult);
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
          {(loading || resolving) && (
            <li className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs">
              <Loader2 className="size-3 animate-spin" />
              {resolving ? "Locating…" : "Searching…"}
            </li>
          )}
          {!loading && !resolving && emptyReason !== null && (
            <li className="text-muted-foreground px-3 py-2 text-xs">
              {EMPTY_COPY[emptyReason]}
            </li>
          )}
          {!loading &&
            !resolving &&
            emptyReason === null &&
            results.length === 0 && (
              <li className="text-muted-foreground px-3 py-2 text-xs">
                No places found.
              </li>
            )}
          {!loading &&
            !resolving &&
            results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => void select(result)}
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
