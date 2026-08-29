import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface LeaveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeave: () => void;
}

/**
 * Styled confirm for leaving the editor with unsaved changes (FR-007 — never
 * the browser dialog). The draft safety net keeps the work recoverable either
 * way; this dialog is the in-app ask. Non-destructive variant of the shared
 * ConfirmDialog (contracts/ui-patterns.md §3).
 */
export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onLeave,
}: LeaveConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Leave unsaved changes?"
      message="Your edits are kept as a draft on this device and can be restored the next time you open the route. You can also leave them in place and come back to save."
      confirmLabel="Leave"
      cancelLabel="Keep editing"
      onConfirm={onLeave}
    />
  );
}
