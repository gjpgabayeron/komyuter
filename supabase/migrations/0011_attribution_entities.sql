-- Migration 0011: Attribution on the remaining entities.
--
-- Decision: docs/adr/0025-attribution-as-account-references.md, refining
-- docs/adr/0019-authorization-model.md (M2b). Glossary: CONTEXT.md's
-- **Attribution**. Migration 0010 attributed the plotted path (routes,
-- directions, stops); this one completes the set with Detours, Detour Stops,
-- Restrictions and Fare Configurations.
--
-- Each `created_by` / `updated_by` is an Account reference with
-- `ON DELETE SET NULL`: Accounts are deactivated rather than deleted
-- (ADR-0019 §1), so the reference is durable in practice, and a hard-deleted
-- identity degrades the attribution to a name-less id rather than orphaning
-- the row.
--
-- Nothing is backfilled. The database never observed those writes, so writing
-- the owner onto them would turn the field into a guess; a null row reads as
-- "Not recorded" and the attribution field stays a fact from M2b onward. The
-- actor is stamped by the server from the resolved guard identity, never from
-- request input (ADR-0025 §3). The commuter export dataset is unchanged:
-- provenance is admin-internal and never exported (ADR-0025 §6).

ALTER TABLE "detours" ADD COLUMN "created_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "detours" ADD COLUMN "updated_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "detour_stops" ADD COLUMN "created_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "detour_stops" ADD COLUMN "updated_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "restrictions" ADD COLUMN "created_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "restrictions" ADD COLUMN "updated_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "fare_configs" ADD COLUMN "created_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "fare_configs" ADD COLUMN "updated_by" uuid REFERENCES "admin_users"("user_id") ON DELETE SET NULL;
