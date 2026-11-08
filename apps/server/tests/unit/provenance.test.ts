import { describe, expect, it } from "vitest";
import { deploymentProvenance } from "../../src/config/provenance";

const PLATFORM_ENV: Record<string, string> = {
  RAILWAY_GIT_COMMIT_SHA: "773964052959334663bccb40ce035d8dd1f21969",
  RAILWAY_GIT_BRANCH: "dev",
  RAILWAY_ENVIRONMENT_NAME: "staging",
  RAILWAY_DEPLOYMENT_ID: "c4b1a8f2-0000-4000-8000-0f5f2f0b1a3e",
  // Present so the test can prove only Railway's variables are picked up: the
  // server's own configuration must not leak into a provenance log line.
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

describe("deploymentProvenance", () => {
  // ADR-0022 §7.3: "which commit is on staging?" has to be answerable from
  // `railway logs`, which is the whole reason the fields are read at all.
  it("reports every field the platform set, under a log-friendly key", () => {
    expect(deploymentProvenance(PLATFORM_ENV)).toEqual({
      commitSha: PLATFORM_ENV.RAILWAY_GIT_COMMIT_SHA,
      branch: "dev",
      environment: "staging",
      deploymentId: PLATFORM_ENV.RAILWAY_DEPLOYMENT_ID,
    });
  });

  it("reports nothing else from the environment, secrets included", () => {
    const provenance = deploymentProvenance(PLATFORM_ENV);
    expect(Object.keys(provenance).sort()).toEqual([
      "branch",
      "commitSha",
      "deploymentId",
      "environment",
    ]);
  });

  // A partially populated environment is the realistic shape: the deployment
  // id is absent when the platform did not inject it, and the line must still
  // name the commit rather than print `undefined` beside it.
  it("omits fields that are absent or empty instead of reporting undefined", () => {
    expect(
      deploymentProvenance({
        RAILWAY_GIT_COMMIT_SHA: PLATFORM_ENV.RAILWAY_GIT_COMMIT_SHA,
        RAILWAY_GIT_BRANCH: "",
      }),
    ).toEqual({ commitSha: PLATFORM_ENV.RAILWAY_GIT_COMMIT_SHA });
  });

  // Local dev, tests and CI all reach this. The caller treats an empty result as
  // "not on a platform" and logs nothing, so this has to be distinguishable from
  // a populated one — an empty object is that signal.
  it("returns nothing when the platform supplied nothing", () => {
    expect(deploymentProvenance({})).toEqual({});
    expect(deploymentProvenance({ PATH: "/usr/bin" })).toEqual({});
  });
});
