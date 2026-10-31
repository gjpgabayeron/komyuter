import type { Attribution } from "@komyuter/shared";

/**
 * What an admin reads where attribution is missing — a row written before the
 * columns existed, or a draft stop that has not been saved yet. The interface
 * never invents an actor (ADR-0025 §2).
 */
export const NOT_RECORDED = "Not recorded";

/**
 * The one formatter for Attribution on the plotted path: the properties panel
 * and the stop editor both read a `{ userId, name } | null` and render this.
 *
 * The name is the Account's current name. When the identity lookup could not
 * name it — an auth user the provider no longer knows — the id is the honest
 * answer, so the reference is never rendered as a blank cell.
 */
export function formatAttributionName(value: Attribution | undefined): string {
  if (!value) {
    return NOT_RECORDED;
  }
  const name = value.name.trim();
  return name === "" ? value.userId : name;
}
