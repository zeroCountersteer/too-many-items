"use strict";

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
  if (state.activeView === "add") panel.innerHTML = renderAddImportView();
  if (state.activeView === "locations") panel.innerHTML = renderLocationsView();
  if (state.activeView === "projects") panel.innerHTML = renderProjectsView();
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
  const navDetails = $("#navDbDetails");
  const metrics = getMetrics();
  if (navName) navName.textContent = state.dbFileName || "inventory.db";
  if (navState) navState.textContent = databaseStateLabel();
  if (navDetails) {
    const source = state.githubConfig?.repo ? "github" : (state.dbSource || "local");
    navDetails.innerHTML = [
      ["source", source],
      ["parts", metrics.parts],
      ["stock", metrics.quantity],
      ["locations", metrics.locations],
      ["updated", formatDate(state.inventory.meta?.updatedAt) || "--"]
    ].map(([key, value]) => `<div><span>${escapeHtml(String(key))}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
  }
}

function renderHeader() {
  const titles = {
    parts: ["inventory", "parts"],
    add: ["inventory", "bulk add"],
    locations: ["inventory", "locations"],
    projects: ["inventory", "projects"],
    database: ["inventory", "statistics"],
    settings: ["inventory", "settings"]
  };
  const [path, title] = titles[state.activeView] || titles.parts;
  $("#pathLine").textContent = path;
  $("#windowTitle").textContent = title;
  $("#chromeActions").innerHTML = "";

  const notice = $("#noticeLine");
  if (!notice) return;
  let text = state.sqliteError ? `SQLite engine is not available: ${state.sqliteError}` : "";
  notice.textContent = text;
  notice.hidden = true;
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
  const rightStats = $("#rightStats");
  if (!rightStats) return;
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

  rightStats.innerHTML = databaseRows.concat(categoryRows).join("");
  if ($("#createdDate")) $("#createdDate").textContent = formatDate(state.inventory.meta?.createdAt);
  if ($("#updatedDate")) $("#updatedDate").textContent = formatDate(state.inventory.meta?.updatedAt);
  if ($("#dbSourceText")) $("#dbSourceText").textContent = state.dbSource || "local";
}

function renderPartsView() {
  const categories = state.inventory.categories;
  const filtered = filteredParts();
  const categoryOptions = [`<option value="all">all categories</option>`]
    .concat(categories.map((category) => `<option value="${category.id}" ${String(category.id) === String(state.categoryFilter) ? "selected" : ""}>${escapeHtml(category.name)}</option>`))
    .join("");
  const sortOptions = [
    ["category", "sort: category"],
    ["name", "sort: name"],
    ["quantity", "sort: quantity"],
    ["package", "sort: package"],
    ["location", "sort: location"],
    ["id", "sort: id"]
  ].map(([value, label]) => `<option value="${value}" ${state.sortKey === value ? "selected" : ""}>${label}</option>`).join("");

  const visibleParts = filtered.slice(0, Number(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit));
  const table = filtered.length
    ? renderPartsTable(visibleParts)
    : `<div class="empty-state compact">
        <div>
          <h3>no matching parts</h3>
          <p>Clear filters, add a component, or open an existing SQLite database.</p>
          <div class="inline-actions">
            <button type="button" class="primary-button" data-action="open-add-part">+ add part</button>
            <button type="button" class="ghost-button" data-action="import-db">open .db</button>
          </div>
        </div>
      </div>`;

  return `
    <div class="view-head compact-head">
      <h3 class="view-title"><span>parts</span> / ${filtered.length} shown</h3>
      <div class="tool-row compact-tools">
        <button type="button" data-action="set-view" data-target-view="add">bulk add</button>
        <button type="button" data-action="add-category">+ category</button>
        <button type="button" class="primary-button" data-action="open-add-part">+ add part</button>
        <button type="button" data-action="export-db">export</button>
      </div>
    </div>
    <div class="toolbar-grid parts-toolbar">
      <input type="search" data-search value="${escapeAttr(state.query)}" placeholder="search name, mpn, value, location..." />
      <select data-category-filter>${categoryOptions}</select>
      <input type="search" data-package-filter value="${escapeAttr(state.packageFilter || "")}" placeholder="package/footprint" />
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
    ${table}
    ${filtered.length > visibleParts.length ? `<div class="database-actions table-more"><button type="button" data-action="show-more-parts">show more ${Math.min(PERFORMANCE_DEFAULTS.renderLimit, filtered.length - visibleParts.length)}</button><button type="button" data-action="reset-render-limit">reset limit</button><span>${visibleParts.length} / ${filtered.length} rendered</span></div>` : ""}
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
          ${spec ? `<span class="subtext part-spec-line">${escapeHtml(spec)}</span>` : ""}
        </td>
        <td><span class="badge">${escapeHtml(category)}</span></td>
        <td><span class="mono-cell">${escapeHtml(part.package || "")}</span><span class="subtext">${escapeHtml(part.footprint || "")}</span></td>
        <td><span class="${low ? "qty-low" : "qty-ok"}">${stock.total}</span>${stock.min ? `<span class="subtext">min ${stock.min}</span>` : ""}</td>
        <td>${escapeHtml(stock.locations || "-")}</td>
        <td><button type="button" class="ghost-button small-button" data-action="open-edit-part" data-id="${part.id}">edit</button></td>
      </tr>`;
  }).join("");

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Part</th>
          <th>Category</th>
          <th>Pkg / footprint</th>
          <th>Qty</th>
          <th>Location</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}


function renderAddImportView() {
  const locations = [`<option value="">no default location</option>`].concat(
    state.inventory.locations.map((location) => `<option value="${location.id}">${escapeHtml(locationPath(location.id))}</option>`)
  ).join("");

  return `
    <div class="view-head">
      <h3 class="view-title"><span>add</span> / bulk component entry</h3>
      <div class="tool-row">
        <button type="button" data-action="set-view" data-target-view="parts">parts list</button>
        <button type="button" class="primary-button" data-action="open-add-part">+ manual part</button>
      </div>
    </div>

    <div class="add-import-grid single-column">
      <section class="database-card add-card">
        <h4>bulk add with shared defaults</h4>
        <p class="small-note">Use this when many parts have the same package, footprint, tolerance, power, voltage, source, and location. Then paste only value and quantity per row.</p>
        <form id="bulkImportForm" novalidate onsubmit="return false;">
          <div class="form-grid">
            <div class="field"><label>kind</label><select name="kind">
              <option value="resistor">resistors</option>
              <option value="capacitor">capacitors</option>
              <option value="inductor">inductors</option>
              <option value="generic">generic parts</option>
            </select></div>
            <div class="field"><label>package</label><input name="defaultPackage" placeholder="0603" /></div>
            <div class="field"><label>footprint</label><input name="defaultFootprint" placeholder="R_0603_1608Metric" /></div>
            <div class="field"><label>default qty if row omits it</label><input name="defaultQuantity" type="number" min="0" step="1" value="0" /></div>
            <div class="field"><label>min stock</label><input name="defaultMin" type="number" min="0" step="1" value="0" /></div>
            <div class="field"><label>location</label><select name="defaultLocationId">${locations}</select></div>
            <div class="field"><label>or new location name</label><input name="defaultLocationName" placeholder="GDK / resistors / 0603" /></div>
            <div class="field"><label>source</label><input name="defaultSource" placeholder="LCSC, AliExpress, Mouser" /></div>
            <div class="field"><label>tolerance %</label><input name="defaultTolerance" placeholder="1" /></div>
            <div class="field"><label>power W</label><input name="defaultPower" placeholder="0.1 or 1/10W" /></div>
            <div class="field"><label>voltage V</label><input name="defaultVoltage" placeholder="50" /></div>
            <div class="field"><label>dielectric</label><input name="defaultDielectric" placeholder="X7R, C0G, NP0" /></div>
            <div class="field"><label>current A</label><input name="defaultCurrent" placeholder="1.5" /></div>
            <label class="switch-row inline-switch"><span>merge matching existing parts</span><input name="mergeExisting" type="checkbox" checked /></label>
          </div>

          <div class="bulk-help-grid">
            <div class="tiny-panel">
              <p class="panel-title">simple rows</p>
              <p><code>value quantity</code></p>
              <p class="small-note">Examples: <code>4.7k 200</code>, <code>100N 20</code>, <code>10U 5</code></p>
            </div>
            <div class="tiny-panel">
              <p class="panel-title">optional row fields</p>
              <p><code>value quantity min location source</code></p>
              <p class="small-note">Resistors: R/k/M. Capacitors: p/n/u. Inductors: n/u/m or nH/uH/mH.</p>
            </div>
            <div class="tiny-panel">
              <p class="panel-title">headers</p>
              <p><code>value,quantity,mpn,manufacturer</code></p>
              <p class="small-note">Headers override positional parsing.</p>
            </div>
          </div>

          <div class="field"><label>rows</label><textarea name="bulkText" class="bulk-textarea" spellcheck="false" placeholder="10R 100
22R 100
100R 200
1k 200
4.7k 200
10k 300
100k 100"></textarea></div>
          <div class="database-actions">
            <button type="button" data-action="preview-bulk">preview</button>
            <button type="button" class="primary-button" data-action="import-bulk">import rows</button>
          </div>
        </form>
        <div id="bulkPreview" class="bulk-preview"></div>
      </section>
    </div>
  `;
}


function renderLocationsView() {
  const locations = state.inventory.locations;
  const cards = locations.length
    ? `<div class="location-grid">${locations.map((location) => renderLocationCard(location)).join("")}</div>`
    : `<div class="empty-state"><div><h3>no storage map yet</h3><p>Add drawers, boxes, trays, cells, or shelves. Parts can reference them from stock rows.</p><button type="button" class="primary-button" data-action="open-add-location">+ add location</button></div></div>`;

  return `
    <div class="view-head compact-head">
      <h3 class="view-title"><span>storage_map</span> / locations</h3>
      <div class="tool-row compact-tools">
        <button type="button" class="primary-button" data-action="open-add-location">+ add location</button>
        <button type="button" data-action="export-db">export</button>
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



/* v17 overrides */

function renderNavigation() {
  $$('[data-view]').forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  const owner = state.githubConfig?.owner || "inventory";
  const repo = state.githubConfig?.repo || "local";
  const ownerHeader = $("#ownerHeader");
  if (ownerHeader) ownerHeader.textContent = owner;
  const navName = $("#navDbName");
  const navState = $("#navDbState");
  const navDetails = $("#navDbDetails");
  const metrics = getMetrics();
  if (navName) navName.textContent = repo === "local" ? (state.dbFileName || "inventory.db") : repo;
  if (navState) navState.textContent = databaseStateLabel();
  if (navDetails) {
    const pstats = projectStats();
    navDetails.innerHTML = [
      ["branch", state.githubConfig?.branch || "main"],
      ["path", state.githubConfig?.path || BUNDLED_DB_PATH],
      ["state", databaseStateLabel()],
      ["parts", metrics.parts],
      ["stock", metrics.quantity],
      ["locations", metrics.locations],
      ["projects", pstats.projects],
      ["updated", formatDate(state.inventory.meta?.updatedAt) || "--"]
    ].map(([key, value]) => `<div><span>${escapeHtml(String(key))}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
  }
}

function renderMetrics() {
  const metrics = getMetrics();
  $("#metricsGrid").innerHTML = [
    metricHtml(metrics.parts, "parts"),
    metricHtml(metrics.quantity, "items"),
    metricHtml(metrics.locations, "locations"),
    metricHtml(metrics.lowStock, "low")
  ].join("");
}

function renderPartsView() {
  const categories = state.inventory.categories;
  const filtered = filteredParts();
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

  const columnChooser = Object.entries(PART_COLUMN_DEFS).map(([key, label]) => {
    const checked = (state.visibleColumns || DEFAULT_PART_COLUMNS).includes(key);
    const disabled = key === "actions";
    return `<label class="check-chip"><input type="checkbox" data-column-toggle value="${escapeAttr(key)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />${escapeHtml(label || "edit")}</label>`;
  }).join("");

  const visibleParts = filtered.slice(0, Number(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit));
  const table = filtered.length
    ? renderPartsTable(visibleParts)
    : `<div class="empty-state compact"><div><h3>no matching parts</h3><p>Clear filters or add a component.</p><div class="inline-actions"><button type="button" class="primary-button" data-action="open-add-part">+ add part</button></div></div></div>`;

  const categoryKindName = state.categoryFilter !== "all" ? categoryKind(getCategoryName(Number(state.categoryFilter))) : "";
  const minPlaceholder = categoryKindName === "resistor" ? "min 1k" : categoryKindName === "capacitor" ? "min 100N" : categoryKindName === "inductor" ? "min 1U" : "spec min";
  const maxPlaceholder = categoryKindName === "resistor" ? "max 10k" : categoryKindName === "capacitor" ? "max 10U" : categoryKindName === "inductor" ? "max 100U" : "spec max";

  return `
    <div class="view-head compact-head">
      <h3 class="view-title"><span>parts</span> / ${filtered.length} shown</h3>
    </div>
    <div class="toolbar-grid parts-toolbar sticky-tools">
      <input type="search" data-search value="${escapeAttr(state.query)}" placeholder="search name, mpn, value, location..." />
      <select data-category-filter>${categoryOptions}</select>
      <input type="search" data-package-filter value="${escapeAttr(state.packageFilter || "")}" placeholder="package/footprint" />
      <input type="search" data-spec-min value="${escapeAttr(state.specFilterMin || "")}" placeholder="${escapeAttr(minPlaceholder)}" />
      <input type="search" data-spec-max value="${escapeAttr(state.specFilterMax || "")}" placeholder="${escapeAttr(maxPlaceholder)}" />
      <input type="search" data-spec-extra value="${escapeAttr(state.specFilterExtra || "")}" placeholder="spec text, dielectric, interface..." />
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
      <button type="button" data-action="set-view" data-target-view="add">bulk add</button>
      <input type="number" data-render-limit min="50" step="50" value="${escapeAttr(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit)}" title="render limit" />
      <button type="button" class="primary-button" data-action="open-add-part">+ part</button>
      <button type="button" data-action="export-csv">CSV</button>
      <button type="button" data-action="export-db">DB</button>
    </div>
    <details class="column-panel">
      <summary>columns</summary>
      <div class="column-grid">${columnChooser}</div>
    </details>
    ${table}
  `;
}

function renderPartsTable(parts) {
  const columns = (state.visibleColumns || DEFAULT_PART_COLUMNS).filter((col) => PART_COLUMN_DEFS[col] !== undefined);
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
    if (col === "actions") return `<td><button type="button" class="ghost-button small-button" data-action="open-edit-part" data-id="${part.id}">edit</button></td>`;
    return "";
  };
  const headers = columns.map((col) => `<th>${escapeHtml(PART_COLUMN_DEFS[col] || col)}</th>`).join("");
  const rows = parts.map((part) => `<tr>${columns.map((col) => renderCell(part, col)).join("")}</tr>`).join("");
  return `<div class="table-wrap scroll-card"><table class="compact-parts-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderDatabaseView() {
  const validation = validateInventory(state.inventory);
  const metrics = getMetrics();
  const catRows = categoryStats().slice(0, 12).map((row) => renderBar(row.category.name, row.count, row.percent)).join("");
  const storage = storageStats();
  const storageRows = storage.byLocation.slice(0, 12).map((row) => renderBar(locationPath(row.location.id), row.quantity, row.fill == null ? Math.min(100, row.quantity ? 12 : 0) : row.fill)).join("");
  const pstats = projectStats();

  return `
    <div class="view-head compact-head">
      <h3 class="view-title"><span>database</span> / statistics</h3>
      <div class="tool-row compact-tools">
        <button type="button" data-action="import-db">open .db</button>
        <button type="button" class="primary-button" data-action="export-db">export .db</button>
      </div>
    </div>

    <div class="database-grid stats-grid">
      <section class="database-card stat-big"><h4>inventory</h4><div class="stat-number">${metrics.parts}</div><p>parts / ${metrics.quantity} items / ${metrics.stockRecords} stock rows</p></section>
      <section class="database-card stat-big"><h4>storage</h4><div class="stat-number">${metrics.locations}</div><p>${storage.orphanRows} stock rows without location</p></section>
      <section class="database-card stat-big"><h4>projects</h4><div class="stat-number">${pstats.projects}</div><p>${pstats.bomRows} BOM rows / ${pstats.unresolved} unresolved / ${(state.inventory.projectReservations || []).length} reservations</p></section>
      <section class="${validation.ok ? "database-card ok-card" : "database-card warn-card"}"><h4>health</h4><p>${validation.ok ? "Inventory references are valid." : escapeHtml(validation.errors[0])}</p></section>
    </div>

    <div class="database-grid two-col">
      <section class="database-card"><h4>category distribution</h4><div class="bar-list">${catRows || "<p>No category data.</p>"}</div></section>
      <section class="database-card"><h4>storage occupancy</h4><div class="bar-list">${storageRows || "<p>No locations yet.</p>"}</div></section>
    </div>

    <div class="database-card">
      <h4>file actions</h4>
      <div class="database-actions">
        <button type="button" data-action="copy-debug">copy debug snapshot</button>
        <button type="button" data-action="clear-service-worker">clear SW cache</button>
        <button type="button" data-action="load-bundled-db">reload bundled db</button>
        <button type="button" data-action="save-local-db">save local copy</button>
        <button type="button" class="primary-button" data-action="export-db">download inventory.db</button>
        <button type="button" class="danger-button" data-action="new-database">new empty database</button>
      </div>
      <dl class="kv-list">
        <div><dt>source</dt><dd>${escapeHtml(state.dbSource || "local")}</dd></div>
        <div><dt>remote path</dt><dd>${escapeHtml(state.githubConfig.path || BUNDLED_DB_PATH)}</dd></div>
        <div><dt>state</dt><dd>${escapeHtml(databaseStateLabel())}</dd></div>
        <div><dt>render limit</dt><dd>${escapeHtml(String(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit))}</dd></div>
        <div><dt>index cache</dt><dd>${indexCache ? "built" : "cold"}</dd></div>
      </dl>
    </div>
  `;
}

function renderBar(label, value, percent) {
  const width = Math.max(2, Math.min(100, Number(percent) || 0));
  return `<div class="stat-bar-row"><div class="stat-bar-label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div><div class="stat-bar"><span style="width:${width}%"></span></div></div>`;
}

function renderLocationsView() {
  const roots = state.inventory.locations.filter((loc) => !loc.parentId);
  const cards = roots.length
    ? `<div class="location-tree">${roots.map((location) => renderLocationNode(location)).join("")}</div>`
    : `<div class="empty-state"><div><h3>no storage map yet</h3><p>Add homes, work sites, cabinets, drawers, bins, boxes, or LED nodes.</p><button type="button" class="primary-button" data-action="open-add-location">+ add location</button></div></div>`;

  return `
    <div class="view-head compact-head">
      <h3 class="view-title"><span>storage</span> / locations</h3>
      <div class="tool-row compact-tools">
        <button type="button" class="primary-button" data-action="open-add-location">+ location</button>
        <button type="button" data-action="export-db">export</button>
      </div>
    </div>
    <div class="database-card">
      <p>Locations are hierarchical and can include capacity, coordinates, color, LED node metadata, and network highlight targets.</p>
    </div>
    ${cards}
  `;
}

function renderLocationNode(location, depth = 0) {
  const children = state.inventory.locations.filter((item) => item.parentId === location.id);
  const stockRows = state.inventory.stock.filter((row) => row.locationId === location.id);
  const qty = stockRows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const capacity = numberOrZero(location.capacity);
  const fill = capacity ? Math.min(100, Math.round(qty / capacity * 100)) : null;
  const color = location.color ? `style="--loc-color:${escapeAttr(location.color)}"` : "";
  return `<article class="location-node depth-${Math.min(depth, 5)}" ${color}>
    <div class="location-main">
      <div>
        <h4><span class="loc-dot"></span>${escapeHtml(location.name)}</h4>
        <p>${escapeHtml(location.type || "bin")} / id ${location.id} / qty ${qty}${capacity ? ` / capacity ${capacity}` : ""}</p>
        ${location.ledNode || location.networkTarget ? `<p class="subtext">LED: ${escapeHtml(location.ledNode || "-")} #${escapeHtml(String(location.ledIndex ?? "-"))} / target: ${escapeHtml(location.networkTarget || "-")}</p>` : ""}
        ${fill != null ? `<div class="stat-bar small"><span style="width:${fill}%"></span></div>` : ""}
      </div>
      <div class="inline-actions">
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
    <div class="view-head compact-head">
      <h3 class="view-title"><span>add</span> / bulk entry and BOM</h3>
      <div class="tool-row compact-tools"><button type="button" class="primary-button" data-action="open-add-part">+ manual part</button></div>
    </div>
    <div class="add-import-grid single-column">
      <section class="database-card add-card">
        <h4>spreadsheet bulk add</h4>
        <p class="small-note">Use rows with shared defaults. Clone a row when only value or quantity changes.</p>
        <form id="bulkImportForm" novalidate onsubmit="return false;">
          <div class="form-grid">
            <div class="field"><label>kind</label><select name="kind"><option value="resistor">resistors</option><option value="capacitor">capacitors</option><option value="inductor">inductors</option><option value="generic">generic parts</option></select></div>
            <div class="field"><label>package</label><input name="defaultPackage" placeholder="0603" /></div>
            <div class="field"><label>footprint</label><input name="defaultFootprint" placeholder="R_0603_1608Metric" /></div>
            <div class="field"><label>default qty</label><input name="defaultQuantity" type="number" min="0" step="1" value="0" /></div>
            <div class="field"><label>min stock</label><input name="defaultMin" type="number" min="0" step="1" value="0" /></div>
            <div class="field"><label>location</label><select name="defaultLocationId">${locations}</select></div>
            <div class="field"><label>source</label><input name="defaultSource" placeholder="LCSC, AliExpress, Mouser" /></div>
            <div class="field"><label>tolerance %</label><input name="defaultTolerance" placeholder="1" /></div>
            <div class="field"><label>power W</label><input name="defaultPower" placeholder="0.1 or 1/10W" /></div>
            <div class="field"><label>voltage V</label><input name="defaultVoltage" placeholder="50" /></div>
            <div class="field"><label>dielectric</label><input name="defaultDielectric" placeholder="X7R, C0G, NP0" /></div>
            <div class="field"><label>current A</label><input name="defaultCurrent" placeholder="1.5" /></div>
            <label class="switch-row inline-switch"><span>merge matching existing parts</span><input name="mergeExisting" type="checkbox" checked /></label>
          </div>

          <div class="bulk-grid-editor" id="bulkGrid">
            ${renderBulkLine(0)}
          </div>
          <div class="database-actions">
            <button type="button" data-action="add-bulk-line">+ blank row</button>
            <button type="button" data-action="clone-bulk-line" data-id="0">+ clone previous</button>
            <button type="button" data-action="preview-bulk">preview</button>
            <button type="button" class="primary-button" data-action="import-bulk">import rows</button>
          </div>

          <details class="database-card nested-card">
            <summary>series generator</summary>
            <div class="form-grid">
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

      <section class="database-card add-card">
        <h4>KiCad BOM import</h4>
        <p class="small-note">Paste KiCad default BOM CSV. It creates a stored project and editable BOM rows in the SQLite repo database.</p>
        <form id="kicadBomForm" novalidate onsubmit="return false;">
          <div class="form-grid">
            <div class="field"><label>project name</label><input name="projectName" placeholder="My keyboard PCB" /></div>
            <div class="field"><label>revision</label><input name="revision" placeholder="rev A" /></div>
            <div class="field span-2"><label>BOM CSV</label><textarea name="bomCsv" class="bulk-textarea" placeholder='"Id","Designator","Package","Quantity","Designation","Supplier and ref"'></textarea></div>
          </div>
          <button type="button" class="primary-button" data-action="import-kicad-bom">store project BOM</button>
        </form>
      </section>
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
    <button type="button" class="danger-button" data-action="remove-bulk-line" data-id="${index}">×</button>
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
    : `<div class="empty-state compact"><div><h3>no projects</h3><p>Import a KiCad BOM from the ADD page.</p><button type="button" data-action="set-view" data-target-view="add">import BOM</button></div></div>`;

  if (!project) {
    return `<div class="view-head compact-head"><h3 class="view-title"><span>projects</span> / BOM</h3></div><div class="projects-layout"><aside class="project-list">${list}</aside></div>`;
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
    <div class="view-head compact-head">
      <h3 class="view-title"><span>projects</span> / BOM</h3>
      <div class="tool-row compact-tools">
        <button type="button" data-action="set-view" data-target-view="add">import BOM</button>
        <button type="button" data-action="reserve-project" data-id="${project.id}">reserve</button>
        <button type="button" data-action="release-project" data-id="${project.id}">release</button>
        <button type="button" class="danger-button" data-action="apply-project-consumption" data-id="${project.id}">consume stock</button>
      </div>
    </div>
    <div class="projects-layout">
      <aside class="project-list">${list}</aside>
      <section class="project-detail">
        <div class="database-card">
          <div class="project-head">
            <div>
              <h4>${escapeHtml(project.name)}</h4>
              <p>${escapeHtml(project.revision || "no revision")} / ${summary.rows} rows / need ${summary.needed} / reserved ${summary.reserved}</p>
            </div>
            <div class="inline-actions">
              <button type="button" data-action="delete-project" data-id="${project.id}" class="danger-button">delete project</button>
            </div>
          </div>
          <div class="project-stat-grid">
            ${metricHtml(summary.rows, "BOM rows")}
            ${metricHtml(summary.unresolved, "unresolved")}
            ${metricHtml(summary.shortageRows, "shortage rows")}
            ${metricHtml(summary.reserved, "reserved")}
          </div>
          <input type="search" data-project-search value="${escapeAttr(state.projectQuery || "")}" placeholder="filter BOM rows..." />
        </div>
        ${renderBomTable(project, rows)}
      </section>
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
      <td class="bom-actions">
        <button type="button" data-action="match-bom-row" data-id="${row.id}">match</button>
        <button type="button" data-action="open-edit-bom-row" data-id="${row.id}">edit</button>
        <button type="button" data-action="unlink-bom-row" data-id="${row.id}">unlink</button>
        <button type="button" class="danger-button" data-action="delete-bom-row" data-id="${row.id}">×</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="11">No BOM rows.</td></tr>`;

  return `<div class="table-wrap scroll-card"><table class="compact-parts-table bom-table">
    <thead><tr>${Object.values(PROJECT_COLUMN_DEFS).map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}
