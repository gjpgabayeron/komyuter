-- Migration 0007: Roles, Permissions and the Super Admin ownership property.
--
-- Decision: docs/adr/0019-authorization-model.md (amended 2026-10-30 for M2a).
-- Until this migration, `admin_users` membership was the whole authorization
-- rule. This introduces three things and keeps every existing Account working:
--
--   1. `roles` — a named, ordered set of Permissions, stored as one bigint
--      bitmask derived from `@komyuter/shared` (1 << n, never positional).
--   2. `admin_users.role_id` — every Account holds exactly one Role. Existing
--      rows are backfilled to the seeded Administrator Role.
--   3. `admin_users.is_super_admin` — the ownership property, not a Role. A
--      partial unique index makes "exactly one owner" a schema fact; the
--      trigger stops any later update or delete from demoting or removing it.
--
-- Bit values are a wire format: they must match `PERMISSIONS` in
-- `packages/shared/src/authorization.ts` and never be renumbered.
--   ROUTES_EDIT        = 1   (bit 0)
--   FARES_EDIT         = 2   (bit 1)
--   EXPORT_DATASET     = 4   (bit 2)
--   MAPBOX_GEOSERVICES = 8   (bit 3)
--   ADMIN_MANAGE       = 16  (bit 4)

CREATE TABLE "roles" (
	"role_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"permissions" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_unique" ON "roles" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX "roles_position_unique" ON "roles" USING btree ("position");
--> statement-breakpoint
-- Seeded Roles are defaults, not fixed vocabulary (CONTEXT.md, Administrator).
-- Positions leave gaps so later Roles can be inserted without renumbering:
-- Administrator holds every Permission, Plotter the plotting set, Viewer none.
INSERT INTO "roles" ("role_id", "name", "position", "permissions") VALUES
	('administrator', 'Administrator', 100, 31),
	('plotter', 'Plotter', 50, 11),
	('viewer', 'Viewer', 10, 0)
ON CONFLICT ("role_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "role_id" text;
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Existing Accounts keep exactly the access they had: every Permission.
UPDATE "admin_users" SET "role_id" = 'administrator' WHERE "role_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "role_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_users"
	ADD CONSTRAINT "admin_users_role_id_roles_role_id_fk"
	FOREIGN KEY ("role_id") REFERENCES "public"."roles"("role_id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_users_role_id_idx" ON "admin_users" USING btree ("role_id");
--> statement-breakpoint
-- At most one owner. The partial predicate is what turns "is_super_admin" from
-- a per-row flag into an ownership property.
CREATE UNIQUE INDEX "admin_users_single_super_admin"
	ON "admin_users" USING btree ("is_super_admin")
	WHERE "is_super_admin";
--> statement-breakpoint
-- Ownership is immutable once set: no demotion, no deletion, no Role change.
-- Promotion (false -> true) stays possible for the one-off promote:owner script;
-- the partial unique index above still refuses a second owner.
CREATE OR REPLACE FUNCTION "protect_super_admin"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		IF OLD."is_super_admin" THEN
			RAISE EXCEPTION 'The Super Admin cannot be deleted';
		END IF;
		RETURN OLD;
	END IF;

	IF OLD."is_super_admin" THEN
		IF NEW."is_super_admin" IS DISTINCT FROM true THEN
			RAISE EXCEPTION 'The Super Admin cannot be demoted';
		END IF;
		IF NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
			RAISE EXCEPTION 'The Super Admin identity is immutable';
		END IF;
		IF NEW."role_id" IS DISTINCT FROM OLD."role_id" THEN
			RAISE EXCEPTION 'The Super Admin Role cannot be changed';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "admin_users_protect_super_admin"
	BEFORE UPDATE OR DELETE ON "admin_users"
	FOR EACH ROW EXECUTE FUNCTION "protect_super_admin"();
--> statement-breakpoint
-- Migration 0006 closed the Data API for the existing tables and revoked the
-- project defaults for future ones. Deny by default on the new table too.
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;