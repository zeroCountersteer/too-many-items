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
    parts: ["INVENTORY / PARTS", "parts"],
    add: ["INVENTORY / ADD", "bulk add"],
    locations: ["INVENTORY / LOCATIONS", "locations"],
    database: ["INVENTORY / DATABASE", "database"],
    settings: ["INVENTORY / SETTINGS", "settings"]
  };
  const [path, title] = titles[state.activeView] || titles.parts;
  $("#pathLine").textContent = path;
  $("#windowTitle").textContent = title;
  $("#chromeActions").innerHTML = "";

  const notice = $("#noticeLine");
  if (!notice) return;
  let text = "";
  if (state.sqliteError) {
    text = `SQLite engine is not available: ${state.sqliteError}`;
  } else if (state.inventory.parts.length === 0) {
    text = "Database is empty. Add the first part or open inventory.db.";
  } else if (state.dbDirty) {
    text = "Local changes are not committed to GitHub yet.";
  }
  notice.textContent = text;
  notice.hidden = !text;
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

  const table = filtered.length
    ? renderPartsTable(filtered)
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


