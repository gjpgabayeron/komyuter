import {
  ALL_PERMISSIONS_MASK,
  permissionsFromMask,
  type AccountSummary,
  type MeResponse,
  type RoleAuthority,
  type RoleSummary,
} from "@komyuter/shared";

/** The resolved Account the guard attaches to every admin request. */
export interface AdminAccount {
  userId: string;
  roleId: string;
  roleName: string;
  position: number;
  /** The Role's stored set — what the Role grants, owner or not. */
  rolePermissions: bigint;
  /** The effective set: the Role's, except the owner's is every Permission. */
  permissions: bigint;
  isSuperAdmin: boolean;
  /** The lifecycle flag: a Deactivated Account is refused at the guard. */
  isActive: boolean;
  /**
   * Forced Password Change: while this is true the guard admits only the routes
   * that declare `config.passwordChangeAllowed` (ADR-0019 §11).
   */
  mustChangePassword: boolean;
}

/** A `roles` row as read from Postgres. */
export interface RoleRecord {
  role_id: string;
  name: string;
  position: number;
  permissions: bigint;
}

export interface AccountIdentity {
  email: string;
  name: string;
  /** Supabase's last successful sign-in, or null when it never recorded one. */
  lastSignInAt: string | null;
}

/**
 * The owner's effective set is every declared Permission, independent of the
 * Role it holds. This is the one place that rule is expressed.
 */
export function effectivePermissions(
  isSuperAdmin: boolean,
  rolePermissions: bigint,
): bigint {
  return isSuperAdmin ? ALL_PERMISSIONS_MASK : rolePermissions;
}

/** The policy inputs for the Account, without the stored Role metadata. */
export function authorityOf(account: AdminAccount): RoleAuthority {
  return {
    isSuperAdmin: account.isSuperAdmin,
    position: account.position,
    permissions: account.permissions,
  };
}

export function roleSummaryOf(record: RoleRecord): RoleSummary {
  return {
    roleId: record.role_id,
    name: record.name,
    position: record.position,
    permissions: permissionsFromMask(record.permissions),
  };
}

export function accountSummaryOf(
  account: AdminAccount,
  identity: AccountIdentity,
): AccountSummary {
  return {
    userId: account.userId,
    email: identity.email,
    name: identity.name,
    role: {
      roleId: account.roleId,
      name: account.roleName,
      position: account.position,
      permissions: permissionsFromMask(account.rolePermissions),
    },
    isSuperAdmin: account.isSuperAdmin,
    isActive: account.isActive,
    lastSignInAt: identity.lastSignInAt,
  };
}

export function meResponseOf(
  account: AdminAccount,
  identity: AccountIdentity,
): MeResponse {
  return {
    ...accountSummaryOf(account, identity),
    permissions: permissionsFromMask(account.permissions),
    mustChangePassword: account.mustChangePassword,
  };
}
