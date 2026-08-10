import { History, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DraftPayload } from "@/lib/draft";

/** Formats a timestamp as a short relative "saved X ago" string. */
function formatDraftAge(savedAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - savedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Unsaved-work banner (FR-014): when the admin reopens a route that still has
 * a client-local draft (written within the 24 h TTL), offer to continue where
 * they left off — exact state including undo history — or discard the draft.
 * Nothing is offered after expiry (loadDraft returns null then).
 */
export function DraftRestoreBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: DraftPayload;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      className="border-primary/30 bg-background absolute top-3 left-1/2 z-20 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <History className="text-primary size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="text-foreground font-medium">
          Unsaved changes {formatDraftAge(draft.savedAt)}.
        </span>{" "}
        <span className="text-muted-foreground">
          Restore your stops and path, or start fresh.
        </span>
      </span>
      <Button
        size="sm"
        variant="default"
        className="h-7 shrink-0 px-2 text-xs"
        onClick={onRestore}
        aria-label="Restore unsaved changes"
      >
        <RotateCcw className="size-3" />
        Restore
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground h-7 shrink-0 px-2 text-xs"
        onClick={onDiscard}
        aria-label="Discard unsaved changes"
      >
        <Trash2 className="size-3" />
        Discard
      </Button>
    </div>
  );
}
