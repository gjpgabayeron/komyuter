import { brandMarkUrl } from "@/lib/brand";

export function BrandPanel() {
  return (
    <div className="bg-muted relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg p-12">
      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
        <img src={brandMarkUrl} alt="Komyuter" className="h-24 w-auto" />
        <div>
          <p className="font-display text-foreground text-2xl font-bold tracking-tight xl:text-3xl">
            Komyuter
          </p>
        </div>
      </div>
    </div>
  );
}
