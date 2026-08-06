import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { FareConfigListItem } from "./api";
import {
  useCreateFareConfig,
  useFareConfigsQuery,
  useUpdateFareConfig,
} from "./queries";
import {
  validateDefaultUnset,
  validateFareConfigForm,
  type FareConfigFormErrors,
  type FareConfigFormValues,
} from "./validation";

interface FareConfigFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode: the form is prefilled from this row. */
  config?: FareConfigListItem | null;
}

/** LTFRB defaults: ₱13 base fare, 4 km base distance, ₱1.80/km, 20% discounts. */
const LTFRB_DEFAULTS: FareConfigFormValues = {
  label: "",
  base_fare: "13",
  base_distance_km: "4",
  rate_per_km: "1.8",
  student_discount_pct: "20",
  senior_discount_pct: "20",
  is_active: true,
  is_default: false,
};

function formValuesFromConfig(
  config: FareConfigListItem,
): FareConfigFormValues {
  return {
    label: config.label,
    base_fare: String(config.base_fare),
    base_distance_km: String(config.base_distance_km),
    rate_per_km: String(config.rate_per_km),
    student_discount_pct: String(config.student_discount_pct),
    senior_discount_pct: String(config.senior_discount_pct),
    is_active: config.is_active,
    is_default: config.is_default,
  };
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: string) => void;
}

function NumberField({
  id,
  label,
  value,
  error,
  min,
  max,
  step = 0.01,
  onChange,
}: NumberFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Create/edit dialog for a fare configuration (US2/US3).
 * Edit mode prefills from the row, edits `is_active` together with the fare
 * values, and submits via `useUpdateFareConfig`; server CONFLICT rejections
 * (inactive-default guard) surface as an error toast with the dialog open and
 * the entered values intact. The default-implies-active invariant (FR-015) is
 * enforced inline by `validateFareConfigForm` for both modes.
 */
export function FareConfigForm({
  open,
  onOpenChange,
  config = null,
}: FareConfigFormProps) {
  const [values, setValues] = useState<FareConfigFormValues>(LTFRB_DEFAULTS);
  const [errors, setErrors] = useState<FareConfigFormErrors>({});
  const id = useId();

  const { data: configs } = useFareConfigsQuery();
  const create = useCreateFareConfig();
  const update = useUpdateFareConfig();
  const isSaving = create.isPending || update.isPending;

  const existingLabels = (configs ?? []).map((config) => ({
    label: config.label,
    fare_config_id: config.fare_config_id,
  }));

  useEffect(() => {
    if (open) {
      setValues(config ? formValuesFromConfig(config) : LTFRB_DEFAULTS);
      setErrors({});
    }
  }, [open, config]);

  const set = <K extends keyof FareConfigFormValues>(
    key: K,
    value: FareConfigFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setValues(LTFRB_DEFAULTS);
      setErrors({});
    }
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    const nextErrors = validateFareConfigForm(
      values,
      existingLabels,
      config?.fare_config_id,
    );
    if (config) {
      const defaultUnset = validateDefaultUnset(
        values,
        config.fare_config_id,
        configs ?? [],
      );
      if (defaultUnset) {
        nextErrors.form = defaultUnset;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    const shared = {
      label: values.label.trim(),
      base_fare: Number(values.base_fare),
      base_distance_km: Number(values.base_distance_km),
      rate_per_km: Number(values.rate_per_km),
      student_discount_pct: Number(values.student_discount_pct),
      senior_discount_pct: Number(values.senior_discount_pct),
      is_default: values.is_default,
    };
    try {
      if (config) {
        await update.mutateAsync({
          fareConfigId: config.fare_config_id,
          patch: { ...shared, is_active: values.is_active },
        });
      } else {
        await create.mutateAsync(shared);
      }
      handleOpenChange(false);
    } catch {
      // The mutation's onError already surfaces the server message (including
      // CONFLICT from the inactive-default guard) as a toast; keep the dialog
      // open with the entered values so the admin can correct and resubmit.
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {config ? "Edit fare configuration" : "New fare configuration"}
            </DialogTitle>
            <DialogDescription>
              Fares follow the LTFRB formula: a base fare plus a per-kilometer
              rate beyond the base distance.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-label`}>Label</Label>
              <Input
                id={`${id}-label`}
                value={values.label}
                onChange={(event) => set("label", event.target.value)}
                placeholder="e.g. Jeepney — city routes"
                aria-invalid={errors.label ? true : undefined}
                aria-describedby={
                  errors.label ? `${id}-label-error` : undefined
                }
              />
              {errors.label ? (
                <p
                  id={`${id}-label-error`}
                  className="text-destructive text-xs"
                >
                  {errors.label}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                id={`${id}-base-fare`}
                label="Base fare (₱)"
                value={values.base_fare}
                error={errors.base_fare}
                onChange={(value) => set("base_fare", value)}
              />
              <NumberField
                id={`${id}-base-distance`}
                label="Base distance (km)"
                value={values.base_distance_km}
                error={errors.base_distance_km}
                onChange={(value) => set("base_distance_km", value)}
              />
              <NumberField
                id={`${id}-rate`}
                label="Rate per km (₱)"
                value={values.rate_per_km}
                error={errors.rate_per_km}
                onChange={(value) => set("rate_per_km", value)}
              />
              <NumberField
                id={`${id}-student`}
                label="Student discount (%)"
                value={values.student_discount_pct}
                error={errors.student_discount_pct}
                min={0}
                max={100}
                step={1}
                onChange={(value) => set("student_discount_pct", value)}
              />
              <NumberField
                id={`${id}-senior`}
                label="Senior / PWD discount (%)"
                value={values.senior_discount_pct}
                error={errors.senior_discount_pct}
                min={0}
                max={100}
                step={1}
                onChange={(value) => set("senior_discount_pct", value)}
              />
            </div>

            {config ? (
              <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div className="grid gap-0.5">
                  <Label htmlFor={`${id}-active`}>Active</Label>
                  <p
                    id={`${id}-active-hint`}
                    className="text-muted-foreground text-xs"
                  >
                    Inactive configurations are not offered for new routes.
                  </p>
                </div>
                <Switch
                  id={`${id}-active`}
                  checked={values.is_active}
                  onCheckedChange={(checked) => set("is_active", checked)}
                  aria-describedby={`${id}-active-hint`}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor={`${id}-default`}>Set as default</Label>
                <p
                  id={`${id}-default-hint`}
                  className="text-muted-foreground text-xs"
                >
                  Routes without an assigned configuration use the default.
                </p>
              </div>
              <Switch
                id={`${id}-default`}
                checked={values.is_default}
                onCheckedChange={(checked) => set("is_default", checked)}
                aria-describedby={`${id}-default-hint`}
              />
            </div>
          </div>

          {errors.form ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.form}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Saving…"
                : config
                  ? "Save changes"
                  : "Save configuration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
