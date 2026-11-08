import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailRow, DetailSection } from "@/components/shared/DetailList";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { usePlottingStore } from "@/lib/plottingStore";
import { formatAttributionName } from "../attribution";
import { StopEditor } from "./StopEditor";
import { StopReadOnly } from "./StopReadOnly";

export function StopGroup({ readOnly = false }: { readOnly?: boolean }) {
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
    <section>
      {stop ? (
        readOnly ? (
          <div className="mt-2.5">
            <StopReadOnly stop={stop} index={index} />
          </div>
        ) : (
          <>
            <div className="mt-2.5 space-y-4">
              <StopEditor stop={stop} disabled={saving} />
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

            <DetailSection>
              <DetailRow label="Stop number">{index + 1}</DetailRow>
              <DetailRow label="Longitude">
                {stop.location[0].toFixed(5)}
              </DetailRow>
              <DetailRow label="Latitude">
                {stop.location[1].toFixed(5)}
              </DetailRow>
              {stop.created_by && (
                <DetailRow label="Created by">
                  {formatAttributionName(stop.created_by)}
                </DetailRow>
              )}
              {stop.updated_by && (
                <DetailRow label="Last written by">
                  {formatAttributionName(stop.updated_by)}
                </DetailRow>
              )}
            </DetailSection>
          </>
        )
      ) : (
        <p className="text-muted-foreground mt-2.5 text-xs">
          Select a stop on the map or in the list to edit its details.
        </p>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete stop?"
        description={`“${stop?.name ?? "This stop"}” will be removed from the route. The change applies the next time you Save.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (stop) removeStop(stop.id);
          setDeleteOpen(false);
        }}
      />
    </section>
  );
}
