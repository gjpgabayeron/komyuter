import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SAVE_COPY, CONFLICT_COPY } from "@/lib/labels";
import type { DraftPayload } from "@/lib/draft";
import { DraftRestoreBanner } from "./DraftRestoreBanner";
import { NoticePlate } from "@/components/shared/NoticePlate";

interface StatusBarProps {
  /** Unsaved plotting/metadata edits exist. */
  dirty: boolean;
  /** A save is in flight. */
  saving: boolean;
  /** A save just completed — show the "Saved just now" state transiently. */
  justSaved: boolean;
  /** A draft was just restored — show the confirmation transiently. */
  restored: boolean;
  /** Pending draft-restore offer (null when none). */
  draft: DraftPayload | null;
  /** A save conflict is active. */
  conflict: boolean;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
  onLoadLatest: () => void;
  onDismissConflict: () => void;
}

/**
 * The status slot (US4) — a plate stack pinned to the top-right of the center
 * track, mirroring the POI search bar on the same top row (same visual
 * hierarchy), shown only while editing. Context-sensitive: the save-lifecycle
 * plate renders ONLY when there is something to say — a save in flight, an
 * unsaved change, or a just-completed save (the "Saved just now" state is
 * transient; the host auto-clears `justSaved` after a few seconds). Below the
 * lifecycle, exactly ONE notice at a time: the draft-restore offer, the
 * draft-restored confirmation, or the save-conflict notice — they never stack
 * (spec US4 scenario 3). Conflict takes precedence (the save failed; the local
 * work is at risk). The whole slot renders nothing when there is no status and
 * no notice (no dead space in the corner).
 */
export function StatusBar({
  dirty,
  saving,
  justSaved,
  restored,
  draft,
  conflict,
  onRestoreDraft,
  onDiscardDraft,
  onLoadLatest,
  onDismissConflict,
}: StatusBarProps) {
  // Lifecycle plate is context-sensitive: show it only on an actual state
  // change — saving, unsaved edits, or a transiently-confirmed save. When
  // clean and idle (no just-completed save), the plate is hidden entirely.
  const showLifecycle = saving || dirty || justSaved;
  const lifecycle = saving
    ? SAVE_COPY.saving
    : dirty
      ? "Unsaved changes"
      : SAVE_COPY.saved;

  if (!showLifecycle && !conflict && !draft && !restored) return null;

  return (
    <div className="pointer-events-auto z-30 flex w-max max-w-sm flex-col items-end gap-1.5">
      {showLifecycle && (
        <div
          role="status"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            saving
              ? "border-primary/40 bg-primary/5 text-primary"
              : dirty
                ? "border-attentionAmber/50 bg-attentionAmberTint text-attentionAmberDeep"
                : "border-emerald-600/40 bg-emerald-50 text-emerald-900"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              saving
                ? "bg-primary animate-pulse"
                : dirty
                  ? "bg-attentionAmber"
                  : "bg-emerald-600"
            }`}
            aria-hidden="true"
          />
          {lifecycle}
        </div>
      )}

      {conflict ? (
        <NoticePlate
          noticeRole="alert"
          className="border-destructive/40 bg-white"
        >
          <TriangleAlert
            className="text-destructive size-4 shrink-0"
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="text-destructive font-medium">Save conflict</span>{" "}
            <span className="text-muted-foreground">
              Another Administrator edited this route. Your work is still here —
              reload to see the latest, or adjust and save again.
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onLoadLatest}
          >
            {CONFLICT_COPY.loadLatest}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Dismiss conflict notice"
            onClick={onDismissConflict}
          >
            <X className="size-3.5" />
          </Button>
        </NoticePlate>
      ) : draft ? (
        <DraftRestoreBanner
          draft={draft}
          onRestore={onRestoreDraft}
          onDiscard={onDiscardDraft}
        />
      ) : restored ? (
        <NoticePlate className="border-primary/30 bg-background">
          <CircleCheck className="text-primary size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="text-foreground font-medium">Draft restored.</span>{" "}
            <span className="text-muted-foreground">
              Your unsaved changes are back.
            </span>
          </span>
        </NoticePlate>
      ) : null}
    </div>
  );
}
