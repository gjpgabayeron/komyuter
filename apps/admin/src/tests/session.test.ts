import { describe, expect, it } from "vitest";
import { getDisplayName, getInitials } from "@/features/auth/session";

describe("getInitials", () => {
  it("uses initials from a multi-word full name", () => {
    expect(getInitials("Admin Komyuter", "admin@komyuter.ph")).toBe("AK");
  });

  it("uses the first two characters of a single-word name", () => {
    expect(getInitials("Admin", "admin@komyuter.ph")).toBe("AD");
  });

  it("falls back to the email local part when no name is present", () => {
    expect(getInitials("", "admin@komyuter.ph")).toBe("A");
  });

  it("returns a placeholder when both name and email are empty", () => {
    expect(getInitials("", "")).toBe("?");
  });
});

describe("getDisplayName", () => {
  it("prefers the full name", () => {
    expect(getDisplayName("Admin Komyuter", "admin@komyuter.ph")).toBe(
      "Admin Komyuter",
    );
  });

  it("falls back to the email local part when no name is present", () => {
    expect(getDisplayName("", "admin@komyuter.ph")).toBe("admin");
  });
});
