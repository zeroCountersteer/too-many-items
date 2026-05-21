"use strict";

function renderShellLoading() {
  $("#noticeLine").textContent = "initializing SQLite database engine";
  $("#noticeLine").hidden = false;
  $("#viewPanel").innerHTML = `<div class="empty-panel"><h3>loading</h3><p>Preparing the local SQLite database.</p></div>`;
}

function render() {
  ensureInventoryShape(state.inventory);
  renderNavigation();
  renderHeader();

  const panel = $("#viewPanel");
  const renderers = {
    parts: renderPartsView,
    add: renderAddImportView,
    locations: renderLocationsView,
    projects: renderProjectsView,
    database: renderDatabaseView,
    settings: renderSettingsView
  };
  panel.innerHTML = (renderers[state.activeView] || renderPartsView)();
}

function renderPartsViewOnly() {
  if (state.activeView === "parts") $("#viewPanel").innerHTML = renderPartsView();
}

function renderHeader() {
  const owner = state.githubConfig?.owner || DEFAULT_REPO_OWNER;
  const titles = {
    parts: ["inventory / parts", "Parts"],
    add: ["inventory / add", "Bulk Add"],
    locations: ["inventory / storage", "Locations"],
    projects: ["inventory / projects", "Projects / BOM"],
    database: ["inventory / database", "Stats / DB"],
    settings: [owner, "Settings"]
  };
  const [path, title] = titles[state.activeView] || titles.parts;
  $("#pathLine").textContent = path;
  $("#windowTitle").textContent = title;

  const notice = $("#noticeLine");
  if (!notice) return;
  const text = state.sqliteError ? `SQLite engine is not available: ${state.sqliteError}` : "";
  notice.textContent = text;
  notice.hidden = !text;
}

function summaryChipHtml(value, label, tone = "") {
  return `<div class="summary-chip ${tone}"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderSummaryStrip(items) {
  return `<div class="summary-strip">${items.map((item) => summaryChipHtml(item[0], item[1], item[2] || "")).join("")}</div>`;
}

function renderNavigation() {
  $$("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  const owner = state.githubConfig?.owner || DEFAULT_REPO_OWNER;
  const repo = state.githubConfig?.repo || DEFAULT_REPO_NAME;
  const ownerHeader = $("#ownerHeader");
  if (ownerHeader) ownerHeader.textContent = owner;
  const navName = $("#navDbName");
  const navState = $("#navDbState");
  const navDetails = $("#navDbDetails");
  if (navName) navName.textContent = repo === "local" ? (state.dbFileName || "inventory.db") : repo;
  if (navState) navState.textContent = databaseStateLabel();
  if (navDetails) {
    navDetails.innerHTML = [
      ["branch", state.githubConfig?.branch || "main"],
      ["path", state.githubConfig?.path || BUNDLED_DB_PATH],
      ["state", databaseStateLabel()],
      ["source", state.dbSource || "local"],
      ["updated", formatDate(state.inventory.meta?.updatedAt) || "--"]
    ].map(([key, value]) => `<div><span>${escapeHtml(String(key))}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
  }
}

