CREATE TABLE IF NOT EXISTS "app_meta" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "locations" (
  "id" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT DEFAULT 'bin',
  "parent_id" INTEGER,
  "capacity" INTEGER,
  "x" INTEGER,
  "y" INTEGER,
  "z" INTEGER,
  "color" TEXT,
  "led_node" TEXT,
  "led_index" INTEGER,
  "network_target" TEXT,
  "notes" TEXT,
  UNIQUE("parent_id", "name"),
  FOREIGN KEY("parent_id") REFERENCES "locations"("id")
);

CREATE TABLE IF NOT EXISTS "parts" (
  "id" INTEGER PRIMARY KEY,
  "category_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "manufacturer" TEXT,
  "mpn" TEXT,
  "footprint" TEXT,
  "package" TEXT,
  "description" TEXT,
  "datasheet_url" TEXT,
  "notes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  FOREIGN KEY("category_id") REFERENCES "categories"("id")
);

CREATE TABLE IF NOT EXISTS "stock" (
  "id" INTEGER PRIMARY KEY,
  "part_id" INTEGER NOT NULL,
  "location_id" INTEGER,
  "quantity" INTEGER NOT NULL DEFAULT 0 CHECK("quantity" >= 0),
  "min_quantity" INTEGER NOT NULL DEFAULT 0 CHECK("min_quantity" >= 0),
  "source" TEXT,
  "order_number" TEXT,
  "unit_price" REAL,
  "currency" TEXT,
  "date_added" TEXT DEFAULT CURRENT_DATE,
  "notes" TEXT,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE,
  FOREIGN KEY("location_id") REFERENCES "locations"("id")
);

CREATE TABLE IF NOT EXISTS "resistor_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "resistance_ohm" REAL NOT NULL,
  "tolerance_percent" REAL,
  "power_w" REAL,
  "voltage_v" REAL,
  "tempco_ppm" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "capacitor_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "capacitance_f" REAL NOT NULL,
  "voltage_v" REAL,
  "tolerance_percent" REAL,
  "dielectric" TEXT,
  "esr_ohm" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "inductor_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "inductance_h" REAL NOT NULL,
  "current_a" REAL,
  "resistance_ohm" REAL,
  "shielded" INTEGER CHECK("shielded" IN (0, 1)),
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "ic_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "pin_count" INTEGER,
  "interface" TEXT,
  "supply_min_v" REAL,
  "supply_max_v" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "keyswitch_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "switch_type" TEXT,
  "mount" TEXT,
  "actuation_force_g" REAL,
  "travel_mm" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "attributes" (
  "part_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "value_num" REAL,
  "unit" TEXT,
  "value_text" TEXT,
  PRIMARY KEY("part_id", "name"),
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_parts_category" ON "parts" ("category_id");
CREATE INDEX IF NOT EXISTS "idx_parts_mpn" ON "parts" ("mpn");
CREATE INDEX IF NOT EXISTS "idx_parts_footprint" ON "parts" ("footprint");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_parts_unique_mpn" ON "parts" ("manufacturer", "mpn") WHERE "mpn" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_stock_part" ON "stock" ("part_id");
CREATE INDEX IF NOT EXISTS "idx_stock_location" ON "stock" ("location_id");

CREATE VIEW IF NOT EXISTS "parts_overview" AS
SELECT
  p."id",
  c."name" AS "category",
  p."name",
  p."manufacturer",
  p."mpn",
  p."footprint",
  p."package",
  p."description",
  p."datasheet_url",
  COALESCE(st."total_quantity", 0) AS "total_quantity",
  COALESCE(st."locations", '') AS "locations"
FROM "parts" p
JOIN "categories" c ON c."id" = p."category_id"
LEFT JOIN (
  SELECT
    s."part_id",
    SUM(s."quantity") AS "total_quantity",
    GROUP_CONCAT(COALESCE(l."name", 'no location') || ': ' || s."quantity", '; ') AS "locations"
  FROM "stock" s
  LEFT JOIN "locations" l ON l."id" = s."location_id"
  GROUP BY s."part_id"
) st ON st."part_id" = p."id";


CREATE TABLE IF NOT EXISTS "projects" (
  "id" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL,
  "revision" TEXT,
  "source_file" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "notes" TEXT
);

CREATE TABLE IF NOT EXISTS "project_bom" (
  "id" INTEGER PRIMARY KEY,
  "project_id" INTEGER NOT NULL,
  "part_id" INTEGER,
  "value" TEXT,
  "footprint" TEXT,
  "mpn" TEXT,
  "references_text" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "fitted" INTEGER DEFAULT 1 CHECK("fitted" IN (0, 1)),
  "notes" TEXT,
  FOREIGN KEY("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_locations_parent" ON "locations" ("parent_id");
CREATE INDEX IF NOT EXISTS "idx_locations_type" ON "locations" ("type");
CREATE INDEX IF NOT EXISTS "idx_project_bom_project" ON "project_bom" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_bom_part" ON "project_bom" ("part_id");


CREATE TABLE IF NOT EXISTS "part_aliases" (
  "id" INTEGER PRIMARY KEY,
  "part_id" INTEGER NOT NULL,
  "alias_type" TEXT,
  "alias_value" TEXT NOT NULL,
  "notes" TEXT,
  UNIQUE("alias_type", "alias_value"),
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "project_reservations" (
  "id" INTEGER PRIMARY KEY,
  "project_id" INTEGER NOT NULL,
  "part_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "location_id" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  FOREIGN KEY("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE,
  FOREIGN KEY("location_id") REFERENCES "locations"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" INTEGER PRIMARY KEY,
  "movement_type" TEXT NOT NULL CHECK("movement_type" IN ('move', 'take', 'adjust', 'project-consume')),
  "part_id" INTEGER NOT NULL,
  "from_location_id" INTEGER,
  "to_location_id" INTEGER,
  "quantity" INTEGER NOT NULL DEFAULT 0 CHECK("quantity" >= 0),
  "project_id" INTEGER,
  "bom_row_id" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE,
  FOREIGN KEY("from_location_id") REFERENCES "locations"("id") ON DELETE SET NULL,
  FOREIGN KEY("to_location_id") REFERENCES "locations"("id") ON DELETE SET NULL,
  FOREIGN KEY("project_id") REFERENCES "projects"("id") ON DELETE SET NULL,
  FOREIGN KEY("bom_row_id") REFERENCES "project_bom"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "activity_log" (
  "id" INTEGER PRIMARY KEY,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" INTEGER,
  "message" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_part_aliases_part" ON "part_aliases" ("part_id");
CREATE INDEX IF NOT EXISTS "idx_part_aliases_value" ON "part_aliases" ("alias_value");
CREATE INDEX IF NOT EXISTS "idx_project_reservations_project" ON "project_reservations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_reservations_part" ON "project_reservations" ("part_id");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_part" ON "stock_movements" ("part_id");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_created" ON "stock_movements" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_project" ON "stock_movements" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_activity_log_created" ON "activity_log" ("created_at");
