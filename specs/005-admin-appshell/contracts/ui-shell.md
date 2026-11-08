# UI Shell Contract: Admin Application Shell

Contract for the external surfaces this feature touches: the browser env, the route table, and the auth session. Implementation details live in `tasks.md`; this is the behavior both the implementation and the `quickstart.md` validators hold it to.

## 1. Environment contract (`apps/admin/.env`, gitignored; `.env.example` documents keys)

| Variable       | Required | Purpose                                                                                   |
| -------------- | -------- | ----------------------------------------------------------------------------------------- |
| `VITE_API_URL` | yes      | Base URL of the Fastify backend; used for auth (login/me) and all future admin API calls. |

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are NOT used by the admin app (auth is backend-proxied; see `auth-api.md`). Behavior: with `VITE_API_URL` reachable, sign-in/sign-out hit the backend. With the backend unreachable, the shell still renders; sign-in fails with an honest error toast (SC-010).

## 2. Route table

| Path               | Auth    | Renders                              |
| ------------------ | ------- | ------------------------------------ |
| `/login`           | public  | Login page                           |
| `/`                | guarded | Shell > Overview                     |
| `/routes`          | guarded | Shell > RouteWorkspace (placeholder) |
| `/routes/:routeId` | guarded | Shell > RouteWorkspace (placeholder) |
| `/fares`           | guarded | Shell > Fares                        |
| `/export`          | guarded | Shell > Export                       |
| `*`                | guarded | Shell > NotFound                     |

Guarded = redirect to `/login` with `state.returnTo` when unauthenticated; after sign-in, navigate to `returnTo` (FR-008).

## 3. Auth session contract

- Provider exposes `{ status, user, signIn(email, password), signOut() }`; it calls the backend API (`contracts/auth-api.md`), never the identity service directly.
- `signIn` resolves with the admin identity on success, rejects with a non-technical, displayable message on failure (FR-002). A 403 (signed in but not an admin) is shown as such.
- `signOut` clears the local token even if the remote call fails, and reports failure honestly (spec Edge Case).
- Session restore on load: a stored token is validated via the backend `/me` endpoint; stale/expired tokens transition to `unauthenticated` and redirect to `/login` (spec Edge Case).
- Shell never fabricates a session and never holds identity-service keys (ADR-0006).

## 4. Shell behavior contract

- **Nav rail**: exactly the four sections in `lib/sections.ts` order (Overview, Routes, Fares, Export); collapsible; active section indicated by more than color (FR-006); keyboard operable (FR-013).
- **Header**: shows the active section's title and a user menu with sign-out (FR-005).
- **Connection banner**: driven by browser `online`/`offline` events only; visible while offline, clears on reconnection, does not unmount the view (FR-011).
- **Toasts**: non-blocking success/error toasts for sign-in and sign-out (FR-015).
- **Design**: Route Sign grammar — pure white ground, signboard green-blue primary + signal amber attention, ≤4px corners on plates, pills on controls, no shadows, no state by color alone (FR-014; WCAG AA per SC-008).
- **Placeholder pages**: each of the four sections renders a designed empty/placeholder state using the shared EmptyState component; swappable without touching the shell (FR-012).