function renderSettingsView() {
  const cfg = state.githubConfig;
  const tokenPresent = sessionStorage.getItem(STORAGE.token) ? "token active for this tab" : "token not set";
  const themeOptions = allThemes().map((theme) => `<option value="${escapeAttr(theme.id)}" ${theme.id === state.activeTheme ? "selected" : ""}>${escapeHtml(theme.name)}</option>`).join("");
  const current = getTheme(state.activeTheme) || BUILTIN_THEMES[DEFAULT_THEME_ID];
  const editor = THEME_FIELDS.map((key) => {
    const value = current.variables[key] || getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    return `<div class="theme-field"><label>${escapeHtml(key)}</label><input data-theme-var="${escapeAttr(key)}" value="${escapeAttr(value)}" /></div>`;
  }).join("");

  return `
    <form id="settingsForm" class="view-stack">
      <div class="view-toolbar">
        <h3 class="view-title">sync and appearance</h3>
        <div class="action-row">
          <button type="submit" class="primary-button">save settings</button>
        </div>
      </div>

      ${renderSummaryStrip([
        [cfg.owner || DEFAULT_REPO_OWNER, "owner"],
        [cfg.repo || DEFAULT_REPO_NAME, "repo"],
        [tokenPresent, "token"],
        [state.githubSha ? "recorded" : "none", "remote version"]
      ])}

      <div class="settings-grid">
        <section class="panel form-section">
          <h4>GitHub storage</h4>
          <div class="form-grid">
            <div class="field"><label>owner</label><input name="owner" value="${escapeAttr(cfg.owner || "")}" placeholder="github username or org" /></div>
            <div class="field"><label>repo</label><input name="repo" value="${escapeAttr(cfg.repo || "")}" placeholder="inventory-data" /></div>
            <div class="field"><label>branch</label><input name="branch" value="${escapeAttr(cfg.branch || "main")}" placeholder="main" /></div>
            <div class="field"><label>path</label><input name="path" value="${escapeAttr(cfg.path || BUNDLED_DB_PATH)}" placeholder="data/inventory.db" /></div>
            <div class="field span-2"><label>fine-grained token, Contents: read/write</label><input type="password" name="token" placeholder="session only" autocomplete="off" /></div>
          </div>
          <div class="action-row">
            <button type="button" data-action="load-github">load from github</button>
            <button type="button" class="primary-button" data-action="commit-github">commit inventory.db</button>
          </div>
        </section>

        <section class="panel form-section danger-zone">
          <h4>local browser copy</h4>
          <p class="small-note">Edits survive refreshes in local browser storage until you clear them.</p>
          <button type="button" class="danger-button" data-action="clear-cache">clear local copy</button>
        </section>
      </div>

      <details class="panel advanced-panel">
        <summary>Advanced appearance</summary>
        <div class="appearance-grid">
          <label class="switch-row">
            <span>moving background</span>
            <input id="movingToggleSettings" type="checkbox" ${state.movingBackground ? "checked" : ""} />
          </label>
          <div class="theme-select-row">
            <div class="field"><label>theme</label><select id="themeSelect">${themeOptions}</select></div>
            <button type="button" data-action="import-theme">import</button>
          </div>
          <div class="action-row">
            <button type="button" data-action="export-theme">export theme</button>
            <button type="button" class="danger-button" data-action="reset-theme">reset custom</button>
          </div>
        </div>
        <p class="section-title">theme variables</p>
        <div class="theme-editor-grid compact">${editor}</div>
      </details>
    </form>
  `;
}

