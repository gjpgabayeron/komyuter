-- Migration 0014: Detour conditional triggers.
--
-- Decision: docs/adr/0012-detour-conditional-triggers.md, implemented by
-- roadmap R2. Glossary: CONTEXT.md's **Active Timeframe** and
-- **Trigger Condition**.
--
-- `active_timeframes` is a JSONB array of recurring weekly windows:
--   { "days": [1,2,3], "start_minute": 1320, "end_minute": 120 }
-- Days are ISO weekdays (1 = Monday … 7 = Sunday). Minutes are local to
-- Asia/Manila. `start_minute > end_minute` wraps midnight.
--
-- `condition` is a nullable JSONB object:
--   { "landmark_stop_id": "stop_...", "radius_meters": 150 }
-- The landmark is a persisted Stop of the same Direction. A null condition
-- means no landmark constraint.
--
-- Both defaults mean "no constraint", so every existing detour keeps
-- activating exactly as it did before this migration.

ALTER TABLE "detours"
  ADD COLUMN "active_timeframes" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "detours" ADD COLUMN "condition" jsonb;
