import { z } from "zod";

/**
 * The canonical Permission list (ADR-0019). Each bit is written explicitly as
 * `1n << n` rather than derived from position, so inserting a Permission can
 * never renumber its neighbours. The list is a wire format: renaming a key or
 * reusing a bit is a breaking change, not a refactor.
 *
 * `bigint`, not `number`: JavaScript's `<<` is 32-bit and wraps silently.
 */
export const PERMISSIONS = {
  ROUTES_EDIT: 1n << 0n,
  FARES_EDIT: 1n << 1n,
  EXPORT_DATASET: 1n << 2n,
  MAPBOX_GEOSERVICES: 1n << 3n,
  ADMIN_MANAGE: 1n << 4n,
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_NAMES = Object.keys(PERMISSIONS) as Permission[];

/** Every declared Permission — the Super Admin's effective set. */
export const ALL_PERMISSIONS_MASK = PERMISSION_NAMES.reduce(
  (mask, permission) => mask | PERMISSIONS[permission],
  0n,
);

export function permissionMask(permissions: readonly Permission[]): bigint {
  return permissions.reduce(
    (mask, permission) => mask | PERMISSIONS[permission],
    0n,
  );
}

/** Declared names only, in catalogue order — unknown bits are ignored. */
export function permissionsFromMask(mask: bigint): Permission[] {
  return PERMISSION_NAMES.filter(
    (permission) => (mask & PERMISSIONS[permission]) !== 0n,
  );
}

export function hasPermission(mask: bigint, permission: Permission): boolean {
  return (mask & PERMISSIONS[permission]) !== 0n;
}

/** True when every bit of `subset` is present in `superset`. */
export function isPermissionSubset(subset: bigint, superset: bigint): boolean {
  return (subset & superset) === subset;
}

export function isPermissionName(value: string): value is Permission {
  return (PERMISSION_NAMES as string[]).includes(value);
}

/**
 * The actor side of every role decision. `position` is the actor's Role
 * position; the Super Admin sits above every Role and holds every Permission.
 */
export interface RoleAuthority {
  isSuperAdmin: boolean;
  position: number;
  permissions: bigint;
}

export interface RoleShape {
  position: number;
  permissions: bigint;
}

/**
 * May this actor create, edit or delete this Role? (ADR-0019 §6.)
 *
 * Strictly below the actor's position and strictly within the actor's
 * Permission set. The Super Admin is exempt: it manages the top.
 */
export function canManageRole(
  actor: RoleAuthority,
  target: RoleShape,
): boolean {
  if (actor.isSuperAdmin) {
    return true;
  }
  return (
    hasPermission(actor.permissions, "ADMIN_MANAGE") &&
    target.position < actor.position &&
    isPermissionSubset(target.permissions, actor.permissions)
  );
}

/**
 * May this actor move an Account from `current` to `target`? (M2a amendment.)
 *
 * Both sides of the move must sit strictly below the actor: otherwise an
 * `ADMIN_MANAGE` holder could reach up and demote a Role above them. Both
 * Permission sets must also be subsets of the actor's, so the move cannot strip
 * or confer a Permission the actor does not hold.
 */
export function canAssignRole(
  actor: RoleAuthority,
  target: RoleShape,
  current: RoleShape,
): boolean {
  if (actor.isSuperAdmin) {
    return true;
  }
  return (
    hasPermission(actor.permissions, "ADMIN_MANAGE") &&
    target.position < actor.position &&
    isPermissionSubset(target.permissions, actor.permissions) &&
    current.position < actor.position &&
    isPermissionSubset(current.permissions, actor.permissions)
  );
}

export const permissionSchema = z.enum(
  PERMISSION_NAMES as [Permission, ...Permission[]],
);

export const roleInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  position: z.number().int().min(0).max(10_000),
  permissions: z.array(permissionSchema).max(PERMISSION_NAMES.length),
});

export type RoleInput = z.infer<typeof roleInputSchema>;

export const inviteAccountSchema = z.object({
  email: z.string().trim().email(),
  temporaryPassword: z.string().min(12).max(128),
  roleId: z.string().trim().min(1),
});

export type InviteAccountInput = z.infer<typeof inviteAccountSchema>;

export const assignRoleSchema = z.object({
  roleId: z.string().trim().min(1),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

/**
 * Wire shapes. Permissions cross the wire as names: `bigint` is not
 * JSON-serialisable (ADR-0019, Consequences).
 */
export interface RoleSummary {
  roleId: string;
  name: string;
  position: number;
  permissions: Permission[];
}

export interface AccountSummary {
  userId: string;
  email: string;
  name: string;
  role: RoleSummary;
  isSuperAdmin: boolean;
}

export interface MeResponse extends AccountSummary {
  /** The Account's effective set — the owner's is every declared Permission. */
  permissions: Permission[];
}
