import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FareConfigForm } from "@/features/fares/FareConfigForm";
import { useFareConfigsQuery } from "@/features/fares/queries";
import type { FareConfigDetail } from "@/features/fares/api";
import { formatPeso } from "@/features/fares/format";

interface FareConfigSelectProps {
  value: string | null;
  onChange: (fareConfigId: string | null) => void;
  disabled?: boolean;
}

/** Cap the popup at 24rem — same ceiling as the old inline dropdown. */
const MAX_HEIGHT = 384;
const GAP = 6;
const EDGE_MARGIN = 8;

interface PopupPos {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/**
 * Fare-config picker for route creation/editing: a searchable list of existing
 * configs plus a "New fare config" entry that opens the full `FareConfigForm`
 * as a nested dialog (issue #15) — so an admin can create a config with every
 * field (discounts, default toggle, duplicate-label validation) without
 * leaving the route they are filling in, and the new config is assigned
 * automatically on save.
 *
 * The list is rendered through a portal anchored to the trigger button (not as
 * an absolutely positioned child) so it is never clipped by an ancestor's
 * `overflow-hidden` — e.g. the `DialogContent` on the "New route" modal — and
 * it hangs directly below the trigger, aligned to the field's width.
 *
 * The list is deliberately closed before the form opens: the portal popup's
 * outside-pointerdown handler treats anything outside its own DOM (including
 * the form's dialog portal) as "outside", and would unmount the form on the
 * first click. Base UI supports stacked dialogs natively and skips the child
 * backdrop, so the enclosing dialog stays visible underneath.
 */
export function FareConfigSelect({
  value,
  onChange,
  disabled,
}: FareConfigSelectProps) {
  const fareQuery = useFareConfigsQuery();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [pos, setPos] = useState<PopupPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  /** Set by a successful create, so closing the form does not reopen the list. */
  const createdRef = useRef(false);

  const position = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Always open below the field, aligned to it (the portal is no longer
    // clipped by the dialog, so no upward flip is needed). Just clamp the
    // height to the visible space below the trigger.
    const spaceBelow = window.innerHeight - rect.bottom - EDGE_MARGIN;
    const maxHeight = Math.max(1, Math.min(MAX_HEIGHT, spaceBelow - GAP));
    setPos({
      top: rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  };

  const toggle = () => {
    if (!open) position();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the popup glued to the trigger as the viewport scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const onMove = () => position();
    window.addEventListener("resize", onMove);
    document.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      document.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const configs = useMemo(() => fareQuery.data ?? [], [fareQuery.data]);
  const selected = configs.find((c) => c.fare_config_id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter((c) => c.label.toLowerCase().includes(q));
  }, [configs, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (fareConfigId: string | null) => {
    onChange(fareConfigId);
    close();
  };

  const openCreate = () => {
    close();
    createdRef.current = false;
    setCreating(true);
  };

  const handleCreatingOpenChange = (next: boolean) => {
    setCreating(next);
    if (next) return;
    if (createdRef.current) {
      // Saved: stay closed — the trigger already shows the new config.
      createdRef.current = false;
      return;
    }
    // Cancelled: hand the list back rather than dropping the admin out of it.
    position();
    setOpen(true);
  };

  const handleCreated = (config: FareConfigDetail) => {
    createdRef.current = true;
    onChange(config.fare_config_id);
  };

  const popup =
    open && pos ? (
      <div
        ref={popupRef}
        className="bg-popover text-popover-foreground ring-foreground/10 z-50 flex flex-col rounded-lg border p-1.5 shadow-lg ring-1"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
          minWidth: "16rem",
          maxHeight: pos.maxHeight,
        }}
      >
        <div className="relative mb-1 shrink-0">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fare configs…"
            aria-label="Search fare configs"
            className="h-8 pr-2 pl-7"
          />
        </div>
        <ul className="overlay-scrollbar min-h-0 flex-1 overflow-y-auto">
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
        <div className="mt-1 shrink-0 border-t pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={openCreate}
          >
            <Plus className="size-3.5" />
            New fare config
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full justify-between font-normal",
          )}
        >
          <span className="truncate">
            {selected ? selected.label : "No fare config"}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      {createPortal(popup, document.body)}
      <FareConfigForm
        open={creating}
        onOpenChange={handleCreatingOpenChange}
        onCreated={handleCreated}
      />
    </>
  );
}
