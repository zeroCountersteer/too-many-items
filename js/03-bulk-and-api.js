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
  const defaultDielectric = nullableText(fd.get("defaultDielectric"));
  const defaultCurrent = nullableNumber(cleanCurrent(fd.get("defaultCurrent")));
  const defaultLocationName = nullableText(fd.get("defaultLocationName"));
  const defaultLocationId = defaultLocationName ? ensureLocationByPath(defaultLocationName) : nullableNumber(fd.get("defaultLocationId"));
  const text = textValue(fd.get("bulkText")) || bulkGridToText(form);
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
      const built = buildBulkRow({ data, kind, defaultPackage, defaultFootprint, defaultQuantity, defaultMin, defaultSource, defaultTolerance, defaultPower, defaultVoltage, defaultDielectric, defaultCurrent, defaultLocationId, now });
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
    const dielectric = nullableText(data.dielectric) || ctx.defaultDielectric;
    spec = { partId: 0, capacitanceF: farad, voltageV: voltage ?? undefined, tolerancePercent: tolerance ?? undefined, dielectric: dielectric ?? undefined };
    specText = [formatCapacitance(farad), voltage != null ? `${voltage}V` : "", dielectric || ""].filter(Boolean).join(" ");
    basePart.name = nullableText(data.name) || [formatCapacitance(farad), voltage != null ? `${voltage}V` : null, dielectric, packageName].filter(Boolean).join(" ");
  } else if (kind === "inductor") {
    const henry = parseInductance(data.value ?? data.inductance ?? data.inductanceH);
    if (henry === null) throw new Error("inductance value is missing or invalid");
    const current = nullableNumber(cleanCurrent(data.current)) ?? ctx.defaultCurrent;
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
    resistor: ["value", "quantity", "minQuantity", "location", "source", "mpn", "manufacturer"],
    capacitor: ["value", "quantity", "minQuantity", "location", "source", "mpn", "manufacturer"],
    inductor: ["value", "quantity", "minQuantity", "location", "source", "mpn", "manufacturer"],
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
  const location = { id: nextId(state.inventory.locations), name: clean, type: "bin", parentId: null, capacity: null, x: null, y: null, z: null, color: null, ledNode: null, ledIndex: null, networkTarget: null, notes: null };
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
  const raw = textValue(value).replace(/\u03a9|ohms?|\u043e\u043c/gi, "").replace(",", ".");
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

function parseEngineeringNumber(input, units, defaultUnit = "") {
  const text = textValue(input)
    .replace("\u00b5", "u")
    .replace("\u03bc", "u")
    .replace(",", ".")
    .trim()
    .toUpperCase();
  if (!text) return null;

  const rNotation = text.match(/^([0-9]*\.?[0-9]+)([A-Z]+)([0-9]+)$/);
  if (rNotation && units[rNotation[2]] !== undefined) {
    const number = Number(`${rNotation[1]}.${rNotation[3]}`);
    return Number.isFinite(number) ? number * units[rNotation[2]] : null;
  }

  const match = text.match(/^([0-9]*\.?[0-9]+)\s*([A-Z]+)?$/);
  if (!match) return null;

  const number = Number(match[1]);
  const unit = match[2] || defaultUnit;
  if (!Number.isFinite(number) || units[unit] === undefined) return null;
  return number * units[unit];
}

function parseCapacitance(value) {
  return parseEngineeringNumber(value, {
    P: 1e-12, PF: 1e-12,
    N: 1e-9, NF: 1e-9,
    U: 1e-6, UF: 1e-6,
    M: 1e-3, MF: 1e-3,
    F: 1
  }, "P");
}

function parseInductance(value) {
  return parseEngineeringNumber(value, {
    N: 1e-9, NH: 1e-9,
    U: 1e-6, UH: 1e-6,
    M: 1e-3, MH: 1e-3,
    H: 1
  }, "H");
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



function bulkGridToText(form) {
  const rows = [...form.querySelectorAll(".bulk-line")].map((line) => {
    const value = line.querySelector("[name^='bulkValue_']")?.value || "";
    const qty = line.querySelector("[name^='bulkQty_']")?.value || "";
    const min = line.querySelector("[name^='bulkMin_']")?.value || "";
    const location = line.querySelector("[name^='bulkLocation_']")?.value || "";
    const source = line.querySelector("[name^='bulkSource_']")?.value || "";
    return [value, qty, min, location, source].filter((cell, idx) => idx < 2 || String(cell).trim()).join(" ");
  }).filter((line) => line.trim());
  return rows.join("\n");
}

function updateBulkPreviewFromGrid() {
  const form = $("#bulkImportForm");
  if (!form) return;
  const hidden = form.querySelector("[name='bulkText']");
  if (hidden) hidden.value = bulkGridToText(form);
}

function addBulkLine(row = {}) {
  const grid = $("#bulkGrid");
  if (!grid) return;
  const index = grid.querySelectorAll(".bulk-line").length;
  grid.insertAdjacentHTML("beforeend", renderBulkLine(index, row));
  updateBulkPreviewFromGrid();
}

function cloneBulkLine(index) {
  const grid = $("#bulkGrid");
  if (!grid) return;
  const lines = [...grid.querySelectorAll(".bulk-line")];
  const src = lines[Number(index)] || lines[lines.length - 1];
  const row = src ? {
    value: src.querySelector("[name^='bulkValue_']")?.value || "",
    quantity: src.querySelector("[name^='bulkQty_']")?.value || "",
    min: src.querySelector("[name^='bulkMin_']")?.value || "",
    location: src.querySelector("[name^='bulkLocation_']")?.value || "",
    source: src.querySelector("[name^='bulkSource_']")?.value || ""
  } : {};
  addBulkLine(row);
}

function removeBulkLine(index) {
  const grid = $("#bulkGrid");
  const lines = grid ? [...grid.querySelectorAll(".bulk-line")] : [];
  if (lines.length <= 1) return;
  lines[Number(index)]?.remove();
  [...grid.querySelectorAll(".bulk-line")].forEach((line, i) => {
    line.dataset.bulkRow = String(i);
    line.querySelectorAll("input").forEach((input) => {
      input.name = input.name.replace(/_\d+$/, `_${i}`);
    });
    line.querySelectorAll("[data-id]").forEach((button) => button.dataset.id = String(i));
  });
  updateBulkPreviewFromGrid();
}

function generateBulkSeries() {
  const form = $("#bulkImportForm");
  const grid = $("#bulkGrid");
  if (!form || !grid) return;
  const fd = new FormData(form);
  const series = E_SERIES[String(fd.get("seriesName") || "E24")] || E_SERIES.E24;
  const decades = String(fd.get("seriesDecades") || "1k,10k,100k").split(/[,;\s]+/).map(parseResistance).filter((n) => n && Number.isFinite(n));
  const qty = integerOrZero(fd.get("seriesQty")) || integerOrZero(fd.get("defaultQuantity")) || 1;
  if (fd.get("seriesReplace") === "replace") grid.innerHTML = "";
  const values = [];
  decades.forEach((base) => {
    const decade = Math.pow(10, Math.floor(Math.log10(base)));
    series.forEach((v) => {
      const ohm = v * decade;
      if (ohm >= Math.min(...decades) && ohm <= Math.max(...decades)) values.push(ohm);
    });
  });
  [...new Set(values.map((v) => Math.round(v * 1000000) / 1000000))]
    .sort((a, b) => a - b)
    .forEach((ohm) => addBulkLine({ value: formatResistance(ohm), quantity: qty }));
  updateBulkPreviewFromGrid();
  previewBulkImport();
}

const BOM_MAPPING_FIELDS = [
  ["references", "Refs"],
  ["quantity", "Qty"],
  ["value", "Value"],
  ["footprint", "Footprint/package"],
  ["mpn", "MPN/part number"],
  ["manufacturer", "Manufacturer"],
  ["fitted", "Fitted"],
  ["dnp", "DNP"],
  ["notes", "Notes"],
  ["unitPrice", "Unit price"],
  ["currency", "Currency"]
];

function importKiCadBomFromForm() {
  const form = $("#kicadBomForm");
  if (!form) return;
  const fd = new FormData(form);
  const csv = textValue(fd.get("bomCsv"));
  if (!csv) {
    toast("BOM CSV is empty", "error");
    return;
  }
  const parsed = parseBomTable(csv, collectBomMapping(form));
  if (!parsed.rows.length) {
    toast("no BOM rows parsed", "error");
    previewBomImport();
    return;
  }
  const mode = textValue(fd.get("projectMode")) || "create";
  const existingProjectId = nullableNumber(fd.get("existingProjectId"));
  const now = new Date().toISOString();
  state.inventory.projects = state.inventory.projects || [];
  state.inventory.projectBom = state.inventory.projectBom || [];
  let project;
  if (mode === "update" && existingProjectId) {
    project = state.inventory.projects.find((item) => item.id === existingProjectId);
    if (!project) {
      toast("choose a project to update", "error");
      return;
    }
    project.name = textValue(fd.get("projectName")) || project.name;
    project.revision = nullableText(fd.get("revision")) || project.revision;
    project.updatedAt = now;
    project.sourceFile = "pasted BOM update";
    state.inventory.projectBom = state.inventory.projectBom.filter((row) => row.projectId !== project.id);
    state.inventory.projectReservations = (state.inventory.projectReservations || []).filter((row) => row.projectId !== project.id);
  } else {
    project = {
      id: nextId(state.inventory.projects || []),
      name: textValue(fd.get("projectName")) || "Imported project",
      revision: nullableText(fd.get("revision")),
      sourceFile: `pasted ${parsed.delimiter === "\t" ? "TSV" : "CSV"} BOM`,
      createdAt: now,
      updatedAt: now,
      notes: null
    };
    state.inventory.projects.push(project);
  }

  parsed.rows.forEach((normalized) => {
    const match = findPartForBom(normalized) || findBestPartForBomRow(normalized);
    state.inventory.projectBom.push({
      id: nextId(state.inventory.projectBom),
      projectId: project.id,
      partId: match?.id || null,
      value: normalized.value,
      footprint: normalized.footprint,
      mpn: normalized.mpn,
      referencesText: normalized.references,
      quantity: normalized.quantity,
      fitted: normalized.fitted,
      notes: [match ? null : "unresolved", normalized.notes, normalized.unitPrice ? `import unit price ${normalized.unitPrice}${normalized.currency ? ` ${normalized.currency}` : ""}` : null].filter(Boolean).join("; ") || null
    });
  });
  const auto = autoMatchProject(project.id);
  logActivity(mode === "update" ? "update-project-bom" : "import-project-bom", "project", project.id, `${parsed.rows.length} rows, ${auto} auto-matched`);
  touchInventory();
  if (!persistDatabase("project BOM imported", { dirty: true })) return;
  toast(`project BOM stored: ${project.name}`);
  state.activeProjectId = project.id;
  localStorage.setItem(STORAGE.activeProjectId, String(project.id));
  setView("projects");
}

function previewBomImport() {
  const form = $("#kicadBomForm");
  const target = $("#bomPreview");
  if (!form || !target) return;
  const parsed = parseBomTable(new FormData(form).get("bomCsv"), collectBomMapping(form));
  if (!parsed.rows.length) {
    const mapping = renderBomMappingControls(parsed);
    target.innerHTML = `<div class="empty-panel compact"><h3>nothing parsed</h3><p>${escapeHtml(parsed.errors[0] || "Paste CSV or TSV rows.")}</p></div>${mapping}`;
    return;
  }
  const mapping = renderBomMappingControls(parsed);
  const rows = parsed.rows.slice(0, 40).map((row) => {
    const match = findPartForBom(row) || findBestPartForBomRow(row);
    return `<tr><td>${escapeHtml(row.references || "")}</td><td>${row.quantity}</td><td>${escapeHtml(row.value || "")}</td><td>${escapeHtml(row.footprint || "")}</td><td>${escapeHtml(row.mpn || "")}</td><td>${row.fitted ? "yes" : "DNP"}</td><td>${match ? escapeHtml(match.name) : `<span class="danger-text">unresolved</span>`}</td></tr>`;
  }).join("");
  target.innerHTML = `
    <p class="section-title">preview / ${parsed.rows.length} rows / delimiter ${parsed.delimiter === "\t" ? "tab" : escapeHtml(parsed.delimiter)}</p>
    ${parsed.errors.length ? `<p class="small-note danger-text">${escapeHtml(parsed.errors.slice(0, 3).join(" / "))}</p>` : ""}
    ${mapping}
    <div class="table-wrap compact-table"><table class="data-table"><thead><tr><th>Refs</th><th>Qty</th><th>Value</th><th>Footprint</th><th>MPN</th><th>Fitted</th><th>Auto match</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function parseCsvTable(text) {
  return parseBomTable(text).rows.map((row) => ({
    references: row.references,
    quantity: row.quantity,
    value: row.value,
    footprint: row.footprint,
    mpn: row.mpn,
    fitted: row.fitted,
    notes: row.notes
  }));
}

function parseBomTable(text, mapping = null) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], delimiter: ",", errors: ["BOM text is empty"], columns: [], mapping: {} };
  const delimiter = detectTableDelimiter(lines);
  const first = parseSimpleCsvLine(lines[0], delimiter);
  const hasHeader = looksLikeBomHeader(first);
  const sourceColumns = (hasHeader ? first : first.map((_, index) => `Column ${index + 1}`)).map((label, index) => ({
    index,
    label: textValue(label) || `Column ${index + 1}`,
    autoTarget: hasHeader ? bomHeaderAlias(normalizeHeaderName(label)) : ""
  }));
  const autoMapping = buildAutoBomMapping(sourceColumns, hasHeader);
  const activeMapping = normalizeBomMapping(mapping, sourceColumns, autoMapping);
  const header = hasCustomBomMapping(mapping)
    ? null
    : hasHeader
      ? first.map(normalizeHeaderName).map(bomHeaderAlias)
      : ["references", "quantity", "value", "footprint", "mpn", "manufacturer", "notes"];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const errors = [];
  const rows = [];
  dataLines.forEach((line, index) => {
    const cells = parseSimpleCsvLine(line, delimiter);
    const raw = {};
    if (hasCustomBomMapping(mapping)) {
      Object.entries(activeMapping).forEach(([target, columnIndex]) => {
        if (columnIndex !== "" && columnIndex !== null && columnIndex !== undefined) raw[target] = cells[Number(columnIndex)] || "";
      });
    } else {
      header.forEach((name, i) => raw[name] = cells[i] || "");
    }
    const normalized = normalizeBomRow(raw);
    if (!normalized.references && !normalized.value && !normalized.mpn) {
      errors.push(`row ${index + 1}: missing refs/value/mpn`);
      return;
    }
    rows.push(normalized);
  });
  return { rows, delimiter, errors, columns: sourceColumns, mapping: activeMapping, hasHeader };
}

function collectBomMapping(form) {
  const root = form?.closest(".bom-import-card") || document;
  const controls = [...root.querySelectorAll("[data-bom-map]")];
  if (!controls.length) return null;
  const mapping = {};
  controls.forEach((control) => {
    const target = control.dataset.bomMap;
    if (target) mapping[target] = control.value;
  });
  return mapping;
}

function hasCustomBomMapping(mapping) {
  return !!mapping && Object.values(mapping).some((value) => value !== "" && value !== null && value !== undefined);
}

function buildAutoBomMapping(columns, hasHeader) {
  const mapping = {};
  if (hasHeader) {
    columns.forEach((column) => {
      if (!column.autoTarget || mapping[column.autoTarget] !== undefined) return;
      mapping[column.autoTarget] = String(column.index);
    });
    return mapping;
  }
  ["references", "quantity", "value", "footprint", "mpn", "manufacturer", "notes"].forEach((target, index) => {
    if (columns[index]) mapping[target] = String(index);
  });
  return mapping;
}

function normalizeBomMapping(mapping, columns, autoMapping) {
  const validIndexes = new Set(columns.map((column) => String(column.index)));
  const source = hasCustomBomMapping(mapping) ? mapping : autoMapping;
  const normalized = {};
  BOM_MAPPING_FIELDS.forEach(([target]) => {
    const value = source?.[target];
    normalized[target] = validIndexes.has(String(value)) ? String(value) : "";
  });
  return normalized;
}

function renderBomMappingControls(parsed) {
  if (!parsed.columns?.length) return "";
  const options = (selected) => [`<option value="">not mapped</option>`].concat(parsed.columns.map((column) => (
    `<option value="${column.index}" ${String(selected) === String(column.index) ? "selected" : ""}>${escapeHtml(column.label)}</option>`
  ))).join("");
  return `<details class="advanced-panel bom-mapping-panel" open>
    <summary>Column mapping</summary>
    <div class="bom-mapping-grid">
      ${BOM_MAPPING_FIELDS.map(([target, label]) => `<div class="field"><label>${escapeHtml(label)}</label><select data-bom-map="${escapeAttr(target)}">${options(parsed.mapping?.[target] ?? "")}</select></div>`).join("")}
    </div>
  </details>`;
}

function detectTableDelimiter(lines) {
  const candidates = ["\t", ",", ";"];
  let best = ",";
  let bestScore = -1;
  candidates.forEach((delimiter) => {
    const counts = lines.slice(0, 5).map((line) => parseSimpleCsvLine(line, delimiter).length);
    const score = counts.reduce((sum, count) => sum + (count > 1 ? count : 0), 0) - new Set(counts).size;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  });
  return best;
}

function looksLikeBomHeader(cells) {
  const names = cells.map((cell) => bomHeaderAlias(normalizeHeaderName(cell)));
  return names.some((name) => ["references", "quantity", "value", "footprint", "mpn", "manufacturer", "fitted", "dnp", "unitPrice"].includes(name));
}

function bomHeaderAlias(name) {
  const aliases = {
    ref: "references",
    refs: "references",
    refdes: "references",
    reference: "references",
    references_text: "references",
    designator: "references",
    designators: "references",
    qty: "quantity",
    count: "quantity",
    designation: "value",
    description: "value",
    package: "footprint",
    pkg: "footprint",
    part_number: "mpn",
    partnumber: "mpn",
    manufacturer_part_number: "mpn",
    mfg_part_number: "mpn",
    manf_num: "mpn",
    supplier_and_ref: "mpn",
    supplier_ref: "mpn",
    mfr: "manufacturer",
    fitted: "fitted",
    populate: "fitted",
    populated: "fitted",
    dnp: "dnp",
    do_not_populate: "dnp",
    unit_price: "unitPrice",
    price: "unitPrice"
  };
  return aliases[name] || headerAlias(name);
}

function normalizeBomRow(row) {
  const references = row.references || row.designator || row.ref || row.refs || "";
  const refs = String(references).split(/[,\s]+/).filter(Boolean);
  const dnpText = String(row.dnp || "").trim().toLowerCase();
  const fittedText = String(row.fitted || "").trim().toLowerCase();
  const isDnp = ["1", "yes", "true", "dnp", "dnf"].includes(dnpText) || ["0", "no", "false", "dnp", "dnf"].includes(fittedText);
  return {
    value: nullableText(row.value || row.designation || row.name),
    footprint: nullableText(row.footprint || row.package),
    mpn: nullableText(row.mpn || row.part_number || row.supplier_and_ref),
    manufacturer: nullableText(row.manufacturer),
    references: nullableText(references),
    quantity: integerOrZero(row.quantity || row.qty || refs.length || 1),
    fitted: isDnp ? 0 : 1,
    notes: nullableText(row.notes),
    unitPrice: nullableNumber(row.unitPrice ?? row.unit_price ?? row.price),
    currency: row.currency ? normalizeCurrency(row.currency) : null
  };
}

function findPartForBom(row) {
  const mpn = String(row.mpn || "").toLowerCase();
  if (mpn) {
    const direct = state.inventory.parts.find((part) => String(part.mpn || "").toLowerCase() === mpn);
    if (direct) return direct;
  }
  const value = String(row.value || "").toLowerCase();
  const fp = String(row.footprint || "").toLowerCase();
  return state.inventory.parts.find((part) => {
    return (!value || String(part.name || "").toLowerCase().includes(value)) &&
      (!fp || String(part.footprint || part.package || "").toLowerCase().includes(fp));
  }) || null;
}
