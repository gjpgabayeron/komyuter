import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { ChangeEntry, ConflictPreview } from "@/lib/conflictPreview";
import { entryDecided, entryDecision } from "@/lib/conflictPreview";
import type {
  MergeAnchor,
  MergeChoices,
  MergeConflict,
  MergeOutcome,
  MergeSnapshot,
} from "@/lib/merge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ComparePane,
  INITIAL_VIEW,
  SideMap,
  compareBounds,
  type CompareStop,
  type ViewState,
} from "./ConflictCompare";
import { anchorLabel, fieldLabel, fieldValue } from "./mergeInputs";

type Side = "mine" | "theirs";

interface ConflictResolverDialogProps {
  open: boolean;
  outcome: MergeOutcome | null;
  routeLabel: string;
  changes: ChangeEntry[];
  preview: ConflictPreview | null;
  mine: MergeSnapshot | null;
  theirs: MergeSnapshot | null;
  initialChoices?: MergeChoices;
  accountName: (userId: string | null | undefined) => string;
  onApply: (choices: MergeChoices) => void;
  onCancel: () => void;
}

/**
 * The Save Conflict resolver (ADR-0020 §3–5 and §"Conflict preview").
 *
 * Near-full-screen plate with a floating margin. 35% lists every change in the
 * batch; 65% is a **side-by-side** comparison — mine left, theirs right — and
 * each side's decision card sits under its own map, so the choice and the
 * geometry it applies to are one column. The polyline is never merged.
 */
