-- Migration 0015: Collapse restriction reason + affects into one kind.
--
-- The admin only decides whether a range forbids loading, unloading, or both.
-- Existing rows are backfilled from `affects`:
--   boarding  -> no_loading
--   alighting -> no_unloading
--   both      -> both
-- The old `reason` values are intentionally dropped with the column.

CREATE TYPE "public"."restriction_kind" AS ENUM('no_loading', 'no_unloading', 'both');
--> statement-breakpoint
ALTER TABLE "restrictions" ADD COLUMN "kind" "restriction_kind";
--> statement-breakpoint
UPDATE "restrictions"
SET "kind" = CASE "affects"
  WHEN 'boarding' THEN 'no_loading'::"restriction_kind"
  WHEN 'alighting' THEN 'no_unloading'::"restriction_kind"
  ELSE 'both'::"restriction_kind"
END;
--> statement-breakpoint
ALTER TABLE "restrictions" ALTER COLUMN "kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "restrictions" DROP COLUMN "reason";
--> statement-breakpoint
ALTER TABLE "restrictions" DROP COLUMN "affects";
--> statement-breakpoint
DROP TYPE "public"."restriction_reason";
--> statement-breakpoint
DROP TYPE "public"."restriction_affects";
