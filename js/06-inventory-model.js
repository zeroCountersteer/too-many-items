"use strict";

let indexCache = null;
let indexVersion = 0;

function invalidateIndexes() {
  indexVersion += 1;
  indexCache = null;
}

function rebuildIndexes() {
  if (indexCache) return indexCache;
  const stockByPart = new Map();
  const stockRowsByPart = new Map();
  for (const row of state.inventory.stock || []) {
    const partId = Number(row.partId);
    const existing = stockByPart.get(partId) || { total: 0, min: 0, locations: [], rows: [] };
    existing.total += numberOrZero(row.quantity);
    existing.min += numberOrZero(row.minQuantity);
    existing.rows.push(row);
    if (row.locationId) existing.locations.push(`${locationPath(row.locationId)}: ${numberOrZero(row.quantity)}`);
    else existing.locations.push(`no location: ${numberOrZero(row.quantity)}`);
    stockByPart.set(partId, existing);
    if (!stockRowsByPart.has(partId)) stockRowsByPart.set(partId, []);
    stockRowsByPart.get(partId).push(row);
  }

  const categoriesById = new Map((state.inventory.categories || []).map((category) => [Number(category.id), category]));
  const partsById = new Map((state.inventory.parts || []).map((part) => [Number(part.id), part]));
  const locationsById = new Map((state.inventory.locations || []).map((location) => [Number(location.id), location]));
  indexCache = { stockByPart, stockRowsByPart, categoriesById, partsById, locationsById, version: indexVersion };
  return indexCache;
}


