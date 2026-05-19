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
  "name" TEXT NOT NULL UNIQUE,
  "parent_id" INTEGER,
  "notes" TEXT,
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
