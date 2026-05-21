"use strict";

function openPartModal(partId = null, prefill = null) {
  const part = partId ? state.inventory.parts.find((item) => item.id === partId) : null;
  const draft = part || prefill || {};
  const title = part ? "edit part" : (prefill ? "review imported part" : "add part");
  const categoryId = part?.categoryId || categoryIdFromName(prefill?.categoryName) || state.inventory.categories[0]?.id || 1;
  const categoryName = getCategoryName(categoryId);
  const stockRows = part ? state.inventory.stock.filter((row) => row.partId === part.id) : [];
  const rowHtml = stockRows.length ? stockRows.map(renderStockEditorRow).join("") : renderStockEditorRow(null);
  const categoryOptions = state.inventory.categories.map((category) => `<option value="${category.id}" ${category.id === categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("");

  openModal(`
    <form id="partForm" class="modal-card" novalidate>
      <div class="modal-head">
        <div><p class="path-line">inventory / part editor</p><h3>${title}</h3></div>
        <button type="button" class="icon-button" data-action="close-modal">×</button>
      </div>
      <input type="hidden" name="id" value="${part ? part.id : ""}" />
      <div class="form-grid">
        <div class="field span-2"><label>name</label><input name="name" required value="${escapeAttr(draft?.name || "")}" placeholder="100nF 50V X7R 0603" /></div>
        <div class="field"><label>category</label><select name="categoryId" id="partCategorySelect">${categoryOptions}</select></div>
        <div class="field"><label>package</label><input name="package" value="${escapeAttr(draft?.package || "")}" placeholder="0603, QFN-48, SOT-23" /></div>
        <div class="field"><label>manufacturer</label><input name="manufacturer" value="${escapeAttr(draft?.manufacturer || "")}" placeholder="Texas Instruments" /></div>
        <div class="field"><label>mpn</label><input name="mpn" value="${escapeAttr(draft?.mpn || "")}" placeholder="TPS25751D" /></div>
        <div class="field"><label>footprint</label><input name="footprint" value="${escapeAttr(draft?.footprint || "")}" placeholder="C_0603_1608Metric" /></div>
        <div class="field"><label>datasheet url</label><input name="datasheetUrl" value="${escapeAttr(draft?.datasheetUrl || "")}" placeholder="https://..." /></div>
        <div class="field span-2"><label>description</label><input name="description" value="${escapeAttr(draft?.description || "")}" /></div>
        <div class="field span-2"><label>notes</label><textarea name="notes">${escapeHtml(draft?.notes || "")}</textarea></div>
      </div>

      <p class="section-title">category specific specs</p>
      <div class="spec-box" id="specFields">${renderSpecFields(draft, categoryName)}</div>

      <p class="section-title">stock</p>
      <div class="stock-editor" id="stockRows">${rowHtml}</div>
      <button type="button" class="ghost-button" data-action="add-stock-row">+ stock row</button>

      <div class="form-actions">
        ${part ? `<button type="button" class="danger-button" data-action="delete-part" data-id="${part.id}">delete</button>` : ""}
        <button type="button" class="ghost-button" data-action="close-modal">cancel</button>
        <button type="button" class="primary-button" data-action="save-part">save part</button>
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
  const spec = part?.spec || (part ? getSpec(part.id, kind) : null);
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
  state.inventory.partAliases = (state.inventory.partAliases || []).filter((alias) => alias.partId !== partId);
  state.inventory.projectReservations = (state.inventory.projectReservations || []).filter((row) => row.partId !== partId);
  (state.inventory.projectBom || []).forEach((row) => {
    if (row.partId === partId) {
      row.partId = null;
      row.notes = row.notes || "unresolved: matched part was deleted";
    }
  });
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
  const typeOptions = LOCATION_TYPES.map((type) => `<option value="${escapeAttr(type)}" ${(location?.type || "bin") === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("");

  openModal(`
    <form id="locationForm" class="modal-card" novalidate>
      <div class="modal-head">
        <div><p class="path-line">inventory / storage editor</p><h3>${location ? "edit location" : "add location"}</h3></div>
        <button type="button" class="icon-button" data-action="close-modal">×</button>
      </div>
      <input type="hidden" name="id" value="${location ? location.id : ""}" />
      <div class="form-grid">
        <div class="field"><label>name</label><input name="name" required value="${escapeAttr(location?.name || "")}" placeholder="drawer A / bin 01" /></div>
        <div class="field"><label>type</label><select name="type">${typeOptions}</select></div>
        <div class="field"><label>parent</label><select name="parentId">${parentOptions}</select></div>
        <div class="field"><label>capacity</label><input name="capacity" type="number" min="0" step="1" value="${escapeAttr(location?.capacity ?? "")}" placeholder="1000" /></div>
        <div class="field"><label>x</label><input name="x" type="number" step="1" value="${escapeAttr(location?.x ?? "")}" /></div>
        <div class="field"><label>y</label><input name="y" type="number" step="1" value="${escapeAttr(location?.y ?? "")}" /></div>
        <div class="field"><label>z</label><input name="z" type="number" step="1" value="${escapeAttr(location?.z ?? "")}" /></div>
        <div class="field"><label>color</label><input name="color" value="${escapeAttr(location?.color || "")}" placeholder="#8fc9ff" /></div>
        <div class="field"><label>LED node</label><input name="ledNode" value="${escapeAttr(location?.ledNode || "")}" placeholder="esp32-storage-1" /></div>
        <div class="field"><label>LED index</label><input name="ledIndex" type="number" step="1" value="${escapeAttr(location?.ledIndex ?? "")}" /></div>
        <div class="field span-2"><label>network highlight target</label><input name="networkTarget" value="${escapeAttr(location?.networkTarget || "")}" placeholder="http://storage-node.local/highlight" /></div>
        <div class="field span-2"><label>notes</label><textarea name="notes">${escapeHtml(location?.notes || "")}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost-button" data-action="close-modal">cancel</button>
        <button type="button" class="primary-button" data-action="save-location">save location</button>
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
    type: textValue(fd.get("type")) || "bin",
    parentId: parentRaw ? Number(parentRaw) : null,
    capacity: nullableNumber(fd.get("capacity")),
    x: nullableNumber(fd.get("x")),
    y: nullableNumber(fd.get("y")),
    z: nullableNumber(fd.get("z")),
    color: nullableText(fd.get("color")),
    ledNode: nullableText(fd.get("ledNode")),
    ledIndex: nullableNumber(fd.get("ledIndex")),
    networkTarget: nullableText(fd.get("networkTarget")),
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
  if (location.parentId && isDescendantLocation(location.parentId, id)) {
    toast("location cannot use its own child as parent", "error");
    return;
  }

  if (existing) Object.assign(existing, location);
  else state.inventory.locations.push(location);

  touchInventory();
  if (!persistDatabase(existing ? "location updated" : "location added", { dirty: true })) return;
  closeModal();
  render();
}

function isDescendantLocation(candidateParentId, locationId) {
  let current = state.inventory.locations.find((item) => item.id === Number(candidateParentId));
  const visited = new Set();
  while (current) {
    if (current.id === Number(locationId)) return true;
    if (!current.parentId || visited.has(current.id)) return false;
    visited.add(current.id);
    current = state.inventory.locations.find((item) => item.id === Number(current.parentId));
  }
  return false;
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
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-layer">${html}</div>`;

  // Direct guard for dynamically inserted modal forms.
  // This prevents accidental native GET submits even if global delegation fails.
  const form = $("form", root);
  if (form) {
    form.addEventListener("submit", handleSubmit);
  }
}

function closeModal() {
  $("#modalRoot").innerHTML = "";
}



function openBomRowModal(rowId) {
  const row = state.inventory.projectBom.find((item) => item.id === Number(rowId));
  if (!row) return;
  const partOptions = [`<option value="">unresolved</option>`].concat(
    state.inventory.parts.map((part) => `<option value="${part.id}" ${row.partId === part.id ? "selected" : ""}>${escapeHtml(part.name)}</option>`)
  ).join("");
  openModal(`
    <form id="bomRowForm" class="modal-card" novalidate>
      <div class="modal-head">
        <div><p class="path-line">project / BOM row</p><h3>edit BOM row</h3></div>
        <button type="button" class="icon-button" data-action="close-modal">×</button>
      </div>
      <input type="hidden" name="id" value="${row.id}" />
      <div class="form-grid">
        <div class="field"><label>references</label><input name="referencesText" value="${escapeAttr(row.referencesText || "")}" /></div>
        <div class="field"><label>value</label><input name="value" value="${escapeAttr(row.value || "")}" /></div>
        <div class="field"><label>footprint</label><input name="footprint" value="${escapeAttr(row.footprint || "")}" /></div>
        <div class="field"><label>mpn</label><input name="mpn" value="${escapeAttr(row.mpn || "")}" /></div>
        <div class="field"><label>quantity</label><input name="quantity" type="number" min="0" step="1" value="${escapeAttr(row.quantity || 0)}" /></div>
        <div class="field"><label>matched part</label><select name="partId">${partOptions}</select></div>
        <label class="switch-row inline-switch"><span>fitted</span><input name="fitted" type="checkbox" ${row.fitted === 0 ? "" : "checked"} /></label>
        <div class="field span-2"><label>notes</label><textarea name="notes">${escapeHtml(row.notes || "")}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost-button" data-action="close-modal">cancel</button>
        <button type="button" class="primary-button" data-action="save-bom-row">save BOM row</button>
      </div>
    </form>
  `);
}

function saveBomRowFromForm(form) {
  const fd = new FormData(form);
  const row = state.inventory.projectBom.find((item) => item.id === Number(fd.get("id")));
  if (!row) return;
  row.referencesText = nullableText(fd.get("referencesText"));
  row.value = nullableText(fd.get("value"));
  row.footprint = nullableText(fd.get("footprint"));
  row.mpn = nullableText(fd.get("mpn"));
  row.quantity = integerOrZero(fd.get("quantity"));
  row.partId = fd.get("partId") ? Number(fd.get("partId")) : null;
  row.fitted = fd.get("fitted") === "on" ? 1 : 0;
  row.notes = nullableText(fd.get("notes"));
  logActivity("edit-bom-row", "project_bom", row.id, row.value || row.referencesText || "");
  touchInventory();
  if (!persistDatabase("BOM row updated", { dirty: true })) return;
  closeModal();
  render();
}
