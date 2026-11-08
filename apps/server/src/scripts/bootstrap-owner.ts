import { Pool } from "pg";
import { loadAdminCredentials, loadEnv } from "../config/env";
import { createSupabaseAdmin } from "../config/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One-off owner bootstrap (ROADMAP M1).
 *
 * There is no dashboard surface that can create the FIRST Account: every admin
 * route sits behind the auth guard, which is a membership check against
 * `admin_users`, and the login endpoint refuses any identity that is not
 * already in that table. So the first Account is made out of band, by this
 * script, holding the service-role key.
 *
 * Two rows make an Account, and both are needed (ADR-0018 §4: Supabase Cloud is
 * also the production database, because `admin_users.user_id` is a foreign key
 * to `auth.users.id` — no Account can exist without an auth identity):
 *
 *   1. the auth identity, with `email_confirm: true` — login goes through
 *      `signInWithPassword`, which refuses an unconfirmed email, and
 *      `supabase/seed.sql` (the documented DEV credential) is deliberately never
 *      applied to production; and
 *   2. the `admin_users` row, which is what every admin gate actually checks.
 *
 * Idempotent by design: re-running adopts the existing identity and does not
 * fail, so the script is safe to run twice.
 *
 * Run with `pnpm --filter server bootstrap:owner` and ADMIN_EMAIL /
 * ADMIN_PASSWORD / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL set.
 * The first two are required by THIS script (and the integration harness), not by
 * the running server, which boots without them (ADR-0022 §9) — so they belong in
 * the operator's shell, never in the deployed service's variables.
 */
async function findUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  // supabase-js has no get-user-by-email, so page through the admin listing.
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw error;
    }
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) {
      return match.id;
    }
    if (data.users.length < perPage) {
      return null;
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  // Read through the strict reader: this script cannot do its job without the
  // owner credentials, while the server deliberately boots without them
  // (ADR-0022 §9).
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } =
    loadAdminCredentials();
  const supabase = createSupabaseAdmin(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Owner" },
    });

  let userId: string;
  if (createError) {
    const existing = await findUserIdByEmail(supabase, email);
    if (!existing) {
      throw createError;
    }
    userId = existing;
    console.log(`Auth identity for ${email} already exists; adopting it.`);
  } else if (created.user) {
    userId = created.user.id;
    console.log(`Created auth identity for ${email}.`);
  } else {
    throw new Error("createUser returned no user");
  }

  // Raw pg rather than the drizzle client: `createDb` encapsulates its pool, so
  // this script could not close it and would hang instead of exiting. Mirrors
  // the insert the integration helpers already perform. The seeded Administrator
  // Role exists as of migration 0007; ownership is the `is_super_admin` property,
  // not a Role (ADR-0019). Re-running promotes an existing row rather than
  // leaving a pre-0007 Account without the ownership flag.
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const existing = await pool.query(
      "select 1 from admin_users where user_id = $1",
      [userId],
    );
    await pool.query(
      `insert into admin_users (user_id, role_id, is_super_admin)
       values ($1, 'administrator', true)
       on conflict (user_id) do update set is_super_admin = true`,
      [userId],
    );
    console.log(
      existing.rowCount === 1
        ? `Adopted ${email} (${userId}) as the Super Admin.`
        : `Granted the Super Admin ownership to ${email} (${userId}).`,
    );
  } finally {
    await pool.end();
  }

  console.log(`\nOwner ready: ${email} (user_id ${userId})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
