import { ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountTable } from "@/features/accounts/AccountTable";
import { InviteAccountDialog } from "@/features/accounts/InviteAccountDialog";
import { useAccountsQuery } from "@/features/accounts/queries";
import type { RoleActor } from "@/features/accounts/roles";
import {
  ACCOUNT_STATUS_FILTERS,
  accountStatusFilterLabel,
  filterAccountsByStatus,
  type AccountStatusFilter,
} from "@/features/accounts/status";
import { useAuth } from "@/features/auth/auth";
import { cn } from "@/lib/utils";

/**
 * The Accounts surface (M2b). The navigation entry declares `ADMIN_MANAGE` and
 * the section guard answers it from the capability module, so this page asks
 * nothing itself: a typed `/accounts` URL without the Permission renders the
 * not-found surface before reaching here (ticket #48). The server refuses the
 * list, the invite and every lifecycle change regardless.
 */
export default function Accounts() {
  const { user } = useAuth();

  // `RequireAuth` admits only a signed-in Account and the section guard only an
  // `ADMIN_MANAGE` holder, so this branch cannot be reached — it exists to read
  // the identity, not to answer for it.
  if (!user) {
    return null;
  }

  // The actor side of every Role decision: the effective Permission set the
  // server resolved, so the pickers offer exactly what the server would accept.
  const actor: RoleActor = {
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    role: user.role,
    permissions: user.permissions,
  };

  return <AccountsSurface actor={actor} />;
}

function AccountsSurface({ actor }: { actor: RoleActor }) {
  const { data, isError, isLoading, refetch } = useAccountsQuery();
  const [inviting, setInviting] = useState(false);
  // The list keeps Deactivated Accounts, so the filter is what answers "who
  // can still sign in?" — All is where the surface starts.
  const [filter, setFilter] = useState<AccountStatusFilter>("all");
  const rows = filterAccountsByStatus(data ?? [], filter);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Accounts are invited, never deleted. Deactivating one keeps its
          identity and Role and ends its access on the next request.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="Account status filter"
            className="bg-muted flex items-center rounded-lg p-0.5"
          >
            {ACCOUNT_STATUS_FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className={cn(
                  "rounded-[3px] px-2 py-1 text-xs font-medium",
                  filter === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {accountStatusFilterLabel(option)}
              </button>
            ))}
          </div>
          <Button onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />
            Invite Account
          </Button>
        </div>
      </div>

      <InviteAccountDialog
        open={inviting}
        onOpenChange={setInviting}
        actor={actor}
      />

      {isLoading ? (
        <div
          className="space-y-2"
          aria-busy="true"
          aria-label="Loading Accounts"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="flex h-full items-center justify-center">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold">
                Couldn't load Accounts
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>
                Check the server connection and try again.
              </EmptyDescription>
              <Button variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold">
                No Accounts yet
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>
                Accounts appear here once they are invited.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold">
                No {accountStatusFilterLabel(filter)} Accounts
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>
                Every Account on this dashboard is in the other state.
              </EmptyDescription>
              <Button variant="outline" onClick={() => setFilter("all")}>
                Show all Accounts
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <AccountTable accounts={rows} actor={actor} />
      )}
    </div>
  );
}
