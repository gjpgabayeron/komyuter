import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/features/auth/auth";
import {
  clearDetourDraft,
  clearDetourDraftFor,
  loadDetourDraft,
  loadDetourDraftFor,
  saveDetourDraft,
  saveDetourDraftFor,
} from "@/lib/draft";
import {
  useDetourStore,
  type DetourDraftSnapshot,
} from "@/features/detours/detourStore";
import { useDirectionStopsQuery } from "@/features/routes/useRouteQueries";
import { coordsDistanceMeters, formatDistance } from "@/lib/coords";
import { formatAttributionName } from "@/features/routes/attribution";
import { DetailRow, DetailSection } from "@/components/shared/DetailList";

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
  const { user } = useAuth();
  const userId = user?.id ?? null;
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
  const isActive = useDetourStore((s) => s.isActive);
  const saving = useDetourStore((s) => s.saving);
  const [discardOpen, setDiscardOpen] = useState(false);

  const setLabel = useDetourStore((s) => s.setLabel);
  const setCommuterInstruction = useDetourStore(
    (s) => s.setCommuterInstruction,
  );
  const setDriverInstruction = useDetourStore((s) => s.setDriverInstruction);
  const setActive = useDetourStore((s) => s.setActive);
  const restoreDraft = useDetourStore((s) => s.restoreDraft);
  const markDraftHandled = useDetourStore((s) => s.markDraftHandled);

  const setTargetStops = useDetourStore((s) => s.setTargetStops);

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

  // Draft offers: the first time the editor opens for a direction with a
  // persisted detour draft, offer restore (US4). One offer per direction.
  const draftCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !target) return;
    const draftKey = `${target.directionId}:${editDetourId ?? "new"}`;
    if (draftCheckedRef.current === draftKey) return;
    draftCheckedRef.current = draftKey;
    const draft = editDetourId
      ? loadDetourDraftFor(userId ?? "", target.directionId, editDetourId)
      : loadDetourDraft(userId ?? "", target.directionId);
    if (userId && draft !== null) {
      useDetourStore.getState().offerDraft();
    }
  }, [open, target, userId, editDetourId]);

  // Persist the composition as the direction's detour draft while editing
  // (US4, T031) — a full snapshot per change; the payload is small and the
  // editor is modal, so plain writes are fine.
  const draftSignature = JSON.stringify([
    target?.directionId,
    editDetourId,
    entry?.coordinate,
    exit?.coordinate,
    loop?.coordinates,
    label,
    commuterInstruction,
    driverInstruction,
    isActive,
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
    if (!draft || !userId) return;
    if (editDetourId) {
      saveDetourDraftFor(userId, target.directionId, editDetourId, draft);
    } else {
      saveDetourDraft(userId, target.directionId, draft);
    }
  }, [open, target, draftSignature, loop, userId, editDetourId, isActive]);

  const offeredDraft = useMemo(
    () =>
      target && userId
        ? editDetourId
          ? loadDetourDraftFor<DetourDraftSnapshot>(
              userId,
              target.directionId,
              editDetourId,
            )
          : loadDetourDraft<DetourDraftSnapshot>(userId, target.directionId)
        : null,
    // Re-read only when an offer is pending; the draft body changes on every
    // edit but the banner only needs existence + restore snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, draftOffer, target?.directionId, editDetourId],
  );

  if (!open || !target) return null;

  return (
    <section aria-label="Alternative route">
      <fieldset disabled={saving} className="min-w-0 border-0 p-0">
        {/* Activation lives here (detour properties), not the list row. */}
        {editDetourId !== null && (
          <div className="mt-2 flex items-center justify-between">
            <Label htmlFor="detour-active" className="text-xs">
              Active
            </Label>
            <Switch
              id="detour-active"
              checked={isActive}
              disabled={saving}
              onCheckedChange={setActive}
            />
          </div>
        )}

        {/* Read-only provenance for a saved detour (ADR-0025): who created it and
          who wrote it last. A detour not yet saved has no baseline to show. */}

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
                  if (userId) {
                    if (editDetourId)
                      clearDetourDraftFor(
                        userId,
                        target.directionId,
                        editDetourId,
                      );
                    else clearDetourDraft(userId, target.directionId);
                  }
                }}
              >
                Restore draft
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setDiscardOpen(true)}
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        <p className="text-muted-foreground mt-2 text-xs">
          {PLACE_STEPS[mode]}
        </p>

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
          <p
            role="alert"
            className="text-destructive mt-2 border-t pt-2 text-xs"
          >
            {lastError}
          </p>
        )}

        <DetailSection>
          <DetailRow label="From">
            {flankLabels?.before ?? "The route"}
          </DetailRow>
          <DetailRow label="To">{flankLabels?.after ?? "The route"}</DetailRow>
          {additionalDistanceMeters !== null && (
            <DetailRow label="Extra distance">
              {formatDistance(
                additionalDistanceMeters,
                additionalDistanceMeters < 1000 ? "m" : "km",
              )}
            </DetailRow>
          )}
          {editBaseline?.created_by && (
            <DetailRow label="Created by">
              {formatAttributionName(editBaseline.created_by)}
            </DetailRow>
          )}
          {editBaseline?.updated_by && (
            <DetailRow label="Last written by">
              {formatAttributionName(editBaseline.updated_by)}
            </DetailRow>
          )}
        </DetailSection>
      </fieldset>

      <p className="text-muted-foreground mt-3 text-right text-[11px]">
        Save changes in the toolbar.
      </p>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard detour draft?"
        description="This removes the saved draft for this direction. The composition cannot be recovered."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          if (userId) {
            if (editDetourId) {
              clearDetourDraftFor(userId, target.directionId, editDetourId);
            } else {
              clearDetourDraft(userId, target.directionId);
            }
          }
          markDraftHandled();
          setDiscardOpen(false);
        }}
      />
    </section>
  );
}
