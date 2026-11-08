import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DetailRow, DetailSection } from "@/components/shared/DetailList";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { StopType } from "@komyuter/shared";
import { STOP_TYPE_LABELS } from "@/features/routes/stopLabels";
import { formatAttributionName } from "@/features/routes/attribution";
import { useDetourStore } from "./detourStore";

/**
 * The DetourStopGroup — the right property-panel editor for a detour stop
 * SELECTED on the map (marker click), mirroring how a base stop opens
 * StopGroup/StopEditor: editable fields on top, static details below.
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
  const saving = useDetourStore((s) => s.saving);
  const [removeOpen, setRemoveOpen] = useState(false);

  if (!detourStop) return null;

  return (
    <section aria-label="Detour stop">
      <fieldset disabled={saving} className="mt-3 space-y-2 border-0 p-0">
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
      </fieldset>

      <DetailSection>
        <DetailRow label="Stop number">{index}</DetailRow>
        <DetailRow label="Longitude">
          {detourStop.location[0].toFixed(5)}
        </DetailRow>
        <DetailRow label="Latitude">
          {detourStop.location[1].toFixed(5)}
        </DetailRow>
        {detourStop.created_by && (
          <DetailRow label="Created by">
            {formatAttributionName(detourStop.created_by)}
          </DetailRow>
        )}
        {detourStop.updated_by && (
          <DetailRow label="Last written by">
            {formatAttributionName(detourStop.updated_by)}
          </DetailRow>
        )}
      </DetailSection>

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={() => setRemoveOpen(true)}
          disabled={saving}
        >
          Remove detour stop
        </Button>
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove detour stop?"
        description={`“${detourStop.name}” will be removed from this alternative route. Save the alternative route to apply the change.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          removeDetourStop(detourStop.id);
          selectDetourStop(null);
          setRemoveOpen(false);
        }}
      />
    </section>
  );
}
