-- Migration 0010: Attribution — `created_by` / `updated_by` on the plotted path.
--
-- Decision: docs/adr/0025-attribution-as-account-references.md, refining
-- docs/adr/0019-authorization-model.md (M2b). Glossary: CONTEXT.md's
-- **Attribution**.
--
-- Routes, Directions and Stops record the Account that created them and the
-- Account that last wrote them. Both are Account references with
-- `ON DELETE SET NULL`: Accounts are deactivated rather than deleted
-- (ADR-0019 §1), so the reference is durable in practice, and a hard-deleted
-- identity degrades the attribution to a name-less id rather than orphaning the
-- row.
--
-- Nothing is backfilled. The database never observed those writes, so writing
-- the owner onto them would turn the field into a guess; a null row reads as
-- "Not recorded" and the attribution field stays a fact from M2b onward. The
-- actor is stamped by the server from the resolved guard identity, never from
-- request input (ADR-0025 §3).

ALTER TABLE "routes" ADD COLUMN "created_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "updated_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "directions" ADD COLUMN "created_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "directions" ADD COLUMN "updated_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "created_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "updated_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