function renderPartsView() {
  const categories = state.inventory.categories;
  const filtered = filteredParts();
  const metrics = getMetrics();
  const categoryOptions = [`<option value="all">all categories</option>`]
    .concat(categories.map((category) => `<option value="${category.id}" ${String(category.id) === String(state.categoryFilter) ? "selected" : ""}>${escapeHtml(category.name)}</option>`))
    .join("");
  const sortOptions = [
    ["category", "sort: category"],
    ["name", "sort: name"],
    ["value", "sort: value/spec"],
    ["voltage", "sort: voltage"],
    ["tolerance", "sort: tolerance"],
    ["quantity", "sort: quantity"],
    ["package", "sort: package"],
    ["location", "sort: location"],
    ["id", "sort: id"]
  ].map(([value, label]) => `<option value="${value}" ${state.sortKey === value ? "selected" : ""}>${label}</option>`).join("");

  state.visibleColumns = normalizeVisibleColumns(state.visibleColumns);
  const columnChooser = Object.entries(PART_COLUMN_DEFS).map(([key, label]) => {
    const checked = state.visibleColumns.includes(key);
    const disabled = key === "actions";
    return `<label class="check-chip"><input type="checkbox" data-column-toggle value="${escapeAttr(key)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />${escapeHtml(label || "actions")}</label>`;
  }).join("");

  const visibleParts = filtered.slice(0, Number(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit));
  const table = filtered.length
    ? renderPartsTable(visibleParts, filtered.length)
    : `<div class="empty-panel compact"><h3>no matching parts</h3><p>Clear filters or add a component.</p><div class="action-row"><button type="button" class="primary-button" data-action="open-add-part">add part</button></div></div>`;

  const categoryKindName = state.categoryFilter !== "all" ? categoryKind(getCategoryName(Number(state.categoryFilter))) : "";
  const minPlaceholder = categoryKindName === "resistor" ? "min 1k" : categoryKindName === "capacitor" ? "min 100N" : categoryKindName === "inductor" ? "min 1U" : "spec min";
  const maxPlaceholder = categoryKindName === "resistor" ? "max 10k" : categoryKindName === "capacitor" ? "max 10U" : categoryKindName === "inductor" ? "max 100U" : "spec max";

  return `
    <div class="view-stack">
      <div class="view-toolbar sticky-tools">
        <div class="toolbar-main parts-toolbar">
          <input type="search" data-search value="${escapeAttr(state.query)}" placeholder="search parts" />
          <select data-category-filter>${categoryOptions}</select>
          <select data-stock-filter>
            <option value="all" ${state.stockFilter === "all" ? "selected" : ""}>stock: all</option>
            <option value="in-stock" ${state.stockFilter === "in-stock" ? "selected" : ""}>stock: in stock</option>
            <option value="low" ${state.stockFilter === "low" ? "selected" : ""}>stock: low</option>
            <option value="zero" ${state.stockFilter === "zero" ? "selected" : ""}>stock: zero</option>
            <option value="no-location" ${state.stockFilter === "no-location" ? "selected" : ""}>stock: no location</option>
          </select>
          <select data-sort-key>${sortOptions}</select>
          <select data-sort-dir>
            <option value="asc" ${state.sortDir !== "desc" ? "selected" : ""}>asc</option>
            <option value="desc" ${state.sortDir === "desc" ? "selected" : ""}>desc</option>
          </select>
        </div>
        <div class="action-row">
          <button type="button" data-action="set-view" data-target-view="add">bulk add</button>
          <button type="button" class="primary-button" data-action="open-add-part">add part</button>
          <button type="button" data-action="export-csv">CSV</button>
          <button type="button" data-action="export-db">DB</button>
        </div>
      </div>

      ${renderSummaryStrip([
        [filtered.length, "shown"],
        [metrics.parts, "parts"],
        [metrics.quantity, "items"],
        [metrics.lowStock, "low stock", metrics.lowStock ? "warn" : ""]
      ])}

      <details class="panel advanced-panel">
        <summary>Filters and columns</summary>
        <div class="toolbar-main advanced-filters">
          <input type="search" data-package-filter value="${escapeAttr(state.packageFilter || "")}" placeholder="package/footprint" />
          <input type="search" data-spec-min value="${escapeAttr(state.specFilterMin || "")}" placeholder="${escapeAttr(minPlaceholder)}" />
          <input type="search" data-spec-max value="${escapeAttr(state.specFilterMax || "")}" placeholder="${escapeAttr(maxPlaceholder)}" />
          <input type="search" data-spec-extra value="${escapeAttr(state.specFilterExtra || "")}" placeholder="spec text, dielectric, interface" />
          <input type="number" data-render-limit min="50" step="50" value="${escapeAttr(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit)}" title="render limit" />
        </div>
        <div class="column-grid">${columnChooser}</div>
        <button type="button" class="ghost-button small-button" data-action="reset-columns">reset columns</button>
      </details>

      ${table}
    </div>
  `;
}

