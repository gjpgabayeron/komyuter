# Backend Auth API Contract: Admin Application Shell

The admin web app's auth is proxied through the existing `apps/server` (Fastify) backend. This contract defines the public auth surface added to the server and what the client may rely on. Behavior defined in `spec.md` (FR-001, FR-002, FR-009) and `research.md` R4/R12.

## Endpoints

| Method | Path              | Auth         | Request                               | Success response                                                                         | Errors                                                                                                                  |
| ------ | ----------------- | ------------ | ------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login` | public       | `{ email: string, password: string }` | `{ success: true, data: { access_token: string, user: { id: string, email: string } } }` | 401 `UNAUTHORIZED` (wrong credentials); 403 `FORBIDDEN` (signed in but not an admin); 422 `VALIDATION_ERROR` (bad body) |
| GET    | `/api/auth/me`    | Bearer token | —                                     | `{ success: true, data: { id: string, email: string } }`                                 | 401 `UNAUTHORIZED` (missing/invalid/expired token); 403 `FORBIDDEN` (not an admin)                                      |

## Rules

- Both endpoints use the standard envelope `{ success, data | error }` and error codes from `apps/server/src/api/errors.ts`.
- `login` MUST use the existing Supabase client (`deps.supabase`) for `signInWithPassword` and MUST verify `admin_users` membership before returning a token (a non-admin gets 403, not a token). If GoTrue rejects a service-role sign-in, use a dedicated anon-key sign-in client (research R4 caveat).
- `me` MUST validate the Bearer token via `supabase.auth.getUser` and check `admin_users` — the same logic as the existing `createAdminAuthGuard`.
- Both are registered OUTSIDE the `/api/admin` guard (public); the guard on `/api/admin/*` is unchanged and consumes the returned token.
- Sign-out has no server endpoint in this feature: access tokens are stateless JWTs and the client discards the stored token (honest behavior on failure per spec Edge Case).

## Client usage (admin app)

- `VITE_API_URL` is the base URL; `POST /api/auth/login` and `GET /api/auth/me` are called via the axios instance in `apps/admin/src/lib/api.ts`.
- The returned `access_token` is stored client-side and injected as `Authorization: Bearer <token>` on all requests.
