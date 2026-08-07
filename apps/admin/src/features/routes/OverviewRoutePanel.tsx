import { Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlottingStore } from "@/lib/plottingStore";
import { formatDistance, polylineDistanceMeters } from "@/lib/coords";
import { useFareConfigsQuery } from "@/features/fares/queries";
import { formatTimestamp } from "./format";
import { useRouteQuery } from "./useRouteQueries";

/**
 * Right-side panel that slides in when a route is focused in overview mode:
 * route-level summary + an "Edit route" button that enters the editing
 * workspace exactly as if the route had been opened directly.
 */
export function OverviewRoutePanel() {
  const overviewRouteId = usePlottingStore((s) => s.overviewRouteId);
  const setOverviewRouteId = usePlottingStore((s) => s.setOverviewRouteId);
  const routeQuery = useRouteQuery(overviewRouteId);
  const fareQuery = useFareConfigsQuery();

  if (overviewRouteId === null) return null;

  const route = routeQuery.data;
  const base = route?.directions[0];
  const distance = base?.base_polyline
    ? polylineDistanceMeters(base.base_polyline)
    : null;
  const fareLabel =
    fareQuery.data?.find((c) => c.fare_config_id === route?.fare_config_id)
      ?.label ?? null;

  return (
    <aside className="animate-in slide-in-from-right-2 absolute top-3 right-3 z-10 w-72 rounded-lg border bg-white p-3 duration-150">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
          {route?.name ?? "Route"}
        </h2>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close route preview"
          onClick={() => setOverviewRouteId(null)}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-[3px] border border-black/10"
            style={{ backgroundColor: route?.color ?? "#1B6DB2" }}
          />
          <span className="text-muted-foreground tabular-nums">
            {route?.short_name ?? "—"}
          </span>
          {route && (
            <Badge
              variant={route.is_active ? "default" : "outline"}
              className="h-4 px-1 text-[10px] font-medium"
            >
              {route.is_active ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground flex items-center justify-between gap-2">
          <span>Fare config</span>
          <span className="text-foreground truncate">{fareLabel ?? "—"}</span>
        </div>
        <div className="text-muted-foreground flex items-center justify-between gap-2">
          <span>Estimated distance</span>
          <span className="text-foreground tabular-nums">
            {distance !== null ? formatDistance(distance, "km") : "—"}
          </span>
        </div>
        {route && (
          <>
            <div className="text-muted-foreground flex items-center justify-between gap-2">
              <span>Created</span>
              <span className="text-foreground tabular-nums">
                {formatTimestamp(route.created_at)}
              </span>
            </div>
            <div className="text-muted-foreground flex items-center justify-between gap-2">
              <span>Last updated</span>
              <span className="text-foreground tabular-nums">
                {formatTimestamp(route.updated_at)}
              </span>
            </div>
          </>
        )}
      </dl>

      <Button
        size="sm"
        className="mt-3 w-full"
        onClick={() => usePlottingStore.getState().openRoute(overviewRouteId)}
      >
        <Pencil className="size-3.5" />
        Edit route
      </Button>
    </aside>
  );
}
