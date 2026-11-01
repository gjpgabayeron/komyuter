import { describe, expect, it } from "vitest";
import type { Permission, RoleSummary } from "@komyuter/shared";
import type { RoleActor } from "@/features/accounts/roles";
import { canResetPassword } from "@/features/accounts/reset";

/**
 * The Role catalogue `supabase/migrations/0007_authorization.sql` seeds, plus a
 * mid-position Manager like the server suite creates. Positions and Permission
 * sets are the seed's, not recomputed from the module under test.
 */
const VIEWER: RoleSummary = {
  roleId: "viewer",
  name: "Viewer",
  position: 10,
  permissions: [],
};

const PLOTTER: RoleSummary = {
  roleId: "plotter",
  name: "Plotter",
  position: 50,
  permissions: ["ROUTES_EDIT", "FARES_EDIT", "MAPBOX_GEOSERVICES"],
};

const MANAGER: RoleSummary = {
  roleId: "manager",
  name: "Manager",
  position: 60,
  permissions: ["ROUTES_EDIT", "ADMIN_MANAGE"],
};

const ADMINISTRATOR: RoleSummary = {
  roleId: "administrator",
  name: "Administrator",
  position: 100,
  permissions: [
    "ROUTES_EDIT",
    "FARES_EDIT",
    "EXPORT_DATASET",
    "MAPBOX_GEOSERVICES",
    "ADMIN_MANAGE",
  ],
};

const actorOf = (
  role: RoleSummary,
  overrides: Partial<RoleActor> = {},
): RoleActor => ({
  userId: "actor-1",
  isSuperAdmin: false,
  role,
  permissions: role.permissions as Permission[],
  ...overrides,
});

const targetOf = (
  role: RoleSummary,
  overrides: Partial<{ userId: string; isSuperAdmin: boolean }> = {},
) => ({
  userId: "target-1",
  isSuperAdmin: false,
  role,
  ...overrides,
});

describe("canResetPassword — the row's Reset password action", () => {
  it("lets an Administrator reset every Role strictly below it", () => {
    const actor = actorOf(ADMINISTRATOR);
    expect(canResetPassword(targetOf(MANAGER), actor)).toBe(true);
    expect(canResetPassword(targetOf(PLOTTER), actor)).toBe(true);
    expect(canResetPassword(targetOf(VIEWER), actor)).toBe(true);
  });

  it("lets a Manager reset a Viewer below it and within its Permissions", () => {
    expect(canResetPassword(targetOf(VIEWER), actorOf(MANAGER))).toBe(true);
  });

  it("withholds a target whose Role is outside the actor's Permission set", () => {
    // Plotter sits below the Manager but carries FARES_EDIT and
    // MAPBOX_GEOSERVICES, which the Manager does not hold.
    expect(canResetPassword(targetOf(PLOTTER), actorOf(MANAGER))).toBe(false);
  });

  it("withholds a target at or above the actor's position", () => {
    expect(canResetPassword(targetOf(ADMINISTRATOR), actorOf(MANAGER))).toBe(
      false,
    );
    // Equal position is not strictly below, so a peer at the same Role is out.
    expect(canResetPassword(targetOf(MANAGER), actorOf(MANAGER))).toBe(false);
  });

  it("withholds an Account with no ADMIN_MANAGE at all", () => {
    expect(canResetPassword(targetOf(VIEWER), actorOf(VIEWER))).toBe(false);
    expect(canResetPassword(targetOf(VIEWER), actorOf(PLOTTER))).toBe(false);
  });

  it("offers no reset on the acting Account's own row", () => {
    const actor = actorOf(ADMINISTRATOR);
    expect(
      canResetPassword(targetOf(VIEWER, { userId: actor.userId }), actor),
    ).toBe(false);
  });

  it("offers no reset on the Super Admin's row, even to the Super Admin", () => {
    const superTarget = targetOf(ADMINISTRATOR, { isSuperAdmin: true });
    expect(canResetPassword(superTarget, actorOf(ADMINISTRATOR))).toBe(false);
    expect(
      canResetPassword(
        superTarget,
        actorOf(ADMINISTRATOR, { isSuperAdmin: true }),
      ),
    ).toBe(false);
  });

  it("lets the Super Admin reset any ordinary Account", () => {
    const superActor = actorOf(ADMINISTRATOR, { isSuperAdmin: true });
    expect(canResetPassword(targetOf(ADMINISTRATOR), superActor)).toBe(true);
    expect(canResetPassword(targetOf(VIEWER), superActor)).toBe(true);
  });
});
