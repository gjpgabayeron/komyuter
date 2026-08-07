import { useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/auth";
import { getDisplayName, getInitials } from "@/features/auth/session";
import { getSectionByPath } from "@/lib/sections";
import { usePlottingStore } from "@/lib/plottingStore";
import { useRouteQuery } from "@/features/routes/useRouteQueries";

export function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const section = getSectionByPath(pathname);

  // Breadcrumb: the plotting page reflects the route being edited.
  const routeId = usePlottingStore((s) => s.routeId);
  const routeQuery = useRouteQuery(routeId);
  const title =
    section?.id === "routes"
      ? routeId !== null
        ? `Route › ${routeQuery.data?.name ?? "…"}`
        : "Route"
      : (section?.label ?? "Komyuter");

  const handleSignOut = () => {
    signOut();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };

  return (
    <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-4 lg:px-6">
      <h1
        className="text-foreground text-base font-semibold tracking-tight"
        aria-live="polite"
      >
        {title}
      </h1>
      <div className="flex items-center gap-2">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                  )}
                  aria-label="Account menu"
                >
                  <Avatar>
                    <AvatarFallback>
                      {getInitials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              )}
            />
            <DropdownMenuContent align="end" className="w-64 p-1">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2">
                  <Avatar>
                    <AvatarFallback>
                      {getInitials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-foreground truncate text-sm font-medium">
                      {getDisplayName(user.name, user.email)}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {user.email}
                    </span>
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
