import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "@/app/Header";
import { NavRail } from "@/app/NavRail";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useOnline } from "@/lib/useOnline";
import { useUiStore } from "@/lib/uiStore";
import { cn } from "@/lib/utils";

export function AppShell() {
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const [hoverOpen, setHoverOpen] = useState(false);
  const online = useOnline();

  const open =
    sidebarMode === "expanded"
      ? true
      : sidebarMode === "collapsed"
        ? false
        : hoverOpen;

  const onOpenChange = (value: boolean) => {
    if (sidebarMode === "hover") setHoverOpen(value);
  };

  return (
    <SidebarProvider open={open} onOpenChange={onOpenChange}>
      <div className="bg-background flex h-svh w-full flex-col">
        <a
          href="#main-content"
          className="bg-background text-foreground focus-visible:outline-ring sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus-visible:outline-2"
        >
          Skip to content
        </a>
        <ConnectionBanner online={online} />
        <div className="relative flex min-h-0 flex-1">
          <NavRail onHoverChange={setHoverOpen} />
          <SidebarInset
            className={cn(
              "min-h-0 transition-[padding] duration-150 ease-linear",
              // Rail behavior (supersedes D1 in ADR-0014): the rail only
              // docks/pushes in persisted "expanded" mode — hover-expand
              // OVERLAYS the content instead of shifting it (the rail is
              // absolute z-30; content keeps the icon-width padding). The
              // workspace's map-width gate absorbs the expanded-rail case.
              sidebarMode === "expanded"
                ? "md:pl-(--sidebar-width)"
                : "md:pl-(--sidebar-width-icon)",
            )}
          >
            <Header />
            <div
              id="main-content"
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-auto focus-visible:outline-none"
            >
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
