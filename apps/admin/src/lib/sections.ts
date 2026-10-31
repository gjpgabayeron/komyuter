import type { Permission } from "@komyuter/shared";
import {
  Banknote,
  Download,
  LayoutGrid,
  Route,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type SectionId = "overview" | "routes" | "fares" | "export" | "accounts";

export interface Section {
  id: SectionId;
  label: string;
  path: string;
  icon: LucideIcon;
  /**
   * The Permission this entry needs, declared on the entry rather than
   * re-derived by the page. Absent means every Account may open it.
   */
  permission?: Permission;
}

export const sections: Section[] = [
  { id: "overview", label: "Overview", path: "/", icon: LayoutGrid },
  { id: "routes", label: "Routes", path: "/routes", icon: Route },
  { id: "fares", label: "Fares", path: "/fares", icon: Banknote },
  { id: "export", label: "Export", path: "/export", icon: Download },
  {
    id: "accounts",
    label: "Accounts",
    path: "/accounts",
    icon: ShieldCheck,
    permission: "ADMIN_MANAGE",
  },
];

export function getSectionByPath(pathname: string): Section | undefined {
  return sections.find(
    (section) =>
      pathname === section.path || pathname.startsWith(`${section.path}/`),
  );
}

/**
 * May this Account see this entry? A direct Permission check on the effective
 * set the server resolved (`GET /api/admin/me`) — the SPA is an affordance, not
 * the boundary, and every hidden entry has a server refusal behind it.
 */
export function canSeeSection(
  section: Section,
  permissions: readonly Permission[],
): boolean {
  if (section.permission === undefined) {
    return true;
  }
  return permissions.includes(section.permission);
}

/** The navigation entries to render for an Account's effective set. */
export function visibleSections(permissions: readonly Permission[]): Section[] {
  return sections.filter((section) => canSeeSection(section, permissions));
}
