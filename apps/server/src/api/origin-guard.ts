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
/**
 * The admin origin allowlist, parsed once from `ADMIN_ORIGINS`.
 *
 * Shared by this guard and by CORS in `app.ts`, so the two mechanisms cannot
 * disagree about who is welcome: the guard refuses a non-allowlisted `Origin`
 * outright, while CORS decides which origins are offered headers at all. Returning
 * an array rather than a Set keeps this the canonical *parse*; callers that need
 * per-request membership build their own Set.
 *
 * Blank entries are dropped rather than kept as empty strings, which would
 * otherwise match an empty `Origin` header and allow it.
 */
export function parseOrigins(allowlist: string): string[] {
  return allowlist
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function createOriginGuard(
  allowlist: string,
): (request: FastifyRequest) => Promise<void> {
  const allowed = new Set(parseOrigins(allowlist));

  return async function originGuard(request): Promise<void> {
    if (request.method === "OPTIONS") return;
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin)) {
      throw forbidden("Origin not allowed");
    }
  };
}
