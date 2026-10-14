import { describe, expect, it } from "vitest";
import { loadAdminCredentials, loadEnv } from "../../src/config/env";

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  ADMIN_EMAIL: "admin@komyuter.ph",
  ADMIN_PASSWORD: "komyuter-admin-dev",
};

/** A production-shaped source: everything the server runs on, and no owner credentials. */
const SERVICE_ENV: Record<string, string> = {
  DATABASE_URL: BASE_ENV.DATABASE_URL,
  SUPABASE_URL: BASE_ENV.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: BASE_ENV.SUPABASE_SERVICE_ROLE_KEY,
};

describe("loadEnv", () => {
  it("defaults ALLOW_DEV_CREDENTIAL to false and ADMIN_ORIGINS to the local dev origins", () => {
    const env = loadEnv(BASE_ENV);
    expect(env.ALLOW_DEV_CREDENTIAL).toBe(false);
    expect(env.ADMIN_ORIGINS).toBe(
      "http://localhost:5173,http://127.0.0.1:5173",
    );
  });

  it("parses ALLOW_DEV_CREDENTIAL=true as true and false as false; rejects other values", () => {
    expect(
      loadEnv({ ...BASE_ENV, ALLOW_DEV_CREDENTIAL: "true" })
        .ALLOW_DEV_CREDENTIAL,
    ).toBe(true);
    expect(
      loadEnv({ ...BASE_ENV, ALLOW_DEV_CREDENTIAL: "false" })
        .ALLOW_DEV_CREDENTIAL,
    ).toBe(false);
    expect(() => loadEnv({ ...BASE_ENV, ALLOW_DEV_CREDENTIAL: "1" })).toThrow(
      /Invalid environment/,
    );
  });

  it("accepts an explicit ADMIN_ORIGINS value", () => {
    const env = loadEnv({
      ...BASE_ENV,
      ADMIN_ORIGINS: "https://admin.komyuter.ph",
    });
    expect(env.ADMIN_ORIGINS).toBe("https://admin.komyuter.ph");
  });

  it("still requires the existing mandatory variables", () => {
    expect(() => loadEnv({ ...BASE_ENV, DATABASE_URL: "" })).toThrow(
      /Invalid environment/,
    );
  });

  // ADR-0022 §9: the deployed service must not carry the owner's password. Nothing
  // in the running server reads it (login refuses a hardcoded DEV_CREDENTIAL), so a
  // service-shaped environment has to load.
  it("loads without the owner credentials the server never reads", () => {
    const env = loadEnv(SERVICE_ENV);
    expect(env.ADMIN_EMAIL).toBeUndefined();
    expect(env.ADMIN_PASSWORD).toBeUndefined();
    // Absent credentials must not disturb the rest of the contract.
    expect(env.DATABASE_URL).toBe(BASE_ENV.DATABASE_URL);
    expect(env.SUPABASE_URL).toBe(BASE_ENV.SUPABASE_URL);
    expect(env.PORT).toBe(3000);
    expect(env.ALLOW_DEV_CREDENTIAL).toBe(false);
  });

  // The relaxation above is exactly two fields. Each of the others must still be
  // refused when missing, or the change has quietly weakened the boot contract.
  it("still refuses a service-shaped env that is missing a variable the server does need", () => {
    for (const key of [
      "DATABASE_URL",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(() => loadEnv({ ...SERVICE_ENV, [key]: "" })).toThrow(
        /Invalid environment/,
      );
    }
  });
});

describe("loadAdminCredentials", () => {
  it("returns the pair for the contexts that actually consume it", () => {
    expect(loadAdminCredentials(BASE_ENV)).toEqual({
      ADMIN_EMAIL: "admin@komyuter.ph",
      ADMIN_PASSWORD: "komyuter-admin-dev",
    });
  });

  // The bootstrap script and the integration harness cannot operate without these,
  // so the failure has to name the variable rather than surface as a wrong password.
  it("names the missing variable when the email is absent", () => {
    expect(() =>
      loadAdminCredentials({ ADMIN_PASSWORD: BASE_ENV.ADMIN_PASSWORD }),
    ).toThrow(/ADMIN_EMAIL/);
  });

  it("names the missing variable when the password is absent", () => {
    expect(() =>
      loadAdminCredentials({ ADMIN_EMAIL: BASE_ENV.ADMIN_EMAIL }),
    ).toThrow(/ADMIN_PASSWORD/);
  });

  // 12, not the local stack's 6 (docs/DEPLOY.md §1): this pair protects the single
  // highest-privilege Account, and the floor has to live here because a Cloud
  // project's own minimum is a dashboard setting no code can read.
  it("enforces a 12-character minimum for the owner password", () => {
    expect(() =>
      loadAdminCredentials({
        ADMIN_EMAIL: BASE_ENV.ADMIN_EMAIL,
        ADMIN_PASSWORD: "elevenchars",
      }),
    ).toThrow(/ADMIN_PASSWORD/);

    expect(() =>
      loadAdminCredentials({
        ADMIN_EMAIL: BASE_ENV.ADMIN_EMAIL,
        ADMIN_PASSWORD: "twelve-chars",
      }),
    ).not.toThrow();
  });
});
