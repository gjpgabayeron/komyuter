import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  useCreateFareConfig,
  useFareConfigsQuery,
} from "@/features/fares/queries";
import type { CreateFareConfigPayload } from "@/features/fares/api";
import { formatPeso } from "@/features/fares/format";

interface FareConfigSelectProps {
  value: string | null;
  onChange: (fareConfigId: string | null) => void;
  disabled?: boolean;
}

const EMPTY_FORM: CreateFareConfigPayload = {
  label: "",
  base_fare: 13,
  base_distance_km: 4,
  rate_per_km: 1.8,
  student_discount_pct: 20,
  senior_discount_pct: 20,
  is_default: false,
};

/**
 * Fare-config picker for route creation/editing: searchable list of existing
 * configs plus a built-in "New fare config" form, so an admin can create and
 * assign a config without leaving the page.
 */
export function FareConfigSelect({
  value,
  onChange,
  disabled,
}: FareConfigSelectProps) {
  const fareQuery = useFareConfigsQuery();
  const createMutation = useCreateFareConfig();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateFareConfigPayload>(EMPTY_FORM);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const configs = useMemo(() => fareQuery.data ?? [], [fareQuery.data]);
  const selected = configs.find((c) => c.fare_config_id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter((c) => c.label.toLowerCase().includes(q));
  }, [configs, query]);

  const pick = (fareConfigId: string | null) => {
    onChange(fareConfigId);
    setOpen(false);
    setQuery("");
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.label.trim()) return;
    try {
      const created = await createMutation.mutateAsync({
        ...form,
        label: form.label.trim(),
      });
      pick(created.fare_config_id);
      setCreating(false);
      setForm(EMPTY_FORM);
    } catch {
      // Error toast handled by the mutation.
    }
  };

  const setNumber = (key: keyof CreateFareConfigPayload) => (value: string) => {
    const parsed = Number(value);
    setForm((f) => ({ ...f, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full justify-between font-normal",
        )}
      >
        <span className="truncate">
          {selected ? selected.label : "No fare config"}
        </span>
        <ChevronDown className="size-3.5 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 w-full min-w-64 rounded-lg border bg-white p-1.5">
          {creating ? (
            <form onSubmit={submitCreate} className="space-y-2">
              <div className="space-y-1">
                <Label
                  htmlFor="fare-config-label"
                  className="text-muted-foreground text-[11px]"
                >
                  Label
                </Label>
                <Input
                  id="fare-config-label"
                  value={form.label}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, label: event.target.value }))
                  }
                  placeholder="e.g. Standard PUJ"
                  autoFocus
                  className="h-8"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <NumberField
                  id="fare-config-base-fare"
                  label="Base fare"
                  value={form.base_fare}
                  onChange={setNumber("base_fare")}
                  step={0.5}
                />
                <NumberField
                  id="fare-config-base-dist"
                  label="Base km"
                  value={form.base_distance_km}
                  onChange={setNumber("base_distance_km")}
                  step={0.5}
                />
                <NumberField
                  id="fare-config-rate"
                  label="Per km"
                  value={form.rate_per_km}
                  onChange={setNumber("rate_per_km")}
                  step={0.1}
                />
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setCreating(false)}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  size="xs"
                  disabled={createMutation.isPending || !form.label.trim()}
                >
                  {createMutation.isPending ? "Creating…" : "Create & assign"}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="relative mb-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search fare configs…"
                  aria-label="Search fare configs"
                  className="h-8 pr-2 pl-7"
                />
              </div>
              <ul className="overlay-scrollbar max-h-48 overflow-y-auto">
                {fareQuery.isLoading && (
                  <li className="text-muted-foreground px-2 py-1.5 text-xs">
                    Loading…
                  </li>
                )}
                {!fareQuery.isLoading && query.trim() === "" && (
                  <li>
                    <button
                      type="button"
                      onClick={() => pick(null)}
                      className="text-muted-foreground hover:bg-muted flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm"
                    >
                      <span>No fare config</span>
                      {value === null && (
                        <Check className="text-primary size-3.5 shrink-0" />
                      )}
                    </button>
                  </li>
                )}
                {!fareQuery.isLoading && filtered.length === 0 && (
                  <li className="text-muted-foreground px-2 py-1.5 text-xs">
                    No matches.
                  </li>
                )}
                {!fareQuery.isLoading &&
                  filtered.map((config) => (
                    <li key={config.fare_config_id}>
                      <button
                        type="button"
                        onClick={() => pick(config.fare_config_id)}
                        className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {config.label}
                          </span>
                          <span className="text-muted-foreground block text-xs tabular-nums">
                            {formatPeso(config.base_fare)} base ·{" "}
                            {formatPeso(config.rate_per_km)}/km
                          </span>
                        </span>
                        {config.fare_config_id === value && (
                          <Check className="text-primary size-3.5 shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
              <div className="mt-1 border-t pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setCreating(true)}
                >
                  <Plus className="size-3.5" />
                  New fare config
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: string) => void;
  step: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-muted-foreground block text-[11px]">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 tabular-nums"
      />
    </div>
  );
}
