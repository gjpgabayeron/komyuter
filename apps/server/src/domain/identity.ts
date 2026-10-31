import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AccountIdentity } from "./authorization";

export function fullNameOf(user: {
  user_metadata?: { full_name?: unknown };
}): string {
  const value = user.user_metadata?.full_name;
  return typeof value === "string" ? value : "";
}

export function identityOf(user: User | null | undefined): AccountIdentity {
  return {
    email: user?.email ?? "",
    name: fullNameOf(user ?? {}),
  };
}

async function pageUsers(supabase: SupabaseClient) {
  const perPage = 1000;
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw error;
    }
    users.push(...data.users);
    if (data.users.length < perPage) {
      return users;
    }
  }
}

export async function listAllIdentities(
  supabase: SupabaseClient,
): Promise<Map<string, AccountIdentity>> {
  const identities = new Map<string, AccountIdentity>();
  for (const user of await pageUsers(supabase)) {
    identities.set(user.id, identityOf(user));
  }
  return identities;
}

export async function findUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const wanted = email.toLowerCase();
  for (const user of await pageUsers(supabase)) {
    if (user.email?.toLowerCase() === wanted) {
      return user.id;
    }
  }
  return null;
}
