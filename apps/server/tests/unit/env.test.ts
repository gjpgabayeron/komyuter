import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env";

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  ADMIN_EMAIL: "admin@komyuter.ph",
  ADMIN_PASSWORD: "komyuter-admin-dev",
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
});
