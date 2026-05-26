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

function stockRowsForPart(partId, locationId = undefined) {
  const rows = (state.inventory.stock || []).filter((row) => row.partId === Number(partId));
  if (locationId === undefined) return rows;
  const normalizedLocation = locationId === null || locationId === "" ? null : Number(locationId);
  return rows.filter((row) => (row.locationId ?? null) === normalizedLocation);
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
    schemaVersion: 22,
    meta: {
      app: "too-many-items",
      createdAt: now,
      updatedAt: now,
      defaultCurrency: "USD"
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
    projectSources: [],
    projectPlacements: [],
    projectBuildSessions: [],
    projectBuildSteps: [],
    partAliases: [],
    projectReservations: [],
    stockMovements: [],
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
  inv.projectSources = normalizeProjectSources(raw.projectSources || raw.project_sources || []);
  inv.projectPlacements = normalizeProjectPlacements(raw.projectPlacements || raw.project_placements || []);
  inv.projectBuildSessions = normalizeProjectBuildSessions(raw.projectBuildSessions || raw.project_build_sessions || []);
  inv.projectBuildSteps = normalizeProjectBuildSteps(raw.projectBuildSteps || raw.project_build_steps || []);
  inv.partAliases = normalizePartAliases(raw.partAliases || raw.part_aliases || []);
  inv.projectReservations = normalizeProjectReservations(raw.projectReservations || raw.project_reservations || []);
  inv.stockMovements = normalizeStockMovements(raw.stockMovements || raw.stock_movements || []);
  inv.activityLog = normalizeActivityLog(raw.activityLog || raw.activity_log || []);
  ensureInventoryShape(inv);
  normalizeReferences(inv);
  return inv;
}

function ensureInventoryShape(inv) {
  inv.schemaVersion = Math.max(22, Number(inv.schemaVersion || 1));
  inv.meta = inv.meta || {};
  inv.meta.app = inv.meta.app || "too-many-items";
  inv.meta.createdAt = inv.meta.createdAt || new Date().toISOString();
  inv.meta.updatedAt = inv.meta.updatedAt || inv.meta.createdAt;
  inv.meta.defaultCurrency = normalizeCurrency(inv.meta.defaultCurrency || "USD");
  ["categories", "locations", "parts", "stock", "resistorSpecs", "capacitorSpecs", "inductorSpecs", "icSpecs", "keyswitchSpecs", "attributes", "projects", "projectBom", "projectSources", "projectPlacements", "projectBuildSessions", "projectBuildSteps", "partAliases", "projectReservations", "stockMovements", "activityLog"].forEach((key) => {
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
  const locationIds = new Set(inv.locations.map((location) => location.id));
  const projectIds = new Set(inv.projects.map((project) => project.id));

  inv.locations.forEach((location) => {
    if (location.parentId !== null && location.parentId !== undefined && !locationIds.has(location.parentId)) location.parentId = null;
  });

  inv.stock = inv.stock.filter((row) => partIds.has(row.partId));
  inv.stock.forEach((row) => {
    if (row.locationId !== null && row.locationId !== undefined && !locationIds.has(row.locationId)) row.locationId = null;
  });
  inv.attributes = inv.attributes.filter((row) => partIds.has(row.partId));
  Object.values(SPEC_CONFIGS).forEach((config) => {
    inv[config.table] = inv[config.table].filter((row) => partIds.has(row.partId));
  });
  inv.projectBom = inv.projectBom.filter((row) => projectIds.has(row.projectId));
  inv.projectBom.forEach((row) => {
    if (row.partId !== null && row.partId !== undefined && !partIds.has(row.partId)) row.partId = null;
  });
  const bomRowIds = new Set((inv.projectBom || []).map((row) => row.id));
  inv.projectSources = (inv.projectSources || []).filter((row) => projectIds.has(row.projectId));
  inv.projectPlacements = (inv.projectPlacements || []).filter((row) => projectIds.has(row.projectId));
  inv.projectPlacements.forEach((row) => {
    if (row.bomRowId !== null && row.bomRowId !== undefined && !bomRowIds.has(row.bomRowId)) row.bomRowId = null;
  });
  const placementIds = new Set((inv.projectPlacements || []).map((row) => row.id));
  inv.projectBuildSessions = (inv.projectBuildSessions || []).filter((row) => projectIds.has(row.projectId));
  const sessionIds = new Set((inv.projectBuildSessions || []).map((row) => row.id));
  inv.projectBuildSteps = (inv.projectBuildSteps || []).filter((row) => projectIds.has(row.projectId) && sessionIds.has(row.sessionId));
  inv.projectBuildSteps.forEach((row) => {
    if (row.placementId !== null && row.placementId !== undefined && !placementIds.has(row.placementId)) row.placementId = null;
    if (row.bomRowId !== null && row.bomRowId !== undefined && !bomRowIds.has(row.bomRowId)) row.bomRowId = null;
  });
  inv.partAliases = inv.partAliases.filter((row) => partIds.has(row.partId));
  inv.projectReservations = inv.projectReservations.filter((row) => projectIds.has(row.projectId) && partIds.has(row.partId));
  inv.projectReservations.forEach((row) => {
    if (row.locationId !== null && row.locationId !== undefined && !locationIds.has(row.locationId)) row.locationId = null;
  });
  inv.stockMovements = inv.stockMovements.filter((row) => partIds.has(row.partId));
  inv.stockMovements.forEach((row) => {
    if (row.fromLocationId !== null && row.fromLocationId !== undefined && !locationIds.has(row.fromLocationId)) row.fromLocationId = null;
    if (row.toLocationId !== null && row.toLocationId !== undefined && !locationIds.has(row.toLocationId)) row.toLocationId = null;
    if (row.projectId !== null && row.projectId !== undefined && !projectIds.has(row.projectId)) row.projectId = null;
    if (row.bomRowId !== null && row.bomRowId !== undefined && !bomRowIds.has(row.bomRowId)) row.bomRowId = null;
    if (row.buildSessionId !== null && row.buildSessionId !== undefined && !sessionIds.has(row.buildSessionId)) row.buildSessionId = null;
    if (row.placementId !== null && row.placementId !== undefined && !placementIds.has(row.placementId)) row.placementId = null;
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
    parentId: nullableNumber(row.parentId ?? row.parent_id),
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
    currency: item.currency ? normalizeCurrency(item.currency) : null,
    dateAdded: item.dateAdded ?? item.date_added ?? new Date().toISOString().slice(0, 10),
    notes: nullableText(item.notes)
  })).filter((item) => Number.isFinite(item.partId));
}

function normalizeCurrency(value, fallback = null) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return fallback;
  return raw.replace(/[^A-Z0-9]/g, "").slice(0, 8) || fallback;
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
  const projectIds = new Set((inv.projects || []).map((project) => project.id));
  const bomRowIds = new Set((inv.projectBom || []).map((row) => row.id));
  const placementIds = new Set((inv.projectPlacements || []).map((row) => row.id));
  const sessionIds = new Set((inv.projectBuildSessions || []).map((row) => row.id));

  inv.parts.forEach((part) => {
    if (!part.name) errors.push(`part ${part.id} has no name`);
    if (!categoryIds.has(part.categoryId)) errors.push(`part ${part.id} references missing category ${part.categoryId}`);
  });

  inv.stock.forEach((row) => {
    if (!partIds.has(row.partId)) errors.push(`stock row ${row.id} references missing part ${row.partId}`);
    if (row.locationId !== null && row.locationId !== undefined && !locationIds.has(row.locationId)) errors.push(`stock row ${row.id} references missing location ${row.locationId}`);
    if (row.quantity < 0) errors.push(`stock row ${row.id} has negative quantity`);
    if (row.unitPrice !== null && row.unitPrice !== undefined && Number(row.unitPrice) < 0) errors.push(`stock row ${row.id} has negative unit price`);
  });

  inv.locations.forEach((location) => {
    if (location.parentId !== null && location.parentId !== undefined && !locationIds.has(location.parentId)) errors.push(`location ${location.id} references missing parent ${location.parentId}`);
    if (location.parentId === location.id) errors.push(`location ${location.id} cannot be its own parent`);
  });

  Object.values(SPEC_CONFIGS).forEach((config) => {
    (inv[config.table] || []).forEach((row) => {
      if (!partIds.has(row.partId)) errors.push(`${config.table} row references missing part ${row.partId}`);
    });
  });

  (inv.attributes || []).forEach((row) => {
    if (!partIds.has(row.partId)) errors.push(`attribute ${row.name || ""} references missing part ${row.partId}`);
  });

  (inv.projects || []).forEach((project) => {
    if (!project.name) errors.push(`project ${project.id} has no name`);
  });

  (inv.projectBom || []).forEach((row) => {
    if (!projectIds.has(row.projectId)) errors.push(`BOM row ${row.id} references missing project ${row.projectId}`);
    if (row.partId !== null && row.partId !== undefined && !partIds.has(row.partId)) errors.push(`BOM row ${row.id} references missing part ${row.partId}`);
    if (row.quantity < 0) errors.push(`BOM row ${row.id} has negative quantity`);
  });

  (inv.projectSources || []).forEach((row) => {
    if (!projectIds.has(row.projectId)) errors.push(`project source ${row.id} references missing project ${row.projectId}`);
    if (!row.fileName) errors.push(`project source ${row.id} has no file name`);
  });

  (inv.projectPlacements || []).forEach((row) => {
    if (!projectIds.has(row.projectId)) errors.push(`placement ${row.id} references missing project ${row.projectId}`);
    if (row.bomRowId !== null && row.bomRowId !== undefined && !bomRowIds.has(row.bomRowId)) errors.push(`placement ${row.id} references missing BOM row ${row.bomRowId}`);
    if (!row.reference) errors.push(`placement ${row.id} has no reference`);
  });

  (inv.projectBuildSessions || []).forEach((row) => {
    if (!projectIds.has(row.projectId)) errors.push(`build session ${row.id} references missing project ${row.projectId}`);
    if (!row.name) errors.push(`build session ${row.id} has no name`);
    if (row.buildQuantity < 0) errors.push(`build session ${row.id} has negative build quantity`);
  });

  (inv.projectBuildSteps || []).forEach((row) => {
    if (!sessionIds.has(row.sessionId)) errors.push(`build step ${row.id} references missing session ${row.sessionId}`);
    if (!projectIds.has(row.projectId)) errors.push(`build step ${row.id} references missing project ${row.projectId}`);
    if (row.placementId !== null && row.placementId !== undefined && !placementIds.has(row.placementId)) errors.push(`build step ${row.id} references missing placement ${row.placementId}`);
    if (row.bomRowId !== null && row.bomRowId !== undefined && !bomRowIds.has(row.bomRowId)) errors.push(`build step ${row.id} references missing BOM row ${row.bomRowId}`);
    if (!["pending", "done", "skipped"].includes(row.status || "pending")) errors.push(`build step ${row.id} has invalid status ${row.status}`);
    if (row.takenQuantity < 0) errors.push(`build step ${row.id} has negative taken quantity`);
  });

  (inv.partAliases || []).forEach((row) => {
    if (!partIds.has(row.partId)) errors.push(`part alias ${row.id} references missing part ${row.partId}`);
    if (!row.aliasValue) errors.push(`part alias ${row.id} has no value`);
  });

  (inv.projectReservations || []).forEach((row) => {
    if (!projectIds.has(row.projectId)) errors.push(`reservation ${row.id} references missing project ${row.projectId}`);
    if (!partIds.has(row.partId)) errors.push(`reservation ${row.id} references missing part ${row.partId}`);
    if (row.locationId !== null && row.locationId !== undefined && !locationIds.has(row.locationId)) errors.push(`reservation ${row.id} references missing location ${row.locationId}`);
    if (row.quantity < 0) errors.push(`reservation ${row.id} has negative quantity`);
  });

  (inv.stockMovements || []).forEach((row) => {
    if (!partIds.has(row.partId)) errors.push(`stock movement ${row.id} references missing part ${row.partId}`);
    if (!["move", "take", "adjust", "project-consume"].includes(row.movementType)) errors.push(`stock movement ${row.id} has invalid type ${row.movementType}`);
    if (row.fromLocationId !== null && row.fromLocationId !== undefined && !locationIds.has(row.fromLocationId)) errors.push(`stock movement ${row.id} references missing source location ${row.fromLocationId}`);
    if (row.toLocationId !== null && row.toLocationId !== undefined && !locationIds.has(row.toLocationId)) errors.push(`stock movement ${row.id} references missing destination location ${row.toLocationId}`);
    if (row.projectId !== null && row.projectId !== undefined && !projectIds.has(row.projectId)) errors.push(`stock movement ${row.id} references missing project ${row.projectId}`);
    if (row.bomRowId !== null && row.bomRowId !== undefined && !bomRowIds.has(row.bomRowId)) errors.push(`stock movement ${row.id} references missing BOM row ${row.bomRowId}`);
    if (row.buildSessionId !== null && row.buildSessionId !== undefined && !sessionIds.has(row.buildSessionId)) errors.push(`stock movement ${row.id} references missing build session ${row.buildSessionId}`);
    if (row.placementId !== null && row.placementId !== undefined && !placementIds.has(row.placementId)) errors.push(`stock movement ${row.id} references missing placement ${row.placementId}`);
    if (row.quantity < 0) errors.push(`stock movement ${row.id} has negative quantity`);
  });

  (inv.activityLog || []).forEach((row) => {
    if (!row.action) errors.push(`activity log row ${row.id} has no action`);
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
  state.inventory.meta.defaultCurrency = normalizeCurrency(fd.get("defaultCurrency"), "USD");
  touchInventory();
  persistDatabase("settings saved", { dirty: true });
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
  state.inventory.meta.defaultCurrency = normalizeCurrency(fd.get("defaultCurrency"), state.inventory.meta.defaultCurrency || "USD");
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
function normalizeProjects(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    name: textValue(row.name) || "project",
    revision: nullableText(row.revision),
    sourceFile: nullableText(row.sourceFile ?? row.source_file),
    status: nullableText(row.status) || "active",
    targetQuantity: integerOrZero(row.targetQuantity ?? row.target_quantity) || 1,
    dueDate: nullableText(row.dueDate ?? row.due_date),
    owner: nullableText(row.owner),
    tags: nullableText(Array.isArray(row.tags) ? row.tags.join(", ") : row.tags),
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || null,
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0);
}

function normalizeProjectBom(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    projectId: integerOrZero(row.projectId ?? row.project_id),
    partId: nullableNumber(row.partId ?? row.part_id),
    value: nullableText(row.value),
    footprint: nullableText(row.footprint),
    mpn: nullableText(row.mpn),
    referencesText: nullableText(row.referencesText ?? row.references_text),
    quantity: integerOrZero(row.quantity ?? row.qty),
    fitted: row.fitted === 0 ? 0 : 1,
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.projectId > 0);
}

function normalizeProjectSources(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    projectId: integerOrZero(row.projectId ?? row.project_id),
    fileName: textValue(row.fileName ?? row.file_name),
    fileType: nullableText(row.fileType ?? row.file_type),
    fileHash: nullableText(row.fileHash ?? row.file_hash),
    importedAt: row.importedAt || row.imported_at || new Date().toISOString(),
    parserVersion: nullableText(row.parserVersion ?? row.parser_version),
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.projectId > 0 && row.fileName);
}

function normalizeProjectPlacements(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    projectId: integerOrZero(row.projectId ?? row.project_id),
    bomRowId: nullableNumber(row.bomRowId ?? row.bom_row_id),
    reference: textValue(row.reference ?? row.ref),
    sourceUuid: nullableText(row.sourceUuid ?? row.source_uuid),
    side: ["top", "bottom", "unknown"].includes(textValue(row.side)) ? textValue(row.side) : "unknown",
    xMm: nullableNumber(row.xMm ?? row.x_mm),
    yMm: nullableNumber(row.yMm ?? row.y_mm),
    rotation: nullableNumber(row.rotation),
    value: nullableText(row.value),
    footprint: nullableText(row.footprint),
    mpn: nullableText(row.mpn),
    manufacturer: nullableText(row.manufacturer),
    dnp: row.dnp === 1 || row.dnp === true ? 1 : 0,
    boundingJson: nullableText(row.boundingJson ?? row.bounding_json),
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.projectId > 0 && row.reference);
}

