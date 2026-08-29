/** Formats an ISO timestamp as a local, human-readable string. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/**
 * Renders a possibly-absent value for read-only display (FR-009): `null`/
 * `undefined` read "Not set" — never a bare dash (a dash doubles as the
 * "loading" affordance and hides the difference). A real `0` is a value and
 * renders as "0". Strings and non-null numbers pass through unchanged.
 */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "Not set";
  return String(value);
}
