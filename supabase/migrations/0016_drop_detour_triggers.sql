-- Migration 0016: Remove the detour trigger feature.
--
-- Detour activation is a request-time navigation concern, not an admin
-- preview; the trigger columns and their API/UI are removed end to end.

ALTER TABLE "detours" DROP COLUMN "active_timeframes";
--> statement-breakpoint
ALTER TABLE "detours" DROP COLUMN "condition";
