"use strict";

function previewBulkImport() {
  const form = $("#bulkImportForm");
  if (!form) return;
  const parsed = parseBulkImportForm(form);
  const target = $("#bulkPreview");
  if (!target) return;
  if (!parsed.rows.length) {
    target.innerHTML = `<div class="empty-state compact"><div><h3>nothing parsed</h3><p>${escapeHtml(parsed.errors[0] || "Paste at least one row.")}</p></div></div>`;
    return;
  }
  const rows = parsed.rows.slice(0, 80).map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.part.name)}</td><td>${escapeHtml(getCategoryName(row.part.categoryId))}</td><td>${escapeHtml(row.part.package || "")}</td><td>${escapeHtml(row.specText || "")}</td><td>${row.stock.quantity}</td><td>${escapeHtml(row.locationLabel || "")}</td></tr>`).join("");
  const more = parsed.rows.length > 80 ? `<p class="small-note">showing first 80 of ${parsed.rows.length} rows</p>` : "";
  target.innerHTML = `
    <p class="section-title">preview / ${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"}</p>
    ${parsed.errors.length ? `<p class="small-note danger-text">${escapeHtml(parsed.errors.slice(0, 3).join(" / "))}</p>` : ""}
    <div class="table-shell compact-table"><table><thead><tr><th>#</th><th>part</th><th>cat</th><th>pkg</th><th>spec</th><th>qty</th><th>location</th></tr></thead><tbody>${rows}</tbody></table></div>${more}`;
}

function importBulkParts() {
  const form = $("#bulkImportForm");
  if (!form) return;
  const parsed = parseBulkImportForm(form);
  if (!parsed.rows.length) {
    toast(parsed.errors[0] || "nothing to import", "error");
    previewBulkImport();
    return;
  }
  const mergeExisting = new FormData(form).get("mergeExisting") === "on";
  let added = 0;
  let merged = 0;
  parsed.rows.forEach((row) => {
    const existing = mergeExisting ? findMatchingPart(row.part, row.kind, row.spec) : null;
    const partId = existing ? existing.id : nextId(state.inventory.parts);
    if (existing) {
      merged += 1;
    } else {
      state.inventory.parts.push({ ...row.part, id: partId });
      if (row.spec) state.inventory[SPEC_CONFIGS[row.kind]?.table]?.push({ ...row.spec, partId });
      added += 1;
    }
    if (row.stock.quantity > 0 || row.stock.minQuantity > 0 || row.stock.locationId || row.stock.source) {
      state.inventory.stock.push({ ...row.stock, id: nextId(state.inventory.stock), partId });
    }
  });
  touchInventory();
  if (!persistDatabase(`bulk import: ${added} added, ${merged} merged`, { dirty: true })) return;
  toast(`bulk import complete: ${added} added, ${merged} merged`);
  render();
}

function parseBulkImportForm(form) {
  const fd = new FormData(form);
  const kind = textValue(fd.get("kind")) || "resistor";
  const defaultPackage = nullableText(fd.get("defaultPackage"));
  const defaultFootprint = nullableText(fd.get("defaultFootprint"));
  const defaultQuantity = integerOrZero(fd.get("defaultQuantity"));
  const defaultMin = integerOrZero(fd.get("defaultMin"));
  const defaultSource = nullableText(fd.get("defaultSource"));
  const defaultTolerance = nullableNumber(cleanPercent(fd.get("defaultTolerance")));
  const defaultPower = parsePower(fd.get("defaultPower"));
  const defaultVoltage = nullableNumber(cleanVoltage(fd.get("defaultVoltage")));
  const defaultLocationName = nullableText(fd.get("defaultLocationName"));
  const defaultLocationId = defaultLocationName ? ensureLocationByPath(defaultLocationName) : nullableNumber(fd.get("defaultLocationId"));
  const text = textValue(fd.get("bulkText"));
  const errors = [];
  const rows = [];
  if (!text) return { rows, errors: ["bulk text is empty"] };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
  let header = null;
  const now = new Date().toISOString();
  for (const line of lines) {
    const cells = splitBulkLine(line);
    if (!cells.length) continue;
    if (!header && looksLikeHeader(cells)) {
      header = cells.map(normalizeHeaderName);
      continue;
    }
    const data = header ? rowFromHeader(cells, header) : rowFromPositional(cells, kind);
    try {
      const built = buildBulkRow({ data, kind, defaultPackage, defaultFootprint, defaultQuantity, defaultMin, defaultSource, defaultTolerance, defaultPower, defaultVoltage, defaultLocationId, now });
      rows.push(built);
    } catch (error) {
      errors.push(`${line}: ${error.message}`);
    }
  }
  return { rows, errors };
}

