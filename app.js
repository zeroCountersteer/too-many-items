"use strict";

const SQLJS_CDN = "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/";
const BUNDLED_DB_PATH = "data/inventory.db";
const VALID_VIEWS = new Set(["parts", "locations", "database", "settings"]);

const STORAGE = {
  dbBase64: "tmi.v3.database.base64",
  dbDirty: "tmi.v3.database.dirty",
  dbSource: "tmi.v3.database.source",
  fallbackInventory: "tmi.v3.inventory.fallback",
  githubConfig: "tmi.v3.github.config",
  githubSha: "tmi.v3.github.sha",
  activeView: "tmi.v3.activeView",
  activeTheme: "tmi.v3.activeTheme",
  customThemes: "tmi.v3.customThemes",
  movingBackground: "tmi.v3.movingBackground",
  token: "tmi.v3.github.token"
};

const DEFAULT_CATEGORIES = [
  "resistor",
  "capacitor",
  "inductor",
  "ic",
  "keyswitch",
  "connector",
  "diode",
  "transistor",
  "module",
  "mechanical",
  "other"
];

const SPEC_CONFIGS = {
  resistor: {
    table: "resistorSpecs",
    dbTable: "resistor_specs",
    fields: [
      ["resistanceOhm", "resistance, ohm", "number", "resistance_ohm"],
      ["tolerancePercent", "tolerance, %", "number", "tolerance_percent"],
      ["powerW", "power, W", "number", "power_w"],
      ["voltageV", "voltage, V", "number", "voltage_v"],
      ["tempcoPpm", "tempco, ppm", "number", "tempco_ppm"]
    ]
  },
  capacitor: {
    table: "capacitorSpecs",
    dbTable: "capacitor_specs",
    fields: [
      ["capacitanceF", "capacitance, F", "number", "capacitance_f"],
      ["voltageV", "voltage, V", "number", "voltage_v"],
      ["tolerancePercent", "tolerance, %", "number", "tolerance_percent"],
      ["dielectric", "dielectric", "text", "dielectric"],
      ["esrOhm", "ESR, ohm", "number", "esr_ohm"]
    ]
  },
  inductor: {
    table: "inductorSpecs",
    dbTable: "inductor_specs",
    fields: [
      ["inductanceH", "inductance, H", "number", "inductance_h"],
      ["currentA", "current, A", "number", "current_a"],
      ["resistanceOhm", "DCR, ohm", "number", "resistance_ohm"],
      ["shielded", "shielded, 0/1", "number", "shielded"]
    ]
  },
  ic: {
    table: "icSpecs",
    dbTable: "ic_specs",
    fields: [
      ["pinCount", "pin count", "number", "pin_count"],
      ["interface", "interface", "text", "interface"],
      ["supplyMinV", "supply min, V", "number", "supply_min_v"],
      ["supplyMaxV", "supply max, V", "number", "supply_max_v"]
    ]
  },
  keyswitch: {
    table: "keyswitchSpecs",
    dbTable: "keyswitch_specs",
    fields: [
      ["switchType", "switch type", "text", "switch_type"],
      ["mount", "mount", "text", "mount"],
      ["actuationForceG", "actuation force, g", "number", "actuation_force_g"],
      ["travelMm", "travel, mm", "number", "travel_mm"]
    ]
  }
};

const THEME_FIELDS = [
  "--bg-base",
  "--bg-soft",
  "--bg-spot-a",
  "--bg-spot-b",
  "--bg-lines",
  "--panel-bg",
  "--panel-bg-strong",
  "--panel-muted",
  "--panel-border",
  "--panel-border-strong",
  "--text",
  "--text-strong",
  "--text-faint",
  "--accent",
  "--accent-2",
  "--accent-3",
  "--ok",
  "--danger",
  "--warning",
  "--shadow",
  "--glow",
  "--radius-xl",
  "--radius-lg",
  "--radius-md",
  "--radius-sm",
  "--font-ui",
  "--font-mono",
  "--font-display"
];

const ANGEL_CLOUD_VARIABLES = {
  "--bg-base": "#dcecff",
  "--bg-soft": "#f7fbff",
  "--bg-spot-a": "rgba(151, 205, 255, 0.55)",
  "--bg-spot-b": "rgba(229, 237, 255, 0.78)",
  "--bg-lines": "rgba(116, 151, 190, 0.14)",
  "--panel-bg": "rgba(255, 255, 255, 0.82)",
  "--panel-bg-strong": "rgba(255, 255, 255, 0.95)",
  "--panel-muted": "rgba(244, 249, 255, 0.72)",
  "--panel-border": "rgba(166, 178, 196, 0.68)",
  "--panel-border-strong": "rgba(134, 153, 180, 0.82)",
  "--text": "#77859a",
  "--text-strong": "#5c6f8c",
  "--text-faint": "#9aa9bb",
  "--accent": "#8fc9ff",
  "--accent-2": "#c6b7ff",
  "--accent-3": "#ff94d4",
  "--ok": "#59b879",
  "--danger": "#e35d82",
  "--warning": "#bf9845",
  "--shadow": "rgba(79, 98, 124, 0.25)",
  "--glow": "rgba(143, 201, 255, 0.48)",
  "--radius-xl": "24px",
  "--radius-lg": "18px",
  "--radius-md": "12px",
  "--radius-sm": "8px",
  "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
  "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
  "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
};

