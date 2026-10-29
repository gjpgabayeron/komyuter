import { useHotkeys } from "react-hotkeys-hook";
import { SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlottingStore } from "@/lib/plottingStore";
import { RouteMap } from "@/features/routes/RouteMap";
import { MapProvider } from "react-map-gl/maplibre";
import { RouteList } from "@/features/routes/RouteList";
import { RouteOverviewLayer } from "@/features/routes/RouteOverviewLayer";
import { PoiSearchBar } from "@/features/routes/PoiSearchBar";
import { EmptyState } from "@/features/routes/EmptyState";
import { NarrowWindowGate } from "@/features/routes/NarrowWindowGate";
import { PlotActionBar } from "@/features/routes/PlotActionBar";
import { useDetourStore } from "@/features/detours/detourStore";
import { DetourSidebar } from "@/features/detours/DetourSidebar";
import { DetourLayer } from "@/features/detours/DetourLayer";
import { PropertiesPanel } from "@/features/routes/PropertiesPanel";
import { SearchResultsPanel } from "@/features/routes/search/SearchResultsPanel";
import { plateSlotsFor } from "@/features/routes/workspace/plateSlots";
import { StatusBar } from "@/features/routes/StatusBar";
import { WorkspaceColumns } from "@/features/routes/workspace/WorkspaceColumns";
import {
  RouteWorkspaceProvider,
  useRouteWorkspace,
} from "@/features/routes/workspace/RouteWorkspaceProvider";

const SNAP_WARNING_COPY: Record<string, string> = {
  no_token:
    "Road following is off — showing a straight line. Add a public Mapbox token (MAPBOX_TOKEN) to enable it.",
  upstream_error:
    "Road following is unavailable right now — showing a straight line. Place another stop to retry.",
};

/**
 * The Route Workspace — a three-column, four-state orchestrator (ADR-0014).
 * The orchestration (route queries, four-state derivation, draft/undo/redo/
 * save/conflict lifecycle, navigation guards, styled dialogs) lives in
 * `RouteWorkspaceProvider`; this page is the thin assembly that renders the
 * map backdrop and the per-state columns around it:
 *
 *   empty    → map + EmptyState veil
 *   overview → RouteList + map (+ overview layer)
 *   focus    → RouteList + map + FocusPlate (right column)
 *   edit     → RouteList(stops) + map + PropertiesPanel + plot action bar
 *
 * The map never remounts (SC-002); the provider owns all behavior.
 */
