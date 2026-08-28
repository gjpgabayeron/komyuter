-- Notable-stops removed from detours (product decision: no consumer; label +
-- commuter_instruction text covers passenger messaging). Drops the column
-- wholesale so the detour row mirrors the simplified model.
alter table "public"."detours" drop column "notable_stops";
