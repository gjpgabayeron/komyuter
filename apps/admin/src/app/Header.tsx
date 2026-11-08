import { Link, useLocation, useNavigate } from "react-router-dom";
import { KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandMark } from "@/components/shared/BrandMark";
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
import { CHANGE_PASSWORD_PATH } from "@/features/auth/forcedPasswordChange";
import { getDisplayName, getInitials } from "@/features/auth/session";
import { getSectionByPath } from "@/lib/sections";
import { usePlottingStore } from "@/lib/plottingStore";
import { useRouteQuery } from "@/features/routes/useRouteQueries";
import { getWorkspaceBridge } from "@/lib/workspaceBridge";
import { RouteHeader } from "./RouteHeader";

function HeaderSlash() {
  return (
    <span aria-hidden className="text-muted-foreground/40 shrink-0 select-none">
      /
    </span>
  );
}

export function Header() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const section = getSectionByPath(pathname);

  // Breadcrumb: the plotting page reflects the route being edited or focused.
  const routeId = usePlottingStore((s) => s.routeId);
  const focusedRouteId = usePlottingStore((s) => s.focusedRouteId);
  const displayRouteId = routeId ?? focusedRouteId;
  const routeQuery = useRouteQuery(displayRouteId);
  const title =
    section?.id === "routes"
      ? displayRouteId !== null
        ? `Route › ${routeQuery.data?.name ?? "…"}`
        : "Route"
      : (section?.label ?? "Komyuter");

  const handleSignOut = () => {
    signOut();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };

  const handleChangePassword = () => {
    // The voluntary flow uses the same screen as the forced one, and returns to
    // this page afterwards.
    navigate(CHANGE_PASSWORD_PATH, {
      state: { returnTo: pathname + search },
    });
  };

  return (
    <header className="bg-background flex h-12 shrink-0 items-center justify-between border-b pr-6 pl-4">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to="/"
          aria-label="Komyuter home"
          className="flex shrink-0 items-center"
        >
          <BrandMark markOnly />
        </Link>
        <HeaderSlash />
        {section?.id === "routes" ? (
          <>
            <h1 className="sr-only">{title}</h1>
            <button
              type="button"
              onClick={() => getWorkspaceBridge()?.goOverview()}
              className="text-muted-foreground hover:text-foreground shrink-0 text-sm"
            >
              Routes
            </button>
            <RouteHeader />
          </>
        ) : (
          <h1
            className="text-foreground text-base font-semibold tracking-tight"
            aria-live="polite"
          >
            {title}
          </h1>
        )}
      </div>
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
                {user.mustChangePassword ? null : (
                  <DropdownMenuItem onClick={handleChangePassword}>
                    <KeyRound />
                    Change password
                  </DropdownMenuItem>
                )}
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
