import { RefreshCw } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { Plate } from "@/components/shared/Plate";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth";

/**
 * FR-015: backend unreachable at dashboard load. Rendered by RequireAuth when
 * the session restore could not reach the server. The stored session is left
 * untouched and the situation is never presented as an expired session —
 * the retry resumes the restore once the backend is reachable again.
 */
export function BackendUnreachable() {
  const { retry, retrying } = useAuth();

  return (
    <main className="bg-background flex min-h-svh flex-col">
      <div className="flex w-full items-center p-4 lg:p-8">
        <BrandMark />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 md:px-6">
        <Plate
          padded="md"
          className="flex w-full max-w-md flex-col items-center gap-4 text-center"
        >
          <h1 className="font-display text-foreground text-xl font-bold">
            Backend unreachable
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The administration server can&apos;t be reached right now. Your
            session is safe — retry to continue where you left off.
          </p>
          <Button onClick={() => void retry()} disabled={retrying}>
            <RefreshCw className={`size-4 ${retrying ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </Plate>
      </div>
    </main>
  );
}
