import { describe, expect, it } from "vitest";
import { securityHeaders } from "../../src/api/security-headers";

describe("securityHeaders", () => {
  it("sets the header-only directives a <meta> CSP cannot express", () => {
    const headers = securityHeaders(false);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  // The dev stack is plain HTTP, so an HSTS header locally would make a browser
  // refuse the very origin it just learned to trust.
  it("omits HSTS outside production", () => {
    expect(securityHeaders(false)["strict-transport-security"]).toBeUndefined();
  });

  it("adds HSTS in production, without includeSubDomains or preload", () => {
    const hsts = securityHeaders(true)["strict-transport-security"];
    expect(hsts).toBe("max-age=31536000");
    // Neither belongs here: `includeSubDomains` would extend the policy to hosts
    // this project does not control, and `preload` is a one-way door into a
    // browser's shipped list.
    expect(hsts).not.toMatch(/includeSubDomains/i);
    expect(hsts).not.toMatch(/preload/i);
  });

  // The layering decision, pinned: the build-time `<meta>` CSP owns the directives
  // that depend on what the frontend talks to. A second, independent policy here
  // would be enforced as an intersection, so drifting apart would silently break
  // the SPA — for example by shadowing `connect-src`.
  it("supplies only what a meta tag cannot, so the two layers cannot conflict", () => {
    const policy = securityHeaders(true)["content-security-policy"] ?? "";
    for (const frontendOwned of [
      "default-src",
      "script-src",
      "style-src",
      "connect-src",
      "img-src",
      "font-src",
    ]) {
      expect(policy).not.toContain(frontendOwned);
    }
  });
});
