import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAdminDistDir } from "../../src/api/spa";

/** Placement of the built SPA inside a workspace, used to build fakes. */
const ADMIN_DIST = join("apps", "admin", "dist");

describe("resolveAdminDistDir", () => {
  const created: string[] = [];

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    created.push(dir);
    return dir;
  }

  /** A fake workspace root: the marker file plus (optionally) a built SPA. */
  function fakeWorkspace(withDist: boolean): string {
    const root = tempDir("komyuter-ws-");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    if (withDist) {
      const distDir = join(root, ADMIN_DIST);
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, "index.html"), "<!doctype html>");
    }
    return root;
  }

  afterEach(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses ADMIN_DIST_DIR when it exists", () => {
    const distDir = tempDir("komyuter-dist-");
    expect(resolveAdminDistDir(distDir, distDir)).toBe(distDir);
  });

  it("returns null rather than a broken root when ADMIN_DIST_DIR is missing", () => {
    const missing = join(tempDir("komyuter-absent-"), "not-built");
    expect(resolveAdminDistDir(missing, missing)).toBeNull();
  });

  it("finds apps/admin/dist by walking up to the workspace root", () => {
    const root = fakeWorkspace(true);
    // Two different depths stand in for `src/api/` (tsx) and `dist/` (bundle):
    // the walk-up resolves both to the same directory.
    expect(
      resolveAdminDistDir(
        undefined,
        join(root, "apps", "server", "src", "api"),
      ),
    ).toBe(join(root, ADMIN_DIST));
    expect(
      resolveAdminDistDir(undefined, join(root, "apps", "server", "dist")),
    ).toBe(join(root, ADMIN_DIST));
  });

  it("returns null when the workspace exists but the SPA is unbuilt", () => {
    const root = fakeWorkspace(false);
    expect(
      resolveAdminDistDir(
        undefined,
        join(root, "apps", "server", "src", "api"),
      ),
    ).toBeNull();
  });

  it("returns null when no workspace root is found", () => {
    const orphan = tempDir("komyuter-orphan-");
    expect(resolveAdminDistDir(undefined, orphan)).toBeNull();
  });
});
