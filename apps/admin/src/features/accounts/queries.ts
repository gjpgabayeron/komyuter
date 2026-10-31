import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountKeys } from "@/lib/queryKeys";
import { listAccounts, setAccountStatus } from "./api";

export function useAccountsQuery() {
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: listAccounts,
    staleTime: 30_000,
  });
}

/**
 * Deactivate or reactivate one Account. The list is invalidated on success, so
 * the row's active state and badge update immediately; a server refusal (self,
 * the Super Admin, a missing Permission) surfaces as an error toast.
 */
export function useSetAccountStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      setAccountStatus(userId, isActive),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      toast.success(
        account.isActive ? "Account reactivated." : "Account deactivated.",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
