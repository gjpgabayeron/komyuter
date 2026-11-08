import type { Pool } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUniqueViolation } from "../db/errors";
import { findUserIdByEmail } from "./identity";

export type OwnerPromotionResult =
  "promoted" | "already" | "missing-identity" | "missing-account";

export interface PromoteOwnerInput {
  pool: Pool;
  supabase: SupabaseClient;
  email: string;
}

/**
 * Marks an existing Account as the Super Admin. The migration backfills every
 * Account to Administrator but cannot guess the owner; this is the one-off
 * operator step. Promotion is only `false → true`; the partial unique index
 * refuses a second owner, and the trigger refuses every later demotion.
 */
export async function promoteOwner({
  pool,
  supabase,
  email,
}: PromoteOwnerInput): Promise<OwnerPromotionResult> {
  const userId = await findUserIdByEmail(supabase, email);
  if (!userId) {
    return "missing-identity";
  }

  const existing = await pool.query<{ is_super_admin: boolean }>(
    "select is_super_admin from admin_users where user_id = $1",
    [userId],
  );
  if (existing.rowCount === 0) {
    return "missing-account";
  }
  if (existing.rows[0].is_super_admin) {
    return "already";
  }

  try {
    await pool.query(
      "update admin_users set is_super_admin = true where user_id = $1",
      [userId],
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(
        "Another Account is already the Super Admin. Ownership is single and permanent.",
      );
    }
    throw error;
  }

  return "promoted";
}
