import { describe, expect, it } from "vitest";
import type { Permission } from "@komyuter/shared";
import type { RoleActor } from "@/features/accounts/roles";
import {
  ACCOUNT_STATUS_FILTERS,
  accountStatusFilterLabel,
  filterAccountsByStatus,
  lastSignInLabel,
  lifecycleActionFor,
  statusLabel,
} from "@/features/accounts/status";

const VIEWER_ROLE = {
  roleId: "viewer",
  name: "Viewer",
  position: 10,
  permissions: [] as Permission[],
};

const ADMINISTRATOR_ROLE = {
  roleId: "administrator",
  name: "Administrator",
  position: 100,
  permissions: [
    "ROUTES_EDIT",
    "FARES_EDIT",
    "EXPORT_DATASET",
    "MAPBOX_GEOSERVICES",
    "ADMIN_MANAGE",
  ] as Permission[],
};

const account = (
  overrides: Partial<{
    userId: string;
    isSuperAdmin: boolean;
    isActive: boolean;
    role: typeof VIEWER_ROLE;
  }> = {},
) => ({
  userId: "account-1",
  isSuperAdmin: false,
  isActive: true,
  role: VIEWER_ROLE,
  ...overrides,
});

/** A non-owner ADMIN_MANAGE holder: Administrator at position 100. */
const actor = (overrides: Partial<RoleActor> = {}): RoleActor => ({
  userId: "actor-1",
  isSuperAdmin: false,
  role: ADMINISTRATOR_ROLE,
  permissions: ADMINISTRATOR_ROLE.permissions,
  ...overrides,
});

describe("lifecycleActionFor", () => {
  it("offers deactivation for an active Account", () => {
    expect(lifecycleActionFor(account(), actor())).toBe("deactivate");
  });

  it("offers reactivation for a Deactivated Account", () => {
    expect(lifecycleActionFor(account({ isActive: false }), actor())).toBe(
      "reactivate",
    );
  });

  it("offers no action on the acting Account's own row", () => {
    expect(
      lifecycleActionFor(account(), actor({ userId: "account-1" })),
    ).toBeNull();
    expect(
      lifecycleActionFor(
        account({ isActive: false }),
        actor({ userId: "account-1" }),
      ),
    ).toBeNull();
  });

  it("offers no action on the Super Admin's row", () => {
    expect(
      lifecycleActionFor(account({ isSuperAdmin: true }), actor()),
    ).toBeNull();
    expect(
      lifecycleActionFor(
        account({ isSuperAdmin: true, isActive: false }),
        actor(),
      ),
    ).toBeNull();
  });

  it("offers no action on a target at or above the actor's Role position", () => {
    // A peer Administrator: the server's `canManageRole` is strictly-below, so
    // the same Role as the actor's is out of reach.
    expect(
      lifecycleActionFor(account({ role: ADMINISTRATOR_ROLE }), actor()),
    ).toBeNull();
    expect(
      lifecycleActionFor(
        account({ isActive: false, role: ADMINISTRATOR_ROLE }),
        actor(),
      ),
    ).toBeNull();
  });

  it("offers no action when the target's Role holds a Permission the actor lacks", () => {
    // Plotter: below the actor, but a third of its set is outside the actor's
    // (made-up) reach — the subset half of the same rule.
    const plotter = {
      roleId: "plotter",
      name: "Plotter",
      position: 50,
      permissions: ["ROUTES_EDIT"] as Permission[],
    };
    const narrow: RoleActor = {
      ...actor(),
      permissions: ["FARES_EDIT", "ADMIN_MANAGE"],
    };
    expect(lifecycleActionFor(account({ role: plotter }), narrow)).toBeNull();
    // Within reach: strictly below and a subset, so the action is offered.
    expect(lifecycleActionFor(account({ role: plotter }), actor())).toBe(
      "deactivate",
    );
  });
});

describe("statusLabel", () => {
  it("names the two lifecycle states in the domain's vocabulary", () => {
    expect(statusLabel(true)).toBe("Active");
    expect(statusLabel(false)).toBe("Deactivated");
  });
});

describe("filterAccountsByStatus", () => {
  const rows = [
    account({ userId: "active-1" }),
    account({ userId: "inactive-1", isActive: false }),
    account({ userId: "active-2" }),
  ];

  it("keeps every Account under All", () => {
    expect(filterAccountsByStatus(rows, "all")).toHaveLength(3);
  });

  it("keeps only the Accounts whose access is live under Active", () => {
    expect(
      filterAccountsByStatus(rows, "active").map((row) => row.userId),
    ).toEqual(["active-1", "active-2"]);
  });

  it("keeps only the Deactivated Accounts under Inactive", () => {
    expect(
      filterAccountsByStatus(rows, "inactive").map((row) => row.userId),
    ).toEqual(["inactive-1"]);
  });

  it("never mutates the list it filters", () => {
    const filtered = filterAccountsByStatus(rows, "inactive");
    expect(filtered).not.toBe(rows);
    expect(rows).toHaveLength(3);
  });

  it("offers exactly the three states, named as the table names them", () => {
    expect(ACCOUNT_STATUS_FILTERS).toEqual(["all", "active", "inactive"]);
    expect(ACCOUNT_STATUS_FILTERS.map(accountStatusFilterLabel)).toEqual([
      "All",
      "Active",
      "Inactive",
    ]);
  });
});

describe("lastSignInLabel", () => {
  it("reads Never when the identity never signed in", () => {
    expect(lastSignInLabel(null)).toBe("Never");
  });

  it("reads Unknown when the recorded value is not a date", () => {
    expect(lastSignInLabel("not-a-date")).toBe("Unknown");
  });

  it("renders the sign-in in Philippine time", () => {
    // 2026-03-13T06:05:00Z is 14:05 on the same day in Iloilo (UTC+8).
    expect(lastSignInLabel("2026-03-13T06:05:00Z")).toBe("13 Mar 2026, 14:05");
  });

  it("rolls the date forward across the Philippine midnight", () => {
    // 2026-03-13T16:30:00Z is 00:30 on 14 March in Iloilo.
    expect(lastSignInLabel("2026-03-13T16:30:00Z")).toBe("14 Mar 2026, 00:30");
  });
});