function renderPartsTable(parts, totalCount) {
  const columns = normalizeVisibleColumns(state.visibleColumns);
  const renderCell = (part, col) => {
    const category = getCategoryName(part.categoryId);
    const stock = stockSummary(part.id);
    const spec = specSummary(part);
    const low = stock.total <= stock.min && stock.min > 0;
    const mpn = [part.manufacturer, part.mpn].filter(Boolean).join(" / ") || "generic";
    if (col === "id") return `<td class="mono-cell">${part.id}</td>`;
    if (col === "name") return `<td><span class="part-name">${escapeHtml(part.name)}</span><span class="subtext">${escapeHtml(mpn)}</span></td>`;
    if (col === "category") return `<td><span class="badge">${escapeHtml(category)}</span></td>`;
    if (col === "value") return `<td><span class="mono-cell">${escapeHtml(spec || "-")}</span></td>`;
    if (col === "package") return `<td><span class="mono-cell">${escapeHtml(part.package || "")}</span></td>`;
    if (col === "footprint") return `<td><span class="subtext">${escapeHtml(part.footprint || "")}</span></td>`;
    if (col === "quantity") return `<td><span class="${low ? "qty-low" : "qty-ok"}">${stock.total}</span></td>`;
    if (col === "min") return `<td>${stock.min || ""}</td>`;
    if (col === "location") return `<td>${escapeHtml(stock.locations || "-")}</td>`;
    if (col === "manufacturer") return `<td>${escapeHtml(part.manufacturer || "")}</td>`;
    if (col === "mpn") return `<td>${escapeHtml(part.mpn || "")}</td>`;
    if (col === "notes") return `<td>${escapeHtml(part.notes || "")}</td>`;
    if (col === "actions") return `<td class="action-cell"><button type="button" class="ghost-button small-button" data-action="open-edit-part" data-id="${part.id}">edit</button></td>`;
    return "";
  };
  const headers = columns.map((col) => `<th>${escapeHtml(PART_COLUMN_DEFS[col] || "Actions")}</th>`).join("");
  const rows = parts.map((part) => `<tr>${columns.map((col) => renderCell(part, col)).join("")}</tr>`).join("");
  const more = totalCount > parts.length ? `<div class="table-more">${parts.length} of ${totalCount} rows rendered. Increase the render limit in Filters and columns.</div>` : "";
  return `<div class="table-wrap"><table class="data-table compact-parts-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>${more}`;
}

