import { canManageRole, permissionMask } from "@komyuter/shared";
import { authorityOfActor, type RoleActor, type RoleTarget } from "./roles";

/**
 * May a row offer the "Reset password" action for this Account? (ADR-0019 §13.)
 *
 * The reach is the same rule the Role surfaces already enforce, applied to the
 * target's **current** Role: strictly below the actor's Role Position and within
 * its Permission set (`canManageRole`). Two rows never offer it — an Account's own
 * row (the self-service change is its only path) and the Super Admin's (unreachable
 * by anyone, including itself). The server refuses all three regardless; this is
 * an affordance that keeps the surface honest, not the boundary.
 */
export function canResetPassword(
  target: RoleTarget,
  actor: RoleActor,
): boolean {
  if (target.userId === actor.userId) return false;
  if (target.isSuperAdmin) return false;
  return canManageRole(authorityOfActor(actor), {
    position: target.role.position,
    permissions: permissionMask(target.role.permissions),
  });
}
