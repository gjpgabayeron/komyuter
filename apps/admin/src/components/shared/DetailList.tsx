import { type ReactNode } from "react";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { cn } from "@/lib/utils";

/**
 * The right plate's standard read-only details surface. Every "static details"
 * group (route, stop, alternative route, detour stop, focus, read-only mode)
 * uses this instead of a bespoke grid or a disabled input, so values read the
 * same in every state.
 */
export function DetailList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn("space-y-1.5 text-xs", className)}>{children}</dl>;
}

/** A titled details block — the bottom half of every right-plate group. */
export function DetailSection({
  children,
  title = "Details",
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <section className={cn("mt-4 border-t pt-3", className)}>
      <SectionLabel>{title}</SectionLabel>
      <DetailList className="mt-2">{children}</DetailList>
    </section>
  );
}

/** One label/value row. Values truncate so long names never widen the rail. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

/** A label above a multi-line value (notes, instructions, provenance notes). */
export function DetailBlock({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
