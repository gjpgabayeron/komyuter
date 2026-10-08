# ADR-0019: Authorization model — Roles as data, Super Admin as ownership (DECIDED)

- **Status**: DECIDED — the direction is agreed and recorded; implementation spans milestones **M2a**
  and **M2b**
- **Date**: 2026-10-08
- **Supersedes/refines**: refines **ADR-0006** (Supabase Auth — admin-gated CRUD) by replacing binary
  admin membership with Roles and Permissions. Supersedes the glossary's definition of **Administrator**
  as "the sole human actor" — it is no longer a term for a person. It also **supersedes the RBAC
  direction recorded in `docs/SECURITY.md` §6.2** (2026-08): this ADR keeps that section's substance and
  corrects four of its points, and §6.2 now carries the delta table and stands as the historical record.

## Context

Authorization today is binary. `admin_users` is a single-column table (`user_id uuid`, primary key),
given a foreign key to `auth.users.id` by `supabase/migrations/0002_admin_users_auth_fk.sql`, and
`isAdminUserId` in `apps/server/src/api/auth.ts` is documented as "_the_ single authorization rule
(FR-011 / US4)… no duplicate inline lookups". The guard validates the bearer token with Supabase, then
asks one question: is this user present in `admin_users`?

Two consequences shape this decision.

**Membership is all-or-nothing.** Every authenticated Account can do everything — including hard-deleting
a Route, which cascades to its directions and stops, and editing fare configuration. Nothing records who
did it either, so a dataset plotted by several people has no provenance.

**The project needs more than one kind of actor.** The milestone plan calls for a single owner, a few
people plotting routes to grow the seed dataset, and a read-only audience for review — and the
authorization rule has to stay in one place, not be duplicated between the server and the UI.

Constraints that bound the design:

- **Single region, one tenant** (ADR-0010). There is no resource scoping to express — no per-route or
  per-direction permissions are meaningful when one team owns one dataset.
- **Shared, never reimplemented.** Permission logic must exist once, and the UI must consume the server's
  answer rather than compute its own.
- The admin SPA is not a trust boundary; anything the UI hides must also be refused server-side.

## Decision

1. **Authorization is Roles and Permissions, enforced server-side.** A **Role** is a named, ordered set
   of **Permissions**; an Account holds exactly one Role.
2. **Permission constants are declared once in `@komyuter/shared`.** Each is written as an explicit
   `1 << n` (never positional, so inserting a Permission cannot renumber its neighbours), and that list
   is the source of truth; the capability module and the stored encoding are **derived** from it. The
   initial set is **inherited from `docs/SECURITY.md` §6.2 rather than invented here**: `ROUTES_EDIT`,
   `FARES_EDIT`, `EXPORT_DATASET`, `MAPBOX_GEOSERVICES` and `ADMIN_MANAGE`. §6.2's `ADMINISTRATOR`
   "bypass everything" bit is dropped — unrestricted _data_ access is expressed by holding every
   Permission (the seeded Administrator Role), and the powers that cannot be delegated are expressed by
   Super Admin ownership (point 5) instead of by a bit any Administrator could grant.
3. **A Role's Permissions are stored as one integer, typed `bigint`.** Not `integer`: per-resource CRUD
   across the domain — routes, directions, stops, detours, detour stops, restrictions, fare configs,
   Accounts, Roles, dataset export, dataset import, security events — reaches 48 bits before any system
   permission, and Postgres `integer` is 32-bit signed. In JavaScript the arithmetic uses `BigInt`,
   because `<<` on a `number` is 32-bit and wraps silently. (`docs/SECURITY.md` §6.2 had already
   anticipated this encoding as `1n << n`; the width argument above is what fixes it.)
4. **A Role is data, not code.** The Super Admin creates, renames, reorders and deletes Roles from the
   dashboard; no Role is hard-coded.
