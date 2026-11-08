-- Route Plotting (specs/007): directions are stored as an atomic pair (the
-- admin-plotted base + the auto-derived return). Clients must always load the
-- BASE direction — the admin's plotted stop order. Previously the pair's row
-- order was unspecified, so the derived return could come back first and the
-- stop list would appear reversed. This migration adds an explicit
-- direction_kind marker; legacy rows default to 'base'.
CREATE TYPE "public"."direction_kind" AS ENUM('base', 'return');--> statement-breakpoint
ALTER TABLE "public"."directions" ADD COLUMN "direction_kind" "public"."direction_kind" DEFAULT 'base' NOT NULL;
