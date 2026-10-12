/**
 * Response security headers — the ones only a real response can carry.
 *
 * This is deliberately the *second* layer of the SPA's CSP, not a replacement for
 * it. `apps/admin/vite.config.ts` injects a `<meta http-equiv="Content-Security-Policy">`
 * into the built `index.html`, and that is the right home for the directives that
 * depend on what the frontend talks to (`connect-src` names the tile CDN, and
 * whatever a future geocoding proxy adds). A meta tag cannot express
 * `frame-ancestors`, which is header-only — so this module supplies that directive
 * and the other headers a `<meta>` has no equivalent for, and the browser enforces
 * the intersection of the two policies, most-restrictive wins.
 *
 * Pure and parameterised so the values are unit-testable without booting an app:
 * `apps/server/src/api/app.ts` registers the `onSend` hook that applies them.
 */

/** Headers applied to every response, in production and locally alike. */
const BASE_HEADERS: Readonly<Record<string, string>> = {
  // The SPA's HTML and the API's JSON share one origin (ADR-0018 §1), so a browser
  // must never be allowed to sniff one as the other.
  "x-content-type-options": "nosniff",
  // Clickjacking. Header-only, and the whole reason this layer exists.
  "content-security-policy": "frame-ancestors 'none'",
  // Same intent for agents that predate `frame-ancestors`. Redundant on modern
  // browsers by design, not by accident.
  "x-frame-options": "DENY",
  // The admin SPA is not a link worth leaking a path or a query through, and its
  // routes carry record ids.
  "referrer-policy": "no-referrer",
};

/**
 * The header set for one response.
 *
 * `production` gates HSTS only. It is deliberately not sent locally: the dev stack
 * is plain HTTP (S2), and an HSTS header there would make a browser refuse the
 * `http://127.0.0.1:3000` origin it just learned to trust. In production TLS
 * terminates at the platform's edge and the site is HTTPS-only, so the header
 * states a fact rather than a hope — with no `includeSubDomains` and no `preload`,
 * so it cannot outlive this host or be baked into a browser's shipped list.
 */
export function securityHeaders(
  production: boolean,
): Readonly<Record<string, string>> {
  if (!production) {
    return BASE_HEADERS;
  }
  return {
    ...BASE_HEADERS,
    "strict-transport-security": "max-age=31536000",
  };
}
