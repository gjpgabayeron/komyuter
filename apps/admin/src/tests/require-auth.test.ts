import { describe, expect, it } from "vitest";
import { getReturnPath } from "@/features/auth/redirect";

describe("getReturnPath", () => {
  it("returns a stored internal returnTo path", () => {
    expect(getReturnPath({ returnTo: "/fares" })).toBe("/fares");
  });

  it("returns the fallback when no state is present", () => {
    expect(getReturnPath(null)).toBe("/");
  });

  it("returns the fallback when returnTo is missing", () => {
    expect(getReturnPath({})).toBe("/");
  });

  it("rejects non-string returnTo values", () => {
    expect(getReturnPath({ returnTo: 42 })).toBe("/");
  });

  it("rejects external URLs to prevent open redirects", () => {
    expect(getReturnPath({ returnTo: "https://evil.example" })).toBe("/");
    expect(getReturnPath({ returnTo: "//evil.example" })).toBe("/");
  });
});
