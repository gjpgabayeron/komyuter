import { useEffect, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import type { StopType } from "@komyuter/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePlottingStore } from "@/lib/plottingStore";
import { formatDistance, polylineDistanceMeters } from "@/lib/coords";
import { useFareConfigsQuery } from "@/features/fares/queries";
import { FareConfigSelect } from "./FareConfigSelect";
import { DEFAULT_ROUTE_COLOR, isValidHexColor } from "./routeColors";
import { formatTimestamp } from "./format";
import { STOP_TYPE_LABELS } from "./stopLabels";
import { useRouteQuery } from "./useRouteQueries";
import { cn } from "@/lib/utils";

const STOP_TYPES: StopType[] = ["terminal", "major_stop", "waiting_area"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
      {children}
    </h3>
  );
}

/**
 * Right-side floating properties panel — visible by default whenever a route
 * is open, height-constrained to the main content area with scrolling for
 * overflow. Two contextual groups:
 * 1. Route — route-level metadata (name, code, colour incl. custom hex,
 *    status, fare config), edited into the store's routeMeta draft; the
 *    shared Save button persists it.
 * 2. Stop — context-sensitive: the focused stop's editable fields (adapting
 *    to its type) plus a confirmed delete action.
 * Distance supports an m/km toggle. No travel-time/ETA data (ADR-0009).
 */
export function PropertiesPanel() {
  const routeId = usePlottingStore((s) => s.routeId);
  if (routeId === null) return null;

  return (
    <aside
      aria-label="Properties"
      className="absolute top-3 right-3 z-10 flex max-h-[calc(100dvh-9rem)] w-80 flex-col rounded-lg border bg-white p-3"
    >
      <h2 className="font-display text-foreground text-sm font-semibold">
        Properties
      </h2>
      <div className="overlay-scrollbar mt-2 min-h-0 flex-1 overflow-x-clip overflow-y-auto">
        <RouteGroup />
        <StopGroup />
      </div>
    </aside>
  );
}

