import type { AccountSummary } from "@komyuter/shared";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSetAccountStatus } from "./queries";
import type { AccountLifecycleAction } from "./status";

interface AccountStatusDialogProps {
  /** The Account pending a status change; null hides the dialog. */
  account: AccountSummary | null;
  action: AccountLifecycleAction | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation for the one lifecycle change an Account row offers
 * (ADR-0019 §1–2). Deactivation keeps the identity and the Role and ends the
 * Account's access on its next request — it is not a deletion, and the
 * dashboard offers no such action. A server refusal (self, the Super Admin)
 * surfaces as an error toast; the list only changes on success.
 */
export function AccountStatusDialog({
  account,
  action,
  onOpenChange,
}: AccountStatusDialogProps) {
  const setStatus = useSetAccountStatus();
  const pending = setStatus.isPending;
  const open = account !== null && action !== null;
  const deactivating = action === "deactivate";

  const handleConfirm = async () => {
    if (!account || !action || pending) {
      return;
    }
    try {
      await setStatus.mutateAsync({
        userId: account.userId,
        isActive: !deactivating,
      });
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
            {deactivating ? "Deactivate" : "Reactivate"}{" "}
            {account?.name || account?.email}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? "Their identity and Role are kept, but they will be signed out on their next request and cannot sign in again until reactivated."
              : "They will be able to sign in again with the same Role."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={deactivating ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending
              ? deactivating
                ? "Deactivating…"
                : "Reactivating…"
              : deactivating
                ? "Deactivate"
                : "Reactivate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