function RouteWorkspaceInner() {
  const {
    uiState,
    hasRoute,
    showSave,
    saving,
    snap,
    showSnapWarning,
    draftOffer,
    conflict,
    justSaved,
    draftRestored,
    openNewRoute,
    anyDialogOpen,
    requestCloseEdit,
    saveAll,
    restoreDraft,
    discardDraft,
    onLoadLatest,
    onDismissConflict,
  } = useRouteWorkspace();

  // Child dialogs (route delete, stop delete) are detected via the DOM — any
  // open role=dialog/alertdialog owns Esc. (The provider's own dialogs are
  // covered by the reactive `anyDialogOpen` from the hook.)
  const childDialogOpen = () =>
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"]',
    ) !== null;

  const directionOpen = usePlottingStore((s) => s.directionId !== null);
  const detourOpen = useDetourStore((s) => s.open);
  // A search session owns the right column while it lasts: results when the
  // answer is ambiguous, nothing when a single hit is being shown on the map.
  const searchActive = usePlottingStore((s) => s.searchActive);
  const poiCandidates = usePlottingStore((s) => s.poiCandidates);
  const poiStatus = usePlottingStore((s) => s.poiStatus);
  // Which plate lives where is a rule, not a condition buried in JSX: results
  // take the context column while a search has something to say, properties
  // yield for the session, and a confident hit opens neither (ADR-0024).
  const slots = plateSlotsFor({
    searchActive,
    candidateCount: poiCandidates.length,
    hasStatus: poiStatus !== null,
  });

  useHotkeys("mod+s", () => void saveAll(), {
    // The detour editor owns SAVE while it is open (its panel has the
    // buttons); the base-route save stays silent so mod+s never saves the
    // wrong thing mid-detour (review follow-up).
    enabled: hasRoute && !saving && !detourOpen,
    preventDefault: true,
  });

  // Undo/redo: the detour editor owns the shortcuts while it is open, the
  // plotting draft otherwise (FR-013/FR-019/FR-020).
  useHotkeys(
    "mod+z",
    () => {
      const detour = useDetourStore.getState();
      if (detour.open) detour.undo();
      else usePlottingStore.getState().undo();
    },
    { enabled: hasRoute && !saving, preventDefault: true },
  );
  useHotkeys(
    "mod+shift+z",
    () => {
      const detour = useDetourStore.getState();
      if (detour.open) detour.redo();
      else usePlottingStore.getState().redo();
    },
    { enabled: hasRoute && !saving, preventDefault: true },
  );

  // Keyboard contract (FR-008): Esc dismisses the focus plate (T6) or leaves
  // the editor back to focus (T5, styled confirm when dirty). Typing inside a
  // form field keeps Esc for its native purpose (blur / close a popover) —
  // never steps the workspace back.
  const focusedRouteId = usePlottingStore((s) => s.focusedRouteId);
  useHotkeys(
    "esc",
    () => {
      if (childDialogOpen()) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        return;
      }
      // Esc first leaves the detour editor (draft preserved for the restore
      // offer); the base-route editor's close flows are untouched.
      if (useDetourStore.getState().open) {
        useDetourStore.getState().close();
        return;
      }
      // A live search session closes before the workspace steps back: the
      // results plate is the surface the admin is looking at (ADR-0024). The
      // pill's own Esc handles the case where the field still has focus.
      if (usePlottingStore.getState().searchActive) {
        usePlottingStore.getState().clearSearchSession();
        return;
      }
      if (hasRoute) {
        requestCloseEdit();
      } else if (focusedRouteId !== null) {
        usePlottingStore.getState().setFocusedRouteId(null);
      }
    },
    { enabled: !anyDialogOpen },
  );

  return (
    <MapProvider>
      <div className="relative h-full w-full overflow-hidden">
        <NarrowWindowGate mode={uiState === "empty" ? "overview" : uiState}>
          {/* The map is the full-bleed backdrop behind the grid (ADR-0015):
              it spans the whole workspace and never resizes or remounts, so
              the plates float over a consistent, seamless canvas. */}
          <main aria-label="Route map" className="absolute inset-0">
            <RouteMap className="h-full w-full">
              {(uiState === "overview" || uiState === "focus") && (
                <RouteOverviewLayer />
              )}
              <DetourLayer />
            </RouteMap>
          </main>

          {/* Three-column shell over the map: content-adaptive plates in
              tracks + a transparent center track hosting the chrome. */}
          <WorkspaceColumns
            mode={uiState}
            leftPinned={directionOpen}
            left={
              <div
                className={
                  directionOpen
                    ? // The track is definite when pinned (h-full there), so
                      // this column can fill it and pin the card to the bottom.
                      "flex h-full w-full flex-col"
                    : "flex w-full flex-col"
                }
              >
                <div className="min-h-0 flex-1 overflow-hidden">
                  <RouteList
                    onCreateRoute={openNewRoute}
                    onCloseEdit={requestCloseEdit}
                  />
                </div>
                {directionOpen && <DetourSidebar />}
              </div>
            }
            right={slots.right === "properties" ? <PropertiesPanel /> : null}
            context={searchActive ? <SearchResultsPanel /> : null}
            contextOpen={slots.context === "search"}
            empty={<EmptyState onCreateRoute={openNewRoute} />}
            chrome={
              hasRoute ? (
                <div className="flex h-full flex-col justify-between py-3">
                  <div className="flex w-full justify-between">
                    <PoiSearchBar />
                    <StatusBar
                      dirty={showSave}
                      saving={saving}
                      justSaved={justSaved}
                      restored={draftRestored}
                      draft={draftOffer}
                      conflict={conflict}
                      onRestoreDraft={() =>
                        draftOffer && restoreDraft(draftOffer)
                      }
                      onDiscardDraft={() =>
                        draftOffer && discardDraft(draftOffer)
                      }
                      onLoadLatest={onLoadLatest}
                      onDismissConflict={onDismissConflict}
                    />
                  </div>
                  <div className="pointer-events-auto z-30 flex items-center justify-center gap-2">
                    <PlotActionBar
                      onUndo={() => usePlottingStore.getState().undo()}
                      onRedo={() => usePlottingStore.getState().redo()}
                    />
                    {showSave && !detourOpen && (
                      <Button
                        size="icon"
                        onClick={() => void saveAll()}
                        disabled={saving}
                        aria-label={saving ? "Saving changes" : "Save changes"}
                      >
                        <SaveIcon />
                      </Button>
                    )}
                  </div>
                  {showSnapWarning && snap.warning && (
                    <div
                      role="status"
                      className="border-warning/60 bg-warning text-foreground pointer-events-auto absolute bottom-16 left-1/2 z-30 w-max max-w-sm -translate-x-1/2 rounded-lg border px-3 py-1.5 text-xs"
                    >
                      {SNAP_WARNING_COPY[snap.warning] ?? snap.warning}
                    </div>
                  )}
                </div>
              ) : null
            }
          />
        </NarrowWindowGate>
      </div>
    </MapProvider>
  );
}

export default function RouteWorkspace() {
  return (
    <RouteWorkspaceProvider>
      <RouteWorkspaceInner />
    </RouteWorkspaceProvider>
  );
}