function renderDatabaseView() {
  const validation = validateInventory(state.inventory);
  const metrics = getMetrics();
  const catRows = categoryStats().slice(0, 12).map((row) => renderBar(row.category.name, row.count, row.percent)).join("");
  const storage = storageStats();
  const storageRows = storage.byLocation.slice(0, 12).map((row) => renderBar(locationPath(row.location.id), row.quantity, row.fill == null ? Math.min(100, row.quantity ? 12 : 0) : row.fill)).join("");
  const pstats = projectStats();
  const reservations = (state.inventory.projectReservations || []).length;
  const healthDetails = validation.ok
    ? "Inventory references are valid."
    : `<ul class="validation-list">${validation.errors.slice(0, 8).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}${validation.errors.length > 8 ? `<li>${validation.errors.length - 8} more issues</li>` : ""}</ul>`;

  return `
    <div class="view-stack">
      <div class="view-toolbar">
        <h3 class="view-title">database health</h3>
        <div class="action-row">
          <button type="button" data-action="import-db">open .db</button>
          <button type="button" class="primary-button" data-action="export-db">export .db</button>
        </div>
      </div>

      <div class="summary-strip dashboard-strip">
        ${summaryChipHtml(metrics.parts, "parts")}
        ${summaryChipHtml(metrics.quantity, "items")}
        ${summaryChipHtml(metrics.stockRecords, "stock rows")}
        ${summaryChipHtml(metrics.lowStock, "low stock", metrics.lowStock ? "warn" : "")}
        ${summaryChipHtml(metrics.locations, "locations")}
        ${summaryChipHtml(pstats.projects, "projects")}
      </div>

      <div class="database-grid stats-grid">
        <section class="panel stat-big"><h4>inventory</h4><div class="stat-number">${metrics.parts}</div><p>${metrics.quantity} items / ${metrics.stockRecords} stock rows</p></section>
        <section class="panel stat-big"><h4>storage</h4><div class="stat-number">${metrics.locations}</div><p>${storage.orphanRows} stock rows without location</p></section>
        <section class="panel stat-big"><h4>projects</h4><div class="stat-number">${pstats.projects}</div><p>${pstats.bomRows} BOM rows / ${pstats.unresolved} unresolved / ${reservations} reservations</p></section>
        <section class="panel health-panel ${validation.ok ? "ok-card" : "warn-card"}"><h4>health</h4>${validation.ok ? `<p>${healthDetails}</p>` : healthDetails}</section>
      </div>

      <div class="database-grid two-col">
        <section class="panel"><h4>category distribution</h4><div class="bar-list">${catRows || "<p>No category data.</p>"}</div></section>
        <section class="panel"><h4>storage occupancy</h4><div class="bar-list">${storageRows || "<p>No locations yet.</p>"}</div></section>
      </div>

      <section class="panel">
        <div class="panel-head">
          <h4>maintenance</h4>
          <div class="action-row">
            <button type="button" data-action="copy-debug">copy debug snapshot</button>
            <button type="button" data-action="clear-service-worker">clear SW cache</button>
            <button type="button" data-action="load-bundled-db">reload bundled db</button>
            <button type="button" data-action="save-local-db">save local copy</button>
            <button type="button" class="primary-button" data-action="export-db">download inventory.db</button>
            <button type="button" class="danger-button" data-action="new-database">new empty database</button>
          </div>
        </div>
        <dl class="kv-list">
          <div><dt>source</dt><dd>${escapeHtml(state.dbSource || "local")}</dd></div>
          <div><dt>remote path</dt><dd>${escapeHtml(state.githubConfig.path || BUNDLED_DB_PATH)}</dd></div>
          <div><dt>state</dt><dd>${escapeHtml(databaseStateLabel())}</dd></div>
          <div><dt>render limit</dt><dd>${escapeHtml(String(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit))}</dd></div>
          <div><dt>index cache</dt><dd>${indexCache ? "built" : "cold"}</dd></div>
        </dl>
      </section>
    </div>
  `;
}

function renderBar(label, value, percent) {
  const width = Math.max(2, Math.min(100, Number(percent) || 0));
  return `<div class="stat-bar-row"><div class="stat-bar-label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div><div class="stat-bar"><span style="width:${width}%"></span></div></div>`;
}

function renderLocationsView() {
  const roots = state.inventory.locations.filter((loc) => !loc.parentId);
  const storage = storageStats();
  const tree = roots.length
    ? `<div class="location-tree">${roots.map((location) => renderLocationNode(location)).join("")}</div>`
    : `<div class="empty-panel"><h3>no storage map yet</h3><p>Add a cabinet, drawer, bin, box, or LED node.</p><button type="button" class="primary-button" data-action="open-add-location">add location</button></div>`;

  return `
    <div class="view-stack">
      <div class="view-toolbar">
        <h3 class="view-title">hierarchical storage</h3>
        <div class="action-row">
          <button type="button" class="primary-button" data-action="open-add-location">add location</button>
          <button type="button" data-action="export-db">export</button>
        </div>
      </div>
      ${renderSummaryStrip([
        [state.inventory.locations.length, "locations"],
        [roots.length, "roots"],
        [storage.orphanRows, "unplaced stock", storage.orphanRows ? "warn" : ""],
        [storage.byLocation.length, "occupied"]
      ])}
      ${tree}
    </div>
  `;
}