function buildBulkRow(ctx) {
  const data = ctx.data;
  const kind = ctx.kind;
  const packageName = nullableText(data.package) || ctx.defaultPackage;
  const footprint = nullableText(data.footprint) || ctx.defaultFootprint;
  const quantity = integerOrZero(firstFilled(data.quantity, data.qty, ctx.defaultQuantity));
  const minQuantity = integerOrZero(firstFilled(data.minQuantity, data.min, ctx.defaultMin));
  const source = nullableText(data.source) || ctx.defaultSource;
  const locationId = nullableText(data.location) ? ensureLocationByPath(data.location) : ctx.defaultLocationId;
  const categoryId = kind === "generic" ? ensureCategoryByName(data.category || "other") : ensureCategoryByName(kind);
  const createdAt = ctx.now;
  const basePart = {
    id: 0,
    categoryId,
    name: "",
    manufacturer: nullableText(data.manufacturer),
    mpn: nullableText(data.mpn),
    footprint,
    package: packageName,
    description: nullableText(data.description),
    datasheetUrl: nullableText(data.datasheetUrl ?? data.datasheet),
    notes: nullableText(data.notes),
    createdAt,
    updatedAt: createdAt
  };
  let spec = null;
  let specText = "";
  if (kind === "resistor") {
    const ohm = parseResistance(data.value ?? data.resistance ?? data.resistanceOhm);
    if (ohm === null) throw new Error("resistance value is missing or invalid");
    const tolerance = nullableNumber(cleanPercent(data.tolerance)) ?? ctx.defaultTolerance;
    const power = parsePower(data.power) ?? ctx.defaultPower;
    const voltage = nullableNumber(cleanVoltage(data.voltage)) ?? ctx.defaultVoltage;
    spec = { partId: 0, resistanceOhm: ohm, tolerancePercent: tolerance ?? undefined, powerW: power ?? undefined, voltageV: voltage ?? undefined };
    specText = [formatResistance(ohm), tolerance != null ? `${tolerance}%` : "", power != null ? `${power}W` : ""].filter(Boolean).join(" ");
    basePart.name = nullableText(data.name) || [formatResistance(ohm), tolerance != null ? `${tolerance}%` : null, power != null ? `${formatPower(power)}` : null, packageName].filter(Boolean).join(" ");
  } else if (kind === "capacitor") {
    const farad = parseCapacitance(data.value ?? data.capacitance ?? data.capacitanceF);
    if (farad === null) throw new Error("capacitance value is missing or invalid");
    const voltage = nullableNumber(cleanVoltage(data.voltage)) ?? ctx.defaultVoltage;
    const tolerance = nullableNumber(cleanPercent(data.tolerance)) ?? ctx.defaultTolerance;
    const dielectric = nullableText(data.dielectric);
    spec = { partId: 0, capacitanceF: farad, voltageV: voltage ?? undefined, tolerancePercent: tolerance ?? undefined, dielectric: dielectric ?? undefined };
    specText = [formatCapacitance(farad), voltage != null ? `${voltage}V` : "", dielectric || ""].filter(Boolean).join(" ");
    basePart.name = nullableText(data.name) || [formatCapacitance(farad), voltage != null ? `${voltage}V` : null, dielectric, packageName].filter(Boolean).join(" ");
  } else if (kind === "inductor") {
    const henry = parseInductance(data.value ?? data.inductance ?? data.inductanceH);
    if (henry === null) throw new Error("inductance value is missing or invalid");
    const current = nullableNumber(cleanCurrent(data.current));
    const dcr = parseResistance(data.dcr ?? data.resistance ?? data.resistanceOhm);
    spec = { partId: 0, inductanceH: henry, currentA: current ?? undefined, resistanceOhm: dcr ?? undefined };
    specText = [formatInductance(henry), current != null ? `${current}A` : ""].filter(Boolean).join(" ");
    basePart.name = nullableText(data.name) || [formatInductance(henry), current != null ? `${current}A` : null, packageName].filter(Boolean).join(" ");
  } else {
    basePart.name = nullableText(data.name || data.value || data.mpn) || "generic part";
  }
  return {
    kind,
    part: basePart,
    spec,
    specText,
    locationLabel: locationId ? locationPath(locationId) : "",
    stock: {
      id: 0,
      partId: 0,
      locationId: locationId || null,
      quantity,
      minQuantity,
      source,
      orderNumber: nullableText(data.orderNumber),
      unitPrice: nullableNumber(data.unitPrice),
      currency: nullableText(data.currency),
      dateAdded: new Date().toISOString().slice(0, 10),
      notes: nullableText(data.stockNotes)
    }
  };
}

