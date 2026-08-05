import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
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

export function NavRail({ onHoverChange }: NavRailProps) {
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const setSidebarMode = useUiStore((s) => s.setSidebarMode);
  const { state } = useSidebar();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const collapsed = state === "collapsed";

  return (
    <Sidebar
      collapsible="icon"
      data-sidebar-mode={sidebarMode}
      className="absolute h-full"
      role="navigation"
      aria-label="Primary"
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
              <Button
                {...props}
                variant="ghost"
                size="icon"
                className="justify-center"
                aria-label="Sidebar visibility options"
              >
                <PanelLeft className="size-4" />
              </Button>
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
    </Sidebar>
  );
}
