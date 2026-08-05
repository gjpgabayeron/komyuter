import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "@/app/Header";
import { NavRail } from "@/app/NavRail";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useOnline } from "@/lib/useOnline";
import { useUiStore } from "@/lib/uiStore";

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
        <ConnectionBanner online={online} />
        <div className="relative flex min-h-0 flex-1">
          <NavRail onHoverChange={setHoverOpen} />
          <SidebarInset className="min-h-0">
            <Header />
            <div className="min-h-0 flex-1 overflow-auto">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