function splitBulkLine(line) {
  const trimmed = line.trim();
  const delimiter = trimmed.includes("\t") ? "\t" : trimmed.includes(";") ? ";" : trimmed.includes(",") ? "," : null;
  return delimiter ? parseSimpleCsvLine(trimmed, delimiter) : trimmed.split(/\s+/).map((cell) => cell.trim()).filter(Boolean);
}

function parseSimpleCsvLine(line, delimiter) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function looksLikeHeader(cells) {
  const names = cells.map(normalizeHeaderName);
  return names.some((name) => ["value", "resistance", "capacitance", "inductance", "quantity", "qty", "package", "footprint", "mpn", "manufacturer", "location"].includes(name));
}

function normalizeHeaderName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^manf_?num$/, "mpn").replace(/^mfr$/, "manufacturer").replace(/^qty$/, "quantity");
}

function rowFromHeader(cells, header) {
  const row = {};
  header.forEach((name, index) => { row[headerAlias(name)] = cells[index] ?? ""; });
  return row;
}

function headerAlias(name) {
  const aliases = {
    resistance_ohm: "resistanceOhm",
    capacitance_f: "capacitanceF",
    inductance_h: "inductanceH",
    min_quantity: "minQuantity",
    datasheet_url: "datasheetUrl",
    part_number: "mpn",
    manufacturer_part_number: "mpn",
    mfg_part_number: "mpn",
    source_supplier: "source"
  };
  return aliases[name] || name;
}

function rowFromPositional(cells, kind) {
  const row = {};
  const maps = {
    resistor: ["value", "quantity", "package", "tolerance", "power", "voltage", "location", "minQuantity", "source"],
    capacitor: ["value", "voltage", "quantity", "package", "dielectric", "tolerance", "location", "minQuantity", "source"],
    inductor: ["value", "current", "quantity", "package", "dcr", "location", "minQuantity", "source"],
    generic: ["name", "quantity", "category", "package", "footprint", "location", "mpn", "manufacturer"]
  };
  (maps[kind] || maps.generic).forEach((key, index) => { row[key] = cells[index] ?? ""; });
  return row;
}

function findMatchingPart(part, kind, spec) {
  return state.inventory.parts.find((item) => {
    if (item.categoryId !== part.categoryId) return false;
    if (String(item.name).toLowerCase() !== String(part.name).toLowerCase()) return false;
    if (String(item.package || "").toLowerCase() !== String(part.package || "").toLowerCase()) return false;
    if (String(item.footprint || "").toLowerCase() !== String(part.footprint || "").toLowerCase()) return false;
    if (part.mpn && item.mpn && String(item.mpn).toLowerCase() !== String(part.mpn).toLowerCase()) return false;
    if (!spec || !SPEC_CONFIGS[kind]) return true;
    const existingSpec = getSpec(item.id, kind);
    if (!existingSpec) return false;
    const firstField = SPEC_CONFIGS[kind].fields[0][0];
    return Math.abs(Number(existingSpec[firstField]) - Number(spec[firstField])) < 1e-18;
  });
}

