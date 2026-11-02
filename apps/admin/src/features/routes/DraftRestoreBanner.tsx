import { History, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DraftSummary } from "@/lib/draft";
import { NoticePlate } from "@/components/shared/NoticePlate";

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
 * Unsaved-work list (FR-014, ADR-0020 §6): the Account's Drafts within the
 * 24 h TTL, newest first. Restoring or discarding one entry leaves the others
 * intact — a single plotter can hold several Drafts, so the old single-slot
 * banner became a list. Positioned by its host (StatusBar).
 */
export function DraftRestoreBanner({
  drafts,
  onRestore,
  onDiscard,
}: {
  drafts: DraftSummary[];
  onRestore: (entry: DraftSummary) => void;
  onDiscard: (entry: DraftSummary) => void;
}) {
  return (
    <NoticePlate className="border-primary/30 bg-background max-w-lg flex-col items-stretch gap-1">
      {drafts.map((entry) => {
        const key = `${entry.routeId ?? "no-route"}/${entry.directionId ?? "new"}`;
        return (
          <div key={key} className="flex min-w-0 items-center gap-2">
            <History className="text-primary size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-foreground font-medium">
                Unsaved changes {formatDraftAge(entry.savedAt)}.
              </span>{" "}
              <span className="text-muted-foreground">{entry.label}</span>
            </span>
            <Button
              size="sm"
              variant="default"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => onRestore(entry)}
              aria-label={`Restore unsaved changes for ${entry.label}`}
            >
              <RotateCcw className="size-3" />
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground h-7 shrink-0 px-2 text-xs"
              onClick={() => onDiscard(entry)}
              aria-label={`Discard unsaved changes for ${entry.label}`}
            >
              <Trash2 className="size-3" />
              Discard
            </Button>
          </div>
        );
      })}
    </NoticePlate>
  );
}
