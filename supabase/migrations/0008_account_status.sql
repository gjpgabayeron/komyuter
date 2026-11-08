-- Migration 0008: the Account lifecycle flag (`is_active`).
--
-- Decision: docs/adr/0019-authorization-model.md (2026-10-31 M2b amendment §1
-- and §6), plus CONTEXT.md's **Deactivated Account**.
--
-- Accounts are deactivated, never deleted: the identity and the Role are kept,
-- and reactivation restores the same Role. The flag is the whole lifecycle —
-- every existing Account keeps the access it has, so the column defaults to
-- true and no row is backfilled.
--
-- The guard reads this column on every request and refuses an inactive Account
-- with `403 ACCOUNT_DEACTIVATED`; sign-in refuses it with the same unified
-- denial as a wrong password. No Supabase identity ban is used: a JWT cannot be
-- un-issued, and a second notion of "active" would drift from this one.

ALTER TABLE "admin_users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- The last-owner lockout guard is structural, not a count (ADR-0019 §6): the
-- owner cannot be deactivated by any caller, including itself, so no sequence
-- of Account edits can leave the dataset without an owner. This extends the
-- existing demotion / identity / Role protection rather than adding a second
-- invariant.
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
		IF NEW."is_active" IS DISTINCT FROM true THEN
			RAISE EXCEPTION 'The Super Admin cannot be deactivated';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;
