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

interface LoadLatestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadLatest: () => void;
}

/**
 * Confirm before a save-conflict recovery: loading the latest server version
 * replaces the local unsaved edits (kept as a draft). Confirms the destructive
 * replace — the admin's unsaved work is intentionally discarded.
 */
export function LoadLatestDialog({
  open,
  onOpenChange,
  onLoadLatest,
}: LoadLatestDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Loading the latest version replaces your unsaved edits. Your current
            work is kept as a draft on this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onLoadLatest}>
            Load latest
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
