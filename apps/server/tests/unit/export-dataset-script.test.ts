import { describe, expect, it } from "vitest";
import { parseExportArgs } from "../../src/scripts/export-dataset";

describe("parseExportArgs", () => {
  it("reads an --out path", () => {
    expect(parseExportArgs(["--out", "staging.json"])).toEqual({
      out: "staging.json",
    });
  });

  it("reads an --out=path form", () => {
    expect(parseExportArgs(["--out=staging.json"])).toEqual({
      out: "staging.json",
    });
  });

  it("ignores the -- separator pnpm forwards", () => {
    expect(parseExportArgs(["--", "--out", "staging.json"])).toEqual({
      out: "staging.json",
    });
  });

  it("refuses a missing --out", () => {
    expect(() => parseExportArgs([])).toThrow(/--out/);
    expect(() => parseExportArgs(["--out", "  "])).toThrow(/--out/);
  });

  it("refuses an unknown argument", () => {
    expect(() => parseExportArgs(["--file", "x.json"])).toThrow(/Unknown/);
  });
});
