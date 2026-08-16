import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePlottingStore } from "@/lib/plottingStore";
import { formatDistance, polylineDistanceMeters } from "@/lib/coords";
import { useFareConfigsQuery } from "@/features/fares/queries";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { formatTimestamp } from "../format";
import { FareConfigSelect } from "../FareConfigSelect";
import { DEFAULT_ROUTE_COLOR, isValidHexColor } from "../routeColors";
import { useRouteQuery } from "../useRouteQueries";

export function RouteGroup() {
  const routeId = usePlottingStore((s) => s.routeId);
  const routeQuery = useRouteQuery(routeId);
  const polyline = usePlottingStore((s) => s.polyline);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const setRouteMeta = usePlottingStore((s) => s.setRouteMeta);
  const saving = usePlottingStore((s) => s.saving);
  const fareQuery = useFareConfigsQuery();
  const [unit, setUnit] = useState<"m" | "km">("m");

  const route = routeQuery.data;

  const [hexText, setHexText] = useState(
    routeMeta?.color ?? DEFAULT_ROUTE_COLOR,
  );

  // Initialize the metadata draft from the loaded route (once).
  useEffect(() => {
    if (!route || usePlottingStore.getState().routeMeta !== null) return;
    setRouteMeta({
      name: route.name,
      shortName: route.short_name,
      color: route.color ?? DEFAULT_ROUTE_COLOR,
      isActive: route.is_active,
      fareConfigId: route.fare_config_id ?? null,
    });
  }, [route, route?.route_id, setRouteMeta]);

  // Keep the hex text in sync with the live draft colour.
  useEffect(() => {
    setHexText(routeMeta?.color ?? DEFAULT_ROUTE_COLOR);
  }, [routeMeta?.color]);

  const distance = polyline ? polylineDistanceMeters(polyline) : null;
  const fareLabel =
    fareQuery.data?.find((c) => c.fare_config_id === routeMeta?.fareConfigId)
      ?.label ?? null;

  return (
    <section className="border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Route</SectionLabel>
        {route && (
          <Badge
            variant={route.is_active ? "default" : "outline"}
            className="h-4 px-1 text-[10px] font-medium"
          >
            {route.is_active ? "Active" : "Inactive"}
          </Badge>
        )}
      </div>

      <div className="mt-2.5 space-y-3.5">
        <div className="space-y-1.5">
          <SectionLabel>Route name</SectionLabel>
          <Input
            autoFocus
            value={routeMeta?.name ?? ""}
            onChange={(event) => setRouteMeta({ name: event.target.value })}
            aria-label="Route name"
            disabled={saving}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>Route code</SectionLabel>
          <Input
            value={routeMeta?.shortName ?? ""}
            onChange={(event) =>
              setRouteMeta({ shortName: event.target.value })
            }
            maxLength={10}
            aria-label="Route code"
            disabled={saving}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>Colour</SectionLabel>
          <div className="flex items-center gap-1.5">
            <label
              title="Pick a colour"
              className="border-border flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-white"
            >
              <input
                type="color"
                value={routeMeta?.color ?? DEFAULT_ROUTE_COLOR}
                onChange={(event) =>
                  setRouteMeta({ color: event.target.value })
                }
                disabled={saving}
                aria-label="Route colour"
                className="size-9 cursor-pointer border-none bg-transparent p-0"
              />
            </label>
            <Input
              value={hexText}
              onChange={(event) => {
                const value = event.target.value;
                setHexText(value);
                if (isValidHexColor(value)) setRouteMeta({ color: value });
              }}
              disabled={saving}
              aria-label="Route colour (hex)"
              aria-invalid={!isValidHexColor(hexText) && hexText.trim() !== ""}
              spellCheck={false}
              className="h-8 font-mono tabular-nums"
            />
          </div>
          {!isValidHexColor(hexText) && hexText.trim() !== "" && (
            <p role="alert" className="text-destructive text-xs">
              Not a valid colour — use six hex digits, e.g. #1B6DB2.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <SectionLabel>Fare config</SectionLabel>
          <FareConfigSelect
            value={routeMeta?.fareConfigId ?? null}
            onChange={(fareConfigId) => setRouteMeta({ fareConfigId })}
            disabled={saving}
          />
          {fareLabel && (
            <p className="text-muted-foreground text-xs">{fareLabel}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Distance</SectionLabel>
            <div
              role="group"
              aria-label="Distance unit"
              className="bg-muted flex items-center rounded-lg p-0.5"
            >
              {(["m", "km"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    "rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium",
                    unit === u
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm tabular-nums">
            {distance !== null ? formatDistance(distance, unit) : "—"}
            <span className="text-muted-foreground text-xs">
              {" "}
              (from plotted path)
            </span>
          </p>
        </div>
        <div className="space-y-1.5">
          <SectionLabel>Last updated</SectionLabel>
          <p className="text-sm tabular-nums">
            {route ? formatTimestamp(route.updated_at) : "—"}
          </p>
        </div>
      </div>
    </section>
  );
}
