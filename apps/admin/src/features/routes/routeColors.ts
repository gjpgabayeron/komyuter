/** Route Sign palette seed colours (used for the random new-route default). */
export const ROUTE_COLORS = [
  "#1B6DB2",
  "#1F9E6B",
  "#C98A1B",
  "#7A5FC0",
] as const;

export const DEFAULT_ROUTE_COLOR = ROUTE_COLORS[0];

/** Validates a #RRGGBB hex colour string. */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