function filteredParts() {
  const query = String(state.query || "").trim().toLowerCase();
  const packageQuery = String(state.packageFilter || "").trim().toLowerCase();
  const stockFilter = state.stockFilter || "all";
  const specMin = parseSpecFilterValue(state.specFilterMin);
  const specMax = parseSpecFilterValue(state.specFilterMax);
  const extra = String(state.specFilterExtra || "").trim().toLowerCase();

  const filtered = state.inventory.parts
    .filter((part) => state.categoryFilter === "all" || String(part.categoryId) === String(state.categoryFilter))
    .filter((part) => {
      if (!packageQuery) return true;
      return [part.package, part.footprint].filter(Boolean).join(" ").toLowerCase().includes(packageQuery);
    })
    .filter((part) => {
      const stock = stockSummary(part.id);
      if (stockFilter === "in-stock") return stock.total > 0;
      if (stockFilter === "zero") return stock.total <= 0;
      if (stockFilter === "low") return stock.min > 0 && stock.total <= stock.min;
      if (stockFilter === "no-location") return state.inventory.stock.some((row) => row.partId === part.id && !row.locationId);
      return true;
    })
    .filter((part) => {
      if (specMin == null && specMax == null && !extra) return true;
      const primary = primarySpecValue(part);
      if ((specMin != null || specMax != null) && primary == null) return false;
      if (specMin != null && primary < specMin) return false;
      if (specMax != null && primary > specMax) return false;
      if (extra && !specSummary(part).toLowerCase().includes(extra)) return false;
      return true;
    })
    .filter((part) => {
      if (!query) return true;
      const haystack = [
        part.id,
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
    });

  const direction = state.sortDir === "desc" ? -1 : 1;
  const sortKey = state.sortKey || "category";
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const compareText = (a, b) => collator.compare(String(a || ""), String(b || ""));
  const compareNumber = (a, b) => Number(a || 0) - Number(b || 0);

  return filtered.sort((a, b) => {
    const stockA = stockSummary(a.id);
    const stockB = stockSummary(b.id);
    let result = 0;
    if (sortKey === "id") result = compareNumber(a.id, b.id);
    else if (sortKey === "name") result = compareText(a.name, b.name);
    else if (sortKey === "category") result = compareText(getCategoryName(a.categoryId), getCategoryName(b.categoryId)) || compareText(a.name, b.name);
    else if (sortKey === "package") result = compareText(a.package || a.footprint, b.package || b.footprint) || compareText(a.name, b.name);
    else if (sortKey === "quantity") result = compareNumber(stockA.total, stockB.total) || compareText(a.name, b.name);
    else if (sortKey === "location") result = compareText(stockA.locations, stockB.locations) || compareText(a.name, b.name);
    else if (sortKey === "value" || sortKey === "spec") result = compareNumber(primarySpecValue(a), primarySpecValue(b)) || compareText(a.name, b.name);
    else if (sortKey === "voltage") result = compareNumber(specNumericField(a, "voltageV"), specNumericField(b, "voltageV")) || compareText(a.name, b.name);
    else if (sortKey === "tolerance") result = compareNumber(specNumericField(a, "tolerancePercent"), specNumericField(b, "tolerancePercent")) || compareText(a.name, b.name);
    else result = compareText(a.name, b.name);
    return result * direction;
  });
}

function stockSummary(partId) {
  const cached = rebuildIndexes().stockByPart.get(Number(partId));
  if (!cached) return { total: 0, min: 0, locations: "" };
  return {
    total: cached.total,
    min: cached.min,
    locations: cached.locations.join("; ")
  };
}

function specSummary(part) {
  const kind = categoryKind(getCategoryName(part.categoryId));
  if (!kind) return "";
  const spec = getSpec(part.id, kind);
  if (!spec) return "";
  if (kind === "resistor") return [formatResistance(spec.resistanceOhm), spec.tolerancePercent != null ? `${trimNumber(spec.tolerancePercent)}%` : "", spec.powerW != null ? formatPower(spec.powerW) : ""].filter(Boolean).join(" ");
  if (kind === "capacitor") return [formatCapacitance(spec.capacitanceF), spec.voltageV != null ? `${trimNumber(spec.voltageV)}V` : "", spec.dielectric || ""].filter(Boolean).join(" ");
  if (kind === "inductor") return [formatInductance(spec.inductanceH), spec.currentA != null ? `${trimNumber(spec.currentA)}A` : ""].filter(Boolean).join(" ");
  const pairs = Object.entries(spec).filter(([key, value]) => key !== "partId" && value !== null && value !== undefined && value !== "");
  return pairs.slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(" / ");
}

function primarySpecValue(part) {
  const kind = categoryKind(getCategoryName(part.categoryId));
  const spec = kind ? getSpec(part.id, kind) : null;
  if (!spec) return null;
  if (kind === "resistor") return numberOrNull(spec.resistanceOhm);
  if (kind === "capacitor") return numberOrNull(spec.capacitanceF);
  if (kind === "inductor") return numberOrNull(spec.inductanceH);
  return null;
}

function specNumericField(part, field) {
  const kind = categoryKind(getCategoryName(part.categoryId));
  const spec = kind ? getSpec(part.id, kind) : null;
  return spec ? numberOrNull(spec[field]) : null;
}

function parseSpecFilterValue(value) {
  const raw = textValue(value);
  if (!raw) return null;
  const category = state.categoryFilter !== "all" ? getCategoryName(Number(state.categoryFilter)) : "";
  const kind = categoryKind(category);
  if (kind === "resistor") return parseResistance(raw);
  if (kind === "capacitor") return parseCapacitance(raw);
  if (kind === "inductor") return parseInductance(raw);
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
    attributes: [],
    projects: [],
    projectBom: [],
    partAliases: [],
    projectReservations: [],
    activityLog: []
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
  inv.projects = normalizeProjects(raw.projects || []);
  inv.projectBom = normalizeProjectBom(raw.projectBom || raw.project_bom || []);
  inv.partAliases = normalizePartAliases(raw.partAliases || raw.part_aliases || []);
  inv.projectReservations = normalizeProjectReservations(raw.projectReservations || raw.project_reservations || []);
  inv.activityLog = normalizeActivityLog(raw.activityLog || raw.activity_log || []);
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
  ["categories", "locations", "parts", "stock", "resistorSpecs", "capacitorSpecs", "inductorSpecs", "icSpecs", "keyswitchSpecs", "attributes", "projects", "projectBom", "partAliases", "projectReservations", "activityLog"].forEach((key) => {
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

function normalizeLocations(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    name: textValue(row.name) || "location",
    type: textValue(row.type) || "bin",
    parentId: row.parentId ?? row.parent_id ?? null,
    capacity: nullableNumber(row.capacity),
    x: nullableNumber(row.x),
    y: nullableNumber(row.y),
    z: nullableNumber(row.z),
    color: nullableText(row.color),
    ledNode: nullableText(row.ledNode ?? row.led_node),
    ledIndex: nullableNumber(row.ledIndex ?? row.led_index),
    networkTarget: nullableText(row.networkTarget ?? row.network_target),
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0);
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
  
  invalidateIndexes();
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

    const message = `inventory: update database ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    let sha = await githubTryGetSha(cfg);
    let result;

    try {
      result = await githubSaveBytes({ ...cfg, sha, bytes, message });
    } catch (error) {
      if (!isGithubConflict(error)) throw error;
      setStatus("github conflict; refreshing remote version...");
      sha = await githubTryGetSha(cfg);
      result = await githubSaveBytes({ ...cfg, sha, bytes, message });
    }

    state.githubSha = result.content?.sha || sha || state.githubSha;
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

function isGithubConflict(error) {
  return /(^|\D)409(\D|$)/.test(String(error && error.message ? error.message : error));
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



Object.assign(window, {
  filteredParts,
  stockSummary,
  specSummary,
  getSpec,
  categoryKind,
  getCategoryName,
  locationPath,
  getMetrics,
  createEmptyInventory,
  normalizeInventory,
  ensureInventoryShape,
  normalizeReferences,
  normalizeCategories,
  normalizeLocations,
  normalizeParts,
  normalizeStock,
  normalizeSpecs,
  normalizeAttributes,
  validateInventory,
  touchInventory,
  addOrUpdatePart,
  deletePart,
  saveSettingsFromForm,
  saveExternalApiSettings,
  loadFromGitHub,
  commitToGitHub,
  githubLoadBytes,
  githubTryGetSha,
  githubSaveBytes,
  githubRequest,
  encodePath
});

function normalizeProjects(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    name: textValue(row.name) || "project",
    revision: nullableText(row.revision),
    sourceFile: nullableText(row.sourceFile ?? row.source_file),
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || null,
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0);
}

function normalizeProjectBom(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    projectId: integerOrZero(row.projectId ?? row.project_id),
    partId: row.partId ?? row.part_id ?? null,
    value: nullableText(row.value),
    footprint: nullableText(row.footprint),
    mpn: nullableText(row.mpn),
    referencesText: nullableText(row.referencesText ?? row.references_text),
    quantity: integerOrZero(row.quantity ?? row.qty),
    fitted: row.fitted === 0 ? 0 : 1,
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.projectId > 0);
}

function saveVisibleColumns() {
  const columns = (state.visibleColumns || DEFAULT_PART_COLUMNS).filter((item, index, arr) => PART_COLUMN_DEFS[item] !== undefined && arr.indexOf(item) === index);
  state.visibleColumns = columns.length ? columns : DEFAULT_PART_COLUMNS.slice();
  localStorage.setItem(STORAGE.visibleColumns || "tmi.visibleColumns", JSON.stringify(state.visibleColumns));
  setStatus("parts columns updated");
}

function storageStats() {
  const byLocation = state.inventory.locations.map((location) => {
    const rows = state.inventory.stock.filter((row) => row.locationId === location.id);
    const quantity = rows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
    const capacity = numberOrZero(location.capacity);
    return { location, rows: rows.length, quantity, capacity, fill: capacity ? Math.min(100, Math.round(quantity / capacity * 100)) : null };
  });
  const orphanRows = state.inventory.stock.filter((row) => !row.locationId).length;
  return { byLocation, orphanRows };
}

function categoryStats() {
  const total = Math.max(1, state.inventory.parts.length);
  return state.inventory.categories
    .map((category) => ({ category, count: state.inventory.parts.filter((part) => part.categoryId === category.id).length }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.category.name.localeCompare(b.category.name))
    .map((row) => ({ ...row, percent: Math.round(row.count / total * 100) }));
}

function projectStats() {
  return {
    projects: state.inventory.projects?.length || 0,
    bomRows: state.inventory.projectBom?.length || 0,
    unresolved: (state.inventory.projectBom || []).filter((row) => !row.partId).length
  };
}

function highlightLocation(locationId) {
  const location = state.inventory.locations.find((item) => item.id === Number(locationId));
  if (!location) return;
  const payload = {
    id: location.id,
    path: locationPath(location.id),
    ledNode: location.ledNode || null,
    ledIndex: location.ledIndex ?? null,
    networkTarget: location.networkTarget || null
  };
  console.log("highlightLocation", payload);
  if (location.networkTarget) {
    fetch(location.networkTarget, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch((error) => console.warn("location highlight request failed", error));
  }
  toast(`highlight: ${locationPath(location.id)}`);
}


window.primarySpecValue = primarySpecValue;

window.parseSpecFilterValue = parseSpecFilterValue;

window.storageStats = storageStats;

window.categoryStats = categoryStats;

window.projectStats = projectStats;

window.highlightLocation = highlightLocation;

window.saveVisibleColumns = saveVisibleColumns;


function normalizePartAliases(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    partId: integerOrZero(row.partId ?? row.part_id),
    aliasType: nullableText(row.aliasType ?? row.alias_type),
    aliasValue: textValue(row.aliasValue ?? row.alias_value),
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.partId > 0 && row.aliasValue);
}

function normalizeProjectReservations(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    projectId: integerOrZero(row.projectId ?? row.project_id),
    partId: integerOrZero(row.partId ?? row.part_id),
    quantity: integerOrZero(row.quantity),
    locationId: row.locationId ?? row.location_id ?? null,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.projectId > 0 && row.partId > 0);
}

function normalizeActivityLog(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    action: textValue(row.action),
    entityType: nullableText(row.entityType ?? row.entity_type),
    entityId: row.entityId ?? row.entity_id ?? null,
    message: nullableText(row.message)
  })).filter((row) => row.id > 0 && row.action);
}

function logActivity(action, entityType, entityId, message) {
  state.inventory.activityLog = state.inventory.activityLog || [];
  state.inventory.activityLog.unshift({
    id: nextId(state.inventory.activityLog),
    createdAt: new Date().toISOString(),
    action,
    entityType: entityType || null,
    entityId: entityId || null,
    message: message || null
  });
  state.inventory.activityLog = state.inventory.activityLog.slice(0, 300);
}

function activeProject() {
  const projects = state.inventory.projects || [];
  if (!state.activeProjectId && projects.length) state.activeProjectId = projects[0].id;
  return projects.find((project) => project.id === Number(state.activeProjectId)) || projects[0] || null;
}

function projectBomRows(projectId) {
  return (state.inventory.projectBom || []).filter((row) => row.projectId === Number(projectId));
}

function reservationsForProject(projectId) {
  return (state.inventory.projectReservations || []).filter((row) => row.projectId === Number(projectId));
}

function reservedQuantity(partId, excludeProjectId = null) {
  return (state.inventory.projectReservations || [])
    .filter((row) => row.partId === Number(partId) && (excludeProjectId == null || row.projectId !== Number(excludeProjectId)))
    .reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
}

function projectReservedQuantity(projectId, partId) {
  return (state.inventory.projectReservations || [])
    .filter((row) => row.projectId === Number(projectId) && row.partId === Number(partId))
    .reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
}

function availableForPart(partId, excludeProjectId = null) {
  return stockSummary(partId).total - reservedQuantity(partId, excludeProjectId);
}

function bomRowStatus(row) {
  const partId = Number(row.partId || 0);
  const need = numberOrZero(row.quantity);
  if (!partId) return { matched: false, available: 0, reserved: 0, shortage: need, ok: false };
  const available = availableForPart(partId, row.projectId);
  const reserved = projectReservedQuantity(row.projectId, partId);
  const effective = available + reserved;
  const shortage = Math.max(0, need - effective);
  return { matched: true, available, reserved, shortage, ok: shortage === 0 };
}

function projectSummary(projectId) {
  const rows = projectBomRows(projectId);
  const needed = rows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const unresolved = rows.filter((row) => !row.partId).length;
  const shortageRows = rows.filter((row) => bomRowStatus(row).shortage > 0).length;
  const reserved = reservationsForProject(projectId).reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  return { rows: rows.length, needed, unresolved, shortageRows, reserved };
}

function findBestPartForBomRow(row) {
  const mpn = String(row.mpn || "").trim().toLowerCase();
  if (mpn) {
    const byMpn = state.inventory.parts.find((part) => String(part.mpn || "").trim().toLowerCase() === mpn);
    if (byMpn) return byMpn;
    const alias = (state.inventory.partAliases || []).find((item) => String(item.aliasValue || "").trim().toLowerCase() === mpn);
    if (alias) return state.inventory.parts.find((part) => part.id === alias.partId) || null;
  }
  const value = String(row.value || "").trim().toLowerCase();
  const footprint = String(row.footprint || "").trim().toLowerCase();
  return state.inventory.parts.find((part) => {
    const name = String(part.name || "").toLowerCase();
    const pkg = String(part.package || "").toLowerCase();
    const fp = String(part.footprint || "").toLowerCase();
    return (!value || name.includes(value)) && (!footprint || fp.includes(footprint) || pkg.includes(footprint));
  }) || null;
}

function autoMatchProject(projectId) {
  let matched = 0;
  projectBomRows(projectId).forEach((row) => {
    if (row.partId) return;
    const part = findBestPartForBomRow(row);
    if (part) {
      row.partId = part.id;
      row.notes = null;
      matched += 1;
    }
  });
  return matched;
}

function selectProject(projectId) {
  state.activeProjectId = Number(projectId) || 0;
  localStorage.setItem(STORAGE.activeProjectId || "tmi.activeProjectId", String(state.activeProjectId));
  if (state.activeView === "projects") $("#viewPanel").innerHTML = renderProjectsView();
}

function deleteProject(projectId) {
  const project = state.inventory.projects.find((item) => item.id === Number(projectId));
  if (!project) return;
  if (!confirm(`Delete project "${project.name}" and its BOM?`)) return;
  state.inventory.projects = state.inventory.projects.filter((item) => item.id !== project.id);
  state.inventory.projectBom = state.inventory.projectBom.filter((row) => row.projectId !== project.id);
  state.inventory.projectReservations = state.inventory.projectReservations.filter((row) => row.projectId !== project.id);
  logActivity("delete-project", "project", project.id, project.name);
  touchInventory();
  if (!persistDatabase("project deleted", { dirty: true })) return;
  state.activeProjectId = state.inventory.projects[0]?.id || 0;
  render();
}

function matchBomRow(rowId) {
  const row = state.inventory.projectBom.find((item) => item.id === Number(rowId));
  if (!row) return;
  const part = findBestPartForBomRow(row);
  if (!part) {
    toast("no matching part found", "error");
    return;
  }
  row.partId = part.id;
  row.notes = null;
  logActivity("match-bom-row", "project_bom", row.id, `${row.value || ""} -> ${part.name}`);
  touchInventory();
  if (!persistDatabase("BOM row matched", { dirty: true })) return;
  render();
}

function unlinkBomRow(rowId) {
  const row = state.inventory.projectBom.find((item) => item.id === Number(rowId));
  if (!row) return;
  row.partId = null;
  row.notes = "unresolved";
  touchInventory();
  if (!persistDatabase("BOM row unlinked", { dirty: true })) return;
  render();
}

function deleteBomRow(rowId) {
  const row = state.inventory.projectBom.find((item) => item.id === Number(rowId));
  if (!row) return;
  state.inventory.projectBom = state.inventory.projectBom.filter((item) => item.id !== row.id);
  touchInventory();
  if (!persistDatabase("BOM row deleted", { dirty: true })) return;
  render();
}

function reserveProjectParts(projectId) {
  const project = state.inventory.projects.find((item) => item.id === Number(projectId));
  if (!project) return;
  releaseProjectReservations(projectId, { silent: true });
  const reservations = [];
  for (const row of projectBomRows(projectId)) {
    if (!row.partId || row.fitted === 0) continue;
    const need = numberOrZero(row.quantity);
    if (need <= 0) continue;
    const available = availableForPart(row.partId, projectId);
    const qty = Math.min(need, Math.max(0, available));
    if (qty > 0) {
      reservations.push({
        id: nextId(state.inventory.projectReservations.concat(reservations)),
        projectId: Number(projectId),
        partId: Number(row.partId),
        quantity: qty,
        locationId: null,
        createdAt: new Date().toISOString(),
        notes: "auto reservation"
      });
    }
  }
  state.inventory.projectReservations.push(...reservations);
  logActivity("reserve-project", "project", project.id, `${reservations.length} reservation rows`);
  touchInventory();
  if (!persistDatabase("project parts reserved", { dirty: true })) return;
  render();
}

function releaseProjectReservations(projectId, options = {}) {
  state.inventory.projectReservations = (state.inventory.projectReservations || []).filter((row) => row.projectId !== Number(projectId));
  if (!options.silent) {
    logActivity("release-project", "project", projectId, "reservations released");
    touchInventory();
    if (!persistDatabase("project reservations released", { dirty: true })) return;
    render();
  }
}

function applyProjectConsumption(projectId) {
  const rows = reservationsForProject(projectId);
  if (!rows.length) {
    toast("no reservations to consume", "error");
    return;
  }
  if (!confirm("Subtract reserved quantities from stock?")) return;
  for (const reservation of rows) {
    let remaining = numberOrZero(reservation.quantity);
    const stockRows = state.inventory.stock.filter((row) => row.partId === reservation.partId && row.quantity > 0);
    for (const stock of stockRows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, numberOrZero(stock.quantity));
      stock.quantity = numberOrZero(stock.quantity) - take;
      remaining -= take;
    }
  }
  state.inventory.projectReservations = state.inventory.projectReservations.filter((row) => row.projectId !== Number(projectId));
  logActivity("consume-project", "project", projectId, "stock consumed from reservations");
  touchInventory();
  if (!persistDatabase("project stock consumed", { dirty: true })) return;
  render();
}


window.activeProject = activeProject;
window.projectBomRows = projectBomRows;
window.reservationsForProject = reservationsForProject;
window.availableForPart = availableForPart;
window.bomRowStatus = bomRowStatus;
window.projectSummary = projectSummary;
window.findBestPartForBomRow = findBestPartForBomRow;
window.autoMatchProject = autoMatchProject;
window.selectProject = selectProject;
window.deleteProject = deleteProject;
window.matchBomRow = matchBomRow;
window.unlinkBomRow = unlinkBomRow;
window.deleteBomRow = deleteBomRow;
window.reserveProjectParts = reserveProjectParts;
window.releaseProjectReservations = releaseProjectReservations;
window.applyProjectConsumption = applyProjectConsumption;
window.logActivity = logActivity;
window.invalidateIndexes = invalidateIndexes;

window.rebuildIndexes = rebuildIndexes;
