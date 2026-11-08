import type { FareConfiguration } from "../types/domain";

/** The passenger classes the LTFRB rule distinguishes. */
export const PASSENGER_TYPES = ["regular", "student", "senior"] as const;
export type PassengerType = (typeof PASSENGER_TYPES)[number];

/**
 * The fare-rule fields the calculator needs. Narrowed from the stored
 * configuration so callers can price a leg without carrying ids, labels or
 * attribution through the computation.
 */
export type FareRule = Pick<
  FareConfiguration,
  | "base_fare"
  | "base_distance_km"
  | "rate_per_km"
  | "student_discount_pct"
  | "senior_discount_pct"
>;

export interface FareBreakdown {
  /** Base fare charged on boarding, in pesos. */
  baseFare: number;
  /** Distance charge beyond the base distance, in pesos. */
  distanceCharge: number;
  /** Base fare plus distance charge, in pesos. */
  subtotal: number;
  /** Discount amount, in pesos (not a percentage). */
  discount: number;
  /** What the passenger pays, in pesos. */
  total: number;
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number >= 0`);
  }
}

function assertDiscount(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${name} must be a finite number between 0 and 100`);
  }
}

/** Money is stored in pesos but never below a centavo. */
function roundCentavos(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The canonical LTFRB fare rule (ADR-0001):
 *
 *   fare = base_fare + max(0, distance_km - base_distance_km) × rate_per_km
 *   discounted = fare × (1 - discount_rate)
 *
 * This is the *displayed* fare. The Dijkstra internal cost is deliberately
 * different (base-on-board plus marginal per-km); never use this function as
 * a graph weight.
 *
 * Every money field is rounded to centavos. The returned values satisfy
 * `total = subtotal - discount`, where each field is already rounded.
 */
export function fareCalculator(
  rule: FareRule,
  distanceKm: number,
  passengerType: PassengerType = "regular",
): FareBreakdown {
  assertFiniteNonNegative("distanceKm", distanceKm);
  assertFiniteNonNegative("base_fare", rule.base_fare);
  assertFiniteNonNegative("base_distance_km", rule.base_distance_km);
  assertFiniteNonNegative("rate_per_km", rule.rate_per_km);
  assertDiscount("student_discount_pct", rule.student_discount_pct);
  assertDiscount("senior_discount_pct", rule.senior_discount_pct);

  if (!PASSENGER_TYPES.includes(passengerType)) {
    throw new RangeError(`Unknown passenger type: ${String(passengerType)}`);
  }

  const discountPct =
    passengerType === "student"
      ? rule.student_discount_pct
      : passengerType === "senior"
        ? rule.senior_discount_pct
        : 0;

  const baseFare = roundCentavos(rule.base_fare);
  const distanceCharge = roundCentavos(
    Math.max(0, distanceKm - rule.base_distance_km) * rule.rate_per_km,
  );
  const subtotal = roundCentavos(baseFare + distanceCharge);
  const discount = roundCentavos(subtotal * (discountPct / 100));
  const total = roundCentavos(subtotal - discount);

  return { baseFare, distanceCharge, subtotal, discount, total };
}