const BUILTIN_THEMES = {
  angelCloud: {
    id: "angelCloud",
    name: "Angel cloud",
    description: "pale blue glass, rounded panels, soft webcore",
    variables: ANGEL_CLOUD_VARIABLES
  },
  violetNight: {
    id: "violetNight",
    name: "Violet night",
    description: "dark cyber inventory",
    variables: {
      ...ANGEL_CLOUD_VARIABLES,
      "--bg-base": "#0d0b1f",
      "--bg-soft": "#171229",
      "--bg-spot-a": "rgba(116, 74, 184, 0.38)",
      "--bg-spot-b": "rgba(47, 117, 155, 0.28)",
      "--bg-lines": "rgba(192, 156, 255, 0.13)",
      "--panel-bg": "rgba(18, 16, 36, 0.82)",
      "--panel-bg-strong": "rgba(29, 24, 52, 0.96)",
      "--panel-muted": "rgba(31, 26, 58, 0.74)",
      "--panel-border": "rgba(141, 111, 189, 0.52)",
      "--panel-border-strong": "rgba(178, 139, 240, 0.72)",
      "--text": "#c7c0dd",
      "--text-strong": "#f3ecff",
      "--text-faint": "#948cab",
      "--accent": "#80f4ff",
      "--accent-2": "#b59aff",
      "--accent-3": "#ff7ecb",
      "--ok": "#a5ff8b",
      "--danger": "#ff5a89",
      "--warning": "#e8d666",
      "--shadow": "rgba(0, 0, 0, 0.42)",
      "--glow": "rgba(128, 244, 255, 0.38)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  graphiteLab: {
    id: "graphiteLab",
    name: "Graphite lab",
    description: "neutral grey UI for longer work sessions",
    variables: {
      ...ANGEL_CLOUD_VARIABLES,
      "--bg-base": "#e7ebef",
      "--bg-soft": "#fbfcfd",
      "--bg-spot-a": "rgba(170, 185, 200, 0.44)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.82)",
      "--text": "#657182",
      "--text-strong": "#2f3a49",
      "--text-faint": "#8f9aaa",
      "--accent": "#4b88d1",
      "--accent-2": "#8c7ac9",
      "--accent-3": "#cd6c9d",
      "--ok": "#2c9a60",
      "--danger": "#c84e68",
      "--warning": "#9a7830",
      "--shadow": "rgba(44, 55, 70, 0.2)",
      "--glow": "rgba(75, 136, 209, 0.28)",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  terminalGreen: {
    id: "terminalGreen",
    name: "Terminal green",
    description: "compact black-green inventory terminal",
    variables: {
      ...ANGEL_CLOUD_VARIABLES,
      "--bg-base": "#03100c",
      "--bg-soft": "#071812",
      "--bg-spot-a": "rgba(51, 255, 167, 0.16)",
      "--bg-spot-b": "rgba(80, 170, 120, 0.12)",
      "--bg-lines": "rgba(102, 255, 178, 0.12)",
      "--panel-bg": "rgba(4, 18, 13, 0.88)",
      "--panel-bg-strong": "rgba(7, 28, 20, 0.96)",
      "--panel-muted": "rgba(8, 33, 23, 0.72)",
      "--panel-border": "rgba(84, 212, 143, 0.48)",
      "--panel-border-strong": "rgba(132, 255, 184, 0.68)",
      "--text": "#9fd7b7",
      "--text-strong": "#d9ffe7",
      "--text-faint": "#6fa786",
      "--accent": "#86ffb5",
      "--accent-2": "#83d0ff",
      "--accent-3": "#f5ff8c",
      "--ok": "#86ff83",
      "--danger": "#ff6b8d",
      "--warning": "#d5dc6a",
      "--shadow": "rgba(0, 0, 0, 0.5)",
      "--glow": "rgba(134, 255, 181, 0.24)",
      "--radius-xl": "12px",
      "--radius-lg": "8px",
      "--radius-md": "5px",
      "--radius-sm": "3px",
      "--font-ui": "Consolas, \"Lucida Console\", monospace",
      "--font-mono": "Consolas, \"Lucida Console\", monospace",
      "--font-display": "Consolas, \"Lucida Console\", monospace"
    }
  }
};

const SCHEMA_SQL = `
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
`;

const state = {
  SQL: null,
  sqliteError: "",
  inventory: createEmptyInventory(),
  activeView: normalizeView(localStorage.getItem(STORAGE.activeView)),
  query: "",
  categoryFilter: "all",
  githubSha: localStorage.getItem(STORAGE.githubSha) || "",
  githubConfig: loadJsonFromStorage(STORAGE.githubConfig, {
    owner: "",
    repo: "",
    branch: "main",
    path: BUNDLED_DB_PATH
  }),
  customThemes: loadJsonFromStorage(STORAGE.customThemes, {}),
  activeTheme: localStorage.getItem(STORAGE.activeTheme) || "angelCloud",
  movingBackground: localStorage.getItem(STORAGE.movingBackground) !== "off",
  dbSource: localStorage.getItem(STORAGE.dbSource) || "not loaded",
  dbFileName: "inventory.db",
  dbDirty: localStorage.getItem(STORAGE.dbDirty) === "1",
  dbBytes: null,
  lastStatus: "initializing"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

window.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    state.sqliteError = error.message;
    state.lastStatus = "database engine failed";
    render();
    toast(error.message, "error");
  });
});

async function init() {
  applyTheme(state.activeTheme);
  document.body.classList.toggle("moving-bg", state.movingBackground);
  bindEvents();
  renderShellLoading();
  await initializeDatabaseEngine();
  await loadInitialDatabase();
  render();
  document.body.dataset.appReady = "true";
}

function bindEvents() {
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("input", handleInput);
  document.body.addEventListener("change", handleChange);
  document.body.addEventListener("submit", handleSubmit);
  $("#dbFileInput").addEventListener("change", importDatabaseFile);
  $("#jsonFileInput").addEventListener("change", importInventoryJsonFile);
  $("#themeFileInput").addEventListener("change", importThemeFile);
}

function handleClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setView(viewButton.dataset.view);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  const id = actionTarget.dataset.id ? Number(actionTarget.dataset.id) : null;

  switch (action) {
    case "open-add-part":
      openPartModal();
      break;
    case "open-edit-part":
      openPartModal(id);
      break;
    case "delete-part":
      deletePart(id);
      break;
    case "open-add-location":
      openLocationModal();
      break;
    case "open-edit-location":
      openLocationModal(id);
      break;
    case "delete-location":
      deleteLocation(id);
      break;
    case "close-modal":
      closeModal();
      break;
    case "add-stock-row":
      addStockEditorRow();
      break;
    case "remove-stock-row":
      actionTarget.closest(".stock-row-edit")?.remove();
      break;
    case "add-category":
      addCategoryPrompt();
      break;
    case "import-db":
      $("#dbFileInput").click();
      break;
    case "export-db":
      exportDatabase();
      break;
    case "save-local-db":
      persistDatabase("database saved locally", { dirty: state.dbDirty });
      render();
      break;
    case "new-database":
      newDatabase();
      break;
    case "load-bundled-db":
      loadBundledDatabase({ makeDirty: false });
      break;
    case "load-github":
      loadFromGitHub();
      break;
    case "commit-github":
      commitToGitHub();
      break;
    case "import-json":
      $("#jsonFileInput").click();
      break;
    case "export-json":
      exportInventoryJson();
      break;
    case "select-theme":
      applyTheme(actionTarget.dataset.themeId);
      render();
      break;
    case "export-theme":
      exportCurrentTheme();
      break;
    case "import-theme":
      $("#themeFileInput").click();
      break;
    case "reset-theme":
      resetCustomTheme();
      break;
    case "clear-cache":
      clearLocalCache();
      break;
    default:
      break;
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.matches("[data-search]")) {
    state.query = target.value;
    renderPartsViewOnly();
  }

  if (target.matches("[data-theme-var]")) {
    updateCustomThemeFromInputs();
  }
}

function handleChange(event) {
  const target = event.target;

  if (target.matches("[data-category-filter]")) {
    state.categoryFilter = target.value;
    renderPartsViewOnly();
    return;
  }

  if (target.id === "partCategorySelect") {
    const categoryName = getCategoryName(Number(target.value));
    const form = target.closest("form");
    const partId = Number(form?.querySelector("[name='id']")?.value || 0);
    const part = state.inventory.parts.find((item) => item.id === partId) || null;
    const specContainer = $("#specFields");
    if (specContainer) specContainer.innerHTML = renderSpecFields(part, categoryName);
    return;
  }

  if (target.id === "movingToggleSettings") {
    state.movingBackground = target.checked;
    localStorage.setItem(STORAGE.movingBackground, state.movingBackground ? "on" : "off");
    document.body.classList.toggle("moving-bg", state.movingBackground);
    setStatus("appearance updated");
    return;
  }

  if (target.id === "themeSelect") {
    applyTheme(target.value);
    render();
  }
}

function handleSubmit(event) {
  if (event.target.id === "partForm") {
    event.preventDefault();
    savePartFromForm(event.target);
  }

  if (event.target.id === "locationForm") {
    event.preventDefault();
    saveLocationFromForm(event.target);
  }

  if (event.target.id === "settingsForm") {
    event.preventDefault();
    saveSettings(event.target);
  }
}

function setView(view) {
  state.activeView = normalizeView(view);
  localStorage.setItem(STORAGE.activeView, state.activeView);
  render();
}

function renderShellLoading() {
  $("#noticeLine").textContent = "initializing SQLite database engine";
  $("#viewPanel").innerHTML = `<div class="empty-state"><div><h3>loading</h3><p>Preparing the local SQLite database.</p></div></div>`;
}

function render() {
  ensureInventoryShape(state.inventory);
  renderNavigation();
  renderHeader();
  renderMetrics();
  renderRightStats();

  const panel = $("#viewPanel");
  if (state.activeView === "parts") panel.innerHTML = renderPartsView();
  if (state.activeView === "locations") panel.innerHTML = renderLocationsView();
  if (state.activeView === "database") panel.innerHTML = renderDatabaseView();
  if (state.activeView === "settings") panel.innerHTML = renderSettingsView();
}

function renderPartsViewOnly() {
  if (state.activeView === "parts") $("#viewPanel").innerHTML = renderPartsView();
}

