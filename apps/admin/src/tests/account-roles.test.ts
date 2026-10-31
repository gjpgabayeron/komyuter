import { describe, expect, it } from "vitest";
import type { Permission, RoleSummary } from "@komyuter/shared";
import {
  assignableRoleChanges,
  assignableRoles,
  type RoleActor,
} from "@/features/accounts/roles";

/**
 * The Role catalogue `supabase/migrations/0007_authorization.sql` seeds, plus a
 * mid-position manager like the server suite creates. Positions and Permission
 * sets are taken from the seed, not recomputed from the module under test.
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

const ROLES = [ADMINISTRATOR, MANAGER, PLOTTER, VIEWER];

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

const ids = (roles: readonly RoleSummary[]) => roles.map((role) => role.roleId);

describe("assignableRoles — the invite picker", () => {
  it("offers an Administrator every Role strictly below it", () => {
    expect(ids(assignableRoles(actorOf(ADMINISTRATOR), ROLES))).toEqual([
      "manager",
      "plotter",
      "viewer",
    ]);
  });

  it("withholds the actor's own Role — equal position is not below", () => {
    const offered = ids(assignableRoles(actorOf(MANAGER), ROLES));
    expect(offered).not.toContain("manager");
    expect(offered).not.toContain("administrator");
  });

  it("offers only Roles within the actor's Permission set", () => {
    // Plotter sits below the Manager but carries FARES_EDIT and
    // MAPBOX_GEOSERVICES, which the Manager does not hold.
    expect(ids(assignableRoles(actorOf(MANAGER), ROLES))).toEqual(["viewer"]);
  });

  it("offers the Super Admin every Role, including the top one", () => {
    expect(
      ids(
        assignableRoles(actorOf(ADMINISTRATOR, { isSuperAdmin: true }), ROLES),
      ),
    ).toEqual(["administrator", "manager", "plotter", "viewer"]);
  });

  it("offers nothing to an Account with no assignable Role", () => {
    expect(assignableRoles(actorOf(VIEWER), ROLES)).toEqual([]);
  });
});

describe("assignableRoleChanges — a row's Role picker", () => {
  const targetOf = (
    role: RoleSummary,
    overrides: Partial<RoleSummary> = {},
  ) => ({
    userId: "target-1",
    isSuperAdmin: false,
    role: { ...role, ...overrides },
  });

  it("offers an Administrator the Roles it may move a Viewer to", () => {
    expect(
      ids(
        assignableRoleChanges(targetOf(VIEWER), actorOf(ADMINISTRATOR), ROLES),
      ),
    ).toEqual(["manager", "plotter", "viewer"]);
  });

  it("offers the Super Admin's picker every Role for the same target", () => {
    expect(
      ids(
        assignableRoleChanges(
          targetOf(VIEWER),
          actorOf(ADMINISTRATOR, { isSuperAdmin: true }),
          ROLES,
        ),
      ),
    ).toEqual(["administrator", "manager", "plotter", "viewer"]);
  });

  it("withholds every Role when the target's current Role is out of reach", () => {
    // Both sides of the move must be within reach: the Manager cannot touch a
    // Plotter at all, because Plotter holds Permissions it does not.
    expect(
      ids(assignableRoleChanges(targetOf(PLOTTER), actorOf(MANAGER), ROLES)),
    ).toEqual([]);
  });

  it("offers a Manager only the Roles it may both leave and reach", () => {
    expect(
      ids(assignableRoleChanges(targetOf(VIEWER), actorOf(MANAGER), ROLES)),
    ).toEqual(["viewer"]);
  });

  it("offers nothing on the acting Account's own row", () => {
    const actor = actorOf(ADMINISTRATOR);
    expect(
      assignableRoleChanges(
        { userId: actor.userId, isSuperAdmin: false, role: VIEWER },
        actor,
        ROLES,
      ),
    ).toEqual([]);
  });

  it("offers nothing on the Super Admin's row", () => {
    expect(
      assignableRoleChanges(
        { userId: "owner-1", isSuperAdmin: true, role: ADMINISTRATOR },
        actorOf(ADMINISTRATOR, { isSuperAdmin: true }),
        ROLES,
      ),
    ).toEqual([]);
  });
});
