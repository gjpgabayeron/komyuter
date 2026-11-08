import { WifiOff } from "lucide-react";

interface ConnectionBannerProps {
  online: boolean;
}

export function ConnectionBanner({ online }: ConnectionBannerProps) {
  if (online) {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-warning text-warning-foreground relative z-50 flex h-9 w-full shrink-0 items-center justify-center gap-2 px-4 text-sm font-medium"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>
        You&apos;re offline. Changes won&apos;t be saved until you reconnect.
      </span>
    </div>
  );
}
