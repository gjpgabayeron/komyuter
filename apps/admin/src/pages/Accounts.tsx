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
import { useAuth } from "@/features/auth/auth";
import NotFound from "@/pages/NotFound";

/**
 * The Accounts surface (M2b). Reaching it requires `ADMIN_MANAGE`, checked
 * directly here and declared on the navigation entry; the server refuses the
 * list, the invite and every lifecycle change regardless, so the check is an
 * affordance.
 */
export default function Accounts() {
  const { user } = useAuth();

  if (!user || !user.permissions.includes("ADMIN_MANAGE")) {
    return <NotFound />;
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

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Accounts are invited, never deleted. Deactivating one keeps its
          identity and Role and ends its access on the next request.
        </p>
        <Button onClick={() => setInviting(true)}>
          <UserPlus className="size-4" />
          Invite Account
        </Button>
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
      ) : (
        <AccountTable accounts={data} actor={actor} />
      )}
    </div>
  );
}
