import {
  canAssignRole,
  canManageRole,
  permissionMask,
  type Permission,
  type RoleAuthority,
  type RoleShape,
  type RoleSummary,
} from "@komyuter/shared";

/**
 * An Account as the Role decisions need it. `permissions` is the **effective**
 * set the server resolved (`GET /api/admin/me`), and `role` is the Role it
 * holds — the two differ only for the Super Admin, whose effective set is every
 * declared Permission.
 */
export interface RoleActor {
  userId: string;
  isSuperAdmin: boolean;
  role: RoleSummary;
  permissions: Permission[];
}

/** A row a Role change could be applied to. */
export interface RoleTarget {
  userId: string;
  isSuperAdmin: boolean;
  role: RoleSummary;
}

/** The policy's input for one Role: its position and its Permission mask. */
function shapeOf(role: RoleSummary): RoleShape {
  return {
    position: role.position,
    permissions: permissionMask(role.permissions),
  };
}

/**
 * The actor side of every Role decision, built from the effective set.
 *
 * The SPA never re-implements the reach rule: `canManageRole` and
 * `canAssignRole` are the same functions the server enforces, so an option this
 * module offers is one the server accepts, and a Role it withholds is one the
 * server would refuse (ADR-0019 §6, §9).
 */
export function authorityOfActor(actor: RoleActor): RoleAuthority {
  return {
    isSuperAdmin: actor.isSuperAdmin,
    position: actor.role.position,
    permissions: permissionMask(actor.permissions),
  };
}

/**
 * The Roles the invite picker may offer: those the actor may manage — strictly
 * below its own position and strictly within its own Permission set, with the
 * Super Admin exempt. The catalogue order is preserved, so the list reads the
 * same way as the Role list itself.
 */
export function assignableRoles(
  actor: RoleActor,
  roles: readonly RoleSummary[],
): RoleSummary[] {
  const authority = authorityOfActor(actor);
  return roles.filter((role) => canManageRole(authority, shapeOf(role)));
}

/**
 * The Roles a row may move its target to, or `[]` when the row offers no Role
 * change at all.
 *
 * Three rows offer none, and each is an authorization fact rather than a
 * presentation choice: an Account cannot change its own Role, no one changes the
 * Super Admin's, and a target at or above the actor's reach cannot be touched
 * (both sides of the move are checked by `canAssignRole`). The server refuses
 * all three regardless.
 */
export function assignableRoleChanges(
  target: RoleTarget,
  actor: RoleActor,
  roles: readonly RoleSummary[],
): RoleSummary[] {
  if (target.userId === actor.userId) return [];
  if (target.isSuperAdmin) return [];

  const authority = authorityOfActor(actor);
  const current = shapeOf(target.role);
  return roles.filter((role) =>
    canAssignRole(authority, shapeOf(role), current),
  );
}
