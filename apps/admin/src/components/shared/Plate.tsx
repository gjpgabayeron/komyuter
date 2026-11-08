import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface PlateProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding scale: "none" (default), "sm" (p-2), "md" (p-3). The plate
   *  itself never adds margins or gutters — spacing comes from the parent
   *  column's 12 px `p-3` inset (gutter-0 layout decision). */
  padded?: "none" | "sm" | "md";
}

/**
 * The white plate surface of the Route Sign grammar — `rounded-lg border
 * bg-white`. Used for the workspace's floating column plates (left route
 * list, right properties). Layout (flex direction, overflow, sizing) is
 * composed by the caller via `className`; this component only provides the
 * shared surface + optional padding so every plate reads identically.
 */
export function Plate({ padded = "none", className, ...props }: PlateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white",
        padded === "sm" && "p-2",
        padded === "md" && "p-3",
        className,
      )}
      {...props}
    />
  );
}
