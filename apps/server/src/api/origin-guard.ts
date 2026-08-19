import type { FastifyRequest } from "fastify";
import { forbidden } from "./errors";

/**
 * Origin allowlist guard (R5 / US4): requests that carry an `Origin` header
 * must match one of the configured `ADMIN_ORIGINS`. Requests WITHOUT an
 * `Origin` (curl, tests, native clients) and OPTIONS preflights pass — the
 * CORS plugin answers preflights before this hook runs, so a foreign-origin
 * preflight never reaches the routes anyway.
 *
 * Registered AFTER `@fastify/cors` in buildApp so preflight handling happens
 * first (T026).
 */
export function createOriginGuard(
  allowlist: string,
): (request: FastifyRequest) => Promise<void> {
  const allowed = new Set(
    allowlist
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  return async function originGuard(request): Promise<void> {
    if (request.method === "OPTIONS") return;
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin)) {
      throw forbidden("Origin not allowed");
    }
  };
}
