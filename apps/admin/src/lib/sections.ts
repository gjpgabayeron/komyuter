import {
  Banknote,
  Download,
  LayoutGrid,
  Route,
  type LucideIcon,
} from "lucide-react";

export type SectionId = "overview" | "routes" | "fares" | "export";

export interface Section {
  id: SectionId;
  label: string;
  path: string;
  icon: LucideIcon;
}

export const sections: Section[] = [
  { id: "overview", label: "Overview", path: "/", icon: LayoutGrid },
  { id: "routes", label: "Routes", path: "/routes", icon: Route },
  { id: "fares", label: "Fares", path: "/fares", icon: Banknote },
  { id: "export", label: "Export", path: "/export", icon: Download },
];

export function getSectionByPath(pathname: string): Section | undefined {
  return sections.find(
    (section) =>
      pathname === section.path || pathname.startsWith(`${section.path}/`),
  );
}
