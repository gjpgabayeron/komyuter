import { describe, expect, it } from "vitest";
import {
  CONFLICT_COPY,
  LABELS,
  SAVE_COPY,
  label,
  type LabelKey,
} from "@/lib/labels";

/**
 * Guardrail for SC-004 / FR-005 (contracts/ui-labels.md): every LabelKey the
 * UI uses resolves to a non-empty canonical string, and no two keys map to
 * the same string (kills "Colour"/"Color", "Detours"/"Alternative routes"
 * drift). The three save-copy strings must stay distinct so the save lifecycle
 * is never ambiguous.
 */
describe("labels registry", () => {
  it("resolves every LabelKey to a non-empty canonical string", () => {
    const keys = Object.keys(LABELS) as LabelKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(label(key)).toBe(LABELS[key]);
      expect(label(key).trim().length).toBeGreaterThan(0);
    }
  });

  it("maps no two keys to the same string (SC-004/FR-005)", () => {
    const values = Object.values(LABELS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps the three SAVE_COPY strings distinct", () => {
    expect(Object.values(SAVE_COPY).length).toBe(3);
    expect(new Set(Object.values(SAVE_COPY)).size).toBe(3);
  });

  it("uses the canonical 'Alternative routes' label for the detours key (FR-019)", () => {
    expect(label("detours")).toBe("Alternative routes");
  });

  it("exposes one shared conflict copy (FR-003)", () => {
    expect(CONFLICT_COPY.title.length).toBeGreaterThan(0);
    expect(CONFLICT_COPY.body.length).toBeGreaterThan(0);
    expect(CONFLICT_COPY.loadLatest.length).toBeGreaterThan(0);
    expect(CONFLICT_COPY.keepLocal.length).toBeGreaterThan(0);
  });
});
