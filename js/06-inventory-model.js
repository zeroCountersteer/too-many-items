"use strict";

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