function renderLocationNode(location, depth = 0) {
  const children = state.inventory.locations.filter((item) => item.parentId === location.id);
  const stockRows = state.inventory.stock.filter((row) => row.locationId === location.id);
  const qty = stockRows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const capacity = numberOrZero(location.capacity);
  const fill = capacity ? Math.min(100, Math.round(qty / capacity * 100)) : null;
  const color = location.color ? `--loc-color:${escapeAttr(location.color)};` : "";
  const meta = [
    location.type || "bin",
    `id ${location.id}`,
    `qty ${qty}`,
    capacity ? `capacity ${capacity}` : "",
    location.x != null || location.y != null || location.z != null ? `xyz ${location.x ?? "-"},${location.y ?? "-"},${location.z ?? "-"}` : "",
    location.ledNode ? `LED ${location.ledNode}${location.ledIndex != null ? ` #${location.ledIndex}` : ""}` : "",
    location.networkTarget ? "highlight target" : ""
  ].filter(Boolean);

  return `<article class="location-node depth-${Math.min(depth, 5)}" style="--depth:${Math.min(depth, 5)};${color}">
    <div class="location-row">
      <div class="location-main">
        <h4><span class="loc-dot"></span>${escapeHtml(location.name)}</h4>
        <div class="meta-row">${meta.map((item) => `<span class="meta-chip">${escapeHtml(item)}</span>`).join("")}</div>
        ${fill != null ? `<div class="stat-bar small"><span style="width:${fill}%"></span></div>` : ""}
      </div>
      <div class="action-row row-actions">
        <button type="button" class="ghost-button" data-action="highlight-location" data-id="${location.id}">highlight</button>
        <button type="button" class="ghost-button" data-action="open-edit-location" data-id="${location.id}">edit</button>
        <button type="button" class="danger-button" data-action="delete-location" data-id="${location.id}">delete</button>
      </div>
    </div>
    ${children.length ? `<div class="location-children">${children.map((child) => renderLocationNode(child, depth + 1)).join("")}</div>` : ""}
  </article>`;
}

function renderAddImportView() {
  const locations = [`<option value="">no default location</option>`].concat(
    state.inventory.locations.map((location) => `<option value="${location.id}">${escapeHtml(locationPath(location.id))}</option>`)
  ).join("");

  return `
    <div class="view-stack">
      <div class="view-toolbar">
        <h3 class="view-title">bulk entry</h3>
        <div class="action-row"><button type="button" class="primary-button" data-action="open-add-part">manual part</button></div>
      </div>
      ${renderSummaryStrip([
        ["row editor", "bulk add"],
        ["E3-E96", "series"],
        ["KiCad CSV", "project BOM"]
      ])}
      <div class="add-import-grid">
        <section class="panel form-section add-card">
          <div class="panel-head"><h4>spreadsheet bulk add</h4></div>
          <form id="bulkImportForm" novalidate onsubmit="return false;">
            <div class="form-grid compact-defaults">
              <div class="field"><label>kind</label><select name="kind"><option value="resistor">resistors</option><option value="capacitor">capacitors</option><option value="inductor">inductors</option><option value="generic">generic parts</option></select></div>
              <div class="field"><label>package</label><input name="defaultPackage" placeholder="0603" /></div>
              <div class="field"><label>footprint</label><input name="defaultFootprint" placeholder="R_0603_1608Metric" /></div>
              <div class="field"><label>default qty</label><input name="defaultQuantity" type="number" min="0" step="1" value="0" /></div>
              <div class="field"><label>min stock</label><input name="defaultMin" type="number" min="0" step="1" value="0" /></div>
              <div class="field"><label>location</label><select name="defaultLocationId">${locations}</select></div>
              <div class="field"><label>or new location</label><input name="defaultLocationName" placeholder="home / drawer A / 0603" /></div>
              <div class="field"><label>source</label><input name="defaultSource" placeholder="LCSC, AliExpress, Mouser" /></div>
              <div class="field"><label>tolerance %</label><input name="defaultTolerance" placeholder="1" /></div>
              <div class="field"><label>power W</label><input name="defaultPower" placeholder="0.1 or 1/10W" /></div>
              <div class="field"><label>voltage V</label><input name="defaultVoltage" placeholder="50" /></div>
              <div class="field"><label>dielectric</label><input name="defaultDielectric" placeholder="X7R, C0G, NP0" /></div>
              <div class="field"><label>current A</label><input name="defaultCurrent" placeholder="1.5" /></div>
              <label class="switch-row inline-switch"><span>merge matches</span><input name="mergeExisting" type="checkbox" checked /></label>
            </div>

            <div class="bulk-grid-editor" id="bulkGrid">
              ${renderBulkLine(0)}
            </div>
            <div class="action-row">
              <button type="button" data-action="add-bulk-line">blank row</button>
              <button type="button" data-action="clone-bulk-line" data-id="0">clone previous</button>
              <button type="button" data-action="preview-bulk">preview</button>
              <button type="button" class="primary-button" data-action="import-bulk">import rows</button>
            </div>

            <details class="advanced-panel nested-card">
              <summary>Series generator</summary>
              <div class="form-grid compact-defaults">
                <div class="field"><label>series</label><select name="seriesName"><option>E24</option><option>E48</option><option>E96</option><option>E12</option><option>E6</option><option>E3</option></select></div>
                <div class="field"><label>decades</label><input name="seriesDecades" value="100,1k,10k,100k" /></div>
                <div class="field"><label>qty</label><input name="seriesQty" type="number" value="100" /></div>
                <div class="field"><label>replace rows</label><select name="seriesReplace"><option value="append">append</option><option value="replace">replace</option></select></div>
              </div>
              <button type="button" data-action="generate-series">generate rows</button>
            </details>

            <textarea name="bulkText" class="bulk-textarea hidden-bulk-text" hidden></textarea>
          </form>
          <div id="bulkPreview" class="bulk-preview"></div>
        </section>

        <section class="panel form-section add-card bom-import-card">
          <div class="panel-head"><h4>KiCad BOM import</h4></div>
          <form id="kicadBomForm" novalidate onsubmit="return false;">
            <div class="form-grid">
              <div class="field"><label>project name</label><input name="projectName" placeholder="My keyboard PCB" /></div>
              <div class="field"><label>revision</label><input name="revision" placeholder="rev A" /></div>
              <div class="field span-2"><label>BOM CSV</label><textarea name="bomCsv" class="bulk-textarea" placeholder='"Id","Designator","Package","Quantity","Designation","Supplier and ref"'></textarea></div>
            </div>
            <div class="action-row">
              <button type="button" class="primary-button" data-action="import-kicad-bom">store project BOM</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  `;
}

