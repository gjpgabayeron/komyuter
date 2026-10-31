import type { AccountSummary } from "@komyuter/shared";

/** The one lifecycle action an Account's row offers, or none. */
export type AccountLifecycleAction = "deactivate" | "reactivate";

/** Only the fields the row's decisions depend on. */
export type AccountStatusView = Pick<
  AccountSummary,
  "userId" | "isSuperAdmin" | "isActive"
>;

/**
 * Which lifecycle action the Accounts table offers for one row.
 *
 * Two rows offer none, and both are authorization facts rather than
 * presentation choices: an Account cannot deactivate itself, and the Super
 * Admin cannot be deactivated by anyone (the server refuses both, and the
 * `protect_super_admin` trigger is the structural backstop).
 */
export function lifecycleActionFor(
  account: AccountStatusView,
  actorUserId: string,
): AccountLifecycleAction | null {
  if (account.userId === actorUserId) return null;
  if (account.isSuperAdmin) return null;
  return account.isActive ? "deactivate" : "reactivate";
}

/** The active state as the dashboard names it (CONTEXT.md, Deactivated Account). */
export function statusLabel(isActive: boolean): string {
  return isActive ? "Active" : "Deactivated";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * The Philippines has observed UTC+8 continuously since 1978 (no DST), so the
 * local wall clock of every Komyuter Account is a fixed shift away from the UTC
 * value Supabase records — applied here rather than through the host's locale
 * and timezone, which would make the same Account render differently per
 * browser.
 */
const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Last sign-in for the Accounts table: `null` is "Never" (an invited Account
 * that has not signed in yet), and an unparseable value is "Unknown" rather
 * than a fabricated date.
 */
export function lastSignInLabel(lastSignInAt: string | null): string {
  if (lastSignInAt === null) return "Never";
  const recorded = Date.parse(lastSignInAt);
  if (Number.isNaN(recorded)) return "Unknown";
  const local = new Date(recorded + PHILIPPINE_OFFSET_MS);
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
}