function renderNavigation() {
  $$('[data-view]').forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  const navName = $("#navDbName");
  const navState = $("#navDbState");
  if (navName) navName.textContent = state.dbFileName || "inventory.db";
  if (navState) navState.textContent = databaseStateLabel();
}

function renderHeader() {
  const titles = {
    parts: ["INVENTORY / PARTS", "electronic components"],
    locations: ["INVENTORY / LOCATIONS", "storage map"],
    database: ["INVENTORY / DATABASE", "sqlite storage"],
    settings: ["INVENTORY / SETTINGS", "configuration"]
  };
  const [path, title] = titles[state.activeView] || titles.parts;
  $("#pathLine").textContent = path;
  $("#windowTitle").textContent = title;

  const actions = [];
  if (state.activeView === "parts") {
    actions.push(`<button type="button" data-action="export-db">export .db</button>`);
    actions.push(`<button type="button" class="primary-button" data-action="open-add-part">+ add part</button>`);
  } else if (state.activeView === "locations") {
    actions.push(`<button type="button" data-action="export-db">export .db</button>`);
    actions.push(`<button type="button" class="primary-button" data-action="open-add-location">+ add location</button>`);
  } else if (state.activeView === "database") {
    actions.push(`<button type="button" data-action="import-db">open .db</button>`);
    actions.push(`<button type="button" class="primary-button" data-action="export-db">export .db</button>`);
  }
  $("#chromeActions").innerHTML = actions.join("");

  const cfg = state.githubConfig;
  const archive = cfg.repo ? `${cfg.owner}/${cfg.repo}` : state.dbFileName || "inventory.db";
  $("#archiveName").textContent = archive;
  $("#archiveSubline").textContent = cfg.repo ? `${cfg.branch || "main"}:${cfg.path || BUNDLED_DB_PATH}` : state.dbSource;

  const notice = $("#noticeLine");
  if (state.sqliteError) {
    notice.textContent = `SQLite engine is not available: ${state.sqliteError}`;
  } else if (state.inventory.parts.length === 0) {
    notice.textContent = "database is empty: add the first part, open an existing .db file, or load inventory.db from GitHub";
  } else if (state.dbDirty) {
    notice.textContent = "local changes are saved in this browser; export or commit the database when ready";
  } else {
    notice.textContent = `database loaded: ${state.dbSource}`;
  }
}

function renderMetrics() {
  const metrics = getMetrics();
  $("#metricsGrid").innerHTML = [
    metricHtml(metrics.parts, "parts"),
    metricHtml(metrics.quantity, "items in stock"),
    metricHtml(metrics.locations, "locations"),
    metricHtml(metrics.lowStock, "low stock")
  ].join("");
}

