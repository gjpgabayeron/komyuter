import type { GeocodeHit, GeocodeWarning } from "@komyuter/shared";
import { api } from "@/lib/api";

/** What the proxy answers: located candidates plus why there are none. */
export interface SearchResponse {
  results: GeocodeHit[];
  warning: GeocodeWarning;
}

/**
 * Place search through the admin Mapbox proxy (issue #16).
 *
 * One call: Search Box `forward` answers with names *and* coordinates, so the
 * pill can list candidates while the map draws every one of them and previews
 * one on hover — no per-row retrieve, no network wait on hover.
 *
 * No session id is sent: `/forward` is not part of the suggest/retrieve billing
 * pair and rejects `session_token` with a 400, which is what made every search
 * answer "Search is unavailable right now".
 *
 * The browser used to call Nominatim directly, which the production CSP's
 * `connect-src` refused, so search was dead in every deployed build. This goes
 * to the same origin as the rest of the admin API, so no CSP directive changed
 * and `MAPBOX_SECRET_TOKEN` never reaches the client.
 *
 * `warning` is part of a *successful* answer by design (`no_token`,
 * `upstream_error`): the caller can explain why the list is empty instead of
 * showing a generic failure. Only a real transport/HTTP failure rejects.
 */
export async function searchPlaces(
  query: string,
  proximity?: string,
  signal?: AbortSignal,
  limit = 6,
): Promise<SearchResponse> {
  const { data } = await api.get<SearchResponse>("/api/admin/mapbox/geocode", {
    params: { q: query, limit, ...(proximity ? { proximity } : {}) },
    signal,
  });
  return {
    results: data?.results ?? [],
    warning: data?.warning ?? null,
  };
}
