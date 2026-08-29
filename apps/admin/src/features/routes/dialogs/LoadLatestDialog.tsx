import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CONFLICT_COPY } from "@/lib/labels";

interface LoadLatestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadLatest: () => void;
}

/**
 * Save-conflict recovery (FR-003): ONE shared confirmation shell — the same
 * non-destructive ConfirmDialog as every other blocking ask, with the shared
 * `conflict.*` copy (labels.ts). Both base-route and Detour save conflicts
 * surface here, retaining all local work and offering the latest saved data.
 */
export function LoadLatestDialog({
  open,
  onOpenChange,
  onLoadLatest,
}: LoadLatestDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={CONFLICT_COPY.title}
      message={CONFLICT_COPY.body}
      confirmLabel={CONFLICT_COPY.loadLatest}
      cancelLabel={CONFLICT_COPY.keepLocal}
      onConfirm={onLoadLatest}
    />
  );
}
