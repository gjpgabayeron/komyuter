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
import {
  lastSignInLabel,
  lifecycleActionFor,
  statusLabel,
  type AccountLifecycleAction,
} from "./status";

interface AccountTableProps {
  accounts: AccountSummary[];
  /** The acting Account — its own row offers no lifecycle action. */
  actorId: string;
}

/** Sticky header styling: keeps column labels in view while the table scrolls. */
const thClass = "bg-muted sticky top-0 z-10";

/**
 * Every Account with the five facts the surface exists to show: email, name,
 * Role, active state and last sign-in. There is no Delete action anywhere —
 * deactivation is the lifecycle (CONTEXT.md, Deactivated Account).
 */
export function AccountTable({ accounts, actorId }: AccountTableProps) {
  const [pending, setPending] = useState<{
    account: AccountSummary;
    action: AccountLifecycleAction;
  } | null>(null);

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
            const action = lifecycleActionFor(account, actorId);
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
                  {action === null ? (
                    <span className="text-muted-foreground text-xs">
                      {account.userId === actorId ? "You" : "—"}
                    </span>
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
    </>
  );
}