function RouteGroup() {
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
              spellCheck={false}
              className="h-8 font-mono tabular-nums"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <SectionLabel>Status</SectionLabel>
            <p className="text-muted-foreground text-xs">
              Active routes are usable in the commuter app.
            </p>
          </div>
          <Switch
            checked={routeMeta?.isActive ?? true}
            onCheckedChange={(checked) => setRouteMeta({ isActive: checked })}
            disabled={saving}
            aria-label="Active route"
          />
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
        {route && (
          <>
            <div className="space-y-0.5">
              <SectionLabel>Created</SectionLabel>
              <p className="text-sm tabular-nums">
                {formatTimestamp(route.created_at)}
              </p>
            </div>
            <div className="space-y-0.5">
              <SectionLabel>Last updated</SectionLabel>
              <p className="text-sm tabular-nums">
                {formatTimestamp(route.updated_at)}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function StopGroup() {
  const selection = usePlottingStore((s) => s.selection);
  const stops = usePlottingStore((s) => s.stops);
  const removeStop = usePlottingStore((s) => s.removeStop);
  const saving = usePlottingStore((s) => s.saving);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const index =
    selection.type === "stop"
      ? stops.findIndex((stop) => stop.id === selection.stopId)
      : -1;
  const stop = index >= 0 ? stops[index] : null;

  return (
    <section className="mt-4 border-t pt-3">
      <SectionLabel>Stop</SectionLabel>
      {stop ? (
        <div className="mt-2.5 space-y-4">
          <StopEditor stop={stop} index={index} disabled={saving} />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={saving}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" />
            Delete stop
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-2.5 text-xs">
          Select a stop on the map or in the list to edit its details.
        </p>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stop?</AlertDialogTitle>
            <AlertDialogDescription>
              “{stop?.name}” will be removed from the route. The change applies
              the next time you Save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (stop) removeStop(stop.id);
                setDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

interface StopShape {
  id: string;
  name: string;
  type: StopType;
  location: [number, number];
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
}

/** Context-aware editable fields, grouped like a Figma properties panel. */
function StopEditor({
  stop,
  index,
  disabled,
}: {
  stop: StopShape;
  index: number;
  disabled: boolean;
}) {
  const updateStop = usePlottingStore((s) => s.updateStop);
  const setType = (type: StopType) => updateStop(stop.id, { type });

  const [lng, lat] = stop.location;
  const [lngText, setLngText] = useState(String(lng));
  const [latText, setLatText] = useState(String(lat));

  // Keep the coordinate fields in sync when the marker is dragged.
  useEffect(() => {
    setLngText(String(lng));
    setLatText(String(lat));
  }, [lng, lat]);

  const applyLng = (value: string) => {
    setLngText(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      updateStop(stop.id, { location: [parsed, stop.location[1]] });
    }
  };
  const applyLat = (value: string) => {
    setLatText(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      updateStop(stop.id, { location: [stop.location[0], parsed] });
    }
  };

  const showGuaranteed = stop.type !== "waiting_area";

  return (
    <div className="space-y-3.5">
      <div className="space-y-1.5">
        <SectionLabel>Name</SectionLabel>
        <Input
          value={stop.name}
          onChange={(event) =>
            updateStop(stop.id, { name: event.target.value })
          }
          aria-label="Stop name"
          disabled={disabled}
          className="h-8"
        />
      </div>

      <div className="space-y-1.5">
        <SectionLabel>Type</SectionLabel>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(props) => (
              <button
                {...props}
                type="button"
                disabled={disabled}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full justify-between font-normal",
                )}
              >
                <span>{STOP_TYPE_LABELS[stop.type]}</span>
                <ChevronDown className="size-3.5" />
              </button>
            )}
          />
          <DropdownMenuContent align="start" className="w-56 p-1">
            <DropdownMenuRadioGroup
              value={stop.type}
              onValueChange={(value) => setType(value as StopType)}
            >
              {STOP_TYPES.map((type) => (
                <DropdownMenuRadioItem
                  key={type}
                  value={type}
                  className="gap-2 py-1.5 pr-8"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">
                      {STOP_TYPE_LABELS[type]}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {type === "terminal"
                        ? "Start or end of the route"
                        : type === "major_stop"
                          ? "Regular boarding point"
                          : "Flag the jeepney anywhere along the route"}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1.5">
        <SectionLabel>Position</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="space-y-1">
            <Label
              htmlFor={`stop-${stop.id}-lng`}
              className="text-muted-foreground text-[11px]"
            >
              Longitude
            </Label>
            <Input
              id={`stop-${stop.id}-lng`}
              value={lngText}
              onChange={(event) => applyLng(event.target.value)}
              inputMode="decimal"
              disabled={disabled}
              className="h-8 tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor={`stop-${stop.id}-lat`}
              className="text-muted-foreground text-[11px]"
            >
              Latitude
            </Label>
            <Input
              id={`stop-${stop.id}-lat`}
              value={latText}
              onChange={(event) => applyLat(event.target.value)}
              inputMode="decimal"
              disabled={disabled}
              className="h-8 tabular-nums"
            />
          </div>
        </div>
      </div>

      {showGuaranteed && (
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <SectionLabel>Guaranteed service</SectionLabel>
            <p className="text-muted-foreground text-xs">
              The jeepney always stops here.
            </p>
          </div>
          <Switch
            checked={stop.is_guaranteed_service ?? true}
            onCheckedChange={(checked) =>
              updateStop(stop.id, { is_guaranteed_service: checked })
            }
            disabled={disabled}
            aria-label="Guaranteed service"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <SectionLabel>Landmark / address</SectionLabel>
        <Input
          value={stop.landmark_hint ?? ""}
          onChange={(event) =>
            updateStop(stop.id, {
              landmark_hint: event.target.value.trim()
                ? event.target.value
                : null,
            })
          }
          placeholder="e.g. beside the plaza"
          disabled={disabled}
          className="h-8"
        />
      </div>

      <div className="space-y-1.5">
        <SectionLabel>Notes</SectionLabel>
        <Input
          value={stop.notes ?? ""}
          onChange={(event) =>
            updateStop(stop.id, {
              notes: event.target.value.trim() ? event.target.value : null,
            })
          }
          placeholder="Optional notes"
          disabled={disabled}
          className="h-8"
        />
      </div>

      {stop.type === "waiting_area" && (
        <p className="bg-muted text-muted-foreground rounded-lg px-2 py-1.5 text-xs">
          Hail-and-ride point — commuters flag the jeepney here. Stop{" "}
          {index + 1} of {usePlottingStore.getState().stops.length}.
        </p>
      )}
    </div>
  );
}
