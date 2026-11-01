import type { Permission } from "@komyuter/shared";
import {
  Banknote,
  Download,
  LayoutGrid,
  Route,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { holdsPermission, type Capabilities } from "@/lib/capabilities";

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
  // Fares stays visible to every Account: without `FARES_EDIT` the page
  // degrades to a read-only table rather than disappearing (ADR-0019 §9 M2b).
  { id: "fares", label: "Fares", path: "/fares", icon: Banknote },
  {
    id: "export",
    label: "Export",
    path: "/export",
    icon: Download,
    permission: "EXPORT_DATASET",
  },
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
 * May this Account see this entry? The declared Permission is answered by the
 * capability module (`lib/capabilities.ts`), so the rail, the section guard and
 * anything else asking the question share one rule — and no surface re-derives
 * it by reading `user.permissions`. The SPA is an affordance, not the boundary:
 * every hidden entry has a server refusal behind it.
 */
export function canSeeSection(
  section: Section,
  capabilities: Capabilities,
): boolean {
  if (section.permission === undefined) {
    return true;
  }
  return holdsPermission(capabilities, section.permission);
}

/** The navigation entries to render for an Account's capability set. */
export function visibleSections(capabilities: Capabilities): Section[] {
  return sections.filter((section) => canSeeSection(section, capabilities));
}
