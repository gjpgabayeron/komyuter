import { brandMarkUrl } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <img
        src={brandMarkUrl}
        alt={compact ? "Komyuter" : ""}
        className="h-6 w-auto shrink-0"
      />
      <span
        className={cn(
          "font-display text-foreground translate-y-px text-xl font-bold tracking-tight whitespace-nowrap transition-opacity duration-150 ease-out",
          compact ? "opacity-0" : "opacity-100",
        )}
        aria-hidden={compact}
      >
        Komyuter
      </span>
    </div>
  );
}
