import { Badge } from "@/components/ui/badge";
import { Plate } from "@/components/shared/Plate";
import { usePlottingStore } from "@/lib/plottingStore";
import { useDetourStore } from "@/features/detours/detourStore";
import {
  useDetourEditing,
  useWorkspaceAccess,
} from "@/features/auth/useCapabilities";
import { FocusPlate } from "./properties/FocusPlate";
import { RouteGroup } from "./properties/RouteGroup";
import { StopGroup } from "./properties/StopGroup";
import { DetourGroup } from "@/features/detours/DetourGroup";
import { DetourStopGroup } from "@/features/detours/DetourStopGroup";
import { useRouteQuery } from "./useRouteQueries";

/**
 * Right-side properties plate (focus / edit states). The default route view
 * keeps a "Route settings" headline so it does not repeat the route name in
 * the left plate; stops and alternatives use their own object name.
 */
export function PropertiesPanel() {
  const { readOnly } = useWorkspaceAccess();
  const detourEditing = useDetourEditing();
  const routeId = usePlottingStore((s) => s.routeId);
  const focusedRouteId = usePlottingStore((s) => s.focusedRouteId);
  const selection = usePlottingStore((s) => s.selection);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const stops = usePlottingStore((s) => s.stops);
  const detourOpen = useDetourStore((s) => s.open);
  const detourLabel = useDetourStore((s) => s.label);
  const detourTarget = useDetourStore((s) => s.target);
  const detourStops = useDetourStore((s) => s.detourStops);
  const selectedDetourStopId = useDetourStore((s) => s.selectedDetourStopId);
  const routeQuery = useRouteQuery(routeId);
  const route = routeQuery.data;

  if (routeId !== null) {
    const activeStop =
      selection.type === "stop"
        ? (stops.find((stop) => stop.id === selection.stopId) ?? null)
        : null;
    const activeDetourStop = selectedDetourStopId
      ? (detourStops.find((stop) => stop.id === selectedDetourStopId) ?? null)
      : null;
    const detourStopIndex = activeDetourStop
      ? detourStops.findIndex((stop) => stop.id === activeDetourStop.id) + 1
      : 0;

    let title = "Route settings";
    let context = route
      ? [route.short_name, `${route.directions.length} directions`]
          .filter(Boolean)
          .join(" · ")
      : "Loading route…";
    let status: boolean | null =
      routeMeta?.isActive ?? route?.is_active ?? null;

    if (activeStop) {
      const stopIndex = stops.findIndex((stop) => stop.id === activeStop.id);
      title = activeStop.name;
      context = `Stop ${stopIndex + 1} of ${stops.length}`;
      status = null;
    } else if (detourOpen && activeDetourStop) {
      title = activeDetourStop.name;
      context = `Detour stop ${detourStopIndex} · detour-only`;
      status = null;
    } else if (detourOpen) {
      title = detourLabel.trim() || "Untitled alternative";
      context = detourTarget
        ? `${detourTarget.routeName} · ${detourTarget.directionLabel}`
        : "Alternative route";
      status = null;
    }

    return (
      <aside
        aria-label="Route properties"
        className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      >
        <Plate
          padded="md"
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-y-0 border-r-0"
        >
          <header className="flex shrink-0 items-start justify-between gap-2 border-b pb-3">
            <div className="min-w-0">
              <h2 className="font-display text-foreground truncate text-base font-semibold">
                {title}
              </h2>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {context}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {status !== null && (
                <Badge
                  variant={status ? "default" : "outline"}
                  className="h-4 px-1 text-[10px] font-medium"
                >
                  {status ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>
          </header>

          <div className="overlay-scrollbar mt-3 -mr-3 -ml-1 min-h-0 flex-1 overflow-x-clip overflow-y-auto pr-3 pl-1">
            {detourOpen && detourEditing ? (
              selection.type === "stop" ? (
                <StopGroup readOnly={readOnly} />
              ) : selectedDetourStopId !== null ? (
                <DetourStopGroup />
              ) : (
                <DetourGroup />
              )
            ) : selection.type === "stop" ? (
              <StopGroup readOnly={readOnly} />
            ) : (
              <RouteGroup readOnly={readOnly} />
            )}
          </div>
        </Plate>
      </aside>
    );
  }
  if (focusedRouteId !== null) return <FocusPlate routeId={focusedRouteId} />;
  return null;
}
