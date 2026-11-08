-- Migration 0013: stable stop ids.
--
-- Decision: docs/adr/0031-stop-identity-across-saves.md, implementing the
-- stop-identity requirement of ADR-0020's merge and of ADR-0027 §9 /
-- ADR-0028 §10.
--
-- The plotted save used to delete every stop of a Direction and re-insert it
-- under fresh ids. That made a stop id meaningless across a save: a Draft
-- could not be merged on ids, every save reassigned `created_by`, and every
-- publish diff would read as "all stops deleted and recreated".
--
-- `derived_from_stop_id` links a return Direction's stop to the base stop it
-- mirrors, so the next save updates that row instead of replacing it. It is
-- deliberately not a foreign key: the base stop may be deleted in the same
-- transaction that rewrites the return, and the link is a correlation, not a
-- referential guarantee. `NULL` on a base stop, and on return rows written
-- before this migration (they acquire a link on their next save).

ALTER TABLE "stops" ADD COLUMN "derived_from_stop_id" text;
