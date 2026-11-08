import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A save against a Direction that no longer exists (ADR-0020 risk: "the
 * resolver must cope with an entity that no longer exists"). Deletion is a
 * conflict shape, not a terminal error: the Draft is never discarded.
 */
export function DeletedDirectionDialog({
  open,
  routeExists,
  routeLabel,
  onKeepDraft,
  onSaveAsNew,
}: {
  open: boolean;
  routeExists: boolean;
  routeLabel: string;
  onKeepDraft: () => void;
  onSaveAsNew: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeepDraft();
      }}
    >
      <DialogContent
        className="flex w-full flex-col gap-0 overflow-hidden rounded-[4px] p-0 ring-1 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader className="border-border bg-warning text-warning-foreground border-b px-5 py-3">
          <DialogTitle className="text-sm font-black tracking-[0.08em] uppercase">
            Gone from the dataset
          </DialogTitle>
          <DialogDescription className="text-sm opacity-80">
            {routeLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <p className="text-foreground text-sm">
            Another Administrator deleted this direction while you were editing.
            Your Draft is untouched.
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            {routeExists
              ? "You can keep the Draft for review, or save it as a new direction on this route."
              : "The route itself is gone, so the Draft can only be kept."}
          </p>
        </div>

        <DialogFooter className="border-border border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onKeepDraft}>
            Keep my draft
          </Button>
          <Button size="sm" disabled={!routeExists} onClick={onSaveAsNew}>
            Save as a new direction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
