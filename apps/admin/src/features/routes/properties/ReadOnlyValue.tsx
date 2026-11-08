import { SectionLabel } from "@/components/shared/SectionLabel";
import { cn } from "@/lib/utils";

/**
 * One property's value as plain text (ticket #47). The read-only workspace
 * shows Route, Direction and Stop values through this — the reading twin of
 * the editor's field, so nothing on the properties column can submit.
 */
export function ReadOnlyValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <SectionLabel>{label}</SectionLabel>
      <p className={cn("text-sm", mono && "font-mono tabular-nums")}>{value}</p>
    </div>
  );
}
