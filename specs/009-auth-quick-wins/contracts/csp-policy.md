# Contract — Admin SPA Content-Security-Policy (production build)

**Producer**: Vite build-time plugin in `apps/admin` (`vite.config.ts` +
`transformIndexHtml`, applied **only** when `mode === "production"`).
**Effect**: injects a `<meta http-equiv="Content-Security-Policy">` into the built
`index.html`. Dev mode has **no** CSP (Vite HMR needs inline scripts/styles).

## Policy

```
default-src 'self';
script-src 'self';
style-src 'self';
worker-src 'self' blob:;
img-src 'self' data: blob: https://tiles.openfreemap.org;
font-src 'self' data:;
connect-src 'self' https://tiles.openfreemap.org <API_ORIGIN>;
object-src 'none';
base-uri 'self';
form-action 'self'
```

- `<API_ORIGIN>` = origin parsed from `VITE_API_URL` at build time (the built app
  talks to that origin; if it equals `'self'`-served, the directive is harmless).
- `worker-src 'self' blob:` — MapLibre GL 5.24 spawns Web Workers from `blob:`
  object URLs.
- `connect-src ... https://tiles.openfreemap.org` — style JSON, glyph PBFs
  (`apps/admin/src/lib/tiles.ts:17-19`).
- `img-src ... data: blob: https://tiles.openfreemap.org` — raster tiles and
  sprites.
- `object-src 'none'` + no `'unsafe-inline'` anywhere — blocks the S1 injected-
  script scenario (the built bundle has no inline scripts).

## Known limitations (recorded in `docs/SECURITY.md`)

- `frame-ancestors` cannot be expressed in a `<meta>` CSP (header-only); deferred
  to the future hosting layer that serves the built SPA — the repo has no
  production server for it today (see research R6).
- Dev mode is exempt; the policy is verified on `pnpm --filter admin build` output.