function metricHtml(value, label) {
  return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderRightStats() {
  const categoryCounts = state.inventory.categories
    .map((category) => ({ name: category.name, count: state.inventory.parts.filter((part) => part.categoryId === category.id).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 4);

  const databaseRows = [
    `<div class="right-stat"><span>database</span><strong>${escapeHtml(state.dbDirty ? "changed" : "saved")}</strong></div>`,
    `<div class="right-stat"><span>stock rows</span><strong>${state.inventory.stock.length}</strong></div>`
  ];

  const categoryRows = categoryCounts.length
    ? categoryCounts.map((entry) => `<div class="right-stat"><span>${escapeHtml(entry.name)}</span><strong>${entry.count}</strong></div>`)
    : [`<div class="right-stat"><span>parts</span><strong>0</strong></div>`];

  $("#rightStats").innerHTML = databaseRows.concat(categoryRows).join("");
  $("#createdDate").textContent = formatDate(state.inventory.meta?.createdAt);
  $("#updatedDate").textContent = formatDate(state.inventory.meta?.updatedAt);
  $("#dbSourceText").textContent = state.dbSource || "local";
}

function renderPartsView() {
  const categories = state.inventory.categories;
  const filtered = filteredParts();
  const categoryOptions = [`<option value="all">all categories</option>`]
    .concat(categories.map((category) => `<option value="${category.id}" ${String(category.id) === String(state.categoryFilter) ? "selected" : ""}>${escapeHtml(category.name)}</option>`))
    .join("");

  const table = filtered.length
    ? renderPartsTable(filtered)
    : `<div class="empty-state">
        <div>
          <h3>inventory is empty</h3>
          <p>Add a real component, open an existing SQLite database, or load <code>data/inventory.db</code> from GitHub.</p>
          <div class="inline-actions">
            <button type="button" class="primary-button" data-action="open-add-part">+ add part</button>
            <button type="button" class="ghost-button" data-action="import-db">open .db</button>
          </div>
        </div>
      </div>`;

  return `
    <div class="view-head">
      <h3 class="view-title"><span>information</span> / parts overview</h3>
      <div class="tool-row">
        <button type="button" data-action="add-category">+ category</button>
        <button type="button" class="primary-button" data-action="open-add-part">+ add part</button>
      </div>
    </div>
    <div class="toolbar-grid">
      <input type="search" data-search value="${escapeAttr(state.query)}" placeholder="search: 0603, tps25751, x7r..." />
      <select data-category-filter>${categoryOptions}</select>
      <button type="button" class="ghost-button" data-action="export-db">export .db</button>
    </div>
    ${table}
  `;
}

function renderPartsTable(parts) {
  const rows = parts.map((part) => {
    const category = getCategoryName(part.categoryId);
    const stock = stockSummary(part.id);
    const spec = specSummary(part);
    const low = stock.total <= stock.min && stock.min > 0;
    const mpn = [part.manufacturer, part.mpn].filter(Boolean).join(" / ") || "generic";
    return `
      <tr>
        <td>${part.id}</td>
        <td>
          <span class="part-name">${escapeHtml(part.name)}</span>
          <span class="subtext">${escapeHtml(mpn)}</span>
          ${spec ? `<span class="subtext">${escapeHtml(spec)}</span>` : ""}
        </td>
        <td><span class="badge">${escapeHtml(category)}</span></td>
        <td>${escapeHtml(part.package || "")}</td>
        <td>${escapeHtml(part.footprint || "")}</td>
        <td><span class="${low ? "qty-low" : "qty-ok"}">${stock.total}</span>${stock.min ? ` / min ${stock.min}` : ""}</td>
        <td>${escapeHtml(stock.locations || "-")}</td>
        <td><button type="button" class="ghost-button" data-action="open-edit-part" data-id="${part.id}">edit</button></td>
      </tr>`;
  }).join("");

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Part</th>
          <th>Category</th>
          <th>Package</th>
          <th>Footprint</th>
          <th>Qty</th>
          <th>Location</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderLocationsView() {
  const locations = state.inventory.locations;
  const cards = locations.length
    ? `<div class="location-grid">${locations.map((location) => renderLocationCard(location)).join("")}</div>`
    : `<div class="empty-state"><div><h3>no storage map yet</h3><p>Add drawers, boxes, trays, cells, or shelves. Parts can reference them from stock rows.</p><button type="button" class="primary-button" data-action="open-add-location">+ add location</button></div></div>`;

  return `
    <div class="view-head">
      <h3 class="view-title"><span>storage_map</span> / locations</h3>
      <div class="tool-row">
        <button type="button" class="primary-button" data-action="open-add-location">+ add location</button>
      </div>
    </div>
    ${cards}
  `;
}

function renderLocationCard(location) {
  const children = state.inventory.locations.filter((item) => item.parentId === location.id).length;
  const stockRows = state.inventory.stock.filter((row) => row.locationId === location.id);
  const qty = stockRows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  return `<article class="location-card">
    <h4>${escapeHtml(locationPath(location.id))}</h4>
    <p>id: ${location.id} / children: ${children} / quantity: ${qty}</p>
    ${location.notes ? `<p>${escapeHtml(location.notes)}</p>` : ""}
    <div class="inline-actions" style="margin-top: 10px;">
      <button type="button" class="ghost-button" data-action="open-edit-location" data-id="${location.id}">edit</button>
      <button type="button" class="danger-button" data-action="delete-location" data-id="${location.id}">delete</button>
    </div>
  </article>`;
}

function renderDatabaseView() {
  const validation = validateInventory(state.inventory);
  const engineClass = state.sqliteError ? "database-card sql-error" : "database-card ok-card";
  const healthClass = validation.ok ? "database-card ok-card" : "database-card warn-card";
  const shaText = state.githubSha ? "version recorded" : "none";

  return `
    <div class="view-head">
      <h3 class="view-title"><span>sqlite</span> / database file</h3>
      <div class="tool-row">
        <button type="button" data-action="import-db">open .db</button>
        <button type="button" class="primary-button" data-action="export-db">export .db</button>
      </div>
    </div>

    <div class="database-grid">
      <section class="${engineClass}">
        <h4>engine</h4>
        <dl class="kv-list">
          <div><dt>sqlite</dt><dd>${state.sqliteError ? escapeHtml(state.sqliteError) : "ready"}</dd></div>
          <div><dt>file</dt><dd>${escapeHtml(state.dbFileName || "inventory.db")}</dd></div>
          <div><dt>state</dt><dd>${escapeHtml(databaseStateLabel())}</dd></div>
        </dl>
      </section>

      <section class="database-card">
        <h4>source</h4>
        <dl class="kv-list">
          <div><dt>loaded from</dt><dd>${escapeHtml(state.dbSource || "local")}</dd></div>
          <div><dt>remote</dt><dd>${escapeHtml(shaText)}</dd></div>
          <div><dt>remote path</dt><dd>${escapeHtml(state.githubConfig.path || BUNDLED_DB_PATH)}</dd></div>
        </dl>
      </section>

      <section class="${healthClass}">
        <h4>health</h4>
        ${validation.ok ? `<p>Inventory references are valid.</p>` : `<p>${escapeHtml(validation.errors[0])}</p>`}
        <p class="small-note">Export or commit writes the normalized v3 SQLite schema.</p>
      </section>
    </div>

    <p class="section-title">database actions</p>
    <div class="database-card">
      <p>The application works with one SQLite file. On GitHub Pages it is stored as <code>data/inventory.db</code> and edited in the browser.</p>
      <div class="database-actions">
        <button type="button" data-action="import-db">open local .db</button>
        <button type="button" data-action="load-bundled-db">reload bundled db</button>
        <button type="button" data-action="save-local-db">save local copy</button>
        <button type="button" class="primary-button" data-action="export-db">download inventory.db</button>
        <button type="button" class="danger-button" data-action="new-database">new empty database</button>
      </div>
      <div class="advanced-actions">
        <button type="button" data-action="import-json">import legacy json</button>
        <button type="button" data-action="export-json">export json snapshot</button>
      </div>
    </div>
  `;
}

function renderSettingsView() {
  const cfg = state.githubConfig;
  const tokenPresent = sessionStorage.getItem(STORAGE.token) ? "token active for this tab" : "token not set";
  const themeOptions = allThemes().map((theme) => `<option value="${escapeAttr(theme.id)}" ${theme.id === state.activeTheme ? "selected" : ""}>${escapeHtml(theme.name)}</option>`).join("");
  const current = getTheme(state.activeTheme) || BUILTIN_THEMES.angelCloud;
  const editor = THEME_FIELDS.map((key) => {
    const value = current.variables[key] || getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    return `<div class="theme-field"><label>${escapeHtml(key)}</label><input data-theme-var="${escapeAttr(key)}" value="${escapeAttr(value)}" /></div>`;
  }).join("");

  return `
    <form id="settingsForm">
      <div class="view-head">
        <h3 class="view-title"><span>settings</span> / sync and appearance</h3>
        <div class="tool-row">
          <button type="submit" class="primary-button">save settings</button>
        </div>
      </div>

      <div class="settings-grid">
        <section class="settings-card">
          <h4>GitHub storage</h4>
          <div class="form-grid">
            <div class="field"><label>owner</label><input name="owner" value="${escapeAttr(cfg.owner || "")}" placeholder="github username or org" /></div>
            <div class="field"><label>repo</label><input name="repo" value="${escapeAttr(cfg.repo || "")}" placeholder="inventory-data" /></div>
            <div class="field"><label>branch</label><input name="branch" value="${escapeAttr(cfg.branch || "main")}" placeholder="main" /></div>
            <div class="field"><label>path</label><input name="path" value="${escapeAttr(cfg.path || BUNDLED_DB_PATH)}" placeholder="data/inventory.db" /></div>
            <div class="field span-2"><label>fine-grained token, Contents: read/write</label><input type="password" name="token" placeholder="session only" autocomplete="off" /></div>
          </div>
          <p class="small-note">${escapeHtml(tokenPresent)} / remote version: ${state.githubSha ? "recorded" : "none"}</p>
          <div class="database-actions">
            <button type="button" data-action="load-github">load from github</button>
            <button type="button" class="primary-button" data-action="commit-github">commit inventory.db</button>
          </div>
        </section>

        <section class="settings-card">
          <h4>appearance</h4>
          <label class="switch-row">
            <span>moving background</span>
            <input id="movingToggleSettings" type="checkbox" ${state.movingBackground ? "checked" : ""} />
          </label>
          <div class="theme-select-row">
            <div class="field"><label>theme</label><select id="themeSelect">${themeOptions}</select></div>
            <button type="button" data-action="import-theme">import</button>
          </div>
          <div class="database-actions">
            <button type="button" data-action="export-theme">export theme</button>
            <button type="button" class="danger-button" data-action="reset-theme">reset custom</button>
          </div>
        </section>

        <section class="settings-card danger-zone">
          <h4>local browser copy</h4>
          <p>The browser keeps a local SQLite copy so edits survive refreshes. Clearing it does not delete exported files or GitHub data.</p>
          <button type="button" class="danger-button" data-action="clear-cache">clear local copy</button>
        </section>
      </div>

      <p class="section-title">theme variables</p>
      <div class="theme-editor-grid compact">${editor}</div>
    </form>
  `;
}

function openPartModal(partId = null) {
  const part = partId ? state.inventory.parts.find((item) => item.id === partId) : null;
  const title = part ? "edit part" : "add part";
  const categoryId = part?.categoryId || state.inventory.categories[0]?.id || 1;
  const categoryName = getCategoryName(categoryId);
  const stockRows = part ? state.inventory.stock.filter((row) => row.partId === part.id) : [];
  const rowHtml = stockRows.length ? stockRows.map(renderStockEditorRow).join("") : renderStockEditorRow(null);
  const categoryOptions = state.inventory.categories.map((category) => `<option value="${category.id}" ${category.id === categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("");

  openModal(`
    <form id="partForm" class="modal-card">
      <div class="modal-head">
        <div><p class="path-line">inventory / part editor</p><h3>${title}</h3></div>
        <button type="button" class="icon-button" data-action="close-modal">×</button>
      </div>
      <input type="hidden" name="id" value="${part ? part.id : ""}" />
      <div class="form-grid">
        <div class="field span-2"><label>name</label><input name="name" required value="${escapeAttr(part?.name || "")}" placeholder="100nF 50V X7R 0603" /></div>
        <div class="field"><label>category</label><select name="categoryId" id="partCategorySelect">${categoryOptions}</select></div>
        <div class="field"><label>package</label><input name="package" value="${escapeAttr(part?.package || "")}" placeholder="0603, QFN-48, SOT-23" /></div>
        <div class="field"><label>manufacturer</label><input name="manufacturer" value="${escapeAttr(part?.manufacturer || "")}" placeholder="Texas Instruments" /></div>
        <div class="field"><label>mpn</label><input name="mpn" value="${escapeAttr(part?.mpn || "")}" placeholder="TPS25751D" /></div>
        <div class="field"><label>footprint</label><input name="footprint" value="${escapeAttr(part?.footprint || "")}" placeholder="C_0603_1608Metric" /></div>
        <div class="field"><label>datasheet url</label><input name="datasheetUrl" value="${escapeAttr(part?.datasheetUrl || "")}" placeholder="https://..." /></div>
        <div class="field span-2"><label>description</label><input name="description" value="${escapeAttr(part?.description || "")}" /></div>
        <div class="field span-2"><label>notes</label><textarea name="notes">${escapeHtml(part?.notes || "")}</textarea></div>
      </div>

      <p class="section-title">category specific specs</p>
      <div class="spec-box" id="specFields">${renderSpecFields(part, categoryName)}</div>

      <p class="section-title">stock</p>
      <div class="stock-editor" id="stockRows">${rowHtml}</div>
      <button type="button" class="ghost-button" data-action="add-stock-row">+ stock row</button>

      <div class="form-actions">
        ${part ? `<button type="button" class="danger-button" data-action="delete-part" data-id="${part.id}">delete</button>` : ""}
        <button type="button" class="ghost-button" data-action="close-modal">cancel</button>
        <button type="submit" class="primary-button">save part</button>
      </div>
    </form>
  `);
}

function renderSpecFields(part, categoryName) {
  const kind = categoryKind(categoryName);
  const config = kind ? SPEC_CONFIGS[kind] : null;
  if (!config) {
    return `<p class="muted">No fixed spec fields for this category. Use notes for unusual parameters.</p>`;
  }
  const spec = part ? getSpec(part.id, kind) : null;
  return `<div class="form-grid">${config.fields.map(([name, label, type]) => {
    const value = spec?.[name] ?? "";
    return `<div class="field"><label>${escapeHtml(label)}</label><input name="spec.${name}" type="${type}" step="any" value="${escapeAttr(value)}" /></div>`;
  }).join("")}</div>`;
}

function renderStockEditorRow(row) {
  const locations = [`<option value="">no location</option>`].concat(
    state.inventory.locations.map((location) => `<option value="${location.id}" ${row?.locationId === location.id ? "selected" : ""}>${escapeHtml(locationPath(location.id))}</option>`)
  ).join("");

  return `<div class="stock-row-edit">
    <div class="field"><label>location</label><select name="stock.locationId">${locations}</select></div>
    <div class="field"><label>quantity</label><input name="stock.quantity" type="number" min="0" step="1" value="${escapeAttr(row?.quantity ?? "")}" /></div>
    <div class="field"><label>min</label><input name="stock.minQuantity" type="number" min="0" step="1" value="${escapeAttr(row?.minQuantity ?? "")}" /></div>
    <div class="field"><label>source</label><input name="stock.source" value="${escapeAttr(row?.source || "")}" placeholder="LCSC, AliExpress..." /></div>
    <button type="button" class="icon-button" data-action="remove-stock-row">×</button>
  </div>`;
}

function addStockEditorRow() {
  const container = $("#stockRows");
  if (container) container.insertAdjacentHTML("beforeend", renderStockEditorRow(null));
}

function savePartFromForm(form) {
  const fd = new FormData(form);
  const id = fd.get("id") ? Number(fd.get("id")) : nextId(state.inventory.parts);
  const existing = state.inventory.parts.find((part) => part.id === id);
  const categoryId = Number(fd.get("categoryId"));
  const now = new Date().toISOString();

  const part = {
    id,
    categoryId,
    name: textValue(fd.get("name")),
    manufacturer: nullableText(fd.get("manufacturer")),
    mpn: nullableText(fd.get("mpn")),
    footprint: nullableText(fd.get("footprint")),
    package: nullableText(fd.get("package")),
    description: nullableText(fd.get("description")),
    datasheetUrl: nullableText(fd.get("datasheetUrl")),
    notes: nullableText(fd.get("notes")),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (!part.name) {
    toast("part name is required", "error");
    return;
  }

  if (part.manufacturer && part.mpn) {
    const duplicate = state.inventory.parts.find((item) =>
      item.id !== id &&
      String(item.manufacturer || "").toLowerCase() === part.manufacturer.toLowerCase() &&
      String(item.mpn || "").toLowerCase() === part.mpn.toLowerCase()
    );
    if (duplicate) {
      toast(`duplicate MPN: ${duplicate.name}`, "error");
      return;
    }
  }

  if (existing) Object.assign(existing, part);
  else state.inventory.parts.push(part);

  updateSpecsFromForm(form, part);
  updateStockFromForm(form, part.id);
  touchInventory();
  if (!persistDatabase(existing ? "part updated" : "part added", { dirty: true })) return;
  closeModal();
  render();
}

function updateSpecsFromForm(form, part) {
  Object.values(SPEC_CONFIGS).forEach((config) => {
    state.inventory[config.table] = state.inventory[config.table].filter((spec) => spec.partId !== part.id);
  });

  const kind = categoryKind(getCategoryName(part.categoryId));
  if (!kind) return;

  const config = SPEC_CONFIGS[kind];
  const spec = { partId: part.id };
  let hasValue = false;

  config.fields.forEach(([name, , type]) => {
    const input = form.querySelector(`[name="spec.${name}"]`);
    if (!input) return;
    const raw = input.value.trim();
    if (raw === "") return;
    spec[name] = type === "number" ? Number(raw) : raw;
    hasValue = true;
  });

  if (hasValue) state.inventory[config.table].push(spec);
}

function updateStockFromForm(form, partId) {
  state.inventory.stock = state.inventory.stock.filter((row) => row.partId !== partId);
  const rows = $$(".stock-row-edit", form);
  const today = new Date().toISOString().slice(0, 10);
  rows.forEach((row) => {
    const locationRaw = $("[name='stock.locationId']", row).value;
    const quantity = integerOrZero($("[name='stock.quantity']", row).value);
    const minQuantity = integerOrZero($("[name='stock.minQuantity']", row).value);
    const source = nullableText($("[name='stock.source']", row).value);
    const locationId = locationRaw ? Number(locationRaw) : null;
    if (!locationId && quantity === 0 && minQuantity === 0 && !source) return;
    state.inventory.stock.push({
      id: nextId(state.inventory.stock),
      partId,
      locationId,
      quantity,
      minQuantity,
      source,
      orderNumber: null,
      unitPrice: null,
      currency: null,
      dateAdded: today,
      notes: null
    });
  });
}

function deletePart(partId) {
  const part = state.inventory.parts.find((item) => item.id === partId);
  if (!part) return;
  if (!confirm(`Delete part "${part.name}"?`)) return;
  state.inventory.parts = state.inventory.parts.filter((item) => item.id !== partId);
  state.inventory.stock = state.inventory.stock.filter((row) => row.partId !== partId);
  state.inventory.attributes = state.inventory.attributes.filter((attr) => attr.partId !== partId);
  Object.values(SPEC_CONFIGS).forEach((config) => {
    state.inventory[config.table] = state.inventory[config.table].filter((spec) => spec.partId !== partId);
  });
  touchInventory();
  if (!persistDatabase("part deleted", { dirty: true })) return;
  closeModal();
  render();
}

function openLocationModal(locationId = null) {
  const location = locationId ? state.inventory.locations.find((item) => item.id === locationId) : null;
  const parentOptions = [`<option value="">no parent</option>`].concat(
    state.inventory.locations
      .filter((item) => item.id !== locationId)
      .map((item) => `<option value="${item.id}" ${location?.parentId === item.id ? "selected" : ""}>${escapeHtml(locationPath(item.id))}</option>`)
  ).join("");

  openModal(`
    <form id="locationForm" class="modal-card">
      <div class="modal-head">
        <div><p class="path-line">inventory / location editor</p><h3>${location ? "edit location" : "add location"}</h3></div>
        <button type="button" class="icon-button" data-action="close-modal">×</button>
      </div>
      <input type="hidden" name="id" value="${location ? location.id : ""}" />
      <div class="form-grid">
        <div class="field"><label>name</label><input name="name" required value="${escapeAttr(location?.name || "")}" placeholder="A01 capacitors" /></div>
        <div class="field"><label>parent</label><select name="parentId">${parentOptions}</select></div>
        <div class="field span-2"><label>notes</label><textarea name="notes">${escapeHtml(location?.notes || "")}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost-button" data-action="close-modal">cancel</button>
        <button type="submit" class="primary-button">save location</button>
      </div>
    </form>
  `);
}

function saveLocationFromForm(form) {
  const fd = new FormData(form);
  const id = fd.get("id") ? Number(fd.get("id")) : nextId(state.inventory.locations);
  const existing = state.inventory.locations.find((location) => location.id === id);
  const parentRaw = fd.get("parentId");
  const location = {
    id,
    name: textValue(fd.get("name")),
    parentId: parentRaw ? Number(parentRaw) : null,
    notes: nullableText(fd.get("notes"))
  };

  if (!location.name) {
    toast("location name is required", "error");
    return;
  }
  if (location.parentId === id) {
    toast("location cannot be its own parent", "error");
    return;
  }

  if (existing) Object.assign(existing, location);
  else state.inventory.locations.push(location);

  touchInventory();
  if (!persistDatabase(existing ? "location updated" : "location added", { dirty: true })) return;
  closeModal();
  render();
}

function deleteLocation(locationId) {
  const location = state.inventory.locations.find((item) => item.id === locationId);
  if (!location) return;
  const children = state.inventory.locations.filter((item) => item.parentId === locationId);
  const stockRows = state.inventory.stock.filter((row) => row.locationId === locationId);
  if (children.length) {
    toast("delete child locations first", "error");
    return;
  }
  if (stockRows.length) {
    toast("location is used by stock rows", "error");
    return;
  }
  if (!confirm(`Delete location "${location.name}"?`)) return;
  state.inventory.locations = state.inventory.locations.filter((item) => item.id !== locationId);
  touchInventory();
  if (!persistDatabase("location deleted", { dirty: true })) return;
  render();
}

function addCategoryPrompt() {
  const name = prompt("Category name");
  if (!name) return;
  const clean = name.trim().toLowerCase();
  if (!clean) return;
  if (state.inventory.categories.some((category) => category.name.toLowerCase() === clean)) {
    toast("category already exists", "error");
    return;
  }
  state.inventory.categories.push({ id: nextId(state.inventory.categories), name: clean });
  touchInventory();
  if (!persistDatabase("category added", { dirty: true })) return;
  render();
}

function openModal(html) {
  $("#modalRoot").innerHTML = `<div class="modal-layer">${html}</div>`;
}

function closeModal() {
  $("#modalRoot").innerHTML = "";
}

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
      updatedAt: metaMap.updatedAt || metaMap.updated_at || new Date().toISOString()
    },
    categories: selectTable(db, "categories", { id: "id", name: "name" }, "ORDER BY \"id\""),
    locations: selectTable(db, "locations", { id: "id", name: "name", parentId: "parent_id", notes: "notes" }, "ORDER BY \"id\""),
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
    }, "ORDER BY \"part_id\", \"name\"")
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
  try {
    const meta = {
      app: inv.meta.app || "too-many-items",
      schemaVersion: String(inv.schemaVersion || 1),
      createdAt: inv.meta.createdAt || new Date().toISOString(),
      updatedAt: inv.meta.updatedAt || new Date().toISOString()
    };
    Object.entries(meta).forEach(([key, value]) => {
      db.run("INSERT INTO \"app_meta\" (\"key\", \"value\") VALUES (?, ?)", [key, sqlValue(value)]);
    });

    inv.categories.forEach((row) => {
      db.run("INSERT INTO \"categories\" (\"id\", \"name\") VALUES (?, ?)", [row.id, row.name]);
    });

    inv.locations.forEach((row) => {
      db.run("INSERT INTO \"locations\" (\"id\", \"name\", \"parent_id\", \"notes\") VALUES (?, ?, ?, ?)", [row.id, row.name, sqlValue(row.parentId), sqlValue(row.notes)]);
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

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
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
  script.split(/;\s*(?:\n|$)/).forEach((statement) => {
    const sql = statement.trim();
    if (sql) db.run(sql);
  });
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

function filteredParts() {
  const query = state.query.trim().toLowerCase();
  return state.inventory.parts
    .filter((part) => state.categoryFilter === "all" || String(part.categoryId) === String(state.categoryFilter))
    .filter((part) => {
      if (!query) return true;
      const haystack = [
        part.name,
        part.manufacturer,
        part.mpn,
        part.footprint,
        part.package,
        part.description,
        part.notes,
        getCategoryName(part.categoryId),
        specSummary(part),
        stockSummary(part.id).locations
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => getCategoryName(a.categoryId).localeCompare(getCategoryName(b.categoryId)) || a.name.localeCompare(b.name));
}

function stockSummary(partId) {
  const rows = state.inventory.stock.filter((row) => row.partId === partId);
  const total = rows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const min = rows.reduce((sum, row) => sum + numberOrZero(row.minQuantity), 0);
  const locations = rows
    .map((row) => `${row.locationId ? locationPath(row.locationId) : "no location"}: ${numberOrZero(row.quantity)}`)
    .join("; ");
  return { total, min, locations };
}

function specSummary(part) {
  const kind = categoryKind(getCategoryName(part.categoryId));
  if (!kind) return "";
  const spec = getSpec(part.id, kind);
  if (!spec) return "";
  const pairs = Object.entries(spec).filter(([key, value]) => key !== "partId" && value !== null && value !== undefined && value !== "");
  return pairs.slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(" / ");
}

function getSpec(partId, kind) {
  const table = SPEC_CONFIGS[kind]?.table;
  if (!table) return null;
  return state.inventory[table].find((spec) => spec.partId === partId) || null;
}

function categoryKind(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("resistor")) return "resistor";
  if (lower.includes("capacitor")) return "capacitor";
  if (lower.includes("inductor")) return "inductor";
  if (lower === "ic" || lower.includes("micro") || lower.includes("controller") || lower.includes("chip")) return "ic";
  if (lower.includes("switch") || lower.includes("keyswitch")) return "keyswitch";
  return null;
}

function getCategoryName(categoryId) {
  return state.inventory.categories.find((category) => category.id === Number(categoryId))?.name || "other";
}

function locationPath(locationId, visited = new Set()) {
  const location = state.inventory.locations.find((item) => item.id === Number(locationId));
  if (!location) return "unknown";
  if (visited.has(location.id)) return location.name;
  visited.add(location.id);
  return location.parentId ? `${locationPath(location.parentId, visited)} / ${location.name}` : location.name;
}

function getMetrics() {
  const stock = state.inventory.stock;
  const quantity = stock.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const lowStock = state.inventory.parts.filter((part) => {
    const summary = stockSummary(part.id);
    return summary.min > 0 && summary.total <= summary.min;
  }).length;
  return {
    parts: state.inventory.parts.length,
    quantity,
    locations: state.inventory.locations.length,
    lowStock,
    categories: state.inventory.categories.length,
    stockRecords: stock.length,
    attributes: state.inventory.attributes.length
  };
}

function createEmptyInventory() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    meta: {
      app: "too-many-items",
      createdAt: now,
      updatedAt: now
    },
    categories: DEFAULT_CATEGORIES.map((name, index) => ({ id: index + 1, name })),
    locations: [],
    parts: [],
    resistorSpecs: [],
    capacitorSpecs: [],
    inductorSpecs: [],
    icSpecs: [],
    keyswitchSpecs: [],
    stock: [],
    attributes: []
  };
}

function normalizeInventory(raw) {
  const base = createEmptyInventory();
  if (!raw || typeof raw !== "object") return base;
  const inv = { ...base, ...raw };
  inv.meta = { ...base.meta, ...(raw.meta || {}) };
  inv.categories = normalizeCategories(raw.categories || base.categories);
  inv.locations = normalizeLocations(raw.locations || []);
  inv.parts = normalizeParts(raw.parts || []);
  inv.stock = normalizeStock(raw.stock || []);
  inv.resistorSpecs = normalizeSpecs(raw.resistorSpecs || raw.resistor_specs || [], "resistor");
  inv.capacitorSpecs = normalizeSpecs(raw.capacitorSpecs || raw.capacitor_specs || [], "capacitor");
  inv.inductorSpecs = normalizeSpecs(raw.inductorSpecs || raw.inductor_specs || [], "inductor");
  inv.icSpecs = normalizeSpecs(raw.icSpecs || raw.ic_specs || [], "ic");
  inv.keyswitchSpecs = normalizeSpecs(raw.keyswitchSpecs || raw.keyswitch_specs || raw.keyswitch_spec || [], "keyswitch");
  inv.attributes = normalizeAttributes(raw.attributes || []);
  ensureInventoryShape(inv);
  normalizeReferences(inv);
  return inv;
}

function ensureInventoryShape(inv) {
  inv.schemaVersion = inv.schemaVersion || 1;
  inv.meta = inv.meta || {};
  inv.meta.app = inv.meta.app || "too-many-items";
  inv.meta.createdAt = inv.meta.createdAt || new Date().toISOString();
  inv.meta.updatedAt = inv.meta.updatedAt || inv.meta.createdAt;
  ["categories", "locations", "parts", "stock", "resistorSpecs", "capacitorSpecs", "inductorSpecs", "icSpecs", "keyswitchSpecs", "attributes"].forEach((key) => {
    if (!Array.isArray(inv[key])) inv[key] = [];
  });
  if (!inv.categories.length) inv.categories = DEFAULT_CATEGORIES.map((name, index) => ({ id: index + 1, name }));
}

function normalizeReferences(inv) {
  const categoryIds = new Set(inv.categories.map((category) => category.id));
  let other = inv.categories.find((category) => category.name === "other");
  if (!other) {
    other = { id: nextId(inv.categories), name: "other" };
    inv.categories.push(other);
    categoryIds.add(other.id);
  }
  inv.parts.forEach((part) => {
    if (!categoryIds.has(part.categoryId)) part.categoryId = other.id;
  });
  const partIds = new Set(inv.parts.map((part) => part.id));
  inv.stock = inv.stock.filter((row) => partIds.has(row.partId));
  inv.attributes = inv.attributes.filter((row) => partIds.has(row.partId));
  Object.values(SPEC_CONFIGS).forEach((config) => {
    inv[config.table] = inv[config.table].filter((row) => partIds.has(row.partId));
  });
}

function normalizeCategories(items) {
  const result = [];
  items.forEach((item, index) => {
    const name = textValue(item.name || item.Name || `category_${index + 1}`).toLowerCase();
    if (!name) return;
    if (result.some((category) => category.name.toLowerCase() === name)) return;
    result.push({ id: Number(item.id || index + 1), name });
  });
  DEFAULT_CATEGORIES.forEach((name) => {
    if (!result.some((category) => category.name === name)) result.push({ id: nextId(result), name });
  });
  return result;
}

function normalizeLocations(items) {
  return items.map((item, index) => ({
    id: Number(item.id || index + 1),
    name: textValue(item.name || item.Name || `location_${index + 1}`),
    parentId: nullableNumber(item.parentId ?? item.parent_id),
    notes: nullableText(item.notes)
  })).filter((item) => item.name);
}

function normalizeParts(items) {
  return items.map((item, index) => ({
    id: Number(item.id || index + 1),
    categoryId: Number(item.categoryId ?? item.category_id ?? 11),
    name: textValue(item.name || item.Name || `part_${index + 1}`),
    manufacturer: nullableText(item.manufacturer ?? item.Manufacturer),
    mpn: nullableText(item.mpn ?? item.partnumber ?? item.Partnumber),
    footprint: nullableText(item.footprint ?? item.Footprint),
    package: nullableText(item.package ?? item.Package),
    description: nullableText(item.description),
    datasheetUrl: nullableText(item.datasheetUrl ?? item.datasheet_url),
    notes: nullableText(item.notes),
    createdAt: item.createdAt ?? item.created_at ?? new Date().toISOString(),
    updatedAt: item.updatedAt ?? item.updated_at ?? null
  })).filter((item) => item.name && Number.isFinite(item.id));
}

function normalizeStock(items) {
  return items.map((item, index) => ({
    id: Number(item.id || index + 1),
    partId: Number(item.partId ?? item.part_id),
    locationId: nullableNumber(item.locationId ?? item.location_id),
    quantity: integerOrZero(item.quantity),
    minQuantity: integerOrZero(item.minQuantity ?? item.min_quantity),
    source: nullableText(item.source),
    orderNumber: nullableText(item.orderNumber ?? item.order_number),
    unitPrice: nullableNumber(item.unitPrice ?? item.unit_price),
    currency: nullableText(item.currency),
    dateAdded: item.dateAdded ?? item.date_added ?? new Date().toISOString().slice(0, 10),
    notes: nullableText(item.notes)
  })).filter((item) => Number.isFinite(item.partId));
}

function normalizeSpecs(items, kind) {
  const config = SPEC_CONFIGS[kind];
  return items.map((item) => {
    const spec = { partId: Number(item.partId ?? item.part_id) };
    config.fields.forEach(([name, , type, column]) => {
      const raw = item[name] ?? item[column] ?? item[camelToSnake(name)];
      if (raw === undefined || raw === null || raw === "") return;
      spec[name] = type === "number" ? Number(raw) : String(raw);
    });
    return spec;
  }).filter((spec) => Number.isFinite(spec.partId));
}

function normalizeAttributes(items) {
  return items.map((item) => ({
    partId: Number(item.partId ?? item.part_id),
    name: textValue(item.name),
    valueNum: nullableNumber(item.valueNum ?? item.value_num),
    unit: nullableText(item.unit),
    valueText: nullableText(item.valueText ?? item.value_text)
  })).filter((item) => Number.isFinite(item.partId) && item.name);
}

function validateInventory(inv) {
  const errors = [];
  const categoryIds = new Set(inv.categories.map((category) => category.id));
  const partIds = new Set(inv.parts.map((part) => part.id));
  const locationIds = new Set(inv.locations.map((location) => location.id));

  inv.parts.forEach((part) => {
    if (!part.name) errors.push(`part ${part.id} has no name`);
    if (!categoryIds.has(part.categoryId)) errors.push(`part ${part.id} references missing category ${part.categoryId}`);
  });

  inv.stock.forEach((row) => {
    if (!partIds.has(row.partId)) errors.push(`stock row ${row.id} references missing part ${row.partId}`);
    if (row.locationId !== null && row.locationId !== undefined && !locationIds.has(row.locationId)) errors.push(`stock row ${row.id} references missing location ${row.locationId}`);
    if (row.quantity < 0) errors.push(`stock row ${row.id} has negative quantity`);
  });

  inv.locations.forEach((location) => {
    if (location.parentId !== null && location.parentId !== undefined && !locationIds.has(location.parentId)) errors.push(`location ${location.id} references missing parent ${location.parentId}`);
  });

  return { ok: errors.length === 0, errors };
}

function touchInventory() {
  state.inventory.meta.updatedAt = new Date().toISOString();
}

function inventoryJson() {
  return JSON.stringify(state.inventory, null, 2) + "\n";
}

async function importInventoryJsonFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    state.inventory = normalizeInventory(JSON.parse(text));
    state.githubSha = "";
    state.dbSource = `imported json: ${file.name}`;
    localStorage.removeItem(STORAGE.githubSha);
    if (!persistDatabase("json imported into database", { dirty: true })) return;
    render();
  } catch (error) {
    toast(`json import failed: ${error.message}`, "error");
  }
}

function exportInventoryJson() {
  downloadText("inventory.snapshot.json", inventoryJson(), "application/json");
  setStatus("json snapshot exported");
}

function saveSettings(form) {
  const fd = new FormData(form);
  state.githubConfig = {
    owner: textValue(fd.get("owner")),
    repo: textValue(fd.get("repo")),
    branch: textValue(fd.get("branch")) || "main",
    path: textValue(fd.get("path")) || BUNDLED_DB_PATH
  };
  localStorage.setItem(STORAGE.githubConfig, JSON.stringify(state.githubConfig));
  const token = textValue(fd.get("token"));
  if (token) sessionStorage.setItem(STORAGE.token, token);
  setStatus("settings saved");
  render();
}

function captureSettingsFormIfPresent() {
  const form = $("#settingsForm");
  if (!form) return;
  const fd = new FormData(form);
  state.githubConfig = {
    owner: textValue(fd.get("owner")),
    repo: textValue(fd.get("repo")),
    branch: textValue(fd.get("branch")) || "main",
    path: textValue(fd.get("path")) || BUNDLED_DB_PATH
  };
  localStorage.setItem(STORAGE.githubConfig, JSON.stringify(state.githubConfig));
  const token = textValue(fd.get("token"));
  if (token) sessionStorage.setItem(STORAGE.token, token);
}

function requireGitHubConfig() {
  const token = sessionStorage.getItem(STORAGE.token);
  const cfg = state.githubConfig;
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.path) throw new Error("fill owner, repo, branch and path in Settings first");
  if (!token) throw new Error("enter GitHub token in Settings first");
  return { ...cfg, token };
}

async function loadFromGitHub() {
  try {
    captureSettingsFormIfPresent();
    const cfg = requireGitHubConfig();
    setStatus("loading database from github...");
    const { bytes, sha } = await githubLoadBytes(cfg);
    loadDatabaseBytes(bytes, {
      source: `github: ${cfg.owner}/${cfg.repo}/${cfg.path}`,
      fileName: cfg.path.split("/").pop() || "inventory.db",
      sha,
      dirty: false,
      cache: true
    });
    state.githubSha = sha;
    localStorage.setItem(STORAGE.githubSha, sha);
    localStorage.setItem(STORAGE.dbDirty, "0");
    render();
  } catch (error) {
    setStatus("github load failed");
    toast(error.message, "error");
  }
}

async function commitToGitHub() {
  try {
    captureSettingsFormIfPresent();
    const cfg = requireGitHubConfig();
    const validation = validateInventory(state.inventory);
    if (!validation.ok) throw new Error(`inventory is invalid: ${validation.errors[0]}`);
    setStatus("committing database to github...");
    touchInventory();
    const bytes = persistDatabase("database prepared", { dirty: true });
    if (!bytes) return;
    let sha = state.githubSha;
    if (!sha) sha = await githubTryGetSha(cfg);
    const result = await githubSaveBytes({
      ...cfg,
      sha,
      bytes,
      message: `inventory: update database ${new Date().toISOString().slice(0, 19).replace("T", " ")}`
    });
    state.githubSha = result.content?.sha || state.githubSha;
    state.dbDirty = false;
    localStorage.setItem(STORAGE.githubSha, state.githubSha);
    cacheDatabaseBytes(bytes, state.dbSource, false);
    setStatus("database committed to github");
    render();
  } catch (error) {
    setStatus("github commit failed");
    toast(error.message, "error");
  }
}

async function githubLoadBytes({ owner, repo, branch, path, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const file = await githubRequest(url, token);
  if (!file.content) throw new Error("GitHub response did not include file content; keep inventory.db reasonably small or use a raw-file workflow");
  return { bytes: base64ToBytes(file.content), sha: file.sha || "" };
}

async function githubTryGetSha({ owner, repo, branch, path, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  try {
    const file = await githubRequest(url, token);
    return file.sha || "";
  } catch (error) {
    if (String(error.message).startsWith("404")) return "";
    throw error;
  }
}

async function githubSaveBytes({ owner, repo, branch, path, token, bytes, sha, message }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const body = {
    message,
    branch,
    content: bytesToBase64(bytes)
  };
  if (sha) body.sha = sha;
  return githubRequest(url, token, { method: "PUT", body: JSON.stringify(body) });
}

async function githubRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 400)}`);
  }
  return response.json();
}

function encodePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

function allThemes() {
  return [...Object.values(BUILTIN_THEMES), ...Object.values(state.customThemes)];
}

function getTheme(id) {
  return BUILTIN_THEMES[id] || state.customThemes[id] || null;
}

function applyTheme(id) {
  const theme = getTheme(id) || BUILTIN_THEMES.angelCloud;
  state.activeTheme = theme.id;
  localStorage.setItem(STORAGE.activeTheme, theme.id);
  THEME_FIELDS.forEach((key) => {
    const value = theme.variables[key];
    if (value) document.documentElement.style.setProperty(key, value);
  });
  document.body.dataset.theme = theme.id;
}

function updateCustomThemeFromInputs() {
  const current = getTheme(state.activeTheme) || BUILTIN_THEMES.angelCloud;
  const customId = current.id.startsWith("custom") ? current.id : "customLocal";
  const custom = state.customThemes[customId] || {
    id: customId,
    name: current.id.startsWith("custom") ? current.name : `${current.name} custom`,
    description: "local edited theme",
    variables: { ...current.variables }
  };

  $$('[data-theme-var]').forEach((input) => {
    custom.variables[input.dataset.themeVar] = input.value;
  });

  state.customThemes[customId] = custom;
  localStorage.setItem(STORAGE.customThemes, JSON.stringify(state.customThemes));
  applyTheme(customId);
}

function exportCurrentTheme() {
  const theme = getTheme(state.activeTheme) || BUILTIN_THEMES.angelCloud;
  downloadText(`${theme.id}.theme.json`, JSON.stringify(theme, null, 2) + "\n", "application/json");
  setStatus("theme exported");
}

async function importThemeFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const theme = JSON.parse(await file.text());
    if (!theme.id || !theme.name || !theme.variables || typeof theme.variables !== "object") {
      throw new Error("theme requires id, name and variables");
    }
    const id = theme.id.startsWith("custom") ? theme.id : `custom_${theme.id}`;
    state.customThemes[id] = { ...theme, id };
    localStorage.setItem(STORAGE.customThemes, JSON.stringify(state.customThemes));
    applyTheme(id);
    setStatus("theme imported");
    render();
  } catch (error) {
    toast(`theme import failed: ${error.message}`, "error");
  }
}

function resetCustomTheme() {
  if (!confirm("Remove all imported and edited custom themes?")) return;
  state.customThemes = {};
  localStorage.removeItem(STORAGE.customThemes);
  applyTheme("angelCloud");
  setStatus("custom themes reset");
  render();
}

function setStatus(text) {
  state.lastStatus = text;
  const navState = $("#navDbState");
  if (navState) navState.textContent = databaseStateLabel();
}

function databaseStateLabel() {
  if (state.sqliteError) return "engine unavailable";
  if (state.dbDirty) return "local changes";
  if (state.dbBytes) return "saved";
  return state.lastStatus || "ready";
}

function toast(message, type = "ok") {
  let stack = $(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 5200);
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  downloadBlob(filename, blob);
}

function downloadBytes(filename, bytes, type) {
  const blob = new Blob([bytes], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function nextId(items) {
  const max = items.reduce((value, item) => Math.max(value, Number(item.id) || 0), 0);
  return max + 1;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function integerOrZero(value) {
  return Math.max(0, Math.floor(numberOrZero(value)));
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textValue(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  const text = textValue(value);
  return text ? text : null;
}

function sqlValue(value) {
  if (value === undefined || value === "") return null;
  return value;
}

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function loadJsonFromStorage(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeView(view) {
  return VALID_VIEWS.has(view) ? view : "parts";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}
