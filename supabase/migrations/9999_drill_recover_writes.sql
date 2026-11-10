-- M4 rollback Drill 2 (staging only) — the compensating migration.
--
-- This is Path B's move: `9998_drill_break_writes.sql` has been applied, so it is
-- never edited — the history table remembers a version, not a file, and editing it
-- would destroy the only faithful record of what ran. The repair is a new forward
-- step that drops the constraint the harmful migration added.
--
-- `supabase migration repair` is not a rollback and is not used for this: it rewrites
-- history rows and touches no schema. See `docs/ROLLBACK.md` §Path B and §Drill 2.
ALTER TABLE routes DROP CONSTRAINT m4_drill_no_insert;
