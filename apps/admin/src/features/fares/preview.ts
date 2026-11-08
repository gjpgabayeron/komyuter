import { fareCalculator, type FareRule } from "@komyuter/shared";

import type { FareConfigFormValues } from "./validation";

/** Distances the fare form previews. Chosen to cross the 4 km base distance. */
export const FARE_PREVIEW_DISTANCES_KM = [4, 10, 20] as const;

export interface FarePreviewRow {
  distanceKm: number;
  regular: number;
  student: number;
  senior: number;
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Sample fares for the form's current values. Returns `null` while any numeric
 * field is mid-typing or invalid, so the preview never renders a fare the
 * current form could not save.
 */
export function farePreviewRows(
  values: FareConfigFormValues,
): FarePreviewRow[] | null {
  const baseFare = numberOrNull(values.base_fare);
  const baseDistance = numberOrNull(values.base_distance_km);
  const rate = numberOrNull(values.rate_per_km);
  const student = numberOrNull(values.student_discount_pct);
  const senior = numberOrNull(values.senior_discount_pct);
  if (
    baseFare === null ||
    baseDistance === null ||
    rate === null ||
    student === null ||
    senior === null
  ) {
    return null;
  }

  const rule: FareRule = {
    base_fare: baseFare,
    base_distance_km: baseDistance,
    rate_per_km: rate,
    student_discount_pct: student,
    senior_discount_pct: senior,
  };

  try {
    return FARE_PREVIEW_DISTANCES_KM.map((distanceKm) => ({
      distanceKm,
      regular: fareCalculator(rule, distanceKm, "regular").total,
      student: fareCalculator(rule, distanceKm, "student").total,
      senior: fareCalculator(rule, distanceKm, "senior").total,
    }));
  } catch {
    // Out-of-range values are the form's validation problem, not the
    // preview's; keep the table absent until the values become valid.
    return null;
  }
}
