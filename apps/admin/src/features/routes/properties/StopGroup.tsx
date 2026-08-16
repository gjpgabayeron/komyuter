import { useState } from "react";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { usePlottingStore } from "@/lib/plottingStore";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { StopEditor } from "./StopEditor";

export function StopGroup() {
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
