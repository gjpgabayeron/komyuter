CREATE TYPE "public"."restriction_affects" AS ENUM('boarding', 'alighting', 'both');--> statement-breakpoint
CREATE TYPE "public"."restriction_reason" AS ENUM('no_stopping_zone', 'contraflow', 'pedestrian_hostile');--> statement-breakpoint
CREATE TYPE "public"."stop_type" AS ENUM('terminal', 'major_stop', 'waiting_area');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"user_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detours" (
	"detour_id" text PRIMARY KEY NOT NULL,
	"direction_id" text NOT NULL,
	"label" text NOT NULL,
	"entry" geometry(Point,4326) NOT NULL,
	"exit" geometry(Point,4326) NOT NULL,
	"detour_polyline" geometry(LineString,4326) NOT NULL,
	"additional_distance_meters" integer,
	"commuter_instruction" text NOT NULL,
	"driver_instruction" text,
	"notable_stops" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directions" (
	"direction_id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"label" text NOT NULL,
	"base_polyline" geometry(LineString,4326) NOT NULL,
	"origin_stop_id" text,
	"destination_stop_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fare_configs" (
	"fare_config_id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"base_fare" numeric(10, 2) DEFAULT '13.00' NOT NULL,
	"base_distance_km" numeric(10, 2) DEFAULT '4.00' NOT NULL,
	"rate_per_km" numeric(10, 2) DEFAULT '1.80' NOT NULL,
	"student_discount_pct" numeric(5, 2) DEFAULT '20' NOT NULL,
	"senior_discount_pct" numeric(5, 2) DEFAULT '20' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restrictions" (
	"restriction_id" text PRIMARY KEY NOT NULL,
	"direction_id" text NOT NULL,
	"from_coord_index" integer NOT NULL,
	"to_coord_index" integer NOT NULL,
	"reason" "restriction_reason" NOT NULL,
	"affects" "restriction_affects" NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"route_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"fare_config_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"stop_id" text PRIMARY KEY NOT NULL,
	"direction_id" text NOT NULL,
	"name" text NOT NULL,
	"stop_order" integer NOT NULL,
	"type" "stop_type" NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"is_guaranteed_service" boolean DEFAULT true NOT NULL,
	"ar_marker_enabled" boolean DEFAULT true NOT NULL,
	"landmark_hint" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detours" ADD CONSTRAINT "detours_direction_id_directions_direction_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("direction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_route_id_routes_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("route_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restrictions" ADD CONSTRAINT "restrictions_direction_id_directions_direction_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("direction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_fare_config_id_fare_configs_fare_config_id_fk" FOREIGN KEY ("fare_config_id") REFERENCES "public"."fare_configs"("fare_config_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_direction_id_directions_direction_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("direction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detours_direction_id_idx" ON "detours" USING btree ("direction_id");--> statement-breakpoint
CREATE INDEX "directions_route_id_idx" ON "directions" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "directions_origin_stop_id_idx" ON "directions" USING btree ("origin_stop_id");--> statement-breakpoint
CREATE INDEX "directions_destination_stop_id_idx" ON "directions" USING btree ("destination_stop_id");--> statement-breakpoint
CREATE INDEX "fare_configs_is_default_idx" ON "fare_configs" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "restrictions_direction_id_idx" ON "restrictions" USING btree ("direction_id");--> statement-breakpoint
CREATE INDEX "routes_fare_config_id_idx" ON "routes" USING btree ("fare_config_id");--> statement-breakpoint
CREATE INDEX "stops_direction_id_stop_order_idx" ON "stops" USING btree ("direction_id","stop_order");--> statement-breakpoint
CREATE INDEX "stops_location_gist" ON "stops" USING gist (location);