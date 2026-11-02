import { useEffect, useMemo, useState } from "react";
import type { MergeChoices, MergeConflict, MergeOutcome } from "@/lib/merge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { anchorLabel, fieldLabel, fieldValue } from "./mergeInputs";

type Side = "mine" | "theirs";

interface ConflictResolverDialogProps {
  open: boolean;
  outcome: MergeOutcome | null;
  routeLabel: string;
  /** Choices carried over from a previous resolution, where they still apply. */
  initialChoices?: MergeChoices;
  /** Resolves an Account id to the name shown beside a side. */
  accountName: (userId: string | null | undefined) => string;
  onApply: (choices: MergeChoices, polyline: Side) => void;
  onCancel: () => void;
}

/**
 * The Save Conflict resolver (ADR-0020 §3–5; ticket #55).
 *
 * A plate sheet over the workspace — not a second surface. It lists only what
 * the three-way merge could not decide, with both sides named, and nothing is
 * preselected: the plotter makes every choice. The polyline is never merged;
 * it is a one-side choice, and taking theirs is the request to re-snap.
 *
 * Visual grammar: the Route Sign — white ground, 1px enamel border, ≤4px
 * corners, signboard green-blue for the chosen side, signal amber for the
 * band that says the save did not go through.
 */
export function ConflictResolverDialog({
  open,
  outcome,
  routeLabel,
  initialChoices,
  accountName,
  onApply,
  onCancel,
}: ConflictResolverDialogProps) {
  const [choices, setChoices] = useState<MergeChoices>(initialChoices ?? {});
  const [polyline, setPolyline] = useState<Side | null>(null);

  // A fresh conflict starts with only the choices that still apply — nothing
  // is preselected for a decision the plotter has not made.
  useEffect(() => {
    if (!open) return;
    setChoices(initialChoices ?? {});
    setPolyline(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outcome]);

  const conflicts = outcome?.conflicts ?? [];
  const decided = conflicts.every((conflict) => choices[conflict.id]);
  const ready = decided && polyline !== null;

  const anchorNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const anchor of outcome?.anchors ?? []) {
      const name = anchor.fields.name;
      names.set(anchor.id, typeof name === "string" ? name : anchor.id);
    }
    return names;
  }, [outcome]);

  const choose = (conflict: MergeConflict, side: Side) =>
    setChoices((current) => ({ ...current, [conflict.id]: side }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden rounded-[4px] p-0 ring-1 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-border bg-primary text-primary-foreground border-b px-5 py-3">
          <DialogTitle className="text-sm font-black tracking-[0.08em] uppercase">
            Save conflict
          </DialogTitle>
          <DialogDescription className="text-primary-foreground/80 text-xs">
            {routeLabel} changed while you were editing. Keep both where you
            can; choose where you cannot.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section aria-labelledby="conflict-line">
            <h3
              id="conflict-line"
              className="text-muted-foreground mb-1 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase"
            >
              The path
            </h3>
            <div
              className="grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Which path to keep"
            >
              <SideOption
                side="mine"
                selected={polyline === "mine"}
                title="Keep my line"
                detail="Your drawn path stays exactly as it is."
                onSelect={() => setPolyline("mine")}
              />
              <SideOption
                side="theirs"
                selected={polyline === "theirs"}
                title="Take theirs, re-snap"
                detail="Their path is adopted and the route re-snaps to it."
                onSelect={() => setPolyline("theirs")}
              />
            </div>
          </section>

          {conflicts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing else conflicts — the change merges cleanly.
            </p>
          ) : (
            <section aria-labelledby="conflict-list">
              <h3
                id="conflict-list"
                className="text-muted-foreground mb-1 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase"
              >
                Decisions · {conflicts.length}
              </h3>
              <ul className="space-y-2">
                {conflicts.map((conflict) => (
                  <li
                    key={conflict.id}
                    className="border-border rounded-[4px] border px-3 py-2.5"
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="text-foreground text-sm font-medium">
                        {conflict.kind === "order"
                          ? "Stop order"
                          : anchorLabel(
                              conflict.anchorId,
                              outcome?.anchors ?? [],
                            )}
                      </span>
                      {conflict.kind === "field" ? (
                        <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
                          {fieldLabel(conflict.field)}
                        </span>
                      ) : null}
                    </div>

                    {conflict.kind === "field" ? (
                      <div
                        className="grid gap-2 sm:grid-cols-2"
                        role="radiogroup"
                        aria-label={`${anchorLabel(conflict.anchorId, outcome?.anchors ?? [])} ${fieldLabel(conflict.field)}`}
                      >
                        <SideOption
                          side="mine"
                          selected={choices[conflict.id] === "mine"}
                          title={accountName(conflict.mineBy)}
                          detail={fieldValue(conflict.field, conflict.mine)}
                          onSelect={() => choose(conflict, "mine")}
                        />
                        <SideOption
                          side="theirs"
                          selected={choices[conflict.id] === "theirs"}
                          title={accountName(conflict.theirsBy)}
                          detail={fieldValue(conflict.field, conflict.theirs)}
                          onSelect={() => choose(conflict, "theirs")}
                        />
                      </div>
                    ) : null}

                    {conflict.kind === "delete-modify" ? (
                      <div
                        className="grid gap-2 sm:grid-cols-2"
                        role="radiogroup"
                        aria-label={`Deleted or kept: ${anchorLabel(conflict.anchorId, outcome?.anchors ?? [])}`}
                      >
                        <SideOption
                          side="mine"
                          selected={choices[conflict.id] === "mine"}
                          title={
                            conflict.deletedBy === "mine"
                              ? "Delete it"
                              : `Keep it · ${accountName(conflict.surviving.updatedBy)}`
                          }
                          detail={
                            conflict.deletedBy === "mine"
                              ? "Your deletion wins."
                              : "Your edited stop stays."
                          }
                          onSelect={() => choose(conflict, "mine")}
                        />
                        <SideOption
                          side="theirs"
                          selected={choices[conflict.id] === "theirs"}
                          title={
                            conflict.deletedBy === "theirs"
                              ? "Delete it"
                              : `Keep it · ${accountName(conflict.surviving.updatedBy)}`
                          }
                          detail={
                            conflict.deletedBy === "theirs"
                              ? "Their deletion wins."
                              : "Their edited stop stays."
                          }
                          onSelect={() => choose(conflict, "theirs")}
                        />
                      </div>
                    ) : null}

                    {conflict.kind === "order" ? (
                      <div
                        className="grid gap-2 sm:grid-cols-2"
                        role="radiogroup"
                        aria-label="Which stop order to keep"
                      >
                        <SideOption
                          side="mine"
                          selected={choices[conflict.id] === "mine"}
                          title="My order"
                          detail={conflict.order.mine
                            .map((id) => anchorNames.get(id) ?? id)
                            .join(" → ")}
                          onSelect={() => choose(conflict, "mine")}
                        />
                        <SideOption
                          side="theirs"
                          selected={choices[conflict.id] === "theirs"}
                          title="Their order"
                          detail={conflict.order.theirs
                            .map((id) => anchorNames.get(id) ?? id)
                            .join(" → ")}
                          onSelect={() => choose(conflict, "theirs")}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <DialogFooter className="border-border border-t px-5 py-3 sm:justify-between">
          <span className="text-muted-foreground hidden text-xs sm:block">
            {ready
              ? "Every decision is made. Applying keeps your Draft unsaved."
              : "Choose every side to continue. Nothing is discarded silently."}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Keep editing
            </Button>
            <Button
              size="sm"
              disabled={!ready}
              onClick={() => {
                if (!polyline) return;
                onApply(choices, polyline);
              }}
            >
              Apply merge
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SideOption({
  side,
  selected,
  title,
  detail,
  onSelect,
}: {
  side: Side;
  selected: boolean;
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`rounded-[4px] border px-3 py-2 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-primary ring-1"
          : "border-border hover:border-foreground/30 hover:bg-muted/40"
      }`}
    >
      <span className="text-muted-foreground block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
        {side === "mine" ? "Mine" : "Theirs"}
      </span>
      <span className="text-foreground block text-sm font-medium">{title}</span>
      <span className="text-muted-foreground block text-xs break-words">
        {detail}
      </span>
    </button>
  );
}
