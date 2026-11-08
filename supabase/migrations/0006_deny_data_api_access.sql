-- Migration 0006: close the Data API path onto the application tables.
--
-- Why (docs/SECURITY.md 2.7): every table this chain creates lands in the exposed
-- "public" schema, which PostgREST serves to the `anon` and `authenticated` roles.
-- Those roles hold grants on the application tables and row level security is off,
-- so anyone holding the publishable (anon) key can read the whole dataset through
-- the Data API. Confirmed against the staging project, not inferred: GET
-- /rest/v1/admin_users with the anon key returns 200, alongside Supabase's advisor
-- reporting rls_disabled_in_public as an ERROR on all nine public tables.
--
-- Nothing in this application uses the Data API. apps/server reaches Postgres
-- directly as `postgres` over DATABASE_URL, and the admin SPA talks to apps/server
-- rather than to PostgREST. So the exposed roles are revoked wholesale, and RLS is
-- enabled with no policies, which denies by default. `service_role` is deliberately
-- left alone: it is a server-side secret that no client ships, and revoking it would
-- trade a real exposure for an invented one.
--
-- Two properties this migration depends on, both measured rather than assumed
-- (select rolname, rolsuper, rolbypassrls from pg_roles):
--
--   1. `postgres` has `rolbypassrls = true`. The running service therefore bypasses
--      row level security outright, and 8 of the 9 public tables are owned by
--      `postgres` as well, because this same role runs the DDL.
--   2. RLS is enabled WITHOUT `force`. `force` would apply the policies to a table's
--      owner, and that only matters for an owner lacking `bypassrls` -- which is not
--      `postgres` here -- so this is noted for completeness rather than because the
--      running service depends on it.
--
-- If the commuter app ever needs Data API access, that is a deliberate change: add
-- the narrow GRANT and the RLS policies for it, rather than loosening this.

-- 1. Future tables must not re-inherit the exposure through project defaults.
alter default privileges in schema public revoke all on tables from anon, authenticated;
--> statement-breakpoint
alter default privileges in schema public revoke all on sequences from anon, authenticated;
--> statement-breakpoint
-- 2. Revoke what the existing tables already granted.
revoke all on all tables in schema public from anon, authenticated;
--> statement-breakpoint
revoke all on all sequences in schema public from anon, authenticated;
--> statement-breakpoint
-- 3. Deny by default, so a future GRANT alone cannot re-open the data.
alter table "public"."admin_users" enable row level security;
--> statement-breakpoint
alter table "public"."routes" enable row level security;
--> statement-breakpoint
alter table "public"."directions" enable row level security;
--> statement-breakpoint
alter table "public"."stops" enable row level security;
--> statement-breakpoint
alter table "public"."detours" enable row level security;
--> statement-breakpoint
alter table "public"."detour_stops" enable row level security;
--> statement-breakpoint
alter table "public"."restrictions" enable row level security;
--> statement-breakpoint
alter table "public"."fare_configs" enable row level security;
--> statement-breakpoint
-- Deliberately NOT attempted: `public.spatial_ref_sys`, the other table in the
-- exposed schema. It belongs to PostGIS and is owned by `supabase_admin`, so
-- `postgres` cannot enable RLS on it -- measured, not assumed: SQLSTATE 42501,
-- "must be owner of table spatial_ref_sys". It holds no project data (it is the
-- EPSG lookup), but PostGIS grants SELECT on it to PUBLIC, so it stays readable
-- through the Data API by anyone holding the publishable key -- confirmed against
-- staging, where GET /rest/v1/spatial_ref_sys returns 200 with real rows. The REVOKE
-- above cannot change that: `postgres` is not its owner, and a schema-wide REVOKE
-- skips objects it has no grant option on. That is the one row Supabase's advisor
-- keeps flagging, and clearing it means moving the extension out of `public`.
select 1;
