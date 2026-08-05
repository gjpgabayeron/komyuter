import { useLocation } from "react-router-dom";
import { getSectionByPath } from "@/lib/sections";

export function Header() {
  const { pathname } = useLocation();
  const section = getSectionByPath(pathname);

  return (
    <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-4 lg:px-6">
      <h1 className="text-foreground text-base font-semibold tracking-tight">
        {section?.label ?? "Komyuter"}
      </h1>
      <div className="flex items-center gap-2">{/* sign-out slot (US3) */}</div>
    </header>
  );
}
