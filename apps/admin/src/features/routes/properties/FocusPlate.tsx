import { useMemo } from "react";
import { Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlottingStore } from "@/lib/plottingStore";
import { readOverviewCache } from "@/lib/overviewCache";
import { Plate } from "@/components/shared/Plate";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { useRoutesQuery } from "../useRouteQueries";
import { label } from "@/lib/labels";
import { displayValue } from "../format";

/**
 * The focus plate (T2/T12) — a read-only peek at a route picked from the
 * map, in the right column. Never enters edit mode; "Edit route" is the
 * single entry point. Data comes from the already-loaded route list + the
 * overview cache — no extra network fetch, so the plate appears instantly.
 */
export function FocusPlate({ routeId }: { routeId: string }) {
  const setFocusedRouteId = usePlottingStore((s) => s.setFocusedRouteId);
  const routesQuery = useRoutesQuery();
  const route =
    routesQuery.data?.find((row) => row.route_id === routeId) ?? null;
  const stopCount = useMemo(() => {
    const row = readOverviewCache()?.find((r) => r.route_id === routeId);
    return row?.stops.length ?? null;
  }, [routeId]);

  return (
    <aside
      aria-label={`Focused route — ${route?.name ?? "route"}`}
      className="flex min-h-0 w-full flex-col overflow-hidden"
    >
      <Plate
        padded="md"
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      >
        <header className="flex shrink-0 items-center justify-between gap-2">
          <SectionLabel as="span">Route</SectionLabel>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close focus plate"
            onClick={() => setFocusedRouteId(null)}
          >
            <X className="size-3.5" />
          </Button>
        </header>
        <h2 className="font-display text-foreground mt-1 truncate text-base font-semibold">
          {route?.name ?? "…"}
        </h2>
        <div className="mt-0.5 flex items-center gap-1.5">
          {route?.short_name && (
            <span className="text-muted-foreground text-xs">
              {route.short_name}
            </span>
          )}
          {route && (
            <Badge
              variant={route.is_active ? "default" : "outline"}
              className="h-4 px-1 text-[10px] font-medium"
            >
              {route.is_active ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground text-xs">{label("stops")}</dt>
            <dd className="tabular-nums">{displayValue(stopCount)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground text-xs">Directions</dt>
            <dd className="tabular-nums">
              {displayValue(route?.direction_count)}
            </dd>
          </div>
        </dl>
        <div className="mt-auto pt-4">
          <Button
            autoFocus
            className="w-full"
            onClick={() => usePlottingStore.getState().openRoute(routeId)}
          >
            <Pencil className="size-3.5" />
            Edit route
          </Button>
        </div>
      </Plate>
    </aside>
  );
}
