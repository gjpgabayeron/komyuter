import { type ElementType, type HTMLAttributes } from "react";

interface SectionLabelProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Underlying element: "h3" (default, inside a plate after its title) or
   *  "span" (when used as a decorative eyebrow before a higher-level title —
   *  avoids heading-order violations). */
  as?: ElementType;
}

/**
 * Small uppercase section heading used to label groups inside a plate
 * (e.g., "Route", "Stop", "Connections" in the properties panel). Consistent
 * muted, tracking-wide styling so every section reads the same.
 */
export function SectionLabel({
  as: Tag = "h3",
  children,
  ...props
}: SectionLabelProps) {
  return (
    <Tag
      className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase"
      {...props}
    >
      {children}
    </Tag>
  );
}
