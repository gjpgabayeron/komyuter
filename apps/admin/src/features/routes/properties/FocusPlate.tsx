import { useMemo } from "react";
import { Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRow, DetailSection } from "@/components/shared/DetailList";
import { Plate } from "@/components/shared/Plate";
import { readOverviewCache } from "@/lib/overviewCache";
import { usePlottingStore } from "@/lib/plottingStore";
import { useWorkspaceAccess } from "@/features/auth/useCapabilities";
import { useRoutesQuery } from "../useRouteQueries";

/**
 * The focus plate (T2/T12) — a read-only peek at a route picked from the
 * map. The whole surface is the standard details UI; Edit route is the single
 * entry point and lives outside the scrolling details.
 */
export function FocusPlate({ routeId }: { routeId: string }) {
  const { readOnly } = useWorkspaceAccess();
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
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      <Plate
        padded="md"
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-y-0 border-r-0"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b pb-3">
          <div className="min-w-0">
            <h2 className="font-display text-foreground truncate text-base font-semibold">
              {route?.name ?? "…"}
            </h2>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {route?.short_name ?? "Route"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {route && (
              <Badge
                variant={route.is_active ? "default" : "outline"}
                className="h-4 px-1 text-[10px] font-medium"
              >
                {route.is_active ? "Active" : "Inactive"}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close focus plate"
              onClick={() => setFocusedRouteId(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </header>

        <div className="overlay-scrollbar mt-3 -mr-3 min-h-0 flex-1 overflow-y-auto pr-3">
          <DetailSection className="mt-0 border-t-0 pt-0">
            <DetailRow label="Stops">{stopCount ?? "—"}</DetailRow>
            <DetailRow label="Directions">
              {route?.direction_count ?? "—"}
            </DetailRow>
          </DetailSection>
        </div>

        {!readOnly && (
          <div className="shrink-0 pt-3">
            <Button
              autoFocus
              className="w-full"
              onClick={() => usePlottingStore.getState().openRoute(routeId)}
            >
              <Pencil className="size-3.5" />
              Edit route
            </Button>
          </div>
        )}
      </Plate>
    </aside>
  );
}
