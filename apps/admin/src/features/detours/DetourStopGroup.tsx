import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { StopType } from "@komyuter/shared";
import { STOP_TYPE_LABELS } from "@/features/routes/stopLabels";
import { useDetourStore } from "./detourStore";

/**
 * The DetourStopGroup — the right property-panel editor for a detour stop
 * SELECTED on the map (marker click), mirroring how a base stop opens
 * StopGroup/StopEditor: rename, type, guaranteed-service, landmark hint, and
 * notes, with the location edited by dragging the marker itself. Backing out
 * (Esc on the panel's close, or clicking the map) returns to the DetourGroup.
 */
export function DetourStopGroup() {
  const selectedId = useDetourStore((s) => s.selectedDetourStopId);
  const index = useDetourStore(
    (s) => s.detourStops.findIndex((stop) => stop.id === selectedId) + 1,
  );
  const detourStop = useDetourStore(
    (s) =>
      s.detourStops.find((stop) => stop.id === s.selectedDetourStopId) ?? null,
  );
  const updateDetourStop = useDetourStore((s) => s.updateDetourStop);
  const removeDetourStop = useDetourStore((s) => s.removeDetourStop);
  const selectDetourStop = useDetourStore((s) => s.selectDetourStop);

  if (!detourStop) return null;

  return (
    <section aria-label="Detour stop" className="border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Detour stop {index}
          <span className="text-muted-foreground block truncate text-xs">
            detour-only — not on the base route
          </span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Deselect detour stop"
          className="text-muted-foreground size-6 shrink-0"
          onClick={() => selectDetourStop(null)}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        Location:{" "}
        <span className="font-mono tabular-nums">
          {[
            detourStop.location[0].toFixed(5),
            detourStop.location[1].toFixed(5),
          ].join(", ")}
        </span>{" "}
        — drag the marker on the map to move it.
      </p>

      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <Label htmlFor="detour-stop-name" className="text-xs">
            Name
          </Label>
          <Input
            id="detour-stop-name"
            value={detourStop.name}
            onChange={(event) =>
              updateDetourStop(detourStop.id, { name: event.target.value })
            }
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="detour-stop-type" className="text-xs">
            Type
          </Label>
          <select
            id="detour-stop-type"
            value={detourStop.type}
            onChange={(event) =>
              updateDetourStop(detourStop.id, {
                type: event.target.value as StopType,
              })
            }
            className="border-border bg-muted h-8 w-full rounded-md border px-2 text-sm"
          >
            {(Object.keys(STOP_TYPE_LABELS) as StopType[]).map((t) => (
              <option key={t} value={t}>
                {STOP_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="detour-stop-guaranteed" className="text-xs">
            Guaranteed service
          </Label>
          <Switch
            id="detour-stop-guaranteed"
            checked={detourStop.is_guaranteed_service}
            onCheckedChange={(checked) =>
              updateDetourStop(detourStop.id, {
                is_guaranteed_service: checked,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="detour-stop-landmark" className="text-xs">
            Landmark hint{" "}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="detour-stop-landmark"
            value={detourStop.landmark_hint ?? ""}
            onChange={(event) =>
              updateDetourStop(detourStop.id, {
                landmark_hint: event.target.value || null,
              })
            }
            className="h-8"
            placeholder="e.g. Inside the school gate"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="detour-stop-notes" className="text-xs">
            Notes <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="detour-stop-notes"
            value={detourStop.notes ?? ""}
            onChange={(event) =>
              updateDetourStop(detourStop.id, {
                notes: event.target.value || null,
              })
            }
            className="h-8"
            placeholder="Crew-only notes"
          />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={() => {
            removeDetourStop(detourStop.id);
            selectDetourStop(null);
          }}
        >
          Remove detour stop
        </Button>
      </div>
    </section>
  );
}
