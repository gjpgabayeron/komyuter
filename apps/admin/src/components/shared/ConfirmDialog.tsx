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
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive confirmations (delete) get destructive action styling. */
  destructive?: boolean;
  /** In-flight confirmation (e.g. network delete) — the confirm button
   *  disables and shows `pendingLabel` so the dialog never double-fires. */
  pending?: boolean;
  pendingLabel?: string;
  onConfirm: () => void;
}

/**
 * ONE confirmation shell for every destructive or blocking ask in the
 * workspace (contracts/ui-patterns.md §3, FR-015): stop delete, route delete,
 * detour delete, leave-with-unsaved, and save-conflict recovery. Identical
 * structure, Esc/focus-trap, and copy rhythm everywhere — the same five
 * dialogs share one component.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  pending,
  pendingLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmDisabled = pending === true;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirmDisabled}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={cn(
              destructive &&
                "bg-destructive text-background hover:bg-destructive/90",
            )}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
