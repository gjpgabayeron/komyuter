import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface NoticePlateProps extends HTMLAttributes<HTMLDivElement> {
  /** ARIA role for the notice: "status" (informational, polite) or "alert"
   *  (action required, assertive). Defaults to "status". */
  noticeRole?: "status" | "alert";
}

/**
 * A floating notice plate (the Route Sign plate grammar with a status/alert
 * role) — used by the status-slot notices (draft restore, draft restored,
 * save conflict). The icon, tone, and actions are composed by the caller via
 * `className`; this component provides the shared plate structure so every
 * notice reads identically and announces correctly.
 */
export function NoticePlate({
  noticeRole = "status",
  className,
  ...props
}: NoticePlateProps) {
  return (
    <div
      role={noticeRole}
      className={cn(
        "flex max-w-md items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        className,
      )}
      {...props}
    />
  );
}
