import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountKeys, roleKeys } from "@/lib/queryKeys";
import {
  inviteAccount,
  listAccounts,
  listRoles,
  resetAccountPassword,
  setAccountRole,
  setAccountStatus,
} from "./api";

export function useAccountsQuery() {
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: listAccounts,
    staleTime: 30_000,
  });
}

/**
 * The Role catalogue. It is fetched once per Accounts visit and narrowed per
 * picker by the shared assignable-Role policy — the SPA never decides reach on
 * its own.
 */
export function useRolesQuery() {
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: listRoles,
    staleTime: 5 * 60_000,
  });
}

/**
 * Invite one Account. The Temporary Password arrives in the mutation's result
 * and is shown once by the dialog; the list is invalidated so the new row
 * appears immediately.
 */
export function useInviteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, roleId }: { email: string; roleId: string }) =>
      inviteAccount(email, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
    },
    onError: (error: Error) => {
      // A duplicate email (409) or an out-of-reach Role (403) reads here.
      toast.error(error.message);
    },
  });
}

/**
 * Move one Account to another Role. The change applies on the target's next
 * request, so the list is invalidated and the row reads the Role the server
 * returned; a refusal surfaces as an error toast and leaves the row alone.
 */
export function useSetAccountRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      setAccountRole(userId, roleId),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      toast.success(
        `${account.email || account.name} is now a ${account.role.name}.`,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
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

/**
 * Force a password reset on one Account. The new Temporary Password arrives in
 * the mutation's result and is shown once by the dialog — no success toast, the
 * handover panel is the confirmation. The list is invalidated so a reset reflects
 * immediately; a server refusal (self, the Super Admin, out of reach) surfaces as
 * an error toast.
 */
export function useResetAccountPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      resetAccountPassword(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
