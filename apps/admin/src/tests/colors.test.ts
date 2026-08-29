import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SEMANTIC_COLORS, semanticColor, DETOUR_COLORS } from "@/lib/colors";

/**
 * Source audit for SC-007 (contracts/ui-colors.md §1): every fixed semantic
 * color is defined in EXACTLY ONE place — `lib/colors.ts` — and consumed via
 * `semanticColor(key)` / the token re-exports. Any raw hex (`#1B6DB2`,
 * `#0F172A`) or hardcoded `amber-*` class string anywhere else in
 * `apps/admin/src` fails this suite. This test was written FIRST (T028) — it
 * fails while T029…T036 duplications exist and goes green as they land.
 */
describe("colors source audit (SC-007, FR-012)", () => {
  /** Registry values are real hex so the audit guards the exact literals. */
  it("registry defines the sanctioned tokens exactly once", () => {
    expect(SEMANTIC_COLORS.activeRoute).toBe("#1B6DB2");
    expect(SEMANTIC_COLORS.nodeInk).toBe("#0F172A");
    expect(SEMANTIC_COLORS.attentionAmber).toBe("#D97706");
    expect(DETOUR_COLORS.length).toBe(4);
    expect(semanticColor("activeRoute")).toBe("#1B6DB2");
    expect(semanticColor("attentionAmber")).toBe("#D97706");
  });

  it("no raw hex or amber class string exists outside lib/colors.ts", () => {
    const root = join(process.cwd(), "src");
    const files = collectSourceFiles(root);
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(root, file).split("\\").join("/");
      if (rel === "lib/colors.ts") continue;
      // index.css declares the @theme-backed utilities FROM the registry
      // (contract ui-colors Rule 2) — sanctioned, never re-encoded classnames.
      if (rel === "index.css") continue;
      // The audit itself lists the tokens in this file — skip self.
      if (rel === "tests/colors.test.ts") continue;
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        const isComment = trimmed.startsWith("//") || trimmed.startsWith("*");
        if (isComment) return;
        // A line that names the sanctioned source or helper is fine.
        if (
          line.includes("semanticColor") ||
          line.includes("SEMANTIC_COLORS") ||
          line.includes("lib/colors")
        )
          return;

        const hit = EXAMINED_TOKENS.find((token) => line.includes(token));
        if (hit) {
          offenders.push(
            `${rel}:${index + 1}: ${hit} → ${trimmed.slice(0, 72)}`,
          );
        }
      });
    }

    expect(offenders.sort()).toEqual([]);
  });
});

/** Every token a surface may re-encode instead of importing. */
const EXAMINED_TOKENS = [
  "#1B6DB2", // active route / brand (FR-012)
  "#0F172A", // node ink / split-merge markers
  "#D97706", // attention amber (road-follow warning)
  // Amber utility classes — any of these re-encodes the attention color.
  "amber-50",
  "amber-500",
  "amber-600",
  "amber-700",
  "amber-900",
];

/** Non-test source files under apps/admin/src (skips the tests dir itself). */
function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  const scan = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
          continue;
        scan(full);
      } else if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      ) {
        out.push(full);
      }
    }
  };
  scan(root);
  return out;
}
