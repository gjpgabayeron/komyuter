import type {
  AccountSummary,
  InviteAccountResponse,
  RoleSummary,
} from "@komyuter/shared";
import { api } from "@/lib/api";

/**
 * `GET /api/admin/accounts` — every Account with its Role, active state and
 * last sign-in. Behind `ADMIN_MANAGE`: the Account list *is* the access model.
 */
export async function listAccounts(): Promise<AccountSummary[]> {
  return (await api.get<AccountSummary[]>("/api/admin/accounts")).data;
}

/**
 * `GET /api/admin/roles` — the Role catalogue, which the invite dialog and each
 * row's Role picker narrow down through the shared assignable-Role policy. The
 * server enforces the same rule, so a filtered catalogue is an affordance.
 */
export async function listRoles(): Promise<RoleSummary[]> {
  return (await api.get<RoleSummary[]>("/api/admin/roles")).data;
}

/**
 * `POST /api/admin/accounts` — invite an Account by email and Role.
 *
 * There is no password in the request: the server generates the Temporary
 * Password and returns it **once**, in this response. Nothing reads it back
 * afterwards (ADR-0019 §10).
 */
export async function inviteAccount(
  email: string,
  roleId: string,
): Promise<InviteAccountResponse> {
  return (
    await api.post<InviteAccountResponse>("/api/admin/accounts", {
      email,
      roleId,
    })
  ).data;
}

/**
 * `PUT /api/admin/accounts/:userId/role` — move an Account to another Role. It
 * applies on the target's next request, with no new sign-in; a narrowing is
 * refused from that request onward (ADR-0019 §6).
 */
export async function setAccountRole(
  userId: string,
  roleId: string,
): Promise<AccountSummary> {
  return (
    await api.put<AccountSummary>(`/api/admin/accounts/${userId}/role`, {
      roleId,
    })
  ).data;
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
  return (
    await api.put<AccountSummary>(`/api/admin/accounts/${userId}/status`, {
      isActive,
    })
  ).data;
}
