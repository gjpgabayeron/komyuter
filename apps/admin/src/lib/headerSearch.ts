export interface SearchableRoute {
  name: string;
  short_name: string;
}

export interface SearchableDetour {
  label: string;
  detour_stops: readonly { name: string }[];
}

function matches(query: string, ...values: string[]): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return values.some((value) => value.toLowerCase().includes(needle));
}

/** Route popover search: name or short code. */
export function filterRoutes<T extends SearchableRoute>(
  routes: readonly T[],
  query: string,
): T[] {
  return routes.filter((route) => matches(query, route.name, route.short_name));
}

/** Branch popover search: detour label or any of its stop names. */
export function filterDetours<T extends SearchableDetour>(
  detours: readonly T[],
  query: string,
): T[] {
  return detours.filter((detour) =>
    matches(
      query,
      detour.label,
      ...detour.detour_stops.map((stop) => stop.name),
    ),
  );
}
