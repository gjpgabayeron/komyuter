import { Outlet, useLocation } from "react-router-dom";
import { useCapabilities } from "@/features/auth/useCapabilities";
import { canSeeSection, getSectionByPath } from "@/lib/sections";
import NotFound from "@/pages/NotFound";

/**
 * The section guard (ticket #48, ADR-0019 §9 M2b amendment): the navigation's
 * rule applied to the URL.
 *
 * An entry declares the Permission it needs; this layout answers it for the
 * path the browser is on, from the same capability module the rail is filtered
 * by. A guarded URL typed directly therefore renders the ordinary not-found
 * surface — indistinguishable from a page that does not exist, which is what a
 * section this Account cannot open is — instead of an empty page or a "403"
 * plate that would confirm the page is there for someone else. No page repeats
 * the check, so no page can drift from the entry.
 *
 * The refusal is an affordance like every other: the server refuses the data
 * behind these sections regardless of what the SPA draws.
 */
export function SectionGuard() {
  const { pathname } = useLocation();
  const capabilities = useCapabilities();
  const section = getSectionByPath(pathname);

  if (section !== undefined && !canSeeSection(section, capabilities)) {
    return <NotFound />;
  }

  return <Outlet />;
}