function normalizeProjectBuildSessions(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    projectId: integerOrZero(row.projectId ?? row.project_id),
    name: textValue(row.name) || "build session",
    status: nullableText(row.status) || "active",
    buildQuantity: integerOrZero(row.buildQuantity ?? row.build_quantity) || 1,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at || null,
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.projectId > 0);
}

function normalizeProjectBuildSteps(rows) {
  return (rows || []).map((row) => ({
    id: integerOrZero(row.id),
    sessionId: integerOrZero(row.sessionId ?? row.session_id),
    projectId: integerOrZero(row.projectId ?? row.project_id),
    placementId: nullableNumber(row.placementId ?? row.placement_id),
    bomRowId: nullableNumber(row.bomRowId ?? row.bom_row_id),
    reference: textValue(row.reference ?? row.ref),
    status: ["pending", "done", "skipped"].includes(textValue(row.status)) ? textValue(row.status) : "pending",
    takenQuantity: integerOrZero(row.takenQuantity ?? row.taken_quantity),
    completedAt: row.completedAt || row.completed_at || null,
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.sessionId > 0 && row.projectId > 0 && row.reference);
}

function saveVisibleColumns() {
  state.visibleColumns = normalizeVisibleColumns(state.visibleColumns);
  localStorage.setItem(STORAGE.visibleColumns, JSON.stringify(state.visibleColumns));
  setStatus("parts columns updated");
}

function resetVisibleColumns() {
  state.visibleColumns = DEFAULT_PART_COLUMNS.slice();
  localStorage.setItem(STORAGE.visibleColumns, JSON.stringify(state.visibleColumns));
  setStatus("parts columns reset");
  renderPartsViewOnly();
}

function normalizeVisibleColumns(columns) {
  const source = Array.isArray(columns) && columns.length ? columns : DEFAULT_PART_COLUMNS;
  const unique = source.filter((item, index, arr) => PART_COLUMN_DEFS[item] !== undefined && arr.indexOf(item) === index && item !== "actions");
  unique.push("actions");
  return unique.length > 1 ? unique : DEFAULT_PART_COLUMNS.slice();
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
    locationId: nullableNumber(row.locationId ?? row.location_id),
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    notes: nullableText(row.notes)
  })).filter((row) => row.id > 0 && row.projectId > 0 && row.partId > 0);
}

