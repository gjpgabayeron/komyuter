import { customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const stopType = pgEnum("stop_type", [
  "terminal",
  "major_stop",
  "waiting_area",
]);

export const restrictionReason = pgEnum("restriction_reason", [
  "no_stopping_zone",
  "contraflow",
  "pedestrian_hostile",
]);

export const restrictionAffects = pgEnum("restriction_affects", [
  "boarding",
  "alighting",
  "both",
]);

const pointGeometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Point,4326)";
  },
});

const lineStringGeometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(LineString,4326)";
  },
});

const timestamps = {
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const adminUsers = pgTable("admin_users", {
  user_id: uuid("user_id").primaryKey(),
});

export const fareConfigs = pgTable(
  "fare_configs",
  {
    fare_config_id: text("fare_config_id").primaryKey(),
    label: text("label").notNull(),
    base_fare: numeric("base_fare", { precision: 10, scale: 2 })
      .notNull()
      .default("13.00"),
    base_distance_km: numeric("base_distance_km", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("4.00"),
    rate_per_km: numeric("rate_per_km", { precision: 10, scale: 2 })
      .notNull()
      .default("1.80"),
    student_discount_pct: numeric("student_discount_pct", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("20"),
    senior_discount_pct: numeric("senior_discount_pct", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("20"),
    is_default: boolean("is_default").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("fare_configs_is_default_idx").on(table.is_default)],
);

export const routes = pgTable(
  "routes",
  {
    route_id: text("route_id").primaryKey(),
    name: text("name").notNull(),
    short_name: text("short_name").notNull(),
    color: text("color"),
    is_active: boolean("is_active").notNull().default(true),
    fare_config_id: text("fare_config_id").references(
      () => fareConfigs.fare_config_id,
      {
        onDelete: "set null",
      },
    ),
    ...timestamps,
  },
  (table) => [index("routes_fare_config_id_idx").on(table.fare_config_id)],
);

export const directions = pgTable(
  "directions",
  {
    direction_id: text("direction_id").primaryKey(),
    route_id: text("route_id")
      .notNull()
      .references(() => routes.route_id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    base_polyline: lineStringGeometry("base_polyline").notNull(),
    origin_stop_id: text("origin_stop_id"),
    destination_stop_id: text("destination_stop_id"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("directions_route_id_idx").on(table.route_id),
    index("directions_origin_stop_id_idx").on(table.origin_stop_id),
    index("directions_destination_stop_id_idx").on(table.destination_stop_id),
  ],
);

export const stops = pgTable(
  "stops",
  {
    stop_id: text("stop_id").primaryKey(),
    direction_id: text("direction_id")
      .notNull()
      .references(() => directions.direction_id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stop_order: integer("stop_order").notNull(),
    type: stopType("type").notNull(),
    location: pointGeometry("location").notNull(),
    is_guaranteed_service: boolean("is_guaranteed_service")
      .notNull()
      .default(true),
    ar_marker_enabled: boolean("ar_marker_enabled").notNull().default(true),
    landmark_hint: text("landmark_hint"),
    notes: text("notes"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("stops_direction_id_stop_order_idx").on(
      table.direction_id,
      table.stop_order,
    ),
    index("stops_location_gist").using("gist", sql`location`),
  ],
);

export const detours = pgTable(
  "detours",
  {
    detour_id: text("detour_id").primaryKey(),
    direction_id: text("direction_id")
      .notNull()
      .references(() => directions.direction_id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    entry: pointGeometry("entry").notNull(),
    exit: pointGeometry("exit").notNull(),
    detour_polyline: lineStringGeometry("detour_polyline").notNull(),
    additional_distance_meters: integer("additional_distance_meters"),
    commuter_instruction: text("commuter_instruction").notNull(),
    driver_instruction: text("driver_instruction"),
    notable_stops:
      jsonb("notable_stops").$type<
        { stop_id: string; name: string; is_detour_only: boolean }[]
      >(),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("detours_direction_id_idx").on(table.direction_id)],
);

export const restrictions = pgTable(
  "restrictions",
  {
    restriction_id: text("restriction_id").primaryKey(),
    direction_id: text("direction_id")
      .notNull()
      .references(() => directions.direction_id, { onDelete: "cascade" }),
    from_coord_index: integer("from_coord_index").notNull(),
    to_coord_index: integer("to_coord_index").notNull(),
    reason: restrictionReason("reason").notNull(),
    affects: restrictionAffects("affects").notNull(),
    note: text("note"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("restrictions_direction_id_idx").on(table.direction_id)],
);
