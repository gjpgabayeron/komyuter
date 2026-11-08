import { useEffect, useState } from "react";
import type { AccountSummary, ResetPasswordResponse } from "@komyuter/shared";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useResetAccountPassword } from "./queries";
import { TemporaryPasswordPanel } from "./TemporaryPasswordPanel";

interface ResetPasswordDialogProps {
  /** The Account pending a forced reset; null hides the dialog. */
  account: AccountSummary | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Force a password reset on another Account (ADR-0019 §13–14, ticket #44).
 *
 * Two states, like the invite: a confirmation that spells out the consequences
 * (the target's current session ends immediately and it must set a new password),
 * then the once-only handover. The server generates the Temporary Password and
 * returns it here; closing the dialog discards it for good. A server refusal
 * (self, the Super Admin, out of reach) surfaces as an error toast and leaves the
 * dialog on the confirmation.
 */
export function ResetPasswordDialog({
  account,
  onOpenChange,
}: ResetPasswordDialogProps) {
  const reset = useResetAccountPassword();
  const [issued, setIssued] = useState<ResetPasswordResponse | null>(null);
  const open = account !== null;
  const pending = reset.isPending;

  // A new row (or a closed dialog) starts clean: the previous handover is gone.
  useEffect(() => {
    if (!open) setIssued(null);
  }, [open]);

  const close = () => {
    setIssued(null);
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!account || pending) {
      return;
    }
    try {
      setIssued(await reset.mutateAsync({ userId: account.userId }));
    } catch {
      // Error toast is handled by the mutation's onError.
    }
  };

  const label = account?.name || account?.email;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {issued ? (
          <div>
            <DialogHeader>
              <DialogTitle>Temporary Password</DialogTitle>
              <DialogDescription>
                Hand this to {issued.account.email}. It is shown once and cannot
                be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <TemporaryPasswordPanel
                temporaryPassword={issued.temporaryPassword}
              />
              <p className="text-muted-foreground text-xs">
                {issued.account.email}&apos;s current session has ended. They
                must set their own password the next time they sign in.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div>
            <DialogHeader>
              <DialogTitle>Reset password for {label}?</DialogTitle>
              <DialogDescription>
                This issues a new Temporary Password and ends their current
                session immediately. They must set their own password the next
                time they sign in. You will see the Temporary Password once.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={pending}
              >
                <KeyRound className="size-3.5" />
                {pending ? "Resetting…" : "Reset password"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
