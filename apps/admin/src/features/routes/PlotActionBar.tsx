import {
  Check,
  Layers,
  Link2,
  MousePointer2,
  Plus,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlottingStore } from "@/lib/plottingStore";
import { cn } from "@/lib/utils";

interface PlotActionBarProps {
  onApply: () => void;
  onRevert: () => void;
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground hover:text-foreground data-disabled:pointer-events-none",
            )}
          >
            {children}
          </button>
        )}
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Edit-mode pointer tool: Select (click/drag stops) vs Add (click to insert). */
function ToolToggle({ disabled }: { disabled: boolean }) {
  const tool = usePlottingStore((s) => s.tool);
  const setTool = usePlottingStore((s) => s.setTool);

  const button = (active: boolean) =>
    cn(
      "flex size-7 items-center justify-center rounded-[3px] transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground",
      disabled && "pointer-events-none opacity-40",
    );

  return (
    <div
      role="group"
      aria-label="Edit tool"
      className="bg-muted flex items-center rounded-lg p-0.5"
    >
      <Tooltip>
        <TooltipTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Select stops"
              aria-pressed={tool === "select"}
              onClick={() => setTool("select")}
              className={button(tool === "select")}
            >
              <MousePointer2 className="size-3.5" />
            </button>
          )}
        />
        <TooltipContent side="top">Select stops (drag to move)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Add stops"
              aria-pressed={tool === "add"}
              onClick={() => setTool("add")}
              className={button(tool === "add")}
            >
              <Plus className="size-3.5" />
            </button>
          )}
        />
        <TooltipContent side="top">Add stops (click the map)</TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Centered floating icon-only action bar below the map (FR-019) — Figma-style:
 * each action is a recognizable icon with a tooltip, and the Select/Add tool
 * toggle shows the active edit tool. Everything locks while a save is in
 * flight; the dedicated Save button (right of the bar) owns persistence.
 */
export function PlotActionBar({ onApply, onRevert }: PlotActionBarProps) {
  const snapStatus = usePlottingStore((s) => s.snap.status);
  const saving = usePlottingStore((s) => s.saving);

  const previewReady = snapStatus === "preview";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5 rounded-lg border bg-white px-1.5 py-1">
        <ToolToggle disabled={saving} />
        <IconAction label="Connect" disabled>
          <Link2 className="size-3.5" />
        </IconAction>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <IconAction
          label="Apply preview"
          onClick={onApply}
          disabled={saving || !previewReady}
        >
          <Check className="size-3.5" />
        </IconAction>
        <IconAction
          label="Revert preview"
          onClick={onRevert}
          disabled={saving || !previewReady}
        >
          <X className="size-3.5" />
        </IconAction>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <IconAction label="Undo" disabled>
          <Undo2 className="size-3.5" />
        </IconAction>
        <IconAction label="Redo" disabled>
          <Redo2 className="size-3.5" />
        </IconAction>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <IconAction label="Layers" disabled>
          <Layers className="size-3.5" />
        </IconAction>
      </div>
    </TooltipProvider>
  );
}
