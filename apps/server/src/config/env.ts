import { existsSync } from "node:fs";
import { z } from "zod";

if (!process.env.DATABASE_URL && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_EMAIL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(6),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Optional: enables real road-network snapping via the Mapbox Directions proxy. Absent → straight-line fallback. */
  MAPBOX_SECRET_TOKEN: z.string().optional(),
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
