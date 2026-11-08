# Data Model: Admin Application Shell

The shell is client-only — nothing here is persisted server-side. This model describes the in-memory UI state the shell owns and the shape of the authenticated session it consumes from the existing auth service.

## Entities

### Administrator

The person operating the dashboard. In this feature the shell only needs to know _whether_ an Administrator is signed in; profile details (name, email) are used only for the header's user menu label.

- Key fields (from the auth service session): `email: string | null`, `user_id: string | null`.
- Not modeled further: roles, permissions, profile data. Single admin role (ADR-0006).

### Application Section

A named destination in the dashboard. The section registry is the single source of truth for navigation.

| Field   | Type                                            | Notes                                                             |
| ------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `id`    | `"overview" \| "routes" \| "fares" \| "export"` | Canonical id; drives the header title.                            |
| `label` | string                                          | Display label ("Overview", "Routes", "Fares", "Export").          |
| `path`  | string                                          | Route path. Routes section maps `/routes` and `/routes/:routeId`. |
| `icon`  | lucide icon ref                                 | Nav rail glyph.                                                   |

Validation: ids must be unique; every nav entry must resolve to a real route; the active section is derived from the current location (no stored pointer that can go stale).

### Session (auth state)

The authenticated state that gates access to protected sections. Obtained by posting credentials to the backend login endpoint; the returned access token is stored client-side, sent as a Bearer token to `/api/admin/*`, and validated on app load via the backend `/me` endpoint.

State machine:

```text
unauthenticated --signIn(ok)--> authenticated
unauthenticated --signIn(fail)--> unauthenticated (error surfaced)
authenticated  --signOut()-----> unauthenticated
authenticated  --token expired/invalid (me 401)--> unauthenticated (redirect to /login)
```

- `status`: `"loading" | "unauthenticated" | "authenticating" | "authenticated"`.
- The backend is the sole auth surface (per Clarifications 2026-08-03); the shell never talks to the identity service directly and never fabricates a session.

### NavState (UI store)

- `collapsed: boolean` — nav rail state. In-memory only (zustand); stable across section changes within a session (FR-010).

## Relationships

- Administrator `1──*` Application Section — one signed-in Administrator can visit all sections; there is no per-section permission in this feature.
- Application Section `1──1` Route — each nav entry maps to one guarded route (Routes spans two paths sharing one placeholder page).
- Session gates Application Sections: access requires `authenticated`.

## Lifecycle / transitions

- **Sign-in**: `unauthenticated → authenticating → authenticated` (or back to `unauthenticated` with an error). On success, navigate to the pre-auth deep link (`returnTo`) or `/`.
- **Sign-out**: `authenticated → unauthenticated`; shell navigates to `/login`; protected routes reject access afterwards.
- **Session expiry / invalid token**: observed via the auth service subscription; shell redirects to `/login` without a crash and preserves the attempted location (FR-008, Edge Case).
- **Offline**: independent of auth state; `online`/`offline` events toggle the banner (FR-011). No data transitions.

## Scale assumptions

Single operator (thesis scale): one session, four sections, trivial state. No pagination, caching beyond react-query defaults, or persistence is required by the shell.
