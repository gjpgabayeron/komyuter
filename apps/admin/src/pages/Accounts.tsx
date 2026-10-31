import { ShieldCheck } from "lucide-react";
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
import { useAccountsQuery } from "@/features/accounts/queries";
import { useAuth } from "@/features/auth/auth";
import NotFound from "@/pages/NotFound";

/**
 * The Accounts surface (M2b). Reaching it requires `ADMIN_MANAGE`, checked
 * directly here and declared on the navigation entry; the server refuses the
 * list and the status change regardless, so the check is an affordance.
 */
export default function Accounts() {
  const { user } = useAuth();

  if (!user || !user.permissions.includes("ADMIN_MANAGE")) {
    return <NotFound />;
  }

  return <AccountsSurface actorId={user.id} />;
}

function AccountsSurface({ actorId }: { actorId: string }) {
  const { data, isError, isLoading, refetch } = useAccountsQuery();

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Accounts are invited, never deleted. Deactivating one keeps its
          identity and Role and ends its access on the next request.
        </p>
      </div>

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
        <AccountTable accounts={data} actorId={actorId} />
      )}
    </div>
  );
}
