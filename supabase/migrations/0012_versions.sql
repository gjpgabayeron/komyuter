-- Migration 0012: Route and Direction versions.
--
-- Decision: docs/adr/0020-concurrent-plotting-safety.md (optimistic
-- concurrency), implemented in M2c. Glossary: CONTEXT.md's **Route Version**
-- and **Direction Version**.
--
-- The column is the stamp a save is based on: the handler compares it with the
-- `base_version` the client read, bumps it in the same UPDATE, and refuses the
-- write when the predecessor no longer matches. Existing rows start at 1 and
-- nothing is backfilled — a version is not a history, and no earlier write was
-- observed.
--
-- A Direction and its Route are stamped separately because they are saved by
-- different writes: plotting a Direction is not an edit of the Route.

ALTER TABLE "routes" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "directions" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
