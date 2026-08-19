/**
 * Client-side validation for the fare configuration form (feature 006, US2/US3).
 *
 * Numeric fields are kept as raw input strings in the form state and parsed
 * here, so typing states like "1." or "1e" never corrupt the value (a
 * string -> number -> string round-trip on every keystroke would silently
 * turn "1.80" into "18").
 *
 * Mirrors the shared zod schemas (`createFareConfigSchema` / `updateFareConfigSchema`)
 * at the form-input level, plus two page-level rules:
 * - label uniqueness (case-insensitive, self-excluded on edit)
 * - the default-implies-active invariant (FR-015): an inactive configuration
 *   can never be the default, and vice versa.
 *
 * `validateDefaultUnset` covers the zero-defaults invariant (FR-005): an edit
 * must not leave the system with no default configuration.
 */
export interface FareConfigFormValues {
  label: string;
  base_fare: string;
  base_distance_km: string;
  rate_per_km: string;
  student_discount_pct: string;
  senior_discount_pct: string;
  is_active: boolean;
  is_default: boolean;
}

export interface ExistingFareConfigLabel {
  label: string;
  fare_config_id: string;
}

export interface FareConfigFormErrors {
  label?: string;
  base_fare?: string;
  base_distance_km?: string;
  rate_per_km?: string;
  student_discount_pct?: string;
  senior_discount_pct?: string;
  /** Form-level errors (invariants spanning multiple fields). */
  form?: string;
}

const LABEL_REQUIRED = "Label is required.";
const LABEL_DUPLICATE = "A configuration with this label already exists.";
const NOT_A_NUMBER = "Enter a valid number.";
const NOT_NEGATIVE = "Must be 0 or greater.";
const DISCOUNT_RANGE = "Must be between 0 and 100.";
const DEFAULT_INACTIVE =
  "Cannot set the default fare configuration inactive; reactivate it or assign another default first.";
const DEFAULT_UNSET = "Assign another default before unsetting the default.";

/** Parses a raw numeric input; null when blank or not a finite number. */
function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateNumber(
  value: string,
  errors: FareConfigFormErrors,
  key: keyof FareConfigFormErrors,
) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    errors[key] = NOT_A_NUMBER;
  } else if (parsed < 0) {
    errors[key] = NOT_NEGATIVE;
  }
}

function validateDiscount(
  value: string,
  errors: FareConfigFormErrors,
  key: keyof FareConfigFormErrors,
) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    errors[key] = NOT_A_NUMBER;
  } else if (parsed < 0 || parsed > 100) {
    errors[key] = DISCOUNT_RANGE;
  }
}

export function validateFareConfigForm(
  values: FareConfigFormValues,
  existing: ExistingFareConfigLabel[],
  selfId?: string,
): FareConfigFormErrors {
  const errors: FareConfigFormErrors = {};

  const trimmedLabel = values.label.trim();
  if (trimmedLabel === "") {
    errors.label = LABEL_REQUIRED;
  } else {
    const duplicate = existing.some(
      (config) =>
        config.fare_config_id !== selfId &&
        config.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    );
    if (duplicate) {
      errors.label = LABEL_DUPLICATE;
    }
  }

  validateNumber(values.base_fare, errors, "base_fare");
  validateNumber(values.base_distance_km, errors, "base_distance_km");
  validateNumber(values.rate_per_km, errors, "rate_per_km");
  validateDiscount(values.student_discount_pct, errors, "student_discount_pct");
  validateDiscount(values.senior_discount_pct, errors, "senior_discount_pct");

  if (values.is_default && !values.is_active) {
    errors.form = DEFAULT_INACTIVE;
  }

  return errors;
}

/**
 * FR-005: an edit must not leave the system with zero default configurations.
 * Blocks unsetting the default when the edited row is currently the default
 * and no other configuration is the default. Returns null when allowed.
 */
export function validateDefaultUnset(
  values: Pick<FareConfigFormValues, "is_default">,
  selfId: string,
  configs: { fare_config_id: string; is_default: boolean }[],
): string | null {
  const self = configs.find((config) => config.fare_config_id === selfId);
  if (!self?.is_default || values.is_default) {
    return null;
  }
  const otherDefault = configs.some(
    (config) => config.fare_config_id !== selfId && config.is_default,
  );
  return otherDefault ? null : DEFAULT_UNSET;
}
