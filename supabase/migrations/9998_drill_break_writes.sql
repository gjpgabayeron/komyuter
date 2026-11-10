-- M4 rollback Drill 2 (staging only) — break the write path without touching data.
--
-- `NOT VALID` is what makes this harmless and instructive at once: existing rows are
-- never scanned, so nothing is deleted and reads keep working, while every insert and
-- update to `routes` is refused. That is the write path, and only the write path.
--
-- The repair is a NEW compensating migration (`9999_drill_recover_writes.sql`), never
-- an edit of this file: `docs/ROLLBACK.md` §Path B. This file is a drill artifact; it
-- must never reach `main`.
ALTER TABLE routes ADD CONSTRAINT m4_drill_no_insert CHECK (false) NOT VALID;
