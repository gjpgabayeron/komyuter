import { useMemo, useState } from "react";
import type { RouteSummary } from "./routesApi";

export type RouteStatusFilter = "all" | "active" | "inactive";

export function useRouteFilter(routes: RouteSummary[]) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RouteStatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = routes;
    if (statusFilter === "active")
      rows = rows.filter((route) => route.is_active);
    if (statusFilter === "inactive")
      rows = rows.filter((route) => !route.is_active);
    if (!q) return rows;
    return rows.filter(
      (route) =>
        route.name.toLowerCase().includes(q) ||
        route.short_name.toLowerCase().includes(q),
    );
  }, [query, statusFilter, routes]);

  return { query, setQuery, statusFilter, setStatusFilter, filtered };
}