function normalizeStockMovements(rows) {
  const allowed = new Set(["move", "take", "adjust", "project-consume"]);
  return (rows || []).map((row) => {
    const movementType = textValue(row.movementType ?? row.movement_type);
    return {
      id: integerOrZero(row.id),
      movementType: allowed.has(movementType) ? movementType : "adjust",
      partId: integerOrZero(row.partId ?? row.part_id),
      fromLocationId: nullableNumber(row.fromLocationId ?? row.from_location_id),
      toLocationId: nullableNumber(row.toLocationId ?? row.to_location_id),
      quantity: integerOrZero(row.quantity),
      projectId: nullableNumber(row.projectId ?? row.project_id),
      bomRowId: nullableNumber(row.bomRowId ?? row.bom_row_id),
      buildSessionId: nullableNumber(row.buildSessionId ?? row.build_session_id),
      placementId: nullableNumber(row.placementId ?? row.placement_id),
      createdAt: row.createdAt || row.created_at || new Date().toISOString(),
      notes: nullableText(row.notes)
    };
  }).filter((row) => row.id > 0 && row.partId > 0);
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

function defaultCurrency() {
  const currency = normalizeCurrency(state.inventory.meta?.defaultCurrency, "USD");
  state.inventory.meta.defaultCurrency = currency;
  return currency;
}

function stockCurrency(row) {
  return normalizeCurrency(row?.currency, defaultCurrency());
}

function formatMoney(value, currency = defaultCurrency()) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${normalizeCurrency(currency, defaultCurrency())} ${trimMoney(number)}`;
}

function trimMoney(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}

function recordStockMovement(input) {
  const quantity = integerOrZero(input.quantity);
  if (quantity <= 0) return null;
  state.inventory.stockMovements = state.inventory.stockMovements || [];
  const movement = {
    id: nextId(state.inventory.stockMovements),
    movementType: ["move", "take", "adjust", "project-consume"].includes(input.movementType) ? input.movementType : "adjust",
    partId: Number(input.partId),
    fromLocationId: input.fromLocationId === undefined ? null : nullableNumber(input.fromLocationId),
    toLocationId: input.toLocationId === undefined ? null : nullableNumber(input.toLocationId),
    quantity,
    projectId: input.projectId === undefined ? null : nullableNumber(input.projectId),
    bomRowId: input.bomRowId === undefined ? null : nullableNumber(input.bomRowId),
    buildSessionId: input.buildSessionId === undefined ? null : nullableNumber(input.buildSessionId),
    placementId: input.placementId === undefined ? null : nullableNumber(input.placementId),
    createdAt: input.createdAt || new Date().toISOString(),
    notes: nullableText(input.notes)
  };
  state.inventory.stockMovements.unshift(movement);
  state.inventory.stockMovements = state.inventory.stockMovements.slice(0, 1000);
  return movement;
}

function stockLotSignature(row, locationId) {
  return [
    row.partId,
    locationId ?? null,
    row.source || "",
    row.orderNumber || "",
    row.unitPrice ?? "",
    row.currency || "",
    row.dateAdded || "",
    row.notes || ""
  ].join("|");
}

function findMergeableStockRow(template, locationId, excludeId = null) {
  const signature = stockLotSignature(template, locationId);
  return (state.inventory.stock || []).find((row) =>
    row.id !== excludeId &&
    row.partId === Number(template.partId) &&
    stockLotSignature(row, row.locationId ?? null) === signature
  ) || null;
}

function createDestinationStockRow(source, locationId) {
  const row = {
    ...source,
    id: nextId(state.inventory.stock || []),
    locationId: locationId ?? null,
    quantity: 0,
    minQuantity: 0
  };
  state.inventory.stock.push(row);
  return row;
}

function moveStockFromRows(partId, fromLocationId, toLocationId, options = {}) {
  const fromAny = fromLocationId === undefined || fromLocationId === "any";
  const fromId = fromAny ? undefined : (fromLocationId === "" ? null : nullableNumber(fromLocationId));
  const toId = toLocationId === "" || toLocationId === undefined ? null : nullableNumber(toLocationId);
  if (!fromAny && (fromId ?? null) === (toId ?? null)) return { ok: false, error: "source and destination are the same", changed: 0, quantity: 0 };
  const candidates = stockRowsForPart(partId, fromId).filter((row) => numberOrZero(row.quantity) > 0 && ((row.locationId ?? null) !== (toId ?? null)));
  const total = candidates.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const requested = options.all ? total : integerOrZero(options.quantity);
  if (requested <= 0) return { ok: false, error: "quantity is required", changed: 0, quantity: 0 };
  if (total < requested) return { ok: false, error: `only ${total} available`, changed: 0, quantity: 0 };

  let remaining = requested;
  let changed = 0;
  let moved = 0;
  for (const source of candidates) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, numberOrZero(source.quantity));
    const target = findMergeableStockRow(source, toId, source.id) || createDestinationStockRow(source, toId);
    source.quantity = numberOrZero(source.quantity) - qty;
    target.quantity = numberOrZero(target.quantity) + qty;
    remaining -= qty;
    moved += qty;
    changed += 1;
    recordStockMovement({
      movementType: "move",
      partId,
      fromLocationId: source.locationId ?? null,
      toLocationId: toId,
      quantity: qty,
      notes: options.notes || `bulk move to ${toId ? locationPath(toId) : "no location"}`
    });
  }
  return { ok: true, changed, quantity: moved };
}

function moveStockLotToLocation(stockRowId, toLocationId, quantity, options = {}) {
  const source = state.inventory.stock.find((row) => row.id === Number(stockRowId));
  if (!source) return { ok: false, error: "stock row not found", changed: 0, quantity: 0 };
  const toId = toLocationId === "" || toLocationId === undefined ? null : nullableNumber(toLocationId);
  if ((source.locationId ?? null) === (toId ?? null)) return { ok: false, error: "source and destination are the same", changed: 0, quantity: 0 };
  const qty = integerOrZero(quantity);
  if (qty <= 0) return { ok: false, error: "quantity is required", changed: 0, quantity: 0 };
  if (numberOrZero(source.quantity) < qty) return { ok: false, error: `only ${numberOrZero(source.quantity)} available`, changed: 0, quantity: 0 };
  const target = findMergeableStockRow(source, toId, source.id) || createDestinationStockRow(source, toId);
  source.quantity = numberOrZero(source.quantity) - qty;
  target.quantity = numberOrZero(target.quantity) + qty;
  recordStockMovement({
    movementType: "move",
    partId: source.partId,
    fromLocationId: source.locationId ?? null,
    toLocationId: toId,
    quantity: qty,
    notes: options.notes || `move stock lot to ${toId ? locationPath(toId) : "no location"}`
  });
  return { ok: true, changed: 1, quantity: qty };
}

function takeStock(partId, options = {}) {
  const sourceId = options.locationId === undefined || options.locationId === "" ? undefined : nullableNumber(options.locationId);
  const candidates = stockRowsForPart(partId, sourceId).filter((row) => numberOrZero(row.quantity) > 0);
  const total = candidates.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const requested = options.all ? total : integerOrZero(options.quantity);
  if (requested <= 0) return { ok: false, error: "quantity is required", changed: 0, quantity: 0 };
  if (total < requested) return { ok: false, error: `only ${total} available`, changed: 0, quantity: 0 };

  let remaining = requested;
  let changed = 0;
  let taken = 0;
  for (const source of candidates) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, numberOrZero(source.quantity));
    source.quantity = numberOrZero(source.quantity) - qty;
    remaining -= qty;
    taken += qty;
    changed += 1;
    recordStockMovement({
      movementType: options.movementType || "take",
      partId,
      fromLocationId: source.locationId ?? null,
      toLocationId: null,
      quantity: qty,
      projectId: options.projectId ?? null,
      bomRowId: options.bomRowId ?? null,
      buildSessionId: options.buildSessionId ?? null,
      placementId: options.placementId ?? null,
      notes: options.notes || null
    });
  }
  return { ok: true, changed, quantity: taken };
}

function setStockRowsMin(partIds, minQuantity) {
  const ids = new Set(partIds.map(Number));
  let changed = 0;
  (state.inventory.stock || []).forEach((row) => {
    if (!ids.has(row.partId)) return;
    row.minQuantity = integerOrZero(minQuantity);
    changed += 1;
  });
  return changed;
}

function setStockRowsSource(partIds, source) {
  const ids = new Set(partIds.map(Number));
  let changed = 0;
  (state.inventory.stock || []).forEach((row) => {
    if (!ids.has(row.partId)) return;
    row.source = nullableText(source);
    changed += 1;
  });
  return changed;
}

function setStockRowsPrice(partIds, unitPrice, currency) {
  const ids = new Set(partIds.map(Number));
  const price = nullableNumber(unitPrice);
  const code = normalizeCurrency(currency || defaultCurrency(), defaultCurrency());
  let changed = 0;
  (state.inventory.stock || []).forEach((row) => {
    if (!ids.has(row.partId)) return;
    row.unitPrice = price;
    row.currency = price == null ? null : code;
    changed += 1;
  });
  return changed;
}

function partPriceInfo(partId) {
  const currency = defaultCurrency();
  const priced = stockRowsForPart(partId)
    .filter((row) => numberOrZero(row.quantity) > 0 && row.unitPrice !== null && row.unitPrice !== undefined && Number.isFinite(Number(row.unitPrice)));
  const currencies = [...new Set(priced.map(stockCurrency))];
  const defaultRows = priced.filter((row) => stockCurrency(row) === currency);
  const pricedQuantity = defaultRows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const totalValue = defaultRows.reduce((sum, row) => sum + numberOrZero(row.quantity) * Number(row.unitPrice), 0);
  const unitPrice = pricedQuantity > 0 ? totalValue / pricedQuantity : null;
  return {
    currency,
    unitPrice,
    pricedQuantity,
    pricedRows: defaultRows.length,
    totalStock: stockSummary(partId).total,
    missingPrice: defaultRows.length === 0,
    mixedCurrency: currencies.some((code) => code !== currency),
    currencies
  };
}

function bomRowCost(row) {
  if (!row.partId || row.fitted === 0) return { unitPrice: null, total: null, currency: defaultCurrency(), missing: !!row.partId, mixedCurrency: false };
  const price = partPriceInfo(row.partId);
  const quantity = integerOrZero(row.quantity);
  return {
    ...price,
    total: price.unitPrice == null ? null : price.unitPrice * quantity,
    missing: price.unitPrice == null
  };
}

function projectCostSummary(projectId) {
  const rows = projectBomRows(projectId).filter((row) => row.fitted !== 0);
  let total = 0;
  let pricedRows = 0;
  let missingPriceRows = 0;
  let mixedCurrencyRows = 0;
  rows.forEach((row) => {
    const cost = bomRowCost(row);
    if (cost.mixedCurrency) mixedCurrencyRows += 1;
    if (cost.total == null) {
      if (row.partId) missingPriceRows += 1;
      return;
    }
    total += cost.total;
    pricedRows += 1;
  });
  return { total, currency: defaultCurrency(), pricedRows, missingPriceRows, mixedCurrencyRows };
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
  if (row.fitted === 0) return { matched: !!partId, available: 0, reserved: 0, shortage: 0, ok: true, dnp: true };
  if (!partId) return { matched: false, available: 0, reserved: 0, shortage: need, ok: false };
  const available = availableForPart(partId, row.projectId);
  const reserved = projectReservedQuantity(row.projectId, partId);
  const effective = available + reserved;
  const shortage = Math.max(0, need - effective);
  return { matched: true, available, reserved, shortage, ok: shortage === 0 };
}

function projectSummary(projectId) {
  const rows = projectBomRows(projectId);
  const activeRows = rows.filter((row) => row.fitted !== 0);
  const needed = activeRows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const unresolved = activeRows.filter((row) => !row.partId).length;
  const shortageRows = activeRows.filter((row) => bomRowStatus(row).shortage > 0).length;
  const reserved = reservationsForProject(projectId).reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  return { rows: rows.length, needed, unresolved, shortageRows, reserved, dnpRows: rows.length - activeRows.length };
}

function findBestPartForBomRow(row) {
  const best = getBomMatchCandidates(row, { limit: 1 })[0];
  return best && ["exact", "strong"].includes(best.confidence) ? best.part : null;
}

function getBomMatchCandidates(row, options = {}) {
  const ctx = bomMatchContext(row);
  const limit = Number(options.limit || 6);
  const candidates = state.inventory.parts
    .map((part) => scorePartForBomCandidate(part, ctx))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.available - a.available || a.part.id - b.part.id)
    .slice(0, limit);
  return candidates.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    confidence: candidateConfidence(candidate, ctx),
    rowWarnings: ctx.warnings
  }));
}

function bomMatchContext(row) {
  const value = textValue(row.value || row.designation || row.name);
  const footprint = textValue(row.footprint || row.package);
  const references = textValue(row.referencesText || row.references || row.ref || row.refs);
  const kind = inferBomKind({ value, footprint, references });
  const parsedValue = parseBomElectricalValue(kind, value);
  const packageToken = extractPackageToken([footprint, value].join(" "));
  const warnings = [];
  if (!kind && (value || footprint || references)) warnings.push("type not inferred");
  if (kind && parsedValue == null) warnings.push("value not parsed");
  if (!packageToken && footprint) warnings.push("package not normalized");
  return {
    row,
    value,
    valueNorm: normalizeMatchText(value),
    footprint,
    footprintNorm: normalizeMatchText(footprint),
    references,
    kind,
    packageToken,
    parsedValue,
    voltage: parseBomVoltage(value),
    warnings
  };
}

function inferBomKind({ value, footprint, references }) {
  const ref = String(references || "").trim().match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || "";
  const fp = String(footprint || "").toLowerCase();
  const text = `${value || ""} ${footprint || ""}`.toLowerCase();
  if (ref === "R" || fp.includes("resistor") || /(^|[:/_-])r[_-]/.test(fp) || /\d\s*(r|k|m)(\s|$)/i.test(text)) return "resistor";
  if (ref === "C" || fp.includes("capacitor") || /(^|[:/_-])c[_-]/.test(fp) || /\d\s*(p|n|u|\u00b5|\u03bc|m)?f?(\s|$)/i.test(text) && /\b(?:pf|nf|uf|mf|f|capacitor|c_)/i.test(text)) return "capacitor";
  if (ref === "L" || fp.includes("inductor") || /(^|[:/_-])l[_-]/.test(fp) || /\d\s*(n|u|\u00b5|\u03bc|m)?h(\s|$)/i.test(text)) return "inductor";
  return null;
}

function parseBomElectricalValue(kind, value) {
  const text = String(value || "").replace("\u00b5", "u").replace("\u03bc", "u").replace("\u03a9", "R");
  if (kind === "resistor") {
    const token = text.match(/(?:^|[^A-Za-z0-9.])([0-9]+(?:[.,][0-9]+)?\s*(?:[rRkKmM](?:[0-9]+)?|ohms?))(?:[^A-Za-z0-9.]|$)/)?.[1]
      || text.match(/^([0-9]+(?:[.,][0-9]+)?\s*[rRkKmM]?)(?:\s|$)/)?.[1];
    return token ? parseResistance(token) : null;
  }
  if (kind === "capacitor") {
    const token = text.match(/(?:^|[^A-Za-z0-9.])([0-9]+(?:[.,][0-9]+)?\s*(?:pF|nF|uF|mF|F|p|n|u|m)(?:[0-9]+)?)(?:[^A-Za-z0-9.]|$)/i)?.[1]
      || text.match(/^([0-9]{2,3})(?:\s|$)/)?.[1];
    if (!token) return null;
    return /^[0-9]{2,3}$/.test(token) ? parseCapacitorCode(token) : parseCapacitance(token);
  }
  if (kind === "inductor") {
    const token = text.match(/(?:^|[^A-Za-z0-9.])([0-9]+(?:[.,][0-9]+)?\s*(?:nH|uH|mH|H|n|u|m)(?:[0-9]+)?)(?:[^A-Za-z0-9.]|$)/i)?.[1];
    return token ? parseInductance(token) : null;
  }
  return null;
}

function parseCapacitorCode(value) {
  const digits = String(value || "").trim();
  if (!/^[0-9]{2,3}$/.test(digits)) return null;
  if (digits.length === 2) return Number(digits) * 1e-12;
  const base = Number(digits.slice(0, 2));
  const multiplier = Number(digits[2]);
  return Number.isFinite(base) && Number.isFinite(multiplier) ? base * (10 ** multiplier) * 1e-12 : null;
}

function parseBomVoltage(value) {
  const match = String(value || "").replace(",", ".").match(/([0-9]+(?:\.[0-9]+)?)\s*v\b/i);
  return match ? Number(match[1]) : null;
}

function scorePartForBomCandidate(part, ctx) {
  const reasons = [];
  const warnings = [];
  let score = 0;
  const partKind = categoryKind(getCategoryName(part.categoryId));
  const partMpn = normalizeMatchText(part.mpn);
  const rowMpn = normalizeMatchText(ctx.row?.mpn);
  if (rowMpn) {
    if (partMpn && partMpn === rowMpn) {
      score += 160;
      reasons.push("MPN exact");
    } else {
      const alias = (state.inventory.partAliases || []).find((item) => item.partId === part.id && normalizeMatchText(item.aliasValue) === rowMpn);
      if (alias) {
        score += 150;
        reasons.push("alias exact");
      }
    }
  }

  if (ctx.kind) {
    if (partKind !== ctx.kind) return null;
    score += 35;
    reasons.push(ctx.kind);
  }

  const spec = ctx.kind ? getSpec(part.id, ctx.kind) : null;
  const specValue = spec ? bomComparableSpecValue(ctx.kind, spec) : null;
  if (ctx.kind && ctx.parsedValue != null) {
    if (specValue == null) {
      warnings.push("part missing normalized spec");
      return null;
    }
    if (!nearlyEqualElectrical(specValue, ctx.parsedValue)) return null;
    score += 100;
    reasons.push("value exact");
  } else if (ctx.valueNorm && normalizeMatchText(part.name).includes(ctx.valueNorm)) {
    score += 20;
    reasons.push("name contains value");
  } else if (ctx.kind) {
    return null;
  }

  const partTokens = partPackageTokens(part);
  if (ctx.packageToken) {
    if (partTokens.has(ctx.packageToken)) {
      score += 40;
      reasons.push(`package ${ctx.packageToken}`);
    } else {
      warnings.push(`package differs: BOM ${ctx.packageToken}, part ${[...partTokens].join("/") || "none"}`);
      score -= 20;
    }
  } else if (ctx.footprint) {
    warnings.push("BOM package not recognized");
  }

  if (ctx.voltage != null && spec?.voltageV != null) {
    const voltage = Number(spec.voltageV);
    if (Number.isFinite(voltage) && voltage >= ctx.voltage) {
      score += 8;
      reasons.push(`voltage >= ${trimNumber(ctx.voltage)}V`);
    } else {
      warnings.push(`voltage below BOM: ${trimNumber(voltage)}V < ${trimNumber(ctx.voltage)}V`);
      score -= 45;
    }
  } else if (ctx.voltage != null && ctx.kind === "capacitor") {
    warnings.push("part voltage unknown");
  }

  if (ctx.valueNorm && normalizeMatchText(part.name).includes(ctx.valueNorm)) score += 5;
  const available = stockSummary(part.id).total;
  if (available > 0) {
    score += 2;
    reasons.push("in stock");
  }
  if (score <= 0) return null;
  const cost = partPriceInfo(part.id);
  return {
    part,
    partId: part.id,
    partName: part.name,
    score,
    reasons,
    warnings,
    available,
    shortage: Math.max(0, numberOrZero(ctx.row?.quantity) - available),
    unitPrice: cost.unitPrice,
    currency: cost.currency,
    missingPrice: cost.missingPrice,
    mixedCurrency: cost.mixedCurrency
  };
}

function candidateConfidence(candidate, ctx) {
  const seriousWarning = candidate.warnings.some((warning) => /differs|below|unknown|missing/.test(warning));
  if (candidate.score >= 165 && !seriousWarning && ctx.kind && ctx.parsedValue != null && ctx.packageToken) return "exact";
  if (candidate.score >= 135 && !candidate.warnings.some((warning) => /below/.test(warning))) return "strong";
  return "review";
}

function bomComparableSpecValue(kind, spec) {
  if (kind === "resistor") return numberOrNull(spec.resistanceOhm);
  if (kind === "capacitor") return numberOrNull(spec.capacitanceF);
  if (kind === "inductor") return numberOrNull(spec.inductanceH);
  return null;
}

function nearlyEqualElectrical(a, b) {
  const aa = Number(a);
  const bb = Number(b);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return false;
  const tolerance = Math.max(Math.max(Math.abs(aa), Math.abs(bb)) * 1e-6, 1e-15);
  return Math.abs(aa - bb) <= tolerance;
}

function normalizeMatchText(value) {
  return String(value || "").toLowerCase().replace("\u00b5", "u").replace("\u03bc", "u").replace(/[^a-z0-9.]+/g, "");
}

function extractPackageToken(value) {
  const text = String(value || "").toLowerCase();
  const match = text.match(/(?:^|[^0-9])(0201|0402|0603|0805|1206|1210|1812|2010|2512|1005|1608|2012|3216|3225|4532|5025|6432)(?:[^0-9]|$)/)
    || text.match(/\b(sot[-_ ]?23|sot[-_ ]?223|sod[-_ ]?123|sod[-_ ]?323|sod[-_ ]?523|qfn[-_ ]?\d+|tqfp[-_ ]?\d+|lqfp[-_ ]?\d+)\b/i);
  if (!match) return "";
  const token = match[1].replace(/[-_ ]/g, "");
  return ({
    "1005": "0402",
    "1608": "0603",
    "2012": "0805",
    "3216": "1206",
    "3225": "1210",
    "4532": "1812",
    "5025": "2010",
    "6432": "2512"
  })[token] || token;
}

function partPackageTokens(part) {
  return new Set([part.package, part.footprint, part.name].map(extractPackageToken).filter(Boolean));
}

function autoMatchProject(projectId) {
  return acceptProjectBomMatches(projectId, { mode: "exact", rowIds: projectBomRows(projectId).filter((row) => !row.partId).map((row) => row.id) });
}

function projectHealth(projectId) {
  const rows = projectBomRows(projectId);
  const partIds = new Set((state.inventory.parts || []).map((part) => part.id));
  const bomRowIds = new Set(rows.map((row) => row.id));
  const placements = projectPlacements(projectId);
  const sessions = projectBuildSessions(projectId);
  const sessionIds = new Set(sessions.map((row) => row.id));
  const placementIds = new Set(placements.map((row) => row.id));
  const sourceWarnings = projectSources(projectId).filter((row) => row.notes).length;
  const activeRows = rows.filter((row) => row.fitted !== 0);
  const invalidLinks = rows.filter((row) => row.partId && !partIds.has(row.partId)).length;
  const placementIssues = placements.filter((row) => row.bomRowId && !bomRowIds.has(row.bomRowId)).length
    + (state.inventory.projectBuildSteps || []).filter((row) => row.projectId === Number(projectId) && (!sessionIds.has(row.sessionId) || (row.placementId && !placementIds.has(row.placementId)) || (row.bomRowId && !bomRowIds.has(row.bomRowId)))).length;
  return {
    rows: rows.length,
    activeRows: activeRows.length,
    dnpRows: rows.length - activeRows.length,
    unresolved: activeRows.filter((row) => !row.partId).length,
    missingPrices: activeRows.filter((row) => row.partId && bomRowCost(row).missing).length,
    invalidLinks,
    sourceWarnings,
    placementIssues,
    shortages: activeRows.filter((row) => bomRowStatus(row).shortage > 0).length,
    warnings: rows.filter((row) => getBomMatchCandidates(row, { limit: 1 })[0]?.warnings.length).length
  };
}

function acceptProjectBomMatches(projectId, options = {}) {
  const rowIds = new Set((options.rowIds || []).map(Number));
  const mode = options.mode || "selected";
  let changed = 0;
  projectBomRows(projectId).forEach((row) => {
    if (row.fitted === 0) return;
    if (rowIds.size && !rowIds.has(row.id)) return;
    const candidate = getBomMatchCandidates(row, { limit: 1 })[0];
    if (!candidate) return;
    if (mode === "exact" && candidate.confidence !== "exact") return;
    if (row.partId === candidate.partId) return;
    row.partId = candidate.partId;
    row.notes = removeNoteFragment(row.notes, "unresolved") || null;
    changed += 1;
  });
  return changed;
}

function unlinkProjectBomRows(rowIds) {
  const ids = new Set((rowIds || []).map(Number));
  let changed = 0;
  (state.inventory.projectBom || []).forEach((row) => {
    if (!ids.has(row.id) || !row.partId) return;
    row.partId = null;
    row.notes = appendNoteText(row.notes, "unlinked for review");
    changed += 1;
  });
  return changed;
}

function analyzeProjectRepair(projectId) {
  const project = state.inventory.projects.find((item) => item.id === Number(projectId));
  const rows = projectBomRows(projectId);
  const partIds = new Set((state.inventory.parts || []).map((part) => part.id));
  const bomRowIds = new Set(rows.map((row) => row.id));
  const placements = projectPlacements(projectId);
  const placementIds = new Set(placements.map((row) => row.id));
  const sessions = projectBuildSessions(projectId);
  const sessionIds = new Set(sessions.map((row) => row.id));
  const changes = [];
  const warnings = [];
  if (!project) return { projectId: Number(projectId), changes, warnings: ["project not found"], health: projectHealth(projectId) };

  rows.forEach((row) => {
    const candidates = getBomMatchCandidates(row, { limit: 3 });
    const best = candidates[0] || null;
    if (row.partId && !partIds.has(row.partId)) {
      changes.push({ id: `unlink-${row.id}`, type: "unlink-invalid-part", rowId: row.id, fromPartId: row.partId, label: `${row.referencesText || row.value || row.id}: remove missing part link ${row.partId}` });
    }
    if (!row.partId && row.fitted !== 0 && best && ["exact", "strong"].includes(best.confidence)) {
      changes.push({ id: `match-${row.id}`, type: "match-row", rowId: row.id, partId: best.partId, partName: best.partName, confidence: best.confidence, score: best.score, label: `${row.referencesText || row.value || row.id}: match ${best.partName}` });
    }
    if (row.fitted === 0 && best?.confidence === "exact" && /^[RCL]\d/i.test(String(row.referencesText || ""))) {
      changes.push({ id: `fit-${row.id}`, type: "set-fitted", rowId: row.id, fitted: 1, label: `${row.referencesText || row.value || row.id}: review stale DNP flag and mark fitted` });
    }
    if (row.fitted !== 0 && !best && bomMatchContext(row).warnings.length) {
      warnings.push(`${row.referencesText || row.value || row.id}: ${bomMatchContext(row).warnings.join(", ")}`);
    }
  });

  placements.forEach((placement) => {
    if (placement.bomRowId && !bomRowIds.has(placement.bomRowId)) {
      const target = rows.find((row) => rowReferences(row).includes(placement.reference));
      if (target) changes.push({ id: `link-placement-${placement.id}`, type: "link-placement", placementId: placement.id, bomRowId: target.id, label: `${placement.reference}: relink placement to BOM row ${target.id}` });
      else warnings.push(`${placement.reference}: placement points at missing BOM row ${placement.bomRowId}`);
    }
  });

  (state.inventory.projectBuildSteps || []).forEach((step) => {
    if (step.projectId !== Number(projectId)) return;
    if (!sessionIds.has(step.sessionId) || (step.placementId && !placementIds.has(step.placementId)) || (step.bomRowId && !bomRowIds.has(step.bomRowId))) {
      changes.push({ id: `clear-step-${step.id}`, type: "clear-build-step-links", stepId: step.id, label: `build step ${step.id}: clear invalid placement/BOM links` });
    }
  });

  const duplicateGroups = new Map();
  rows.forEach((row) => {
    const key = [row.value || "", row.footprint || "", row.mpn || "", row.fitted === 0 ? "dnp" : "fit"].map((value) => String(value).toLowerCase().trim()).join("|");
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(row);
  });
  duplicateGroups.forEach((group) => {
    if (group.length > 1) warnings.push(`duplicate BOM groups: ${group.map((row) => row.referencesText || row.id).join(" / ")}`);
  });

  return { projectId: Number(projectId), changes, warnings, health: projectHealth(projectId) };
}

function applyProjectRepair(projectId, approvedChanges = []) {
  const changes = approvedChanges.length ? approvedChanges : analyzeProjectRepair(projectId).changes;
  if (!changes.length) return 0;
  localStorage.setItem(STORAGE.repairBackup, inventoryJson());
  let applied = 0;
  changes.forEach((change) => {
    if (change.type === "match-row") {
      const row = state.inventory.projectBom.find((item) => item.id === Number(change.rowId));
      if (row && change.partId) {
        row.partId = Number(change.partId);
        row.notes = removeNoteFragment(row.notes, "unresolved") || null;
        applied += 1;
      }
    }
    if (change.type === "unlink-invalid-part") {
      const row = state.inventory.projectBom.find((item) => item.id === Number(change.rowId));
      if (row) {
        row.partId = null;
        row.notes = appendNoteText(row.notes, "invalid part link cleared");
        applied += 1;
      }
    }
    if (change.type === "set-fitted") {
      const row = state.inventory.projectBom.find((item) => item.id === Number(change.rowId));
      if (row) {
        row.fitted = Number(change.fitted) === 0 ? 0 : 1;
        row.notes = appendNoteText(row.notes, "DNP flag reviewed");
        applied += 1;
      }
    }
    if (change.type === "link-placement") {
      const placement = (state.inventory.projectPlacements || []).find((item) => item.id === Number(change.placementId));
      if (placement) {
        placement.bomRowId = Number(change.bomRowId);
        applied += 1;
      }
    }
    if (change.type === "clear-build-step-links") {
      const step = (state.inventory.projectBuildSteps || []).find((item) => item.id === Number(change.stepId));
      if (step) {
        step.placementId = null;
        step.bomRowId = null;
        applied += 1;
      }
    }
  });
  if (applied) logActivity("repair-project", "project", projectId, `${applied} repair changes applied`);
  return applied;
}

function restoreLastRepairBackup() {
  const backup = localStorage.getItem(STORAGE.repairBackup);
  if (!backup) return false;
  state.inventory = normalizeInventory(JSON.parse(backup));
  invalidateIndexes();
  touchInventory();
  return true;
}

function rowReferences(row) {
  return String(row.referencesText || row.references || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function removeNoteFragment(notes, fragment) {
  const lower = String(fragment || "").toLowerCase();
  return String(notes || "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item && !item.toLowerCase().includes(lower))
    .join("; ");
}

function appendNoteText(notes, note) {
  const existing = String(notes || "").trim();
  if (!existing) return note;
  if (existing.toLowerCase().includes(String(note).toLowerCase())) return existing;
  return `${existing}; ${note}`;
}

function selectProject(projectId) {
  state.activeProjectId = Number(projectId) || 0;
  state.selectedBomRowIds = new Set();
  state.projectRepairAnalysis = null;
  localStorage.setItem(STORAGE.activeProjectId || "tmi.activeProjectId", String(state.activeProjectId));
  if (state.activeView === "projects") $("#viewPanel").innerHTML = renderProjectsView();
}

function deleteProject(projectId) {
  const project = state.inventory.projects.find((item) => item.id === Number(projectId));
  if (!project) return;
  if (!confirm(`Delete project "${project.name}" and its BOM?`)) return;
  state.inventory.projects = state.inventory.projects.filter((item) => item.id !== project.id);
  state.inventory.projectBom = state.inventory.projectBom.filter((row) => row.projectId !== project.id);
  state.inventory.projectSources = (state.inventory.projectSources || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectPlacements = (state.inventory.projectPlacements || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectBuildSessions = (state.inventory.projectBuildSessions || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectBuildSteps = (state.inventory.projectBuildSteps || []).filter((row) => row.projectId !== project.id);
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
  (state.inventory.projectPlacements || []).forEach((placement) => {
    if (placement.bomRowId === row.id) placement.bomRowId = null;
  });
  (state.inventory.projectBuildSteps || []).forEach((step) => {
    if (step.bomRowId === row.id) step.bomRowId = null;
  });
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
    const result = takeStock(reservation.partId, {
      quantity: reservation.quantity,
      locationId: reservation.locationId ?? undefined,
      projectId,
      movementType: "project-consume",
      notes: "consume reserved stock"
    });
    if (!result.ok) {
      toast(`consume failed: ${result.error}`, "error");
      return;
    }
  }
  state.inventory.projectReservations = state.inventory.projectReservations.filter((row) => row.projectId !== Number(projectId));
  logActivity("consume-project", "project", projectId, "stock consumed from reservations");
  touchInventory();
  if (!persistDatabase("project stock consumed", { dirty: true })) return;
  render();
}

function takeBomRow(rowId, quantity = null) {
  const row = state.inventory.projectBom.find((item) => item.id === Number(rowId));
  if (!row || !row.partId) {
    toast("BOM row is unresolved", "error");
    return;
  }
  const qty = quantity == null ? integerOrZero(row.quantity) : integerOrZero(quantity);
  const result = takeStock(row.partId, {
    quantity: qty,
    projectId: row.projectId,
    bomRowId: row.id,
    notes: `project take: ${row.referencesText || row.value || "BOM row"}`
  });
  if (!result.ok) {
    toast(`take failed: ${result.error}`, "error");
    return;
  }
  logActivity("take-bom-row", "project_bom", row.id, `${result.quantity} taken`);
  touchInventory();
  if (!persistDatabase("project parts taken", { dirty: true })) return;
  render();
}


window.activeProject = activeProject;
window.projectBomRows = projectBomRows;
window.reservationsForProject = reservationsForProject;
window.availableForPart = availableForPart;
window.bomRowStatus = bomRowStatus;
window.projectSummary = projectSummary;
window.findBestPartForBomRow = findBestPartForBomRow;
window.getBomMatchCandidates = getBomMatchCandidates;
window.autoMatchProject = autoMatchProject;
window.projectHealth = projectHealth;
window.acceptProjectBomMatches = acceptProjectBomMatches;
window.unlinkProjectBomRows = unlinkProjectBomRows;
window.analyzeProjectRepair = analyzeProjectRepair;
window.applyProjectRepair = applyProjectRepair;
window.restoreLastRepairBackup = restoreLastRepairBackup;
window.selectProject = selectProject;
window.deleteProject = deleteProject;
window.matchBomRow = matchBomRow;
window.unlinkBomRow = unlinkBomRow;
window.deleteBomRow = deleteBomRow;
window.reserveProjectParts = reserveProjectParts;
window.releaseProjectReservations = releaseProjectReservations;
window.applyProjectConsumption = applyProjectConsumption;
window.takeBomRow = takeBomRow;
window.logActivity = logActivity;
window.invalidateIndexes = invalidateIndexes;

window.rebuildIndexes = rebuildIndexes;

Object.assign(window, {
  filteredParts,
  stockSummary,
  stockRowsForPart,
  specSummary,
  primarySpecValue,
  parseSpecFilterValue,
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
  normalizeCurrency,
  normalizeSpecs,
  normalizeAttributes,
  validateInventory,
  touchInventory,
  saveSettings,
  loadFromGitHub,
  commitToGitHub,
  githubLoadBytes,
  githubTryGetSha,
  githubSaveBytes,
  githubRequest,
  encodePath,
  normalizeVisibleColumns,
  saveVisibleColumns,
  resetVisibleColumns,
  storageStats,
  categoryStats,
  projectStats,
  defaultCurrency,
  stockCurrency,
  formatMoney,
  recordStockMovement,
  moveStockFromRows,
  moveStockLotToLocation,
  takeStock,
  setStockRowsMin,
  setStockRowsSource,
  setStockRowsPrice,
  partPriceInfo,
  bomRowCost,
  projectCostSummary,
  highlightLocation,
  normalizeProjects,
  normalizeProjectBom,
  normalizeProjectSources,
  normalizeProjectPlacements,
  normalizeProjectBuildSessions,
  normalizeProjectBuildSteps,
  normalizePartAliases,
  normalizeProjectReservations,
  normalizeActivityLog,
  activeProject,
  projectBomRows,
  reservationsForProject,
  availableForPart,
  bomRowStatus,
  projectSummary,
  findBestPartForBomRow,
  getBomMatchCandidates,
  autoMatchProject,
  projectHealth,
  acceptProjectBomMatches,
  unlinkProjectBomRows,
  analyzeProjectRepair,
  applyProjectRepair,
  restoreLastRepairBackup,
  selectProject,
  deleteProject,
  matchBomRow,
  unlinkBomRow,
  deleteBomRow,
  reserveProjectParts,
  releaseProjectReservations,
  applyProjectConsumption,
  takeBomRow,
  logActivity,
  invalidateIndexes,
  rebuildIndexes
});
