import {
  canManageRole,
  roleShapeOf,
  type AccountSummary,
} from "@komyuter/shared";
import { authorityOfActor, type RoleActor } from "./roles";

/** The one lifecycle action an Account's row offers, or none. */
export type AccountLifecycleAction = "deactivate" | "reactivate";

/** Only the fields the row's decisions depend on. */
export type AccountStatusView = Pick<
  AccountSummary,
  "userId" | "isSuperAdmin" | "isActive" | "role"
>;

/**
 * Which lifecycle action the Accounts table offers for one row.
 *
 * Three rows offer none, and each is an authorization fact rather than a
 * presentation choice: an Account cannot change its own status, the Super
 * Admin cannot be touched by anyone, and a target at or above the actor's reach
 * cannot be changed either. The last one is the same `canManageRole` the server
 * applies before it writes — the target's **current** Role strictly below the
 * actor's Role Position and within its Permission set — so the surface never
 * offers a status change the server would refuse (ADR-0019 §5–6).
 */
export function lifecycleActionFor(
  account: AccountStatusView,
  actor: RoleActor,
): AccountLifecycleAction | null {
  if (account.userId === actor.userId) return null;
  if (account.isSuperAdmin) return null;
  if (!canManageRole(authorityOfActor(actor), roleShapeOf(account.role))) {
    return null;
  }
  return account.isActive ? "deactivate" : "reactivate";
}

/** The active state as the dashboard names it (CONTEXT.md, Deactivated Account). */
export function statusLabel(isActive: boolean): string {
  return isActive ? "Active" : "Deactivated";
}

/**
 * The Accounts table's active-state filter.
 *
 * A Deactivated Account stays on the list — deactivation keeps the identity and
 * the Role, and the surface exists to show both — but once a dashboard has more
 * than a handful of rows, "who can still sign in?" is a question the table
 * cannot answer by itself. The three states are the domain's own vocabulary
 * (Active / Deactivated), plus All, which is where the surface starts.
 */
export type AccountStatusFilter = "all" | "active" | "inactive";

/** The filter options in the order the control reads them. */
export const ACCOUNT_STATUS_FILTERS: readonly AccountStatusFilter[] = [
  "all",
  "active",
  "inactive",
];

/** The control's label for one option. */
export function accountStatusFilterLabel(filter: AccountStatusFilter): string {
  if (filter === "active") return "Active";
  if (filter === "inactive") return "Inactive";
  return "All";
}

/**
 * The rows one filter admits. `all` is a copy rather than the same array, so a
 * caller can never write through the filter into the cached Account list.
 */
export function filterAccountsByStatus<T extends { isActive: boolean }>(
  accounts: readonly T[],
  filter: AccountStatusFilter,
): T[] {
  if (filter === "all") return [...accounts];
  const wanted = filter === "active";
  return accounts.filter((account) => account.isActive === wanted);
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
