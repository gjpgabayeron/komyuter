/**
 * ADR-0022 §7.3 — the deployment's provenance, logged once at boot.
 *
 * The platform injects these four variables at runtime. The serving process
 * reads them for exactly one purpose: making "which commit is on staging?"
 * answerable from `railway logs`, which M4's rollback runbook needs. They are
 * deliberately NOT surfaced through `GET /api/status`: that route is
 * unauthenticated, and publishing the deployed revision to anonymous callers
 * buys convenience the logs already provide.
 *
 * Read from `process.env` directly rather than through `loadEnv`, for the same
 * reason `buildApp` reads `NODE_ENV` that way: these are the platform's own
 * variables, not application configuration. A service that *required* them
 * could not boot locally, and one that validated them would be validating
 * something it does not own.
 */

/** What describes the running revision, and the log key each is reported under. */
const PROVENANCE_FIELDS = {
  commitSha: "RAILWAY_GIT_COMMIT_SHA",
  branch: "RAILWAY_GIT_BRANCH",
  environment: "RAILWAY_ENVIRONMENT_NAME",
  deploymentId: "RAILWAY_DEPLOYMENT_ID",
} as const;

/**
 * The provenance fields this process was handed, keyed for logging.
 *
 * An empty result is the normal case off the platform — local dev, tests, CI —
 * and is a signal rather than an error: the caller logs nothing rather than an
 * empty record on every local start. Absent fields are omitted rather than
 * reported as `undefined`, so a partially populated environment still reads
 * correctly.
 */
export function deploymentProvenance(
  source: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const present: Record<string, string> = {};
  for (const [key, variable] of Object.entries(PROVENANCE_FIELDS)) {
    const value = source[variable];
    if (value) {
      present[key] = value;
    }
  }
  return present;
}
