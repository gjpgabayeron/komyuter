import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeactivateFareConfig } from "./queries";
import type { FareConfigListItem } from "./api";

interface DeleteFareConfigDialogProps {
  /** The configuration pending deactivation; null hides the dialog. */
  config: FareConfigListItem | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation dialog for soft-deactivating a fare configuration (US4).
 * Deletion never destroys: the server flips `is_active` to false.
 * Server rejections (active-route reference, sole default) surface as an
 * error toast via the mutation; the dialog always closes (FR-008) and the
 * list stays unchanged because refetch only happens on success.
 */
export function DeleteFareConfigDialog({
  config,
  onOpenChange,
}: DeleteFareConfigDialogProps) {
  const deactivate = useDeactivateFareConfig();
  const open = config !== null;

  const handleConfirm = async () => {
    if (!config || deactivate.isPending) {
      return;
    }
    try {
      await deactivate.mutateAsync(config.fare_config_id);
    } catch {
      // Error toast is handled by the mutation's onError.
    }
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete fare configuration &ldquo;{config?.label}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This deactivates the configuration; it can be reactivated later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deactivate.isPending}
          >
            {deactivate.isPending ? "Deactivating…" : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
