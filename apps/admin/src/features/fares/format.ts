/**
 * Exact-value display helpers (SC-007): fares, distances, and discounts are
 * shown as stored — never fabricated into round numbers. Whole values drop
 * their decimal zeros; fractional values keep up to two decimals.
 */

function trimFixed(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/** Peso display: whole pesos without decimals, otherwise exactly two. */
export function formatPeso(value: number): string {
  if (Number.isInteger(value)) {
    return `₱${value}`;
  }
  return `₱${value.toFixed(2)}`;
}

/** Kilometre display: up to two decimals, trailing zeros stripped. */
export function formatKm(value: number): string {
  return trimFixed(value, 2);
}

/** Percentage display: up to two decimals, trailing zeros stripped. */
export function formatPct(value: number): string {
  return `${trimFixed(value, 2)}%`;
}
