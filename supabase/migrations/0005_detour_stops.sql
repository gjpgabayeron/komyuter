-- Detour stops (product decision): points created by the detour tool are REAL
-- stops with full base-stop parity, scoped to their detour only. They live in
-- their own table (never the base chain), cascade with the detour, and are
-- ordered — the detour's route is entry → detour_stops → exit.
create table "public"."detour_stops" (
	"detour_stop_id" text primary key not null,
	"detour_id" text not null references "public"."detours"("detour_id") on delete cascade,
	"stop_order" integer not null,
	"name" text not null,
	"location" geometry(Point,4326) not null,
	"type" "public"."stop_type" not null default 'waiting_area',
	"is_guaranteed_service" boolean default false not null,
	"landmark_hint" text,
	"notes" text,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
create unique index "detour_stops_detour_id_order_idx"
	on "public"."detour_stops" using btree ("detour_id", "stop_order");
