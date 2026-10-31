import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attribution } from "@komyuter/shared";
import { listAllIdentities } from "./identity";

/**
 * Attribution (ADR-0025): every Route, Direction and Stop records the Account
 * that created it and the Account that last wrote it.
 *
 * Three rules live here and nowhere else:
 *
 * - **The actor comes from the resolved guard identity**, never from request
 *   input — the server is the only writer, so a client cannot forge provenance.
 * - **Create sets both columns; update moves only `updated_by`.** `created_by`
 *   is written once and never touched again, so "who made this" and "who
 *   touched it last" stay different questions with different answers.
 * - **Null means "not recorded".** Rows that predate the columns are not
 *   backfilled, and a row that is updated for the first time after M2b gains a
 *   last writer while its creator stays unrecorded.
 */

/** The columns a create writes: the acting Account is both creator and writer. */
export function createAttribution(actorId: string) {
  return { created_by: actorId, updated_by: actorId };
}

/** The columns an update writes: `created_by` is deliberately absent. */
export function updateAttribution(actorId: string) {
  return { updated_by: actorId };
}

/** Maps stored Account ids to `{ userId, name }` for one request. */
export type AttributionResolver = (userId: string | null) => Attribution;

/**
 * A resolver over one identity listing. A missing identity — an auth user the
 * provider no longer knows — degrades to the id with an empty name rather than
 * failing the request (ADR-0025 consequences).
 */
export function attributionResolverFrom(
  identities: Map<string, { name: string }>,
): AttributionResolver {
  return (userId) => {
    if (!userId) {
      return null;
    }
    return { userId, name: identities.get(userId)?.name ?? "" };
  };
}

/**
 * The identity source the Accounts surface already uses — `listAllIdentities`,
 * not a second lookup — read ONCE per request and mapped over the rows, so a
 * response never costs one identity lookup per entity.
 */
export async function loadAttributionResolver(
  supabase: SupabaseClient,
): Promise<AttributionResolver> {
  return attributionResolverFrom(await listAllIdentities(supabase));
}
