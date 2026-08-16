import { usePlottingStore } from "@/lib/plottingStore";
import { Plate } from "@/components/shared/Plate";
import { FocusPlate } from "./properties/FocusPlate";
import { RouteGroup } from "./properties/RouteGroup";
import { StopGroup } from "./properties/StopGroup";

/**
 * Right-side properties plate (focus / edit states) — one of the two
 * right-column variants:
 * - focus: the FocusPlate — a read-only peek at a route picked from the map.
 * - edit: the editable Properties panel (route metadata + stop editor).
 * Returns null in overview/empty (the column track is hidden then).
 */
export function PropertiesPanel() {
  const routeId = usePlottingStore((s) => s.routeId);
  const focusedRouteId = usePlottingStore((s) => s.focusedRouteId);
  const selection = usePlottingStore((s) => s.selection);

  if (routeId !== null) {
    return (
      <aside
        aria-label="Route properties"
        className="flex min-h-0 w-full flex-col overflow-hidden"
      >
        <Plate
          padded="md"
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        >
          <header className="flex shrink-0 items-center justify-between gap-2">
            <h2 className="font-display text-foreground text-sm font-semibold">
              Properties
            </h2>
          </header>
          <div className="overlay-scrollbar mt-2 min-h-0 flex-1 overflow-x-clip overflow-y-auto">
            {selection.type === "stop" ? <StopGroup /> : <RouteGroup />}
          </div>
        </Plate>
      </aside>
    );
  }
  if (focusedRouteId !== null) return <FocusPlate routeId={focusedRouteId} />;
  return null;
}
