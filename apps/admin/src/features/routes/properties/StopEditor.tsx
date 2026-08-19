import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StopType } from "@komyuter/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePlottingStore } from "@/lib/plottingStore";
import { pathFromConnections } from "@/lib/connections";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { STOP_TYPE_LABELS } from "../stopLabels";
import { ConnectionSelect } from "./ConnectionSelect";
import { STOP_TYPES, type StopShape } from "./types";

/** Context-aware editable fields, grouped like a Figma properties panel. */
export function StopEditor({
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

  // Chain neighbours (path order — orientation-independent) for the
  // "Connected from/to" dropdowns. Closed loops (FR-004) wrap around: the
  // first stop's predecessor is the last stop and vice versa.
  const connections = usePlottingStore((s) => s.connections);
  const stops = usePlottingStore((s) => s.stops);
  const setStopLinks = usePlottingStore((s) => s.setStopLinks);
  const path = pathFromConnections(connections, stops);
  const pathIndex = path.stopIds.indexOf(stop.id);
  const lastIndex = path.stopIds.length - 1;
  const closedLoop = path.closed && path.stopIds.length >= 3;
  const chainFromId =
    closedLoop && pathIndex === 0
      ? path.stopIds[lastIndex]
      : pathIndex > 0
        ? path.stopIds[pathIndex - 1]
        : null;
  const chainToId =
    closedLoop && pathIndex === lastIndex
      ? path.stopIds[0]
      : pathIndex >= 0 && pathIndex < lastIndex
        ? path.stopIds[pathIndex + 1]
        : null;
  const otherStops = stops.filter((s) => s.id !== stop.id);

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
          aria-invalid={stop.name.trim() === ""}
          disabled={disabled}
          className="h-8"
        />
        {stop.name.trim() === "" && (
          <p role="alert" className="text-destructive text-xs">
            Give this stop a name so riders recognize it.
          </p>
        )}
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

      {/* Linked-chain neighbours, editable via dropdowns — the chain stays in
          sync with placement order (single-mode plotting). */}
      <div className="space-y-1.5">
        <SectionLabel>Connections</SectionLabel>
        <ConnectionSelect
          label="Connected from"
          value={chainFromId}
          options={otherStops}
          onSelect={(id) => setStopLinks(stop.id, { from: id })}
          disabled={disabled}
        />
        <ConnectionSelect
          label="Connected to"
          value={chainToId}
          options={otherStops}
          onSelect={(id) => setStopLinks(stop.id, { to: id })}
          disabled={disabled}
        />
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