async function lookupExternalPart() {
  const form = $("#externalLookupForm");
  if (!form) return;
  const fd = new FormData(form);
  const provider = textValue(fd.get("provider")) || state.externalApiConfig.provider || "nexar";
  const query = textValue(fd.get("query"));
  const manufacturer = textValue(fd.get("manufacturer"));
  if (!query) { toast("enter MPN or search text", "error"); return; }
  state.externalLastQuery = query;
  state.externalApiConfig.provider = provider;
  localStorage.setItem(STORAGE.externalApiConfig, JSON.stringify(state.externalApiConfig));
  setStatus(`searching ${provider}...`);
  try {
    let results;
    if (provider === "nexar") results = await lookupNexar(query);
    else results = await lookupGenericProvider(provider, query, manufacturer);
    state.externalResults = results;
    setStatus(`${results.length} external result${results.length === 1 ? "" : "s"}`);
    render();
  } catch (error) {
    setStatus("external lookup failed");
    toast(error.message, "error");
  }
}

async function lookupNexar(mpn) {
  const token = sessionStorage.getItem(STORAGE.externalApiToken);
  if (!token) throw new Error("paste Nexar application access token in Settings first");
  const query = `query ($mpn: String!) { supSearchMpn(q: $mpn) { hits results { part { id name mpn manufacturer { name } shortDescription descriptions { text } category { id name path } specs { attribute { name shortname } displayValue value unitsName unitsSymbol } } } } }`;
  const response = await fetch("https://api.nexar.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ query, variables: { mpn } })
  });
  const data = await response.json();
  if (!response.ok || data.errors) throw new Error((data.errors || []).map((err) => err.message).join("; ") || `${response.status} ${response.statusText}`);
  return (data.data?.supSearchMpn?.results || []).map((result) => normalizeExternalCandidate(result.part || result)).filter((item) => item.name || item.mpn);
}

async function lookupGenericProvider(provider, q, manufacturer) {
  const cfg = state.externalApiConfig || {};
  const template = provider === "ultralibrarian" ? cfg.ultraUrlTemplate : cfg.genericUrlTemplate;
  if (!template) throw new Error(`${provider} URL template is not configured in Settings`);
  const url = buildTemplateUrl(template, { q, mpn: q, manufacturer });
  const headers = { Accept: "application/json" };
  const token = sessionStorage.getItem(STORAGE.externalApiToken);
  if (token) headers.Authorization = `${cfg.bearerPrefix || "Bearer"} ${token}`.trim();
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const data = await response.json();
  return extractGenericApiResults(data).map(normalizeExternalCandidate).filter((item) => item.name || item.mpn);
}

function buildTemplateUrl(template, values) {
  return String(template).replace(/\{(q|mpn|manufacturer)\}/g, (_, key) => encodeURIComponent(values[key] || ""));
}

function extractGenericApiResults(data) {
  if (Array.isArray(data)) return data;
  const candidates = [data.results, data.items, data.parts, data.data?.results, data.data?.items, data.data?.parts, data.data?.supSearchMpn?.results];
  const found = candidates.find(Array.isArray);
  return found || [data];
}

