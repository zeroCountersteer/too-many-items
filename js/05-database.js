"use strict";

async function initializeDatabaseEngine() {
  if (typeof initSqlJs !== "function") {
    throw new Error("sql.js was not loaded. Check the CDN script or vendor sql-wasm.js locally.");
  }
  state.SQL = await initSqlJs({ locateFile: (file) => `${SQLJS_CDN}${file}` });
  state.sqliteError = "";
}

async function loadInitialDatabase() {
  const cached = localStorage.getItem(STORAGE.dbBase64);
  if (cached) {
    try {
      loadDatabaseBytes(base64ToBytes(cached), {
        source: localStorage.getItem(STORAGE.dbSource) || "browser local copy",
        fileName: "inventory.db",
        dirty: localStorage.getItem(STORAGE.dbDirty) === "1",
        cache: false
      });
      setStatus("database loaded from browser");
      return;
    } catch (error) {
      console.warn("cached database failed", error);
      localStorage.removeItem(STORAGE.dbBase64);
    }
  }

  await loadBundledDatabase({ makeDirty: false, quiet: true });
}

async function loadBundledDatabase(options = {}) {
  requireSql();
  try {
    const response = await fetch(`${BUNDLED_DB_PATH}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error("bundled database is empty");
    loadDatabaseBytes(bytes, {
      source: BUNDLED_DB_PATH,
      fileName: "inventory.db",
      dirty: !!options.makeDirty,
      cache: true
    });
    setStatus("bundled database loaded");
    if (!options.quiet) render();
  } catch (error) {
    state.inventory = createEmptyInventory();
    persistDatabase("new local database created", { dirty: !!options.makeDirty });
    if (!options.quiet) {
      toast(`bundled database not loaded; empty database created: ${error.message}`, "error");
      render();
    }
  }
}

function loadDatabaseBytes(bytes, options = {}) {
  requireSql();
  const db = new state.SQL.Database(bytes);
  let inventory;
  try {
    inventory = databaseToInventory(db);
  } finally {
    db.close();
  }
  state.inventory = normalizeInventory(inventory);
  invalidateIndexes();
  state.dbBytes = new Uint8Array(bytes);
  state.dbFileName = options.fileName || "inventory.db";
  state.dbSource = options.source || "SQLite file";
  state.dbDirty = !!options.dirty;
  if (options.sha !== undefined) state.githubSha = options.sha || "";
  if (options.cache !== false) cacheDatabaseBytes(state.dbBytes, state.dbSource, state.dbDirty);
  setStatus(`database loaded: ${state.dbSource}`);
}

function persistDatabase(message = "database saved", options = {}) {
  if (!state.SQL) {
    localStorage.setItem(STORAGE.fallbackInventory, inventoryJson());
    setStatus("saved fallback inventory");
    return null;
  }
  ensureInventoryShape(state.inventory);
  const validation = validateInventory(state.inventory);
  if (!validation.ok) {
    toast(`database not saved: ${validation.errors[0]}`, "error");
    return null;
  }
  let bytes;
  try {
    bytes = inventoryToDatabaseBytes(state.inventory);
  } catch (error) {
    setStatus("database save failed");
    toast(`database not saved: ${error.message}`, "error");
    return null;
  }
  invalidateIndexes();
  state.dbBytes = bytes;
  state.dbFileName = "inventory.db";
  state.dbSource = state.dbSource || "browser local copy";
  state.dbDirty = options.dirty ?? true;
  cacheDatabaseBytes(bytes, state.dbSource, state.dbDirty);
  setStatus(message);
  return bytes;
}

function cacheDatabaseBytes(bytes, source, dirty) {
  localStorage.setItem(STORAGE.dbBase64, bytesToBase64(bytes));
  localStorage.setItem(STORAGE.dbSource, source || "browser local copy");
  localStorage.setItem(STORAGE.dbDirty, dirty ? "1" : "0");
}

async function importDatabaseFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    loadDatabaseBytes(bytes, {
      source: `local file: ${file.name}`,
      fileName: file.name,
      dirty: true,
      cache: true
    });
    render();
  } catch (error) {
    toast(`database import failed: ${error.message}`, "error");
  }
}

function exportDatabase() {
  const validation = validateInventory(state.inventory);
  if (!validation.ok) {
    toast(`fix database first: ${validation.errors[0]}`, "error");
    return;
  }
  const bytes = persistDatabase("database exported", { dirty: state.dbDirty });
  if (!bytes) return;
  downloadBytes("inventory.db", bytes, "application/vnd.sqlite3");
}

function newDatabase() {
  const ok = confirm("Create a new empty database? Current local data will be replaced. Export first if needed.");
  if (!ok) return;
  state.inventory = createEmptyInventory();
  state.githubSha = "";
  state.dbSource = "new local database";
  localStorage.removeItem(STORAGE.githubSha);
  if (!persistDatabase("new empty database created", { dirty: true })) return;
  render();
}

function clearLocalCache() {
  if (!confirm("Clear the local browser copy? Export or commit first if needed.")) return;
  localStorage.removeItem(STORAGE.dbBase64);
  localStorage.removeItem(STORAGE.dbDirty);
  localStorage.removeItem(STORAGE.dbSource);
  localStorage.removeItem(STORAGE.fallbackInventory);
  state.dbDirty = false;
  setStatus("local copy cleared");
  render();
}

function databaseToInventory(db) {
  const metaRows = tableExists(db, "app_meta") ? selectTable(db, "app_meta", { key: "key", value: "value" }) : [];
  const metaMap = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));

  const raw = {
    schemaVersion: Number(metaMap.schemaVersion || 1),
    meta: {
      app: metaMap.app || "too-many-items",
      createdAt: metaMap.createdAt || metaMap.created_at || new Date().toISOString(),
      updatedAt: metaMap.updatedAt || metaMap.updated_at || new Date().toISOString(),
      defaultCurrency: metaMap.defaultCurrency || metaMap.default_currency || "USD"
    },
    categories: selectTable(db, "categories", { id: "id", name: "name" }, "ORDER BY \"id\""),
    locations: selectTable(db, "locations", {
      id: "id",
      name: "name",
      type: "type",
      parentId: "parent_id",
      capacity: "capacity",
      x: "x",
      y: "y",
      z: "z",
      color: "color",
      ledNode: "led_node",
      ledIndex: "led_index",
      networkTarget: "network_target",
      notes: "notes"
    }, "ORDER BY \"id\""),
    parts: selectTable(db, "parts", {
      id: "id",
      categoryId: "category_id",
      name: "name",
      manufacturer: "manufacturer",
      mpn: "mpn",
      footprint: "footprint",
      package: "package",
      description: "description",
      datasheetUrl: "datasheet_url",
      notes: "notes",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }, "ORDER BY \"id\""),
    stock: selectTable(db, "stock", {
      id: "id",
      partId: "part_id",
      locationId: "location_id",
      quantity: "quantity",
      minQuantity: "min_quantity",
      source: "source",
      orderNumber: "order_number",
      unitPrice: "unit_price",
      currency: "currency",
      dateAdded: "date_added",
      notes: "notes"
    }, "ORDER BY \"id\""),
    resistorSpecs: selectTable(db, "resistor_specs", {
      partId: "part_id",
      resistanceOhm: "resistance_ohm",
      tolerancePercent: "tolerance_percent",
      powerW: "power_w",
      voltageV: "voltage_v",
      tempcoPpm: "tempco_ppm"
    }, "ORDER BY \"part_id\""),
    capacitorSpecs: selectTable(db, "capacitor_specs", {
      partId: "part_id",
      capacitanceF: "capacitance_f",
      voltageV: "voltage_v",
      tolerancePercent: "tolerance_percent",
      dielectric: "dielectric",
      esrOhm: "esr_ohm"
    }, "ORDER BY \"part_id\""),
    inductorSpecs: selectTable(db, "inductor_specs", {
      partId: "part_id",
      inductanceH: "inductance_h",
      currentA: "current_a",
      resistanceOhm: "resistance_ohm",
      shielded: "shielded"
    }, "ORDER BY \"part_id\""),
    icSpecs: selectTable(db, "ic_specs", {
      partId: "part_id",
      pinCount: "pin_count",
      interface: "interface",
      supplyMinV: "supply_min_v",
      supplyMaxV: "supply_max_v",
      oldFootprint: "footprint"
    }, "ORDER BY \"part_id\""),
    keyswitchSpecs: [],
    attributes: selectTable(db, "attributes", {
      partId: "part_id",
      name: "name",
      valueNum: "value_num",
      unit: "unit",
      valueText: "value_text"
    }, "ORDER BY \"part_id\", \"name\""),
    projects: selectTable(db, "projects", {
      id: "id",
      name: "name",
      revision: "revision",
      sourceFile: "source_file",
      createdAt: "created_at",
      updatedAt: "updated_at",
      notes: "notes"
    }, "ORDER BY \"id\""),
    projectBom: selectTable(db, "project_bom", {
      id: "id",
      projectId: "project_id",
      partId: "part_id",
      value: "value",
      footprint: "footprint",
      mpn: "mpn",
      referencesText: "references_text",
      quantity: "quantity",
      fitted: "fitted",
      notes: "notes"
    }, "ORDER BY \"project_id\", \"id\""),
    partAliases: selectTable(db, "part_aliases", {
      id: "id",
      partId: "part_id",
      aliasType: "alias_type",
      aliasValue: "alias_value",
      notes: "notes"
    }, "ORDER BY \"part_id\", \"id\""),
    projectReservations: selectTable(db, "project_reservations", {
      id: "id",
      projectId: "project_id",
      partId: "part_id",
      quantity: "quantity",
      locationId: "location_id",
      createdAt: "created_at",
      notes: "notes"
    }, "ORDER BY \"project_id\", \"id\""),
    stockMovements: selectTable(db, "stock_movements", {
      id: "id",
      movementType: "movement_type",
      partId: "part_id",
      fromLocationId: "from_location_id",
      toLocationId: "to_location_id",
      quantity: "quantity",
      projectId: "project_id",
      bomRowId: "bom_row_id",
      createdAt: "created_at",
      notes: "notes"
    }, "ORDER BY \"id\" DESC"),
    activityLog: selectTable(db, "activity_log", {
      id: "id",
      createdAt: "created_at",
      action: "action",
      entityType: "entity_type",
      entityId: "entity_id",
      message: "message"
    }, "ORDER BY \"id\" DESC")
  };

  const keyswitchTable = tableExists(db, "keyswitch_specs") ? "keyswitch_specs" : (tableExists(db, "keyswitch_spec") ? "keyswitch_spec" : null);
  if (keyswitchTable) {
    raw.keyswitchSpecs = selectTable(db, keyswitchTable, {
      partId: "part_id",
      switchType: "switch_type",
      mount: "mount",
      actuationForceG: "actuation_force_g",
      travelMm: "travel_mm"
    }, "ORDER BY \"part_id\"");
  }

  raw.icSpecs.forEach((spec) => {
    if (!spec.oldFootprint) return;
    const part = raw.parts.find((item) => Number(item.id) === Number(spec.partId));
    if (part && !part.footprint) part.footprint = spec.oldFootprint;
  });

  return normalizeInventory(raw);
}

function inventoryToDatabaseBytes(inventory) {
  requireSql();
  const inv = normalizeInventory(inventory);
  const db = new state.SQL.Database();
  runSqlScript(db, SCHEMA_SQL);
  db.run("PRAGMA foreign_keys=OFF");
  db.run("BEGIN TRANSACTION");
  let committed = false;
  try {
    const meta = {
      app: inv.meta.app || "too-many-items",
      schemaVersion: String(inv.schemaVersion || 1),
      createdAt: inv.meta.createdAt || new Date().toISOString(),
      updatedAt: inv.meta.updatedAt || new Date().toISOString(),
      defaultCurrency: normalizeCurrency(inv.meta.defaultCurrency || "USD", "USD")
    };
    Object.entries(meta).forEach(([key, value]) => {
      db.run("INSERT INTO \"app_meta\" (\"key\", \"value\") VALUES (?, ?)", [key, sqlValue(value)]);
    });

    inv.categories.forEach((row) => {
      db.run("INSERT INTO \"categories\" (\"id\", \"name\") VALUES (?, ?)", [row.id, row.name]);
    });

    inv.locations.forEach((row) => {
      db.run(`INSERT INTO "locations" ("id", "name", "type", "parent_id", "capacity", "x", "y", "z", "color", "led_node", "led_index", "network_target", "notes") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.name,
        sqlValue(row.type || "bin"),
        sqlValue(row.parentId),
        sqlValue(row.capacity),
        sqlValue(row.x),
        sqlValue(row.y),
        sqlValue(row.z),
        sqlValue(row.color),
        sqlValue(row.ledNode),
        sqlValue(row.ledIndex),
        sqlValue(row.networkTarget),
        sqlValue(row.notes)
      ]);
    });

    inv.parts.forEach((row) => {
      db.run(`INSERT INTO "parts" ("id", "category_id", "name", "manufacturer", "mpn", "footprint", "package", "description", "datasheet_url", "notes", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.categoryId,
        row.name,
        sqlValue(row.manufacturer),
        sqlValue(row.mpn),
        sqlValue(row.footprint),
        sqlValue(row.package),
        sqlValue(row.description),
        sqlValue(row.datasheetUrl),
        sqlValue(row.notes),
        row.createdAt || new Date().toISOString(),
        sqlValue(row.updatedAt)
      ]);
    });

    inv.stock.forEach((row) => {
      db.run(`INSERT INTO "stock" ("id", "part_id", "location_id", "quantity", "min_quantity", "source", "order_number", "unit_price", "currency", "date_added", "notes") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.partId,
        sqlValue(row.locationId),
        integerOrZero(row.quantity),
        integerOrZero(row.minQuantity),
        sqlValue(row.source),
        sqlValue(row.orderNumber),
        sqlValue(row.unitPrice),
        sqlValue(row.currency),
        row.dateAdded || new Date().toISOString().slice(0, 10),
        sqlValue(row.notes)
      ]);
    });

    insertSpecRows(db, inv, "resistor");
    insertSpecRows(db, inv, "capacitor");
    insertSpecRows(db, inv, "inductor");
    insertSpecRows(db, inv, "ic");
    insertSpecRows(db, inv, "keyswitch");

    inv.attributes.forEach((row) => {
      db.run(`INSERT INTO "attributes" ("part_id", "name", "value_num", "unit", "value_text") VALUES (?, ?, ?, ?, ?)`, [
        row.partId,
        row.name,
        sqlValue(row.valueNum),
        sqlValue(row.unit),
        sqlValue(row.valueText)
      ]);
    });

    (inv.projects || []).forEach((row) => {
      db.run(`INSERT INTO "projects" ("id", "name", "revision", "source_file", "created_at", "updated_at", "notes") VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.name,
        sqlValue(row.revision),
        sqlValue(row.sourceFile),
        row.createdAt || new Date().toISOString(),
        sqlValue(row.updatedAt),
        sqlValue(row.notes)
      ]);
    });

    (inv.projectBom || []).forEach((row) => {
      db.run(`INSERT INTO "project_bom" ("id", "project_id", "part_id", "value", "footprint", "mpn", "references_text", "quantity", "fitted", "notes") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.projectId,
        sqlValue(row.partId),
        sqlValue(row.value),
        sqlValue(row.footprint),
        sqlValue(row.mpn),
        sqlValue(row.referencesText),
        integerOrZero(row.quantity),
        row.fitted === 0 ? 0 : 1,
        sqlValue(row.notes)
      ]);
    });

    (inv.partAliases || []).forEach((row) => {
      db.run(`INSERT OR IGNORE INTO "part_aliases" ("id", "part_id", "alias_type", "alias_value", "notes") VALUES (?, ?, ?, ?, ?)`, [
        row.id,
        row.partId,
        sqlValue(row.aliasType),
        row.aliasValue,
        sqlValue(row.notes)
      ]);
    });

    (inv.projectReservations || []).forEach((row) => {
      db.run(`INSERT INTO "project_reservations" ("id", "project_id", "part_id", "quantity", "location_id", "created_at", "notes") VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.projectId,
        row.partId,
        integerOrZero(row.quantity),
        sqlValue(row.locationId),
        row.createdAt || new Date().toISOString(),
        sqlValue(row.notes)
      ]);
    });

    (inv.stockMovements || []).forEach((row) => {
      db.run(`INSERT INTO "stock_movements" ("id", "movement_type", "part_id", "from_location_id", "to_location_id", "quantity", "project_id", "bom_row_id", "created_at", "notes") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.movementType,
        row.partId,
        sqlValue(row.fromLocationId),
        sqlValue(row.toLocationId),
        integerOrZero(row.quantity),
        sqlValue(row.projectId),
        sqlValue(row.bomRowId),
        row.createdAt || new Date().toISOString(),
        sqlValue(row.notes)
      ]);
    });

    (inv.activityLog || []).forEach((row) => {
      db.run(`INSERT INTO "activity_log" ("id", "created_at", "action", "entity_type", "entity_id", "message") VALUES (?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.createdAt || new Date().toISOString(),
        row.action,
        sqlValue(row.entityType),
        sqlValue(row.entityId),
        sqlValue(row.message)
      ]);
    });

    db.run("COMMIT");
    committed = true;
    assertForeignKeyIntegrity(db);
  } catch (error) {
    if (!committed) db.run("ROLLBACK");
    db.close();
    throw error;
  }
  const bytes = db.export();
  db.close();
  return bytes;
}

function insertSpecRows(db, inv, kind) {
  const config = SPEC_CONFIGS[kind];
  const rows = inv[config.table] || [];
  if (!rows.length) return;
  const columns = ["part_id"].concat(config.fields.map((field) => field[3]));
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${qid(config.dbTable)} (${columns.map(qid).join(", ")}) VALUES (${placeholders})`;
  rows.forEach((row) => {
    const values = [row.partId].concat(config.fields.map(([name]) => sqlValue(row[name])));
    const hasValue = values.slice(1).some((value) => value !== null && value !== undefined && value !== "");
    const requiredFirstValue = values[1];
    const requiresFirstValue = kind === "resistor" || kind === "capacitor" || kind === "inductor";
    if (!hasValue) return;
    if (requiresFirstValue && (requiredFirstValue === null || requiredFirstValue === undefined || requiredFirstValue === "")) return;
    db.run(sql, values);
  });
}

function runSqlScript(db, script) {
  db.exec(script);
}

function assertForeignKeyIntegrity(db) {
  const rows = queryRows(db, "PRAGMA foreign_key_check");
  if (!rows.length) return;
  const first = rows[0];
  throw new Error(`foreign key check failed: ${first.table || "table"} row ${first.rowid || "?"} references ${first.parent || "parent"}`);
}

function requireSql() {
  if (!state.SQL) throw new Error(state.sqliteError || "SQLite engine is not ready");
}

function tableExists(db, table) {
  return queryRows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]).length > 0;
}

function tableColumns(db, table) {
  return new Set(queryRows(db, `PRAGMA table_info(${qid(table)})`).map((row) => row.name));
}

function selectTable(db, table, fieldMap, orderBy = "") {
  if (!tableExists(db, table)) return [];
  const columns = tableColumns(db, table);
  const expressions = Object.entries(fieldMap)
    .filter(([, column]) => columns.has(column))
    .map(([key, column]) => `${qid(column)} AS ${qid(key)}`);
  if (!expressions.length) return [];
  const sql = `SELECT ${expressions.join(", ")} FROM ${qid(table)} ${orderBy}`;
  return queryRows(db, sql);
}

function queryRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];
  try {
    if (params.length) statement.bind(params);
    while (statement.step()) rows.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return rows;
}

function qid(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
