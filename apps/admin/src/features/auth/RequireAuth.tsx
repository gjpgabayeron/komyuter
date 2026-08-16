import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/features/auth/auth";
import { BackendUnreachable } from "@/features/auth/BackendUnreachable";

export function RequireAuth() {
  const { status, sessionExpired } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="bg-background flex h-svh items-center justify-center">
        <Loader2 className="text-primary size-6 animate-spin" />
        <span className="sr-only">Loading session</span>
      </div>
    );
  }

  if (status === "unreachable") {
    return <BackendUnreachable />;
  }

  if (status !== "authenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          returnTo: location.pathname + location.search,
          sessionExpired,
        }}
      />
    );
  }

  return <Outlet />;
}
