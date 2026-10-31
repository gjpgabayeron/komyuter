import type { AccountSummary } from "@komyuter/shared";
import { api } from "@/lib/api";

/**
 * `GET /api/admin/accounts` — every Account with its Role, active state and
 * last sign-in. Behind `ADMIN_MANAGE`: the Account list *is* the access model.
 */
export async function listAccounts(): Promise<AccountSummary[]> {
  const { data } = await api.get<AccountSummary[]>("/api/admin/accounts");
  return data;
}

/**
 * `PUT /api/admin/accounts/:userId/status` — deactivate or reactivate an
 * Account. Deactivation keeps the identity and the Role; it refuses the caller's
 * own Account and the Super Admin.
 */
export async function setAccountStatus(
  userId: string,
  isActive: boolean,
): Promise<AccountSummary> {
  const { data } = await api.put<AccountSummary>(
    `/api/admin/accounts/${userId}/status`,
    { isActive },
  );
  return data;
}