function renderBulkLine(index, row = {}) {
  return `<div class="bulk-line" data-bulk-row="${index}">
    <input data-bulk-input name="bulkValue_${index}" placeholder="value" value="${escapeAttr(row.value || "")}" />
    <input data-bulk-input name="bulkQty_${index}" type="number" min="0" step="1" placeholder="qty" value="${escapeAttr(row.quantity || "")}" />
    <input data-bulk-input name="bulkMin_${index}" type="number" min="0" step="1" placeholder="min" value="${escapeAttr(row.min || "")}" />
    <input data-bulk-input name="bulkLocation_${index}" placeholder="location override" value="${escapeAttr(row.location || "")}" />
    <input data-bulk-input name="bulkSource_${index}" placeholder="source" value="${escapeAttr(row.source || "")}" />
    <button type="button" data-action="clone-bulk-line" data-id="${index}">clone</button>
    <button type="button" class="danger-button" data-action="remove-bulk-line" data-id="${index}">remove</button>
  </div>`;
}

function renderProjectsView() {
  const projects = state.inventory.projects || [];
  const project = activeProject();
  const list = projects.length
    ? projects.map((item) => {
        const summary = projectSummary(item.id);
        return `<button type="button" class="project-list-item ${project?.id === item.id ? "active" : ""}" data-action="select-project" data-id="${item.id}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.revision || "no rev")} / ${summary.rows} rows / ${summary.shortageRows} shortages</span>
        </button>`;
      }).join("")
    : `<div class="empty-panel compact"><h3>no projects</h3><p>Import a KiCad BOM from the Add view.</p><button type="button" data-action="set-view" data-target-view="add">import BOM</button></div>`;

  if (!project) {
    return `
      <div class="view-stack">
        <div class="view-toolbar">
          <h3 class="view-title">projects / BOM</h3>
          <div class="action-row"><button type="button" data-action="set-view" data-target-view="add">import BOM</button></div>
        </div>
        <div class="projects-layout"><aside class="project-list">${list}</aside></div>
      </div>
    `;
  }

  const summary = projectSummary(project.id);
  const rows = projectBomRows(project.id)
    .filter((row) => {
      const q = String(state.projectQuery || "").toLowerCase();
      if (!q) return true;
      const part = row.partId ? state.inventory.parts.find((item) => item.id === row.partId) : null;
      return [row.value, row.footprint, row.mpn, row.referencesText, part?.name].filter(Boolean).join(" ").toLowerCase().includes(q);
    });

  return `
    <div class="view-stack">
      <div class="view-toolbar">
        <h3 class="view-title">projects / BOM</h3>
        <div class="action-row">
          <button type="button" data-action="set-view" data-target-view="add">import BOM</button>
          <button type="button" data-action="reserve-project" data-id="${project.id}">reserve</button>
          <button type="button" data-action="release-project" data-id="${project.id}">release</button>
          <button type="button" class="danger-button" data-action="apply-project-consumption" data-id="${project.id}">consume stock</button>
        </div>
      </div>
      <div class="projects-layout">
        <aside class="project-list">${list}</aside>
        <section class="project-detail">
          <div class="panel project-summary-panel">
            <div class="project-head">
              <div>
                <h4>${escapeHtml(project.name)}</h4>
                <p>${escapeHtml(project.revision || "no revision")}</p>
              </div>
              <button type="button" data-action="delete-project" data-id="${project.id}" class="danger-button">delete project</button>
            </div>
            ${renderSummaryStrip([
              [summary.rows, "BOM rows"],
              [summary.needed, "needed"],
              [summary.reserved, "reserved"],
              [summary.unresolved, "unresolved", summary.unresolved ? "warn" : ""],
              [summary.shortageRows, "shortages", summary.shortageRows ? "warn" : ""]
            ])}
            <input type="search" data-project-search value="${escapeAttr(state.projectQuery || "")}" placeholder="filter BOM rows" />
          </div>
          ${renderBomTable(project, rows)}
        </section>
      </div>
    </div>
  `;
}

