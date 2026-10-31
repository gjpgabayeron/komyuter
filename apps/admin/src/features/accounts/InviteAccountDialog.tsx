import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { InviteAccountResponse } from "@komyuter/shared";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInviteAccount, useRolesQuery } from "./queries";
import { assignableRoles, type RoleActor } from "./roles";

interface InviteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The acting Account — the picker offers only the Roles it may assign. */
  actor: RoleActor;
}

/**
 * Invite an Account by email and Role (ADR-0019 §10, US4–5).
 *
 * The password is never typed here: the server generates the Temporary Password
 * and returns it once, so this dialog has two states — the form, then the
 * handover. The second state is the only place the value is ever visible, and
 * closing the dialog discards it for good.
 */
export function InviteAccountDialog({
  open,
  onOpenChange,
  actor,
}: InviteAccountDialogProps) {
  const roles = useRolesQuery();
  const invite = useInviteAccount();

  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [issued, setIssued] = useState<InviteAccountResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Only the Roles this actor may assign: strictly below its position and
  // within its Permission set, decided by the shared policy.
  const options = useMemo(
    () => assignableRoles(actor, roles.data ?? []),
    [actor, roles.data],
  );

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRoleId("");
    setIssued(null);
    setCopied(false);
  }, [open]);

  // Default the picker to the first assignable Role, and re-derive it only if
  // the catalogue changes underneath — never overwriting a choice the admin
  // made, and never touching the handover state once a password is on screen.
  useEffect(() => {
    if (!open || issued) return;
    setRoleId((current) =>
      options.some((role) => role.roleId === current)
        ? current
        : (options[0]?.roleId ?? ""),
    );
  }, [open, issued, options]);

  const noAssignableRoles =
    !roles.isLoading && !roles.isError && options.length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (invite.isPending || !email.trim() || !roleId) return;
    try {
      setIssued(await invite.mutateAsync({ email: email.trim(), roleId }));
    } catch {
      // The mutation's onError shows the refusal (duplicate email, reach).
    }
  };

  const copyPassword = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.temporaryPassword);
      setCopied(true);
      toast.success("Temporary Password copied.");
    } catch {
      toast.error("Could not copy — select the password and copy it manually.");
    }
  };

  const close = () => {
    setIssued(null);
    setCopied(false);
    onOpenChange(false);
  };

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
              <div className="space-y-1.5">
                <Label htmlFor="invited-temporary-password">
                  Temporary Password
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="invited-temporary-password"
                    value={issued.temporaryPassword}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-9 font-mono tracking-wide"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyPassword}
                    aria-label="Copy Temporary Password"
                  >
                    {copied ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-amber-700">
                This Temporary Password cannot be shown again. Copy it now and
                hand it over securely — if it is lost, the Account has to be
                reset.
              </p>
              <p className="text-muted-foreground text-xs">
                {issued.account.email} was invited as {issued.account.role.name}
                .
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Invite Account</DialogTitle>
              <DialogDescription>
                The server generates the Temporary Password; you will see it
                once, here, and never again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="plotter@komyuter.ph"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                  disabled={roles.isLoading || noAssignableRoles}
                  className="border-border bg-muted h-8 w-full rounded-md border px-2 text-sm"
                  required
                >
                  {roles.isLoading && <option value="">Loading Roles…</option>}
                  {noAssignableRoles && (
                    <option value="">No Role is yours to assign</option>
                  )}
                  {options.map((role) => (
                    <option key={role.roleId} value={role.roleId}>
                      {role.name} (position {role.position})
                    </option>
                  ))}
                </select>
                {noAssignableRoles ? (
                  <p className="text-xs text-amber-700">
                    Every Role sits at or above your position, or grants a
                    Permission you do not hold.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Only Roles below your own position and within your
                    Permissions are offered.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  invite.isPending ||
                  noAssignableRoles ||
                  !email.trim() ||
                  !roleId
                }
              >
                <KeyRound className="size-3.5" />
                {invite.isPending ? "Inviting…" : "Invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
