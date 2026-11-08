import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * Configuration as code for the `komyuter` Railway project (ADR-0022 §2).
 *
 * One authoring file describes both long-lived environments. The program runs
 * once per linked environment, so `ctx.isEnvironment("production")` is the only
 * place the two differ: the branch, the custom domain, the origin allow-list,
 * the EXPECTED_* guards and App Sleeping. The image and the service shape are
 * the same, which is what lets a Release be promoted rather than rebuilt
 * (ADR-0018 §2).
 *
 * **Shape only, never values.** Secrets stay in Railway and are imported through
 * `preserve()` (ADR-0022 §2.4), so this file records no secret and no generated
 * service domain. `railway.json` and `railway.toml` are never used — the format
 * cannot be adopted by a new service and stops being read on 2026-12-01
 * (ADR-0022 §2.2).
 *
 * Staging already exists. Production is declared here but is not provisioned
 * until ticket #75 creates its data plane; `railway config plan --environment
 * production` is the reviewed create, and `railway config apply` is not run
 * until that plan is approved.
 */
export default defineRailway((ctx) => {
  const production = ctx.isEnvironment("production");

  const komyuter = service("komyuter", {
    // Staging tracks `dev`; production tracks `main`. The branch is per
    // environment, not per service (ADR-0021 §2-3). `checkSuites` refuses a
    // commit whose CI pipeline is red (ADR-0022 §5.4).
    source: github("gjpgabayeron/komyuter", {
      branch: production ? "main" : "dev",
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
      // `supabase/migrations/**` and `deploy/**` are there because the image
      // carries the chain and the guarded pre-deploy runner the step executes.
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
        "deploy/**",
      ],
    },

    // Exists, needs no authentication, and proves the container reaches
    // Postgres — which is what a platform health check requires (ADR-0022 §5.1).
    healthcheck: "/api/status",

    // The guarded migration runner the image carries (deploy/pre-deploy.mjs).
    // It refuses to run unless RAILWAY_ENVIRONMENT_NAME, EXPECTED_ENVIRONMENT and
    // EXPECTED_SUPABASE_PROJECT_REF agree, then applies the chain before the new
    // container serves traffic (ADR-0022 §3.1). A failure fails the deployment;
    // the previous healthy container keeps serving (docs/DEPLOY.md §3.4).
    preDeploy: ["/app/deploy/pre-deploy.mjs"],

    // Singapore, one replica. The nearest platform region to Iloilo City and
    // the same region in both environments, so a latency difference between
    // them is never a variable under test (ADR-0022 §6.1-6.2).
    replicas: { "asia-southeast1-eqsg3a": 1 },

    deploy: {
      // The direct Supabase host is IPv6-only; this service needs IPv6 egress
      // (docs/DEPLOY.md §3.3).
      ipv6EgressEnabled: true,
      // A crash loop is reported rather than restarted forever (ADR-0022 §5.2).
      // Do not set restartPolicyType here: Railway's effective default is
      // ON_FAILURE, but the stored service config reports the default as null,
      // so an explicit "ON_FAILURE" plans as permanent drift. The effective
      // policy is still ON_FAILURE; the bounded retry count stays explicit.
      restartPolicyMaxRetries: 5,
      limitOverride: {
        containers: { cpu: 4, memoryBytes: 4000000000 },
      },
      // The migration step gets 300s before the platform fails the deployment;
      // the chain takes well under that (ADR-0022 §3.1).
      preDeployTimeoutSeconds: 300,
      // Staging only. Production must not sleep: a cold start adds seconds to
      // the first request (ADR-0022 §8.2).
      sleepApplication: !production,
    },

    // The custom domain per environment. No generated domain is recorded:
    // Railway owns those. `ADMIN_ORIGINS` must match this hostname.
    //
    // Staging moved to `komyuter-dev` so the bare `komyuter.gjpgabayeron.dev`
    // is free for production at go-live (ticket #79). Operational order matters
    // and is not expressible here: add the new domain and its DNS record first,
    // wait for the certificate, verify a sign-in on the new hostname, and only
    // then drop the old origin from `ADMIN_ORIGINS` — otherwise there is a
    // window with no working origin. The cutover procedure is docs/DEPLOY.md
    // §3.9.
    domains: [
      {
        domain: production
          ? "komyuter.gjpgabayeron.dev"
          : "komyuter-dev.gjpgabayeron.dev",
        port: 8080,
      },
    ],

    // Secrets are preserved rather than written, so no value enters source
    // (ADR-0022 §2.4). `ADMIN_ORIGINS` is a literal, not preserved, because it
    // is not a secret and must track the custom domain above — the origin guard
    // refuses any request whose `Origin` is not allow-listed (ADR-0021). The
    // two EXPECTED_* guards are the pre-deploy runner's environment and
    // project-ref checks (deploy/pre-deploy.mjs); neither is a secret, so both
    // are literals. RAILWAY_ENVIRONMENT_NAME is absent because the platform
    // injects it. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are absent on purpose —
    // they are not service variables at all, because the running server never
    // reads them (ADR-0022 §9).
    env: {
      ADMIN_ORIGINS: production
        ? "https://komyuter.gjpgabayeron.dev"
        : "https://komyuter-dev.gjpgabayeron.dev",
      ALLOW_DEV_CREDENTIAL: "false",
      DATABASE_URL: preserve(),
      EXPECTED_ENVIRONMENT: production ? "production" : "staging",
      // The production project ref arrives with #75, before the first deploy.
      // It is preserved rather than written so no fake ref can be planned into
      // the service; the pre-deploy runner refuses to run without it.
      EXPECTED_SUPABASE_PROJECT_REF: production
        ? preserve()
        : "prmccdmsqtywprmfaluf",
      MAPBOX_SECRET_TOKEN: preserve(),
      NODE_ENV: "production",
      PORT: "8080",
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_URL: preserve(),
    },
  });

  return project("komyuter", {
    environments: ["staging", "production"],
    resources: [komyuter],
  });
});
