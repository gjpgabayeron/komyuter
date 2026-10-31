import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS_MASK,
  PERMISSIONS,
  isPermissionSubset,
  canAssignRole,
  canManageRole,
  hasPermission,
  permissionMask,
  permissionsFromMask,
  roleInputSchema,
  type RoleAuthority,
} from "@komyuter/shared";

const actor = (overrides: Partial<RoleAuthority> = {}): RoleAuthority => ({
  isSuperAdmin: false,
  position: 50,
  permissions:
    PERMISSIONS.ADMIN_MANAGE |
    PERMISSIONS.ROUTES_EDIT |
    PERMISSIONS.MAPBOX_GEOSERVICES,
  ...overrides,
});

describe("Permission catalogue", () => {
  it("uses explicit, non-overlapping bits", () => {
    expect(PERMISSIONS.ROUTES_EDIT).toBe(1n);
    expect(PERMISSIONS.FARES_EDIT).toBe(2n);
    expect(PERMISSIONS.EXPORT_DATASET).toBe(4n);
    expect(PERMISSIONS.MAPBOX_GEOSERVICES).toBe(8n);
    expect(PERMISSIONS.ADMIN_MANAGE).toBe(16n);
    expect(ALL_PERMISSIONS_MASK).toBe(31n);
  });

  it("round-trips a permission set through its mask", () => {
    const set = ["ROUTES_EDIT", "EXPORT_DATASET"] as const;
    const mask = permissionMask(set);
    expect(mask).toBe(5n);
    expect(permissionsFromMask(mask)).toEqual([...set]);
  });

  it("ignores unknown bits when decoding", () => {
    expect(permissionsFromMask(1n | (1n << 40n))).toEqual(["ROUTES_EDIT"]);
  });

  it("checks a single bit", () => {
    expect(hasPermission(5n, "ROUTES_EDIT")).toBe(true);
    expect(hasPermission(5n, "FARES_EDIT")).toBe(false);
  });

  it("is safe above 32 bits", () => {
    const high = 1n << 40n;
    expect(isPermissionSubset(high, high | 1n)).toBe(true);
    expect(isPermissionSubset(high | 1n, high)).toBe(false);
  });
});

describe("canManageRole", () => {
  it("lets the Super Admin manage any Role, including the top", () => {
    expect(
      canManageRole(actor({ isSuperAdmin: true, permissions: 0n }), {
        position: 100,
        permissions: ALL_PERMISSIONS_MASK,
      }),
    ).toBe(true);
  });

  it("requires ADMIN_MANAGE", () => {
    expect(
      canManageRole(actor({ permissions: PERMISSIONS.ROUTES_EDIT }), {
        position: 10,
        permissions: 0n,
      }),
    ).toBe(false);
  });

  it("requires a strictly lower position", () => {
    expect(canManageRole(actor(), { position: 50, permissions: 0n })).toBe(
      false,
    );
    expect(canManageRole(actor(), { position: 60, permissions: 0n })).toBe(
      false,
    );
    expect(canManageRole(actor(), { position: 40, permissions: 0n })).toBe(
      true,
    );
  });

  it("requires the target Permissions to be a subset", () => {
    expect(
      canManageRole(actor(), {
        position: 40,
        permissions: PERMISSIONS.ROUTES_EDIT,
      }),
    ).toBe(true);
    expect(
      canManageRole(actor(), {
        position: 40,
        permissions: PERMISSIONS.FARES_EDIT,
      }),
    ).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("requires both the target and the current Role below the actor", () => {
    const target = { position: 10, permissions: 0n };
    expect(
      canAssignRole(actor(), target, { position: 20, permissions: 0n }),
    ).toBe(true);
    expect(
      canAssignRole(actor(), target, { position: 60, permissions: 0n }),
    ).toBe(false);
  });

  it("requires the target Permissions to be a subset", () => {
    expect(
      canAssignRole(
        actor(),
        { position: 10, permissions: PERMISSIONS.FARES_EDIT },
        { position: 20, permissions: 0n },
      ),
    ).toBe(false);
  });

  it("requires the current Role's Permissions to be a subset too", () => {
    expect(
      canAssignRole(
        actor(),
        { position: 10, permissions: 0n },
        { position: 20, permissions: PERMISSIONS.EXPORT_DATASET },
      ),
    ).toBe(false);
  });
});

describe("roleInputSchema", () => {
  it("accepts known Permission names", () => {
    const parsed = roleInputSchema.parse({
      name: "Plotter",
      position: 50,
      permissions: ["ROUTES_EDIT", "MAPBOX_GEOSERVICES"],
    });
    expect(parsed.permissions).toEqual(["ROUTES_EDIT", "MAPBOX_GEOSERVICES"]);
  });

  it("rejects an unknown Permission name", () => {
    expect(() =>
      roleInputSchema.parse({
        name: "Plotter",
        position: 50,
        permissions: ["ROUTES_DELETE"],
      }),
    ).toThrow();
  });
});
