import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface HeaderPopoverProps {
  /** Accessible name for the trigger and the panel. */
  label: string;
  /** The chip's content; the chevron is added by the shell. */
  trigger: ReactNode;
  /** Rendered inside the panel. Call `close` after an action. */
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}

/**
 * The shell-header popover: a 288 px plate anchored under a chip. Non-modal,
 * closes on outside pointerdown or Escape, and never leaves a shadow — the
 * Route Sign grammar keeps the header flat. One panel is open at a time
 * because each trigger owns its own instance and the document pointerdown
 * closes the other.
 */
export function HeaderPopover({
  label,
  trigger,
  children,
  align = "left",
}: HeaderPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (rootRef.current?.contains(target)) return;
      // Nested menus render in a portal outside this root; a click there is
      // still "inside" the interaction and must not dismiss the popover.
      if (
        target.closest?.('[data-slot="dropdown-menu-content"], [role="menu"]')
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="text-foreground hover:bg-muted flex h-8 min-w-0 items-center gap-1.5 rounded-sm px-2 text-sm"
      >
        {trigger}
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            "bg-popover absolute top-full z-50 mt-1 w-72 overflow-hidden rounded-sm border",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}