5. **Super Admin is an immutable ownership property, not a Role.** Exactly one Account is the owner. It
   cannot be demoted, deactivated, deleted or edited by anyone — including itself — and it is the only
   Account that may create, edit, reorder or delete Roles. This makes the lockout invariant structural
   rather than a rule someone must remember to check, and it answers "who may create Roles?" without
   recursion.
6. **The hierarchy rule is grant-subset.** An Account may only create or edit a Role whose Permissions
   are a **subset of its own**, and may not modify or assign any Role at or above its own position.
   Position is presentation order; the subset rule is what closes privilege escalation.
7. **Enforcement lives at the existing single seam.** `isAdminUserId` grows into the capability check in
   the same place, and `GET /api/admin/me` returns the Account's effective Permission set, which the
   admin UI consumes to hide and disable controls. The UI's use of that set is an affordance, never the
   authorization boundary.
8. **Provisioning is invite-only.** Accounts are created by the owner (email plus a temporary password,
   through the service-role key). There is no self-signup and no approval queue.
9. **A read-only Account gets an honest surface.** Because a Role may lack write Permissions, the
   workspace degrades fully: map, selection and pan keep working, while every mutating affordance is
   absent rather than failing on save.

## Alternatives considered

- **Fixed Roles in code** (an enum of Administrator / Plotter / Viewer). The least work, and rejected
  because the milestone asks for Roles the Super Admin composes — the point is that adding a Role is
  data entry, not a release.
- **Per-Account capability grants, with no Role rows.** Maximum flexibility, rejected: it multiplies UI
  surface and error surface at this population size, and it makes "what may a Plotter do?" unanswerable
  as a single artefact.
- **The literal Discord model in full** — multiple Roles per Account, per-resource overwrites, and a
  positional hierarchy. Considered seriously and largely rejected. Per-resource overwrites exist because
  a guild has thousands of channels with different rules; this project is single-tenant (ADR-0010), so
  there is no resource to overwrite. Multiple Roles per Account is redundant when the intended Roles
  nest, and costs a join table plus union resolution. What was **kept** is the useful half: Permissions
  as the unit, and grant-subset as the escalation guard.
- **Bitfields on Accounts instead of Roles.** Rejected: a handful of Role rows is fine to decode in
  application code, but per-Account bitfields would turn "who can delete routes?" into a bitwise AND
  that cannot use an index and cannot be read in a query result.
- **Client-side gating only.** Rejected outright — the SPA is not a trust boundary.

## Consequences

- **Positive**: one place to ask "may this Account do this?"; one artefact that answers "what may this
  Role do?"; the owner-lockout invariant becomes structural; a read-only audience becomes possible
  without a second application; and attribution gives the seed dataset provenance.
- **Trade-off**: a Roles table, a Permission module and a role-management surface must exist before a
  single groupmate can plot. That work is M2a and M2b, and it is deliberately sequenced before the
  route-modeling milestone — the dataset grows through other people, so it needs them first.
- **Risk**: **the integer width is a real ceiling.** If per-resource CRUD is granted as Permissions, the
  usable `bigint` range is nearer than it looks. Grow the Permission list deliberately, and treat the
  encoding as a data format with a compatibility story.
- **Risk**: `BigInt` is not JSON-serialisable. The API must carry Permissions across the wire as an array
  of names (or a decimal string) rather than as a raw number. Settle this in M2a rather than discovering
  it at the first `JSON.stringify`.
- **Risk**: skipping the grant-subset rule lets an Account mint a Role carrying a Permission it does not
  hold and widen its own access. The rule is the security property, not the ordering.

## Non-goals (explicit)

- No per-resource, per-route or per-direction permissions (ADR-0010, single tenant).
- No multiple Roles per Account.
- No approval or publish workflow, and no four-eyes gate on writes.
- No change to how Supabase Auth issues or validates tokens (ADR-0006); this ADR governs only what an
  authenticated Account may do.
- No OAuth, SSO, or commuter-side identity — the commuter app stays anonymous with optional sign-in
  (ADR-0006).