export function ConflictResolverDialog({
  open,
  outcome,
  routeLabel,
  changes,
  preview,
  mine,
  theirs,
  initialChoices,
  accountName,
  onApply,
  onCancel,
}: ConflictResolverDialogProps) {
  const [choices, setChoices] = useState<MergeChoices>(initialChoices ?? {});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);

  useEffect(() => {
    if (!open) return;
    setChoices(initialChoices ?? {});
    setView(INITIAL_VIEW);
    setSelectedKey(
      changes.find((change) => change.state === "decision")?.key ??
        changes[0]?.key ??
        null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outcome]);

  const conflicts = outcome?.conflicts ?? [];

  const stopConflicts = useMemo(
    () =>
      conflicts.filter(
        (conflict) =>
          (conflict.kind === "field" && conflict.anchorId !== "__meta__") ||
          conflict.kind === "delete-modify",
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome],
  );
  const metaConflicts = useMemo(
    () =>
      conflicts.filter(
        (conflict) =>
          conflict.kind === "field" && conflict.anchorId === "__meta__",
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome],
  );
  const orderConflict = useMemo(
    () => conflicts.find((conflict) => conflict.kind === "order") ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome],
  );

  const decided = conflicts.every((conflict) => choices[conflict.id]);
  const ready = decided;

  const selected =
    changes.find((change) => change.key === selectedKey) ?? changes[0] ?? null;

  const choose = (conflict: MergeConflict, side: Side) =>
    setChoices((current) => ({ ...current, [conflict.id]: side }));

  const chooseAll = (list: MergeConflict[], side: Side) =>
    setChoices((current) => ({
      ...current,
      ...Object.fromEntries(list.map((conflict) => [conflict.id, side])),
    }));

  const handleView = (next: ViewState) =>
    setView((current) =>
      current.longitude === next.longitude &&
      current.latitude === next.latitude &&
      current.zoom === next.zoom
        ? current
        : next,
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden rounded-[4px] p-0 ring-1"
        style={{
          width: "calc(100vw - 3rem)",
          height: "calc(100vh - 3rem)",
          maxWidth: "1360px",
        }}
        showCloseButton={false}
      >
        <DialogHeader className="border-border bg-primary border-b px-6 py-3 text-white">
          <DialogTitle className="text-sm font-black tracking-[0.08em] text-white uppercase">
            Save conflict
          </DialogTitle>
          <DialogDescription className="text-xs text-white/80">
            {routeLabel} changed while you were editing. Keep both where you
            can; choose where you cannot.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[30%_70%]">
          <nav
            aria-label="Changes in this save"
            className="border-border min-h-0 overflow-y-auto border-r"
          >
            <ul>
              {changes.map((change) => {
                const active = change.key === selected?.key;
                const settled = entryDecided(change, conflicts, choices);
                return (
                  <li key={change.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(change.key)}
                      aria-current={active ? "true" : undefined}
                      className={`w-full border-b px-4 py-2.5 text-left transition-colors ${
                        active
                          ? "border-border bg-primary/5 ring-primary ring-1 ring-inset"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-foreground block truncate text-sm font-medium">
                          {change.label}
                        </span>
                        {settled ? (
                          <Check
                            className="text-primary size-3.5 shrink-0"
                            aria-hidden
                          />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground block truncate text-[11px]">
                        {change.fields.join(" · ")}
                      </span>
                      <EntryState
                        entry={change}
                        settled={settled}
                        decision={entryDecision(change, conflicts, choices)}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-3 px-4 py-4">
              {stopConflicts.length > 1 ? (
                <BulkChoices
                  label="Stops"
                  onChoose={(side) => chooseAll(stopConflicts, side)}
                />
              ) : null}
              {metaConflicts.length > 1 ? (
                <BulkChoices
                  label="Route details"
                  onChoose={(side) => chooseAll(metaConflicts, side)}
                />
              ) : null}
            </div>
          </nav>

          <div className="flex min-h-0 flex-col">
            {selected ? (
              <ChangeDetail
                change={selected}
                outcome={outcome}
                preview={preview}
                mine={mine}
                theirs={theirs}
                choices={choices}
                view={view}
                onViewChange={handleView}
                accountName={accountName}
                onChoose={choose}
                orderConflict={orderConflict}
              />
            ) : (
              <p className="text-muted-foreground p-4 text-sm">
                Nothing in this save disagrees.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="border-border mx-0 mb-0 flex flex-col items-center justify-center gap-2 border-t bg-transparent p-4 sm:flex-row sm:justify-end">
          <span className="text-muted-foreground text-center text-xs">
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
                onApply(choices);
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

function ChangeDetail({
  change,
  outcome,
  preview,
  mine,
  theirs,
  choices,
  view,
  onViewChange,
  accountName,
  onChoose,
  orderConflict,
}: {
  change: ChangeEntry;
  outcome: MergeOutcome | null;
  preview: ConflictPreview | null;
  mine: MergeSnapshot | null;
  theirs: MergeSnapshot | null;
  choices: MergeChoices;
  view: ViewState;
  onViewChange: (view: ViewState) => void;
  accountName: (userId: string | null | undefined) => string;
  onChoose: (conflict: MergeConflict, side: Side) => void;
  orderConflict: MergeConflict | null;
}) {
  const mineAnchor =
    change.kind === "stop"
      ? mine?.anchors.find((anchor) => anchor.id === change.key)
      : undefined;
  const theirsAnchor =
    change.kind === "stop"
      ? theirs?.anchors.find((anchor) => anchor.id === change.key)
      : undefined;

  const mineOrder = mine?.anchors.findIndex((a) => a.id === change.key) ?? -1;
  const theirsOrder =
    theirs?.anchors.findIndex((a) => a.id === change.key) ?? -1;

  if (change.kind === "stop") {
    const conflicts = (outcome?.conflicts ?? []).filter(
      (conflict) =>
        conflict.kind !== "order" && conflict.anchorId === change.key,
    );
    const subject = mineAnchor ?? theirsAnchor;
    const orderConflictFlag = preview?.stops.some(
      (stop) => stop.id === change.key && stop.orderConflict,
    );
    const bounds = subject
      ? compareBounds([
          ...(mineAnchor ? [locationOf(mineAnchor)] : []),
          ...(theirsAnchor ? [locationOf(theirsAnchor)] : []),
        ])
      : null;

    const mineStop: CompareStop | null = subject
      ? {
          id: change.key,
          name: nameOf(mineAnchor ?? subject),
          location: locationOf(mineAnchor ?? subject),
          order: mineOrder + 1,
          otherOrder: theirsOrder >= 0 ? theirsOrder + 1 : null,
          orderConflict: Boolean(orderConflictFlag),
          ghost: !mineAnchor,
        }
      : null;
    const theirsStop: CompareStop | null = subject
      ? {
          id: change.key,
          name: nameOf(theirsAnchor ?? subject),
          location: locationOf(theirsAnchor ?? subject),
          order: theirsOrder + 1,
          otherOrder: mineOrder >= 0 ? mineOrder + 1 : null,
          orderConflict: Boolean(orderConflictFlag),
          ghost: !theirsAnchor,
        }
      : null;

    return (
      <SheetBody title={change.label}>
        <ComparePane
          left={{
            map: (
              <SideMap
                side="mine"
                view={view}
                onViewChange={onViewChange}
                stop={mineStop}
                polyline={preview?.minePolyline ?? null}
                fitBounds={bounds}
              />
            ),
            detail: conflicts.length ? (
              <SideCards
                side="mine"
                conflicts={conflicts}
                accountName={accountName}
                choices={choices}
                onChoose={onChoose}
              />
            ) : (
              <ReadOnlyFields
                fields={change.fields}
                anchor={mineAnchor}
                side="mine"
              />
            ),
          }}
          right={{
            map: (
              <SideMap
                side="theirs"
                view={view}
                onViewChange={onViewChange}
                stop={theirsStop}
                polyline={preview?.theirsPolyline ?? null}
                fitBounds={null}
              />
            ),
            detail: conflicts.length ? (
              <SideCards
                side="theirs"
                conflicts={conflicts}
                accountName={accountName}
                choices={choices}
                onChoose={onChoose}
              />
            ) : (
              <ReadOnlyFields
                fields={change.fields}
                anchor={theirsAnchor}
                side="theirs"
              />
            ),
          }}
        />
      </SheetBody>
    );
  }

  if (change.kind === "meta") {
    const conflicts = (outcome?.conflicts ?? []).filter(
      (conflict) =>
        conflict.kind === "field" && conflict.anchorId === "__meta__",
    );
    return (
      <SheetBody title="Route details">
        <ComparePane
          left={{
            map: null,
            detail: conflicts.length ? (
              <SideCards
                side="mine"
                conflicts={conflicts}
                accountName={accountName}
                choices={choices}
                onChoose={onChoose}
              />
            ) : (
              <ReadOnlyMeta meta={mine?.meta} fields={change.fields} />
            ),
          }}
          right={{
            map: null,
            detail: conflicts.length ? (
              <SideCards
                side="theirs"
                conflicts={conflicts}
                accountName={accountName}
                choices={choices}
                onChoose={onChoose}
              />
            ) : (
              <ReadOnlyMeta meta={theirs?.meta} fields={change.fields} />
            ),
          }}
        />
      </SheetBody>
    );
  }

  if (!orderConflict || orderConflict.kind !== "order") return null;

  return (
    <SheetBody title="Stop order">
      <ComparePane
        left={{
          map: null,
          detail: (
            <SideOption
              side="mine"
              selected={choices[orderConflict.id] === "mine"}
              title="My order"
              detail={orderConflict.order.mine
                .map((id) => anchorLabel(id, outcome?.anchors ?? []))
                .join(" → ")}
              onSelect={() => onChoose(orderConflict, "mine")}
            />
          ),
        }}
        right={{
          map: null,
          detail: (
            <SideOption
              side="theirs"
              selected={choices[orderConflict.id] === "theirs"}
              title="Their order"
              detail={orderConflict.order.theirs
                .map((id) => anchorLabel(id, outcome?.anchors ?? []))
                .join(" → ")}
              onSelect={() => onChoose(orderConflict, "theirs")}
            />
          ),
        }}
      />
    </SheetBody>
  );
}

function SheetBody({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="text-foreground border-border border-b px-5 py-2.5 text-sm font-semibold">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SideCards({
  side,
  conflicts,
  accountName,
  choices,
  onChoose,
}: {
  side: Side;
  conflicts: MergeConflict[];
  accountName: (userId: string | null | undefined) => string;
  choices: MergeChoices;
  onChoose: (conflict: MergeConflict, side: Side) => void;
}) {
  return (
    <div className="space-y-2">
      {conflicts.map((conflict) => {
        if (conflict.kind === "field") {
          return (
            <SideOption
              key={conflict.id}
              side={side}
              selected={choices[conflict.id] === side}
              title={accountName(
                side === "mine" ? conflict.mineBy : conflict.theirsBy,
              )}
              detail={fieldValue(
                conflict.field,
                side === "mine" ? conflict.mine : conflict.theirs,
              )}
              onSelect={() => onChoose(conflict, side)}
            />
          );
        }
        if (conflict.kind === "delete-modify") {
          const deletedByThisSide = conflict.deletedBy === side;
          return (
            <SideOption
              key={conflict.id}
              side={side}
              selected={choices[conflict.id] === side}
              title={
                deletedByThisSide
                  ? "Delete it"
                  : `Keep it · ${accountName(conflict.surviving.updatedBy)}`
              }
              detail={
                deletedByThisSide
                  ? "This side deleted the stop."
                  : "This side edited and kept the stop."
              }
              onSelect={() => onChoose(conflict, side)}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function ReadOnlyFields({
  fields,
  anchor,
  side,
}: {
  fields: string[];
  anchor: MergeAnchor | undefined;
  side: Side;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px]">
        {side === "mine" ? "Merged automatically." : "Kept from this side."}
      </p>
      {fields.map((field) => {
        const key = fieldKey(field);
        return (
          <div
            key={field}
            className="border-border rounded-[4px] border px-3 py-2"
          >
            <span className="text-muted-foreground block text-[10px] font-semibold tracking-[0.08em] uppercase">
              {field}
            </span>
            <span className="text-foreground block text-xs">
              {fieldValue(key, anchor?.fields[key])}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReadOnlyMeta({
  meta,
  fields,
}: {
  meta: Record<string, unknown> | null | undefined;
  fields: string[];
}) {
  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div
          key={field}
          className="border-border rounded-[4px] border px-3 py-2"
        >
          <span className="text-muted-foreground block text-[10px] font-semibold tracking-[0.08em] uppercase">
            {fieldLabel(fieldKey(field))}
          </span>
          <span className="text-foreground block text-xs">
            {fieldValue(fieldKey(field), meta?.[fieldKey(field)])}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Maps a human field label back to the anchor's field key. */
function fieldKey(label: string): string {
  const keys: Record<string, string> = {
    Name: "name",
    Type: "type",
    Position: "location",
    "Guaranteed service": "is_guaranteed_service",
    Landmark: "landmark_hint",
    Notes: "notes",
  };
  return keys[label] ?? label;
}

function locationOf(anchor: MergeAnchor): [number, number] {
  const value = anchor.fields.location;
  if (Array.isArray(value) && value.length >= 2) {
    return [Number(value[0]), Number(value[1])];
  }
  return [122.5645, 10.693];
}

function nameOf(anchor: MergeAnchor): string {
  const value = anchor.fields.name;
  return typeof value === "string" && value.length > 0 ? value : "Stop";
}

function EntryState({
  entry,
  settled,
  decision,
}: {
  entry: ChangeEntry;
  settled: boolean;
  decision: "mine" | "theirs" | "mixed" | null;
}) {
  if (entry.state === "merged") {
    return (
      <span className="text-muted-foreground mt-0.5 block text-[10px] font-semibold tracking-[0.08em] uppercase">
        Merged
      </span>
    );
  }
  if (!settled) {
    return (
      <span className="text-destructive mt-0.5 block text-[10px] font-semibold tracking-[0.08em] uppercase">
        Needs decision · {entry.conflictCount}
      </span>
    );
  }
  return (
    <span className="text-primary mt-0.5 block text-[10px] font-semibold tracking-[0.08em] uppercase">
      {decision === "mine"
        ? "Decided · Mine"
        : decision === "theirs"
          ? "Decided · Theirs"
          : decision === "mixed"
            ? "Decided · Mixed"
            : "Decided"}
    </span>
  );
}

function BulkChoices({
  label,
  onChoose,
}: {
  label: string;
  onChoose: (side: Side) => void;
}) {
  return (
    <div>
      <span className="text-muted-foreground block text-[10px] font-semibold tracking-[0.1em] uppercase">
        {label}
      </span>
      <div className="mt-1 flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 flex-1 px-1.5 text-[11px]"
          onClick={() => onChoose("mine")}
        >
          All mine
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 flex-1 px-1.5 text-[11px]"
          onClick={() => onChoose("theirs")}
        >
          All theirs
        </Button>
      </div>
    </div>
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
      className={`w-full rounded-[4px] border px-3 py-2 text-left transition-colors ${
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
