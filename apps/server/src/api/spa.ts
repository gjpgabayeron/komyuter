import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppInstance } from "./app";
import { notFound } from "./errors";

/**
 * ADR-0018 §1 — the deployment topology is one service on one origin: this
 * Fastify API also serves the built admin SPA. Two properties follow, and both
 * are why this lives at the app level rather than in a route module:
 *
 *   1. a history fallback, so a client-side route deep-links (`/routes/42`)
 *      instead of 404-ing on refresh, and
 *   2. that fallback must EXCLUDE `/api/*`, otherwise the SPA's `NotFound`
 *      route and the API's own 404s compete for the same handler — and an
 *      unknown API path would answer with HTML.
 */

/** Every path under this prefix belongs to the API and is never rewritten. */
const API_PREFIX = "/api";

/** The SPA's build output, relative to the workspace root. */
const ADMIN_DIST_PATH = join("apps", "admin", "dist");

/** Identifies the workspace root when walking up from this module. */
const WORKSPACE_MARKER = "pnpm-workspace.yaml";

/**
 * Locate the built admin SPA, or null when it has not been built.
 *
 * `ADMIN_DIST_DIR` wins when set: the production image ships build artifacts
 * only, so it has no workspace to walk up through and states the path
 * explicitly. Otherwise the workspace's `apps/admin/dist` is found by walking
 * up from this module, which resolves the same directory from `src/api/`
 * (tsx, dev) and from `dist/` (the esbuild bundle) without hard-coding either
 * depth — a fixed `../..` would silently break in the bundled build.
 *
 * Null is a supported outcome, not an error: a dev or test environment with no
 * admin build must still start and still serve `/api/*`.
 */
export function resolveAdminDistDir(
  configured?: string,
  startDir: string = dirname(fileURLToPath(import.meta.url)),
): string | null {
  if (configured) {
    const configuredDir = resolve(configured);
    return existsSync(configuredDir) ? configuredDir : null;
  }

  let current = startDir;
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) {
      const distDir = join(current, ADMIN_DIST_PATH);
      return existsSync(distDir) ? distDir : null;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Serve the built admin SPA and install the app-wide 404.
 *
 * The not-found handler is installed unconditionally, even when the SPA is
 * absent, so `/api/*` 404 semantics are identical in every environment rather
 * than depending on whether someone happened to run an admin build.
 */
export function registerSpa(app: AppInstance, distDir: string | null): void {
  if (distDir) {
    // Serves index.html at `/`, every hashed asset, and hands a miss to the
    // not-found handler below (fastify-static calls reply.callNotFound()).
    app.register(fastifyStatic, { root: distDir });
  }

  app.setNotFoundHandler((request, reply) => {
    const queryStart = request.url.indexOf("?");
    const path =
      queryStart === -1 ? request.url : request.url.slice(0, queryStart);
    const isApi = path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
    const isNavigation = request.method === "GET" || request.method === "HEAD";

    if (distDir && !isApi && isNavigation) {
      return reply.sendFile("index.html");
    }

    // No envelope is built here — the central error handler owns that shape.
    throw notFound(`Route ${request.method}:${path} not found`);
  });
}
