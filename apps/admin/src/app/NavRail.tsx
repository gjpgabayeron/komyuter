import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { getSectionByPath, sections } from "@/lib/sections";
import { useUiStore, type SidebarMode } from "@/lib/uiStore";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: {
  mode: SidebarMode;
  label: string;
}[] = [
  {
    mode: "expanded",
    label: "Expanded",
  },
  {
    mode: "collapsed",
    label: "Collapsed",
  },
  {
    mode: "hover",
    label: "Expand on hover",
  },
];

interface NavRailProps {
  onHoverChange: (open: boolean) => void;
}

/**
 * Overlay navigation rail.
 *
 * Unlike the stock shadcn `Sidebar`, this rail is a pure overlay: it never
 * pushes the content area (no sidebar-gap), so pages like the plotting
 * surface keep their own layout and the rail simply slides over them on
 * hover-expand. The content area offsets itself by the rail width in
 * `AppShell`, so the collapsed rail never covers the page's left panel.
 */
export function NavRail({ onHoverChange }: NavRailProps) {
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const setSidebarMode = useUiStore((s) => s.setSidebarMode);
  const { state } = useSidebar();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const collapsed = state === "collapsed";

  return (
    <div
      data-slot="sidebar"
      data-state={state}
      data-collapsible={collapsed ? "icon" : ""}
      role="navigation"
      aria-label="Primary"
      className={cn(
        "bg-sidebar text-sidebar-foreground group absolute inset-y-0 left-0 z-30 hidden h-full flex-col border-r transition-[width] duration-150 ease-linear md:flex",
        collapsed ? "w-(--sidebar-width-icon)" : "w-(--sidebar-width)",
      )}
      onMouseEnter={() => {
        if (sidebarMode === "hover") onHoverChange(true);
      }}
      onMouseLeave={() => {
        if (sidebarMode === "hover") onHoverChange(false);
      }}
    >
      <SidebarHeader>
        <div className="flex items-center overflow-hidden px-2 py-1">
          <BrandMark compact={collapsed} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {sections.map((section) => {
              const active = section.id === getSectionByPath(pathname)?.id;
              return (
                <SidebarMenuItem key={section.id}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={section.label}
                    className={cn(
                      "data-active:bg-primary data-active:text-primary-foreground",
                      active
                        ? ""
                        : "hover:bg-accent hover:text-accent-foreground",
                    )}
                    render={(props) => (
                      <NavLink
                        {...props}
                        to={section.path}
                        end={section.path === "/"}
                      />
                    )}
                  >
                    <section.icon />
                    <span>{section.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={(props) => (
              <button
                {...props}
                type="button"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "justify-center",
                )}
                aria-label="Sidebar visibility options"
              >
                <PanelLeft className="size-4" />
              </button>
            )}
          />
          <DropdownMenuContent
            align="start"
            side="top"
            sideOffset={8}
            className="w-60 min-w-60 p-1"
          >
            <DropdownMenuRadioGroup
              value={sidebarMode}
              onValueChange={(value) => {
                setSidebarMode(value as SidebarMode);
                // Radio items don't auto-close the menu — close explicitly.
                setMenuOpen(false);
              }}
            >
              <DropdownMenuLabel>Sidebar control</DropdownMenuLabel>
              {MODE_OPTIONS.map((option) => (
                <DropdownMenuRadioItem
                  key={option.mode}
                  value={option.mode}
                  className="gap-2 py-1.5 pr-8"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{option.label}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </div>
  );
}