function normalizeExternalCandidate(raw) {
  const part = raw?.part || raw || {};
  const specs = Array.isArray(part.specs) ? part.specs : [];
  const specMap = Object.fromEntries(specs.map((spec) => {
    const key = spec.attribute?.shortname || spec.attribute?.name || spec.name || spec.key;
    const value = spec.displayValue || spec.value || spec.valueText || spec.text;
    return key ? [String(key).toLowerCase(), value] : null;
  }).filter(Boolean));
  const mpn = nullableText(part.mpn ?? part.MPN ?? part.partNumber ?? part.part_number ?? part.manufacturerPartNumber);
  const manufacturer = nullableText(part.manufacturer?.name ?? part.manufacturer ?? part.mfr ?? part.brand);
  const description = nullableText(part.shortDescription ?? part.description ?? part.descriptions?.[0]?.text ?? part.summary);
  const categoryName = inferCategoryFromExternal(part.category?.name ?? part.category ?? part.categoryName ?? description ?? "");
  const datasheetUrl = nullableText(part.datasheetUrl ?? part.datasheet_url ?? part.datasheet?.url ?? part.datasheets?.[0]?.url);
  const packageName = nullableText(part.package ?? part.casePackage ?? specMap.package ?? specMap.case_package);
  const kind = categoryKind(categoryName);
  const spec = externalSpecFromMap(kind, specMap);
  return {
    name: nullableText(part.name) || [mpn, description].filter(Boolean).join(" ") || mpn,
    manufacturer,
    mpn,
    footprint: nullableText(part.footprint ?? part.landPattern ?? part.kicadFootprint),
    package: packageName,
    description,
    datasheetUrl,
    categoryName,
    spec,
    notes: raw ? `Imported from external API. Raw keys: ${Object.keys(raw).slice(0, 12).join(", ")}` : null
  };
}

function externalSpecFromMap(kind, specMap) {
  if (!kind) return null;
  const pick = (...keys) => keys.map((key) => specMap[key.toLowerCase()]).find((value) => value !== undefined && value !== null && value !== "");
  if (kind === "resistor") {
    const resistanceOhm = parseResistance(pick("resistance", "resistance_ohm", "r"));
    if (resistanceOhm === null) return null;
    return {
      resistanceOhm,
      tolerancePercent: nullableNumber(cleanPercent(pick("tolerance", "tolerance_percent"))),
      powerW: parsePower(pick("power", "power_w", "power rating")),
      voltageV: nullableNumber(cleanVoltage(pick("voltage", "voltage_rating")))
    };
  }
  if (kind === "capacitor") {
    const capacitanceF = parseCapacitance(pick("capacitance", "capacitance_f", "c"));
    if (capacitanceF === null) return null;
    return {
      capacitanceF,
      voltageV: nullableNumber(cleanVoltage(pick("voltage", "voltage_rating"))),
      tolerancePercent: nullableNumber(cleanPercent(pick("tolerance", "tolerance_percent"))),
      dielectric: nullableText(pick("dielectric", "temperature coefficient"))
    };
  }
  if (kind === "inductor") {
    const inductanceH = parseInductance(pick("inductance", "inductance_h", "l"));
    if (inductanceH === null) return null;
    return {
      inductanceH,
      currentA: nullableNumber(cleanCurrent(pick("current", "current_rating"))),
      resistanceOhm: parseResistance(pick("dcr", "dc resistance", "resistance"))
    };
  }
  return null;
}

function inferCategoryFromExternal(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("resistor")) return "resistor";
  if (lower.includes("capacitor")) return "capacitor";
  if (lower.includes("inductor")) return "inductor";
  if (lower.includes("switch")) return "keyswitch";
  if (lower.includes("connector")) return "connector";
  if (lower.includes("diode")) return "diode";
  if (lower.includes("transistor") || lower.includes("mosfet") || lower.includes("bjt")) return "transistor";
  if (lower.includes("module")) return "module";
  return "ic";
}

function categoryIdFromName(name) {
  if (!name) return null;
  const wanted = categoryKind(name) || String(name).toLowerCase();
  return state.inventory.categories.find((category) => category.name.toLowerCase() === wanted)?.id || null;
}

function ensureCategoryByName(name) {
  const clean = String(categoryKind(name) || name || "other").toLowerCase().trim();
  const existing = state.inventory.categories.find((category) => category.name.toLowerCase() === clean);
  if (existing) return existing.id;
  const category = { id: nextId(state.inventory.categories), name: clean };
  state.inventory.categories.push(category);
  return category.id;
}

