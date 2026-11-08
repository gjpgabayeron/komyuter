import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { SectionGuard } from "@/app/SectionGuard";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { CHANGE_PASSWORD_PATH } from "@/features/auth/forcedPasswordChange";
import Accounts from "@/pages/Accounts";
import ChangePassword from "@/pages/ChangePassword";
import Export from "@/pages/Export";
import Fares from "@/pages/Fares";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Overview from "@/pages/Overview";
import RouteWorkspace from "@/pages/RouteWorkspace";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        {/* Authenticated, but outside the AppShell: a flagged Account has no
            navigation, and a voluntary change should not look like a workspace
            page (ADR-0019 §11). */}
        <Route path={CHANGE_PASSWORD_PATH} element={<ChangePassword />} />
        <Route element={<AppShell />}>
          {/* Every page sits behind the section guard: a section this Account
              cannot open renders the not-found surface even when its URL is
              typed directly (ticket #48). */}
          <Route element={<SectionGuard />}>
            <Route index element={<Overview />} />
            <Route path="/routes" element={<RouteWorkspace />} />
            <Route path="/routes/:routeId" element={<RouteWorkspace />} />
            <Route path="/fares" element={<Fares />} />
            <Route path="/export" element={<Export />} />
            <Route path="/accounts" element={<Accounts />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
