import { useEffect, useMemo, useRef } from "react";
import { Redo2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clearDetourDraft,
  loadDetourDraft,
  saveDetourDraft,
} from "@/lib/draft";
import {
  useDetourStore,
  type DetourDraftSnapshot,
} from "@/features/detours/detourStore";
import { useCreateDetourMutation } from "@/features/routes/useRouteQueries";
import { useUpdateDetourMutation } from "@/features/routes/useRouteQueries";
import { useDetoursQuery } from "@/features/routes/useRouteQueries";
import { useDirectionStopsQuery } from "@/features/routes/useRouteQueries";
import { useQueryClient } from "@tanstack/react-query";
import { routeKeys } from "@/lib/queryKeys";
import type { UpdateDetourPayload } from "@/features/routes/routesApi";
import { coordsDistanceMeters, formatDistance } from "@/lib/coords";

const CONFLICT_COPY =
  "Another detour was added or removed while you were editing — review the list and save again.";

const PLACE_STEPS: Record<"entry" | "exit" | "waypoint", string> = {
  entry: "Click the MAIN route where the alternative path splits (split node).",
  exit: "Click the MAIN route where it rejoins — ahead of the split (merge node).",
  waypoint:
    "Click to add detour stops along the alternative path between the nodes.",
};

/**
 * The DetourGroup — the right property-panel surface for quick-mode detour
 * authoring (tool-driven from the action bar, exactly like the base route).
 * One map click between two stops composes the whole detour (entry = stop
 * before, exit = stop after, road-followed loop through the clicked point,
 * auto label/instruction); the panel only reviews + saves. Save runs through
 * the store's validateSave gate FIRST (T016) — the HTTP call only ever
 * happens on a fully valid composition (SC-014). Editing a saved detour
 * saves a computed patch (changed fields only) and a stale-list conflict
 * blocks the save (US4).
 */
