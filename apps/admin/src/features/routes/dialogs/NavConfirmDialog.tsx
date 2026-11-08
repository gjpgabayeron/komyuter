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

interface NavConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStay: () => void;
  onLeaveAnyway: () => void;
}

/**
 * Styled confirm for in-app navigation away from the editor with unsaved
 * changes (FR-007). Intercepting pushState/replaceState routes here; the
 * draft keeps the work recoverable after leaving.
 */
export function NavConfirmDialog({
  open,
  onOpenChange,
  onStay,
  onLeaveAnyway,
}: NavConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved route changes. Your work is kept as a draft on this
            device and can be restored when you return.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={onLeaveAnyway}>
            Leave anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
