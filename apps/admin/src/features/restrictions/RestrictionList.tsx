import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/shared/Plate";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  useDetoursQuery,
  useDirectionsQuery,
  useRestrictionsQuery,
} from "@/features/routes/useRouteQueries";
import {
  RESTRICTION_KIND_LABELS,
  restrictionRangeLabel,
} from "./restrictionHelpers";
import { inheritedMainRestrictions } from "./inheritance";
import { useRestrictionStore } from "./restrictionStore";

/**
 * Left rail while restriction mode is active. The stop list is deliberately
 * replaced: restrictions are ranges of the saved Direction polyline, not
 * stop-owned facts, and the two should not compete for the same context.
 */
export function RestrictionList() {
  const routeId = usePlottingStore((s) => s.routeId);
  const directionId = usePlottingStore((s) => s.directionId);
  const draftDirty = usePlottingStore((s) => s.draftDirty);
  const { data: directions } = useDirectionsQuery(routeId);
  const restrictionsQuery = useRestrictionsQuery(directionId);
  const detoursQuery = useDetoursQuery(directionId);
  const selectedId = useRestrictionStore((s) => s.selectedId);
  const detourId = useRestrictionStore((s) => s.detourId);
  const select = useRestrictionStore((s) => s.select);
  const startNew = useRestrictionStore((s) => s.startNew);
  const setTool = usePlottingStore((s) => s.setTool);

  const direction =
    directions?.find((item) => item.direction_id === directionId) ?? null;
  const detour =
    detoursQuery.data?.find((item) => item.detour_id === detourId) ?? null;
  const restrictions = restrictionsQuery.data ?? [];
  const scoped = restrictions.filter(
    (restriction) => restriction.detour_id === detourId,
  );
  const inherited =
    detour && direction
      ? inheritedMainRestrictions(direction.base_polyline, detour, restrictions)
      : [];
  const rows = detourId ? [...inherited, ...scoped] : scoped;
  const inheritedIds = new Set(
    inherited.map((restriction) => restriction.restriction_id),
  );
  const canEdit = !draftDirty;

  return (
    <nav
      aria-label="Restrictions"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      <Plate
        padded="sm"
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-y-0 border-l-0"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 px-1 pb-1.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Restrictions</p>
            <p className="text-muted-foreground truncate text-xs">
              {detourId ? (detour?.label ?? "Alternative route") : "Main route"}
            </p>
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {rows.length}
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          className="mb-1.5 w-full"
          onClick={() => {
            setTool("add");
            startNew();
          }}
          disabled={!canEdit}
        >
          <Plus className="size-3.5" />
          New restriction
        </Button>

        {draftDirty ? (
          <p role="status" className="text-muted-foreground px-1 pb-1 text-xs">
            Save the route before editing restrictions — ranges refer to the
            saved path.
          </p>
        ) : null}

        <div className="overlay-scrollbar -mr-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
          {restrictionsQuery.isLoading ? (
            <p className="text-muted-foreground px-1 py-2 text-xs">
              Loading restrictions…
            </p>
          ) : null}
          {restrictionsQuery.isError ? (
            <p className="text-destructive px-1 py-2 text-xs">
              Could not load restrictions.
            </p>
          ) : null}
          {!restrictionsQuery.isLoading &&
          !restrictionsQuery.isError &&
          rows.length === 0 ? (
            <p className="text-muted-foreground px-1 py-2 text-xs">
              No restrictions yet. Add one and pick two points on the route.
            </p>
          ) : null}

          {rows.map((restriction) => {
            const active = restriction.restriction_id === selectedId;
            const isInherited = inheritedIds.has(restriction.restriction_id);
            return (
              <button
                key={restriction.restriction_id}
                type="button"
                disabled={isInherited}
                onClick={() => {
                  setTool("select");
                  select(restriction);
                }}
                aria-pressed={active}
                className={
                  isInherited
                    ? "border-border bg-muted/30 w-full cursor-default rounded-sm border px-2 py-1.5 text-left opacity-70"
                    : active
                      ? "border-primary/60 bg-primary/5 w-full rounded-sm border px-2 py-1.5 text-left"
                      : "border-border hover:bg-muted/50 w-full rounded-sm border px-2 py-1.5 text-left"
                }
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">
                    {RESTRICTION_KIND_LABELS[restriction.kind]}
                  </span>
                  {isInherited ? (
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[10px] font-medium"
                    >
                      Inherited
                    </Badge>
                  ) : !restriction.is_active ? (
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[10px] font-medium"
                    >
                      Inactive
                    </Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground block truncate text-[11px]">
                  {restrictionRangeLabel(restriction)}
                </span>
              </button>
            );
          })}
        </div>
      </Plate>
    </nav>
  );
}
