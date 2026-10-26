import type {
  CoordinatePair,
  GeocodeSuggestion,
  GeocodeWarning,
} from "@komyuter/shared";
import { api } from "@/lib/api";

/** What the suggest half of the proxy answers: rows plus why there are none. */
export interface SuggestResponse {
  suggestions: GeocodeSuggestion[];
  warning: GeocodeWarning;
}

/** What the resolve half answers for one chosen row. */
export interface ResolveResponse {
  location: CoordinatePair | null;
  warning: GeocodeWarning;
}

/**
 * Place search through the admin Mapbox proxy (issue #16).
 *
 * Two calls, because Mapbox's Search Box API splits them: `suggest` returns
 * names and ids, `retrieve` turns the id the plotter picked into coordinates.
 * Coordinates are therefore only paid for on selection.
 *
 * The browser used to call Nominatim directly, which the production CSP's
 * `connect-src` refused, so search was dead in every deployed build. Both calls
 * go to the same origin as the rest of the admin API, so no CSP directive
 * changed and `MAPBOX_SECRET_TOKEN` never reaches the client.
 *
 * `warning` is part of a *successful* answer by design (`no_token`,
 * `upstream_error`): the caller can explain why the list is empty instead of
 * showing a generic failure. Only a real transport/HTTP failure rejects.
 */
export async function suggestPlaces(
  query: string,
  session: string,
  signal?: AbortSignal,
  limit = 6,
): Promise<SuggestResponse> {
  const { data } = await api.get<SuggestResponse>("/api/admin/mapbox/geocode", {
    params: { q: query, limit, session },
    signal,
  });
  return {
    suggestions: data?.suggestions ?? [],
    warning: data?.warning ?? null,
  };
}

/** Resolves one suggestion id into a `[lng, lat]` point. */
export async function resolvePlace(
  id: string,
  session: string,
  signal?: AbortSignal,
): Promise<ResolveResponse> {
  const { data } = await api.get<ResolveResponse>(
    "/api/admin/mapbox/geocode/resolve",
    { params: { id, session }, signal },
  );
  return {
    location: data?.location ?? null,
    warning: data?.warning ?? null,
  };
}
