import { existsSync } from "node:fs";
import { z } from "zod";

if (!process.env.DATABASE_URL && existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * The owner Account's credentials, declared once and reused in the two shapes below.
 *
 * They are deliberately NOT part of the service's boot contract: nothing in the
 * running server reads them — login refuses a hardcoded `DEV_CREDENTIAL`
 * (`api/auth-login.ts`) — so requiring them at boot only put the owner's real
 * password into the serving container for no runtime reason (ADR-0022 §9). The
 * contexts that genuinely consume the pair are the one-off bootstrap script
 * (`src/scripts/bootstrap-owner.ts`) and the integration harness
 * (`tests/integration/helpers.ts`), both of which mirror the admin that
 * `supabase/seed.sql` seeds. They require it through `loadAdminCredentials`.
 */
const adminEmail = z.string().min(1);
/**
 * 12, not the 6 `supabase/config.toml` sets for the local stack: this pair protects
 * the single highest-privilege Account, and the floor has to be enforced here because
 * a Cloud project's own minimum is a dashboard setting no code can read (the M1
 * operator checklist in `docs/DEPLOY.md` §1 raises it to match). The documented local
 * seed credential is 17 characters, so development is unaffected.
 */
const adminPassword = z.string().min(12);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Optional to boot — see `loadAdminCredentials` for the contexts that require them (ADR-0022 §9). */
  ADMIN_EMAIL: adminEmail.optional(),
  ADMIN_PASSWORD: adminPassword.optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Optional: enables real road-network snapping via the Mapbox Directions proxy. Absent → straight-line fallback. */
  MAPBOX_SECRET_TOKEN: z.string().optional(),
  /**
   * Optional: the built admin SPA that this API serves (ADR-0018 §1). The
   * production image ships build artifacts only, so it sets this explicitly;
   * unset, the workspace's `apps/admin/dist` is discovered by walking up from
   * the server module. Absent entirely → the API runs without SPA hosting.
   */
  ADMIN_DIST_DIR: z.string().optional(),
  /** Development credential gate: when false (default), the documented dev credential is refused at login. */
  ALLOW_DEV_CREDENTIAL: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default(false),
  /** Comma-separated list of allowed Origin headers for the admin API. */
  ADMIN_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

/** The owner credential pair, as required by the contexts that actually consume it. */
const adminCredentialsSchema = z.object({
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: adminPassword,
});

export type AdminCredentials = z.infer<typeof adminCredentialsSchema>;

/**
 * Require the owner credential pair — the strict counterpart to the two optional
 * fields in `envSchema`.
 *
 * Separate from `loadEnv` on purpose: the service must boot without it, while the
 * two contexts that use it cannot run at all without it. The error carries zod's
 * per-field issues, so a missing or too-short value names its own variable rather
 * than surfacing later as an unexplained wrong-password denial.
 */
export function loadAdminCredentials(
  source: Record<string, string | undefined> = process.env,
): AdminCredentials {
  const result = adminCredentialsSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(
      `Invalid admin credentials: ${issues}. These are the owner Account's ` +
        `credentials — locally the pair supabase/seed.sql seeds. The bootstrap ` +
        `script and the integration harness require them; the server does not.`,
    );
  }
  return result.data;
}
