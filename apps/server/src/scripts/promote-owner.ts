import { Pool } from "pg";
import { loadEnv } from "../config/env";
import { createSupabaseAdmin } from "../config/supabase";
import { promoteOwner } from "../domain/owner-promotion";

/**
 * One-off owner promotion for an environment that predates migration 0007.
 *
 * The migration backfills every existing Account to the seeded Administrator
 * Role, but it deliberately does not guess who the owner is — `admin_users` had
 * no timestamp to order by, and committing an email into SQL would be wrong for
 * every environment but one. This script marks the named Account with the
 * ownership property; it is idempotent and refuses to invent an Account.
 *
 * Run with `pnpm --filter server promote:owner` and OWNER_EMAIL plus the same
 * variables `bootstrap:owner` uses:
 *   OWNER_EMAIL, DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * On a brand-new environment, `bootstrap:owner` already writes the flag, so this
 * script is only for the existing staging Account.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const email = process.env.OWNER_EMAIL?.trim();
  if (!email) {
    throw new Error("OWNER_EMAIL is required");
  }

  const supabase = createSupabaseAdmin(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const result = await promoteOwner({ pool, supabase, email });
    switch (result) {
      case "missing-identity":
        throw new Error(
          `No auth identity for ${email}. Run bootstrap:owner first, or create the identity.`,
        );
      case "missing-account":
        throw new Error(
          `${email} has no Account row. Run bootstrap:owner first.`,
        );
      case "already":
        console.log(`${email} is already the Super Admin.`);
        break;
      case "promoted":
        console.log(`Promoted ${email} to Super Admin.`);
        break;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
