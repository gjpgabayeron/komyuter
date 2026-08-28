import { Eye, EyeOff, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  useDirectionsQuery,
  useDetoursQuery,
  useDirectionStopsQuery,
} from "@/features/routes/useRouteQueries";
import {
  DEFAULT_ROUTE_COLOR,
  detourLineColorFor,
} from "@/features/routes/routeColors";
import { useDetourStore } from "./detourStore";
import { buildDetourTarget } from "./target";

/**
 * The **Alternative routes** list — now a dedicated bottom-left sidebar card.
 *
 * Rows are minimal: palette chip + label + eye (map visibility). FOCUSING a
 * detour happens by clicking the row (opens it in the editor — properties
 * rail) or by clicking one of its stop markers on the map. Activation is a
 * detached concern: the active switch lives in the detour's properties panel.
 * Add / empty / error states are explicit (FR-018).
 */
export function DetourList({ directionId }: { directionId: string }) {
  const routeId = usePlottingStore((s) => s.routeId);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const detoursQuery = useDetoursQuery(directionId);
  const { data: directions } = useDirectionsQuery(routeId);
  const { data: directionStops } = useDirectionStopsQuery(directionId);
  const toggleDetourVisibility = useDetourStore(
    (s) => s.toggleDetourVisibility,
  );
  const hiddenDetourIds = useDetourStore((s) => s.hiddenDetourIds);

  const direction =
    directions?.find((d) => d.direction_id === directionId) ?? null;

  const detours = detoursQuery.data ?? [];

  /** Focuses a saved detour: arms the Add tool (placement), opens the editor. */
  const focusDetour = (detourIndex: number) => {
    const detour = detours[detourIndex];
    if (!direction || !detour) return;
    useDetourStore.getState().openEdit(
      detour,
      buildDetourTarget(
        direction,
        routeMeta?.name ?? "Route",
        detours.length,
        (directionStops ?? []).map((stop) => ({
          stop_id: stop.stop_id,
          name: stop.name,
          location: stop.location.coordinates,
        })),
      ),
    );
  };

  const openNew = () => {
    if (!direction) return;
    useDetourStore.getState().openNew(
      buildDetourTarget(
        direction,
        routeMeta?.name ?? "Route",
        detours.length,
        (directionStops ?? []).map((stop) => ({
          stop_id: stop.stop_id,
          name: stop.name,
          location: stop.location.coordinates,
        })),
      ),
    );
  };

  return (
    <section aria-label="Alternative routes">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Alternative routes</SectionLabel>
        {detours.length > 0 && (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {detours.length}
          </span>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        {detoursQuery.isLoading && (
          <p className="text-muted-foreground text-xs">Loading detours…</p>
        )}

        {detoursQuery.isError && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-destructive text-xs">Could not load detours.</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => void detoursQuery.refetch()}
            >
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        )}

        {!detoursQuery.isLoading &&
          !detoursQuery.isError &&
          detours.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No detours yet — add the first alternative route.
            </p>
          )}

        {detours.map((detour, index) => {
          const hidden = hiddenDetourIds.includes(detour.detour_id);
          return (
            <div
              key={detour.detour_id}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                detour.is_active
                  ? "border-border"
                  : "border-border/50 bg-muted/40"
              }`}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: detourLineColorFor(
                    routeMeta?.color ?? DEFAULT_ROUTE_COLOR,
                    detour.detour_id,
                  ),
                }}
              />
              <button
                type="button"
                onClick={() => focusDetour(index)}
                aria-label={`Focus ${detour.label}`}
                className={`min-w-0 flex-1 truncate text-left text-xs hover:underline ${
                  detour.is_active ? "" : "text-muted-foreground line-through"
                }`}
                title={detour.label}
              >
                {detour.label}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${hidden ? "Show" : "Hide"} ${detour.label} on the map`}
                className="text-muted-foreground size-6"
                onClick={() => toggleDetourVisibility(detour.detour_id)}
              >
                {hidden ? (
                  <EyeOff className="size-3" />
                ) : (
                  <Eye className="size-3" />
                )}
              </Button>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full justify-center gap-1 text-xs"
          onClick={openNew}
          disabled={!direction || detoursQuery.isLoading}
        >
          <Plus className="size-3" /> Add alternative route
        </Button>
      </div>
    </section>
  );
}
