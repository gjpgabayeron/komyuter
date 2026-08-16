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

interface LeaveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeave: () => void;
}

/**
 * Styled confirm for leaving the editor with unsaved changes (FR-007 — never
 * the browser dialog). The draft safety net keeps the work recoverable either
 * way; this dialog is the in-app ask.
 */
export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onLeave,
}: LeaveConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your edits are kept as a draft on this device and can be restored
            the next time you open the route. You can also leave them in place
            and come back to save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onLeave}>Leave</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
