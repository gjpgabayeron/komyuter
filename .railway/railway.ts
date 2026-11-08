import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * Configuration as code for the `komyuter` Railway project (ADR-0022 §2).
 *
 * This file describes the staging service **as it already is**. The shape was
 * imported from the live environment, so `railway config plan` is the check
 * that source and platform agree: a clean plan, no unexpected deletions. It is
 * deliberately behaviour-preserving; the pipeline changes arrive in later
 * tickets.
 *
 * **Shape only, never values.** Secrets stay in Railway and are imported through
 * `preserve()` (ADR-0022 §2.4), so this file records no secret, no Railway UUID
 * and no generated service domain.
 *
 * `railway.json` and `railway.toml` are never used — the format cannot be
 * adopted by a new service and stops being read on 2026-12-01 (ADR-0022 §2.2).
 */
export default defineRailway(() => {
  const komyuter = service("komyuter", {
    // Staging tracks `dev`; production tracks `main`. The branch is per
    // environment, not per service (ADR-0021 §2-3). `checkSuites` refuses a
    // commit whose CI pipeline is red (ADR-0022 §5.4).
    source: github("gjpgabayeron/komyuter", {
      branch: "dev",
      checkSuites: true,
    }),

    build: {
      // An explicit builder, never framework auto-detection: this is a pnpm +
      // turbo workspace, which is the case auto-detecting builders get wrong
      // (ADR-0018 §3, ADR-0022 §1.2).
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",

      // Exactly what the image is built from, so a docs-only or mobile-only
      // push does not rebuild and redeploy the API (ADR-0022 §5.3). Every
      // workspace manifest is listed — `apps/mobile`'s included — because the
      // Dockerfile's dependency layer COPYs all of them, and
      // `supabase/migrations/**` is there because the image carries the chain
      // the pre-deploy step will apply.
      watchPatterns: [
        "Dockerfile",
        ".dockerignore",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        ".npmrc",
        "turbo.json",
        "apps/mobile/package.json",
        "apps/server/**",
        "apps/admin/**",
        "packages/shared/**",
        "packages/ui/**",
        "supabase/migrations/**",
      ],
    },

    // Exists, needs no authentication, and proves the container reaches
    // Postgres — which is what a platform health check requires (ADR-0022 §5.1).
    healthcheck: "/api/status",

    // Empty today: the guarded migration step is a later ticket, and
    // docs/DEPLOY.md §3.4 records why the command this project documented
    // cannot run on the platform as an argv with no shell.
    preDeploy: [],

    // Singapore, one replica. The nearest platform region to Iloilo City and
    // the same region in both environments, so a latency difference between
    // them is never a variable under test (ADR-0022 §6.1-6.2).
    replicas: { "asia-southeast1-eqsg3a": 1 },

    deploy: {
      // The direct Supabase host is IPv6-only; this service needs IPv6 egress
      // (docs/DEPLOY.md §3.3).
      ipv6EgressEnabled: true,
      limitOverride: {
        containers: { cpu: 4, memoryBytes: 4000000000 },
      },
      // Staging only. Production must not sleep: a cold start adds seconds to
      // the first request (ADR-0022 §8.2).
      sleepApplication: true,
    },

    // The one custom domain on staging. No generated domain is recorded:
    // Railway owns those. `ADMIN_ORIGINS` must match this hostname.
    domains: ["komyuter.gjpgabayeron.dev"],

    // Shape only: every variable is preserved rather than written, so no value
    // enters source (ADR-0022 §2.4). `ADMIN_EMAIL` and `ADMIN_PASSWORD` are
    // absent on purpose — they are not service variables at all, because the
    // running server never reads them (ADR-0022 §9).
    env: {
      ADMIN_ORIGINS: preserve(),
      ALLOW_DEV_CREDENTIAL: preserve(),
      DATABASE_URL: preserve(),
      MAPBOX_SECRET_TOKEN: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_URL: preserve(),
    },
  });

  return project("komyuter", {
    resources: [komyuter],
  });
});
