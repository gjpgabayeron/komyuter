import { useEffect, useState } from "react";
import type { Restriction, RestrictionKind } from "@komyuter/shared";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { cn } from "@/lib/utils";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  useCreateRestrictionMutation,
  useDeactivateRestrictionMutation,
  useRestrictionsQuery,
  useUpdateRestrictionMutation,
} from "@/features/routes/useRouteQueries";
import {
  RESTRICTION_KIND_LABELS,
  restrictionRangeLabel,
} from "./restrictionHelpers";
import { useRestrictionStore } from "./restrictionStore";

const KINDS: RestrictionKind[] = ["no_loading", "no_unloading", "both"];

interface RestrictionsGroupProps {
  readOnly?: boolean;
}

/**
 * Direction-level restrictions in the right properties rail. A restriction is
 * a range of the SAVED base polyline with boarding/alighting rules; two map
 * clicks pick the range, and the fields describe why.
 *
 * Read-only Accounts keep the list and the map band; every control that writes
 * is omitted. `draftDirty` blocks editing because the stored indices describe
 * the saved polyline, not the unsaved draft the map may be showing.
 */
export function RestrictionsGroup({
  readOnly = false,
}: RestrictionsGroupProps) {
  const directionId = usePlottingStore((s) => s.directionId);
  const draftDirty = usePlottingStore((s) => s.draftDirty);

  const restrictionsQuery = useRestrictionsQuery(directionId);
  const create = useCreateRestrictionMutation(directionId ?? "");
  const update = useUpdateRestrictionMutation(directionId ?? "");
  const deactivate = useDeactivateRestrictionMutation(directionId ?? "");

  const state = useRestrictionStore();
  const [confirm, setConfirm] = useState<Restriction | null>(null);

  // A restriction belongs to one Direction; moving to another must not carry
  // the editor's range or selected id across.
  useEffect(() => {
    useRestrictionStore.getState().reset();
  }, [directionId]);

  if (directionId === null) return null;

  const restrictions = restrictionsQuery.data ?? [];
  const selected =
    restrictions.find((r) => r.restriction_id === state.selectedId) ?? null;
  const canEdit = !readOnly && !draftDirty;
  const rangeReady =
    state.fromIndex !== null &&
    state.toIndex !== null &&
    state.fromIndex !== state.toIndex;
  const editorOpen =
    !readOnly &&
    (state.mode === "picking" ||
      state.selectedId !== null ||
      state.fromIndex !== null);
  const saving = create.isPending || update.isPending;

  const save = async () => {
    if (!rangeReady || !canEdit) return;
    const payload = {
      from_coord_index: state.fromIndex as number,
      to_coord_index: state.toIndex as number,
      kind: state.kind,
      note: state.note.trim() === "" ? null : state.note.trim(),
    };
    try {
      const saved = state.selectedId
        ? await update.mutateAsync({
            restrictionId: state.selectedId,
            patch: { ...payload, is_active: state.isActive },
          })
        : await create.mutateAsync(payload);
      useRestrictionStore.getState().select(saved);
    } catch {
      // The mutation's onError already surfaced the server message; keep the
      // editor open with the picked range and fields.
    }
  };

  const confirmDeactivate = async () => {
    if (!confirm || deactivate.isPending) return;
    try {
      await deactivate.mutateAsync(confirm.restriction_id);
      useRestrictionStore.getState().reset();
    } catch {
      // Toast handled by the mutation.
    } finally {
      setConfirm(null);
    }
  };

  const instruction =
    state.mode === "picking" && state.fromIndex === null
      ? "Click the start vertex on the route."
      : state.mode === "picking" &&
          state.fromIndex !== null &&
          state.toIndex === null
        ? "Click the end vertex on the route."
        : state.fromIndex !== null && state.toIndex !== null
          ? state.fromIndex === state.toIndex
            ? "Pick a second, different vertex."
            : restrictionRangeLabel({
                from_coord_index: state.fromIndex,
                to_coord_index: state.toIndex,
              })
          : "Pick a range on the route.";

  return (
    <section className="border-t pt-3" aria-label="Restrictions">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Restrictions</SectionLabel>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {restrictions.length}
        </span>
      </div>

      {draftDirty ? (
        <p role="status" className="text-muted-foreground mt-2 text-xs">
          Save the route before editing restrictions — ranges refer to the saved
          path.
        </p>
      ) : null}

      {canEdit && !editorOpen ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full justify-center gap-1 text-xs"
          onClick={() => useRestrictionStore.getState().startNew()}
        >
          Add restriction
        </Button>
      ) : null}

      {editorOpen ? (
        <div className="border-border mt-2 space-y-2 rounded-md border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">
              {state.selectedId ? "Edit restriction" : "New restriction"}
            </p>
            {state.selectedId && state.mode === "idle" && canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 px-1.5 text-[11px]"
                onClick={() => useRestrictionStore.getState().beginRerange()}
              >
                Re-range
              </Button>
            ) : null}
          </div>

          <p
            role="status"
            className={cn(
              "text-xs",
              rangeReady ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {instruction}
          </p>

          <div className="grid gap-1.5">
            <label
              className="text-muted-foreground text-[11px]"
              htmlFor="restriction-kind"
            >
              Type
            </label>
            <select
              id="restriction-kind"
              value={state.kind}
              onChange={(event) =>
                useRestrictionStore
                  .getState()
                  .setKind(event.target.value as RestrictionKind)
              }
              disabled={!canEdit}
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {RESTRICTION_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <label
              className="text-muted-foreground text-[11px]"
              htmlFor="restriction-note"
            >
              Note
            </label>
            <Input
              id="restriction-note"
              value={state.note}
              onChange={(event) =>
                useRestrictionStore.getState().setNote(event.target.value)
              }
              disabled={!canEdit}
              placeholder="Optional context for this range"
              className="h-8 text-xs"
            />
          </div>

          {state.selectedId ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs">Active</span>
              <Switch
                checked={state.isActive}
                onCheckedChange={(checked) =>
                  useRestrictionStore.getState().setActive(checked)
                }
                disabled={!canEdit || saving}
                aria-label="Active restriction"
              />
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => void save()}
              disabled={!rangeReady || saving || !canEdit}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => useRestrictionStore.getState().reset()}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>

          {selected?.is_active && canEdit ? (
            <Button
              type="button"
              variant="destructive"
              size="xs"
              className="h-6 w-full text-[11px]"
              onClick={() => setConfirm(selected)}
            >
              Deactivate
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 space-y-1">
        {restrictionsQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Loading restrictions…</p>
        ) : null}

        {restrictionsQuery.isError ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-destructive text-xs">
              Could not load restrictions.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => void restrictionsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {!restrictionsQuery.isLoading &&
        !restrictionsQuery.isError &&
        restrictions.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No restrictions yet — mark a stretch where boarding or alighting is
            not allowed.
          </p>
        ) : null}

        {restrictions.map((restriction) => {
          const active = restriction.restriction_id === state.selectedId;
          return (
            <button
              key={restriction.restriction_id}
              type="button"
              onClick={() => useRestrictionStore.getState().select(restriction)}
              aria-pressed={active}
              className={cn(
                "w-full rounded-sm border px-2 py-1.5 text-left transition-colors",
                active
                  ? "border-primary/60 bg-primary/5"
                  : "border-border hover:bg-muted/50",
                !restriction.is_active && "opacity-60",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">
                  {RESTRICTION_KIND_LABELS[restriction.kind]}
                </span>
                {!restriction.is_active ? (
                  <Badge
                    variant="outline"
                    className="h-4 px-1 text-[10px] font-medium"
                  >
                    Inactive
                  </Badge>
                ) : null}
              </span>
              <span className="text-muted-foreground block truncate text-[11px]">
                {restrictionRangeLabel(restriction)}
              </span>
            </button>
          );
        })}
      </div>

      {readOnly && selected ? (
        <dl className="border-border mt-2 space-y-1 rounded-md border p-2.5 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Range</dt>
            <dd>{restrictionRangeLabel(selected)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{RESTRICTION_KIND_LABELS[selected.kind]}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{selected.is_active ? "Active" : "Inactive"}</dd>
          </div>
          {selected.note ? (
            <div>
              <dt className="text-muted-foreground">Note</dt>
              <dd className="mt-0.5">{selected.note}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate this{" "}
              {confirm
                ? RESTRICTION_KIND_LABELS[confirm.kind].toLowerCase()
                : "restriction"}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The range stays in the dataset and can be reactivated later. It
              stops applying to boarding and alighting immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDeactivate()}
              disabled={deactivate.isPending}
            >
              {deactivate.isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
