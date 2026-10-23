import type { GeocodeResult, GeocodeWarning } from "@komyuter/shared";
import { api } from "@/lib/api";

/** What the proxy answers: hits plus the reason there are none. */
export interface GeocodeResponse {
  results: GeocodeResult[];
  warning: GeocodeWarning;
}

/**
 * Place search through the admin Mapbox geocoding proxy (issue #16).
 *
 * The browser used to call Nominatim directly, which the production CSP's
 * `connect-src` refused — so search was dead in every deployed build. This call
 * goes to the same origin as the rest of the admin API (`/api/admin/...`), so
 * no CSP directive has to change, and `MAPBOX_SECRET_TOKEN` never reaches the
 * client.
 *
 * `warning` is part of a *successful* answer by design (`no_token`,
 * `upstream_error`): the caller can explain why the list is empty instead of
 * showing a generic failure. Only a real transport/HTTP failure rejects.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  limit = 6,
): Promise<GeocodeResponse> {
  const { data } = await api.get<GeocodeResponse>("/api/admin/mapbox/geocode", {
    params: { q: query, limit },
    signal,
  });
  return {
    results: data?.results ?? [],
    warning: data?.warning ?? null,
  };
}
