import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SAVE_COPY } from "@/lib/labels";

interface SaveButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick" | "children"
> {
  /** A save is in flight — the button is disabled and shows "Saving…". */
  saving: boolean;
  /** Snapshot of the shared save lifecycle copy. */
  copy?: typeof SAVE_COPY;
  /** Start the save (the visible affordance's only job). */
  onSave: () => void;
  /** Extra content beside the label (e.g. the base editor's Save icon). */
  icon?: ReactNode;
}

/**
 * The ONE primary save affordance in the route workspace (contracts/
 * ui-patterns.md §1, FR-001/FR-002): every active editor surface that can
 * save renders this same control with the same id/loading copy from
 * `SAVE_COPY` — the base page chrome row and the Detour editor rail. It is
 * never inert while an editor is open (FR-014/US6#3): a visible, enabled
 * "Save changes" button or a disabled, in-flight "Saving…" one — nothing
 * in between, no per-surface label inventing.
 */
export function SaveButton({
  saving,
  copy = SAVE_COPY,
  onSave,
  icon,
  className,
  ...props
}: SaveButtonProps) {
  return (
    <Button
      type="button"
      onClick={onSave}
      disabled={saving}
      aria-label={saving ? copy.saving : copy.idle}
      className={cn(className)}
      {...props}
    >
      {icon}
      {saving ? copy.saving : copy.idle}
    </Button>
  );
}
