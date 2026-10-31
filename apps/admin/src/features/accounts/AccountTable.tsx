import type { AccountSummary } from "@komyuter/shared";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AccountStatusDialog } from "./AccountStatusDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { useRolesQuery, useSetAccountRole } from "./queries";
import { canResetPassword } from "./reset";
import { assignableRoleChanges, type RoleActor } from "./roles";
import {
  lastSignInLabel,
  lifecycleActionFor,
  statusLabel,
  type AccountLifecycleAction,
} from "./status";

interface AccountTableProps {
  accounts: AccountSummary[];
  /** The acting Account — its own row offers neither a Role change nor a status. */
  actor: RoleActor;
}

/** Sticky header styling: keeps column labels in view while the table scrolls. */
const thClass = "bg-muted sticky top-0 z-10";

/**
 * Every Account with the five facts the surface exists to show: email, name,
 * Role, active state and last sign-in. There is no Delete action anywhere —
 * deactivation is the lifecycle (CONTEXT.md, Deactivated Account).
 *
 * The Role picker offers only the Roles the actor may move that row to, taken
 * from the shared assignable-Role policy, so the surface never offers a move the
 * server would refuse. Self, the Super Admin and out-of-reach targets read as
 * inactionable rather than disappearing, so the hierarchy stays legible.
 */
export function AccountTable({ accounts, actor }: AccountTableProps) {
  const [pending, setPending] = useState<{
    account: AccountSummary;
    action: AccountLifecycleAction;
  } | null>(null);
  const [resetAccount, setResetAccount] = useState<AccountSummary | null>(null);
  const roles = useRolesQuery();
  const setRole = useSetAccountRole();

  return (
    <>
      <Table containerClassName="max-h-[65vh] rounded-md border">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className={thClass}>
              Email
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Name
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Role
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Status
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Last sign-in
            </TableHead>
            <TableHead scope="col" className={cn(thClass, "text-right")}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => {
            const action = lifecycleActionFor(account, actor.userId);
            const mayReset = canResetPassword(account, actor);
            const roleOptions = assignableRoleChanges(
              account,
              actor,
              roles.data ?? [],
            );
            const pendingRole =
              setRole.isPending && setRole.variables?.userId === account.userId;

            return (
              <TableRow
                key={account.userId}
                className={cn(!account.isActive && "text-muted-foreground")}
              >
                <TableCell className="font-medium">{account.email}</TableCell>
                <TableCell>
                  {account.name || "—"}
                  {account.isSuperAdmin && (
                    <Badge className="bg-primary text-primary-foreground ml-2">
                      <ShieldCheck className="size-3" />
                      Super Admin
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{account.role.name}</TableCell>
                <TableCell>
                  {account.isActive ? (
                    <Badge variant="default">{statusLabel(true)}</Badge>
                  ) : (
                    <Badge variant="outline">{statusLabel(false)}</Badge>
                  )}
                </TableCell>
                <TableCell>{lastSignInLabel(account.lastSignInAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {roleOptions.length > 0 ? (
                      <select
                        value={account.role.roleId}
                        onChange={(event) =>
                          setRole.mutate({
                            userId: account.userId,
                            roleId: event.target.value,
                          })
                        }
                        disabled={pendingRole}
                        aria-label={`Change Role for ${account.email}`}
                        className="border-border bg-muted h-8 rounded-md border px-2 text-sm"
                      >
                        {/* The current Role first: it is what the row reads, and
                            the picker must not pretend the Account moved. */}
                        <option value={account.role.roleId}>
                          {account.role.name}
                        </option>
                        {roleOptions
                          .filter((role) => role.roleId !== account.role.roleId)
                          .map((role) => (
                            <option key={role.roleId} value={role.roleId}>
                              {role.name}
                            </option>
                          ))}
                      </select>
                    ) : null}
                    {mayReset ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setResetAccount(account)}
                        aria-label={`Reset password for ${account.email}`}
                      >
                        Reset password
                      </Button>
                    ) : null}
                    {action === null ? (
                      roleOptions.length === 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {account.userId === actor.userId ? "You" : "—"}
                        </span>
                      ) : null
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPending({ account, action })}
                        aria-label={`${action === "deactivate" ? "Deactivate" : "Reactivate"} ${account.email}`}
                      >
                        {action === "deactivate" ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <AccountStatusDialog
        account={pending?.account ?? null}
        action={pending?.action ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
      />
      <ResetPasswordDialog
        account={resetAccount}
        onOpenChange={(open) => {
          if (!open) {
            setResetAccount(null);
          }
        }}
      />
    </>
  );
}