function ensureLocationByPath(name) {
  const clean = textValue(name);
  if (!clean) return null;
  const existing = state.inventory.locations.find((location) => locationPath(location.id).toLowerCase() === clean.toLowerCase() || location.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const location = { id: nextId(state.inventory.locations), name: clean, parentId: null, notes: null };
  state.inventory.locations.push(location);
  return location.id;
}

function firstFilled(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function parseResistance(value) {
  const raw = textValue(value).replace(/Ω|ohms?|ом/gi, "").replace(",", ".");
  if (!raw) return null;
  const rNotation = raw.match(/^(\d+(?:\.\d+)?)([rRkKmM])(\d+)$/);
  if (rNotation) {
    const base = Number(`${rNotation[1]}.${rNotation[3]}`);
    const mult = rNotation[2].toLowerCase() === "m" ? 1e6 : rNotation[2].toLowerCase() === "k" ? 1e3 : 1;
    return base * mult;
  }
  const match = raw.match(/^([0-9]*\.?[0-9]+)\s*([mMkKrR]?)$/);
  if (!match) return null;
  const valueNum = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(valueNum)) return null;
  if (unit === "m") return valueNum * 1e6;
  if (unit === "k") return valueNum * 1e3;
  return valueNum;
}

function parseCapacitance(value) {
  const raw = textValue(value).replace("µ", "u").replace(",", ".");
  if (!raw) return null;
  if (/^\d{3}$/.test(raw)) return Number(raw.slice(0, 2)) * Math.pow(10, Number(raw[2])) * 1e-12;
  const match = raw.match(/^([0-9]*\.?[0-9]+)\s*(pf|nf|uf|mf|f)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = String(match[2] || "f").toLowerCase();
  const mult = unit === "pf" ? 1e-12 : unit === "nf" ? 1e-9 : unit === "uf" ? 1e-6 : unit === "mf" ? 1e-3 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

function parseInductance(value) {
  const raw = textValue(value).replace("µ", "u").replace(",", ".");
  if (!raw) return null;
  const match = raw.match(/^([0-9]*\.?[0-9]+)\s*(nh|uh|mh|h)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = String(match[2] || "h").toLowerCase();
  const mult = unit === "nh" ? 1e-9 : unit === "uh" ? 1e-6 : unit === "mh" ? 1e-3 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

function parsePower(value) {
  const raw = textValue(value).toLowerCase().replace("w", "").replace(",", ".");
  if (!raw) return null;
  if (raw.includes("/")) {
    const [a, b] = raw.split("/").map(Number);
    return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function cleanPercent(value) { return textValue(value).replace("%", "").replace(",", "."); }
function cleanVoltage(value) { return textValue(value).replace(/v$/i, "").replace(",", "."); }
function cleanCurrent(value) { return textValue(value).replace(/a$/i, "").replace(",", "."); }

function formatResistance(ohm) {
  const n = Number(ohm);
  if (!Number.isFinite(n)) return "";
  if (n >= 1e6) return `${trimNumber(n / 1e6)}M`;
  if (n >= 1e3) return `${trimNumber(n / 1e3)}k`;
  return `${trimNumber(n)}R`;
}

function formatCapacitance(farad) {
  const n = Number(farad);
  if (!Number.isFinite(n)) return "";
  if (n >= 1e-3) return `${trimNumber(n / 1e-3)}mF`;
  if (n >= 1e-6) return `${trimNumber(n / 1e-6)}uF`;
  if (n >= 1e-9) return `${trimNumber(n / 1e-9)}nF`;
  return `${trimNumber(n / 1e-12)}pF`;
}

function formatInductance(henry) {
  const n = Number(henry);
  if (!Number.isFinite(n)) return "";
  if (n >= 1e-3) return `${trimNumber(n / 1e-3)}mH`;
  if (n >= 1e-6) return `${trimNumber(n / 1e-6)}uH`;
  return `${trimNumber(n / 1e-9)}nH`;
}

function formatPower(watt) {
  const n = Number(watt);
  if (!Number.isFinite(n)) return "";
  return `${trimNumber(n)}W`;
}

function trimNumber(value) {
  return Number(value).toFixed(6).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

