import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { RequireAuth } from "@/features/auth/RequireAuth";
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
        <Route element={<AppShell />}>
          <Route index element={<Overview />} />
          <Route path="/routes" element={<RouteWorkspace />} />
          <Route path="/routes/:routeId" element={<RouteWorkspace />} />
          <Route path="/fares" element={<Fares />} />
          <Route path="/export" element={<Export />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