function renderBomTable(project, rows) {
  const body = rows.length ? rows.map((row) => {
    const part = row.partId ? state.inventory.parts.find((item) => item.id === row.partId) : null;
    const status = bomRowStatus(row);
    return `<tr class="${status.shortage ? "bom-shortage" : ""}">
      <td>${escapeHtml(row.referencesText || "")}</td>
      <td>${escapeHtml(row.value || "")}</td>
      <td>${escapeHtml(row.footprint || "")}</td>
      <td>${escapeHtml(row.mpn || "")}</td>
      <td>${row.quantity}</td>
      <td>${part ? `<button type="button" class="link-button" data-action="open-edit-part" data-id="${part.id}">${escapeHtml(part.name)}</button>` : `<span class="danger-text">unresolved</span>`}</td>
      <td>${status.available}</td>
      <td>${status.reserved}</td>
      <td>${status.shortage ? `<span class="qty-low">${status.shortage}</span>` : `<span class="qty-ok">0</span>`}</td>
      <td>${row.fitted === 0 ? "no" : "yes"}</td>
      <td class="bom-actions action-cell">
        <button type="button" data-action="match-bom-row" data-id="${row.id}">match</button>
        <button type="button" data-action="open-edit-bom-row" data-id="${row.id}">edit</button>
        <button type="button" data-action="unlink-bom-row" data-id="${row.id}">unlink</button>
        <button type="button" class="danger-button" data-action="delete-bom-row" data-id="${row.id}">delete</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="11">No BOM rows.</td></tr>`;

  return `<div class="table-wrap"><table class="data-table compact-parts-table bom-table">
    <thead><tr>${Object.values(PROJECT_COLUMN_DEFS).map((label) => `<th>${escapeHtml(label || "Actions")}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}
