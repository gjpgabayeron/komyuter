import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { DetailRow, DetailSection } from "@/components/shared/DetailList";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { formatDistance, polylineDistanceMeters } from "@/lib/coords";
import { usePlottingStore } from "@/lib/plottingStore";
import { useFareConfigsQuery } from "@/features/fares/queries";
import { formatAttributionName } from "../attribution";
import { FareConfigSelect } from "../FareConfigSelect";
import { formatTimestamp } from "../format";
import { DEFAULT_ROUTE_COLOR, isValidHexColor } from "../routeColors";
import { useRouteQuery } from "../useRouteQueries";

export function RouteGroup({ readOnly = false }: { readOnly?: boolean }) {
  const routeId = usePlottingStore((s) => s.routeId);
  const routeQuery = useRouteQuery(routeId);
  const polyline = usePlottingStore((s) => s.polyline);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const setRouteMeta = usePlottingStore((s) => s.setRouteMeta);
  const saving = usePlottingStore((s) => s.saving);
  const fareQuery = useFareConfigsQuery();

  const route = routeQuery.data;
  const baseDirection = route?.directions[0] ?? null;

  const [hexText, setHexText] = useState(
    routeMeta?.color ?? DEFAULT_ROUTE_COLOR,
  );

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

  useEffect(() => {
    setHexText(routeMeta?.color ?? DEFAULT_ROUTE_COLOR);
  }, [routeMeta?.color]);

  const distance = polyline ? polylineDistanceMeters(polyline) : null;
  const fareLabel =
    fareQuery.data?.find((c) => c.fare_config_id === routeMeta?.fareConfigId)
      ?.label ?? null;

  return (
    <section>
      {readOnly ? (
        <DetailSection className="mt-2">
          <DetailRow label="Route name">{route?.name ?? "—"}</DetailRow>
          <DetailRow label="Route code">{route?.short_name ?? "—"}</DetailRow>
          <DetailRow label="Colour">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="border-border size-3 shrink-0 rounded-[3px] border"
                style={{ backgroundColor: route?.color ?? "transparent" }}
              />
              <span className="font-mono">{route?.color ?? "—"}</span>
            </span>
          </DetailRow>
          <DetailRow label="Fare config">
            {fareLabel ??
              (route?.fare_config_id ? route.fare_config_id : "None")}
          </DetailRow>
        </DetailSection>
      ) : (
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
                aria-invalid={
                  !isValidHexColor(hexText) && hexText.trim() !== ""
                }
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
          </div>
        </div>
      )}

      <DetailSection>
        <DetailRow label="Distance">
          {distance !== null ? formatDistance(distance, "m") : "—"}
        </DetailRow>
        {route && (
          <>
            <DetailRow label="Last updated">
              {formatTimestamp(route.updated_at)}
            </DetailRow>
            {route.created_by && (
              <DetailRow label="Created by">
                {formatAttributionName(route.created_by)}
              </DetailRow>
            )}
            {route.updated_by && (
              <DetailRow label="Last written by">
                {formatAttributionName(route.updated_by)}
              </DetailRow>
            )}
          </>
        )}
      </DetailSection>

      {baseDirection && (
        <DetailSection title="Direction">
          <DetailRow label="Label">{baseDirection.label}</DetailRow>
          {baseDirection.created_by && (
            <DetailRow label="Created by">
              {formatAttributionName(baseDirection.created_by)}
            </DetailRow>
          )}
          {baseDirection.updated_by && (
            <DetailRow label="Last written by">
              {formatAttributionName(baseDirection.updated_by)}
            </DetailRow>
          )}
          <DetailRow label="Last updated">
            {formatTimestamp(baseDirection.updated_at)}
          </DetailRow>
        </DetailSection>
      )}
    </section>
  );
}
