import { Eye, EyeOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelState } from "@/components/shared/PanelState";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { label } from "@/lib/labels";
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
    <section aria-label={label("detours")}>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{label("detours")}</SectionLabel>
        {detours.length > 0 && (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {detours.length}
          </span>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        <PanelState
          loading={detoursQuery.isLoading}
          error={detoursQuery.isError}
          errorMessage="Could not load alternative routes."
          onRetry={() => void detoursQuery.refetch()}
          empty={
            !detoursQuery.isLoading &&
            !detoursQuery.isError &&
            detours.length === 0
          }
          emptyTitle="No alternative routes yet"
          emptyHint="Add the first one below."
          className="px-0 py-2"
        >
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
        </PanelState>
        {/* The Add affordance must stay visible in EVERY state (loading /
            error / empty / loaded) — PanelState's early-return branches do
            not render children, so the button lives OUTSIDE the children
            slot. It is disabled while loading / without a direction, never
            removed (FR-014). */}
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