export function DetourGroup() {
  const open = useDetourStore((s) => s.open);
  const target = useDetourStore((s) => s.target);
  const snap = useDetourStore((s) => s.snap);
  const entry = useDetourStore((s) => s.entry);
  const exit = useDetourStore((s) => s.exit);
  const mode = useDetourStore((s) => s.mode);
  const refusal = useDetourStore((s) => s.refusal);
  const swapEntryExit = useDetourStore((s) => s.swapEntryExit);
  const loop = useDetourStore((s) => s.loop);
  const mapboxWarning = useDetourStore((s) => s.mapboxWarning);
  const composeError = useDetourStore((s) => s.composeError);
  const additionalDistanceMeters = useDetourStore(
    (s) => s.additionalDistanceMeters,
  );
  const lastError = useDetourStore((s) => s.lastError);
  const label = useDetourStore((s) => s.label);
  const commuterInstruction = useDetourStore((s) => s.commuterInstruction);
  const driverInstruction = useDetourStore((s) => s.driverInstruction);
  const editDetourId = useDetourStore((s) => s.editDetourId);
  const editBaseline = useDetourStore((s) => s.editBaseline);
  const draftOffer = useDetourStore((s) => s.draftOffer);
  const baselineDetourCount = useDetourStore((s) => s.baselineDetourCount);

  const close = useDetourStore((s) => s.close);
  const setLabel = useDetourStore((s) => s.setLabel);
  const setCommuterInstruction = useDetourStore(
    (s) => s.setCommuterInstruction,
  );
  const setDriverInstruction = useDetourStore((s) => s.setDriverInstruction);
  const setLastError = useDetourStore((s) => s.setLastError);
  const validateSave = useDetourStore((s) => s.validateSave);
  const undo = useDetourStore((s) => s.undo);
  const redo = useDetourStore((s) => s.redo);
  const canUndo = useDetourStore((s) => s.canUndo());
  const canRedo = useDetourStore((s) => s.canRedo());
  const restoreDraft = useDetourStore((s) => s.restoreDraft);
  const markDraftHandled = useDetourStore((s) => s.markDraftHandled);

  const queryClient = useQueryClient();
  const createMutation = useCreateDetourMutation(target?.directionId ?? "");
  const updateMutation = useUpdateDetourMutation(target?.directionId ?? "");
  const saving = createMutation.isPending || updateMutation.isPending;
  const setTargetStops = useDetourStore((s) => s.setTargetStops);

  const detoursQuery = useDetoursQuery(target?.directionId ?? null);
  // The directions list does not embed stops — use the dedicated stops query
  // (chain order) for the picker and flank-name readout. Memoized: the `?? []`
  // fallback must not mint a new array per render (flankLabels depends on it).
  const { data: directionStops } = useDirectionStopsQuery(
    target?.directionId ?? null,
  );
  const stops = useMemo(() => directionStops ?? [], [directionStops]);

  // Late-bind stops into the store target once they land (the editor can
  // open before the stops query resolves — composing needs them).
  useEffect(() => {
    if (stops.length > 0) {
      setTargetStops(
        stops.map((stop) => ({
          stop_id: stop.stop_id,
          name: stop.name,
          location: stop.location.coordinates,
        })),
      );
    }
  }, [stops, setTargetStops]);

  // Flanking stop names for the readout (entry/exit match direction stops).
  const flankLabels = useMemo(() => {
    if (!stops.length || !entry || !exit) return null;
    const near = (location: [number, number]) =>
      stops.find(
        (stop) =>
          coordsDistanceMeters(stop.location.coordinates, location) < 60,
      )?.name ?? null;
    return { before: near(entry.coordinate), after: near(exit.coordinate) };
  }, [stops, entry, exit]);

  const closeGroup = (opts: { clearDraft?: boolean } = {}) => {
    const directionId = target?.directionId;
    close();
    // Clear only after close() so the persistence effect's final pass
    // (open=false) can never re-write a draft we just erased. A successful
    // save clears the draft; Cancel/Esc/tool-switch PRESERVE it (the restore
    // offer recovers it next time — same contract as the base route).
    if (opts.clearDraft && directionId) clearDetourDraft(directionId);
  };

  // Draft offers: the first time the editor opens for a direction with a
  // persisted detour draft, offer restore (US4). One offer per direction.
  const draftCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !target) return;
    if (draftCheckedRef.current === target.directionId) return;
    draftCheckedRef.current = target.directionId;
    if (loadDetourDraft(target.directionId) !== null) {
      useDetourStore.getState().offerDraft();
    }
  }, [open, target]);

  // Persist the composition as the direction's detour draft while editing
  // (US4, T031) — a full snapshot per change; the payload is small and the
  // editor is modal, so plain writes are fine.
  const draftSignature = JSON.stringify([
    target?.directionId,
    entry?.coordinate,
    exit?.coordinate,
    loop?.coordinates,
    label,
    commuterInstruction,
    driverInstruction,
    additionalDistanceMeters,
  ]);
  useEffect(() => {
    if (!open || !target) return;
    const state = useDetourStore.getState();
    // A pristine open must NEVER clobber a leftover draft: until the admin
    // actually changes the composition (`touched`), the old draft stays in
    // storage so the restore offer can surface it (offer-banner race). The
    // flag covers BOTH the new and the edit path (review follow-up).
    if (!state.touched) return;
    const draft = state.serializeDraft();
    if (draft) saveDetourDraft(target.directionId, draft);
  }, [open, target, draftSignature, loop]);

  const offeredDraft = useMemo(
    () =>
      target ? loadDetourDraft<DetourDraftSnapshot>(target.directionId) : null,
    // Re-read only when an offer is pending; the draft body changes on every
    // edit but the banner only needs existence + restore snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, draftOffer, target?.directionId],
  );

  if (!open || !target) return null;

  const buildEditPatch = (
    baseline: NonNullable<typeof editBaseline>,
  ): UpdateDetourPayload | null => {
    const result = validateSave();
    if (!result.ok) {
      setLastError(result.reason);
      return null;
    }
    const payload = result.payload;
    const patch: UpdateDetourPayload = {};
    if (payload.label !== baseline.label) patch.label = payload.label;
    if (payload.commuter_instruction !== baseline.commuter_instruction)
      patch.commuter_instruction = payload.commuter_instruction;
    if ((payload.driver_instruction ?? null) !== baseline.driver_instruction)
      patch.driver_instruction = payload.driver_instruction ?? null;
    const loopChanged =
      JSON.stringify(payload.detour_polyline.coordinates) !==
      JSON.stringify(baseline.detour_polyline.coordinates);
    const entryChanged =
      JSON.stringify(payload.entry.coordinates) !==
      JSON.stringify(baseline.entry.coordinates);
    const exitChanged =
      JSON.stringify(payload.exit.coordinates) !==
      JSON.stringify(baseline.exit.coordinates);
    if (loopChanged || entryChanged || exitChanged) {
      patch.detour_polyline = payload.detour_polyline;
      patch.entry = payload.entry;
      patch.exit = payload.exit;
      patch.additional_distance_meters = payload.additional_distance_meters;
    }
    const stopsChanged =
      JSON.stringify(payload.detour_stops) !==
      JSON.stringify(
        baseline.detour_stops.map(
          ({
            name,
            location,
            type,
            is_guaranteed_service,
            landmark_hint,
            notes,
          }) => ({
            name,
            location,
            type,
            is_guaranteed_service,
            landmark_hint,
            notes,
          }),
        ),
      );
    if (stopsChanged) patch.detour_stops = payload.detour_stops;
    return Object.keys(patch).length > 0 ? patch : null;
  };

  const handleSave = () => {
    if (!target) return;
    // US4 conflict guard: the saved list changed while editing. Load latest
    // before refusing — the retried save then validates against fresh data.
    const savedCount = detoursQuery.data?.length ?? 0;
    if (savedCount !== baselineDetourCount) {
      void detoursQuery.refetch();
      setLastError(CONFLICT_COPY);
      return;
    }
    setLastError(null);
    if (editDetourId && editBaseline) {
      const patch = buildEditPatch(editBaseline);
      if (!patch) {
        setLastError("No changes to save."); // gate reason already set if invalid
        return;
      }
      updateMutation.mutate(
        { detourId: editDetourId, patch },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: routeKeys.detours(target.directionId),
            });
            closeGroup({ clearDraft: true });
          },
          onError: (error) =>
            setLastError(
              error instanceof Error ? error.message : "Save failed.",
            ),
        },
      );
      return;
    }
    const result = validateSave();
    if (!result.ok) {
      setLastError(result.reason);
      return;
    }
    createMutation.mutate(result.payload, {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: routeKeys.detours(target.directionId),
        });
        closeGroup({ clearDraft: true });
      },
      onError: (error) =>
        setLastError(error instanceof Error ? error.message : "Save failed."),
    });
  };

  return (
    <section aria-label="Alternative route" className="border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {editDetourId ? "Edit alternative route" : "Plot alternative route"}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {target.routeName} · {target.directionLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => closeGroup()}
          aria-label="Close alternative route"
          className="text-muted-foreground size-6 shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Activation lives here (detour properties), not the list row. */}
      {editDetourId !== null && (
        <div className="mt-2 flex items-center justify-between">
          <Label htmlFor="detour-active" className="text-xs">
            Active
          </Label>
          <Switch
            id="detour-active"
            checked={editBaseline?.is_active !== false}
            disabled={saving || updateMutation.isPending}
            onCheckedChange={(checked) =>
              updateMutation.mutate({
                detourId: editDetourId,
                patch: { is_active: checked },
              })
            }
          />
        </div>
      )}

      {draftOffer && offeredDraft && (
        <div
          role="status"
          className="mt-2 rounded-md border border-amber-500/50 bg-amber-50 px-2 py-1.5 text-xs"
        >
          You have an unsaved detour draft for this direction.
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                if (!offeredDraft) return;
                restoreDraft(offeredDraft);
                clearDetourDraft(target.directionId);
              }}
            >
              Restore draft
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                clearDetourDraft(target.directionId);
                markDraftHandled();
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      <p className="text-muted-foreground mt-2 text-xs">{PLACE_STEPS[mode]}</p>

      {refusal !== null && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 mt-2 rounded-md border px-2 py-1.5 text-xs"
        >
          {refusal.kind === "order" ? (
            <span>
              The merge node must come AFTER the split node along the route.
              <button
                type="button"
                onClick={swapEntryExit}
                className="text-foreground ml-1 font-semibold underline underline-offset-2"
              >
                Swap split/merge
              </button>
            </span>
          ) : (
            <span>
              Split and merge are too close together — pick a merge further
              along the route.
            </span>
          )}
        </div>
      )}

      {stops.length === 0 && (
        <p className="text-muted-foreground mt-1 text-xs">
          Loading this direction’s stops…
        </p>
      )}

      {composeError !== null && (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {composeError}
        </p>
      )}

      {/* Composition readout: entry/exit flanks + distance. */}
      {entry !== null && exit !== null && (
        <div className="mt-2 rounded-md border px-2 py-1.5 text-xs">
          <p>
            <span className="font-semibold">
              {label.trim() || "Untitled detour"}
            </span>
            {flankLabels && (
              <span className="text-muted-foreground">
                {" "}
                — from{" "}
                <span className="font-medium">
                  {flankLabels.before ?? "the route"}
                </span>{" "}
                to{" "}
                <span className="font-medium">
                  {flankLabels.after ?? "the route"}
                </span>
                {additionalDistanceMeters !== null && (
                  <>
                    {" · extra "}
                    {formatDistance(
                      additionalDistanceMeters,
                      additionalDistanceMeters < 1000 ? "m" : "km",
                    )}
                  </>
                )}
              </span>
            )}
          </p>
        </div>
      )}

      {snap !== null && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          Snap:{" "}
          {formatDistance(
            snap.distanceMeters,
            snap.distanceMeters < 1000 ? "m" : "km",
          )}{" "}
          from route
        </p>
      )}

      {mapboxWarning !== null && (
        <p className="mt-1.5 text-xs text-amber-600">
          Road following is unavailable — showing a straight line. Click the
          detour point again to retry.
        </p>
      )}

      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <Label htmlFor="detour-label" className="text-xs">
            Label
          </Label>
          <Input
            id="detour-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="h-8"
            placeholder="Detour name shown to commuters"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="detour-commuter" className="text-xs">
            Passenger instruction
          </Label>
          <Input
            id="detour-commuter"
            value={commuterInstruction}
            onChange={(event) => setCommuterInstruction(event.target.value)}
            className="h-8"
            placeholder="e.g. Turn left at the market, rejoin after the bridge"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="detour-driver" className="text-xs">
            Driver instruction{" "}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="detour-driver"
            value={driverInstruction}
            onChange={(event) => setDriverInstruction(event.target.value)}
            className="h-8"
            placeholder="Crew-only notes"
          />
        </div>
      </div>

      {lastError !== null && (
        <p role="alert" className="text-destructive mt-2 border-t pt-2 text-xs">
          {lastError}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Undo"
          disabled={!canUndo || saving}
          onClick={undo}
          className="text-muted-foreground size-7"
        >
          <Undo2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Redo"
          disabled={!canRedo || saving}
          onClick={redo}
          className="text-muted-foreground size-7"
        >
          <Redo2 className="size-3.5" />
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => closeGroup()}
        >
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : editDetourId ? "Save changes" : "Save detour"}
        </Button>
      </div>
    </section>
  );
}
