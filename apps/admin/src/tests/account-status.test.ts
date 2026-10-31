import { describe, expect, it } from "vitest";
import {
  lastSignInLabel,
  lifecycleActionFor,
  statusLabel,
} from "@/features/accounts/status";

const account = (
  overrides: Partial<{
    userId: string;
    isSuperAdmin: boolean;
    isActive: boolean;
  }> = {},
) => ({
  userId: "account-1",
  isSuperAdmin: false,
  isActive: true,
  ...overrides,
});

describe("lifecycleActionFor", () => {
  it("offers deactivation for an active Account", () => {
    expect(lifecycleActionFor(account(), "actor-1")).toBe("deactivate");
  });

  it("offers reactivation for a Deactivated Account", () => {
    expect(lifecycleActionFor(account({ isActive: false }), "actor-1")).toBe(
      "reactivate",
    );
  });

  it("offers no action on the acting Account's own row", () => {
    expect(lifecycleActionFor(account(), "account-1")).toBeNull();
    expect(
      lifecycleActionFor(account({ isActive: false }), "account-1"),
    ).toBeNull();
  });

  it("offers no action on the Super Admin's row", () => {
    expect(
      lifecycleActionFor(account({ isSuperAdmin: true }), "actor-1"),
    ).toBeNull();
    expect(
      lifecycleActionFor(
        account({ isSuperAdmin: true, isActive: false }),
        "actor-1",
      ),
    ).toBeNull();
  });
});

describe("statusLabel", () => {
  it("names the two lifecycle states in the domain's vocabulary", () => {
    expect(statusLabel(true)).toBe("Active");
    expect(statusLabel(false)).toBe("Deactivated");
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
