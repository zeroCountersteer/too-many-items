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
  if (navName) navName.textContent = state.dbFileName || "inventory.db";
  if (navState) navState.textContent = databaseStateLabel();
}

function renderHeader() {
  const titles = {
    parts: ["INVENTORY / PARTS", "electronic components"],
    add: ["INVENTORY / ADD", "batch import and api lookup"],
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
    actions.push(`<button type="button" data-action="set-view" data-target-view="add">batch / api</button>`);
    actions.push(`<button type="button" class="primary-button" data-action="open-add-part">+ add part</button>`);
  } else if (state.activeView === "add") {
    actions.push(`<button type="button" data-action="set-view" data-target-view="parts">parts list</button>`);
    actions.push(`<button type="button" class="primary-button" data-action="open-add-part">+ manual part</button>`);
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
        <button type="button" data-action="set-view" data-target-view="add">batch / api</button>
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


function renderAddImportView() {
  const locations = [`<option value="">no default location</option>`].concat(
    state.inventory.locations.map((location) => `<option value="${location.id}">${escapeHtml(locationPath(location.id))}</option>`)
  ).join("");
  const provider = state.externalApiConfig.provider || "nexar";
  const apiConfigured = externalApiConfigured(provider);
  const apiResults = state.externalResults.length
    ? `<div class="api-result-list">${state.externalResults.map((item, index) => renderExternalResult(item, index)).join("")}</div>`
    : `<div class="empty-state compact"><div><h3>no api results</h3><p>Search by manufacturer part number, then review a result before adding it to the database.</p></div></div>`;

  return `
    <div class="view-head">
      <h3 class="view-title"><span>add</span> / batch and api</h3>
      <div class="tool-row">
        <button type="button" data-action="set-view" data-target-view="parts">parts list</button>
        <button type="button" class="primary-button" data-action="open-add-part">+ manual part</button>
      </div>
    </div>

    <div class="add-import-grid">
      <section class="database-card add-card">
        <h4>bulk add passive parts</h4>
        <p class="small-note">Paste many values at once. Header rows are supported. Without headers the default resistor order is: value, quantity, package, tolerance, power, voltage, location, min, source.</p>
        <form id="bulkImportForm">
          <div class="form-grid">
            <div class="field"><label>kind</label><select name="kind">
              <option value="resistor">resistors</option>
              <option value="capacitor">capacitors</option>
              <option value="inductor">inductors</option>
              <option value="generic">generic parts</option>
            </select></div>
            <div class="field"><label>default package</label><input name="defaultPackage" placeholder="0603" /></div>
            <div class="field"><label>default footprint</label><input name="defaultFootprint" placeholder="R_0603_1608Metric" /></div>
            <div class="field"><label>default qty</label><input name="defaultQuantity" type="number" min="0" step="1" value="0" /></div>
            <div class="field"><label>default min</label><input name="defaultMin" type="number" min="0" step="1" value="0" /></div>
            <div class="field"><label>default location</label><select name="defaultLocationId">${locations}</select></div>
            <div class="field"><label>new location by name</label><input name="defaultLocationName" placeholder="A01 resistors" /></div>
            <div class="field"><label>source</label><input name="defaultSource" placeholder="LCSC, AliExpress, Mouser" /></div>
            <div class="field"><label>tolerance %</label><input name="defaultTolerance" placeholder="1" /></div>
            <div class="field"><label>power W</label><input name="defaultPower" placeholder="0.1 or 1/10W" /></div>
            <div class="field"><label>voltage V</label><input name="defaultVoltage" placeholder="50" /></div>
            <label class="switch-row inline-switch"><span>merge matching existing parts</span><input name="mergeExisting" type="checkbox" checked /></label>
          </div>
          <div class="field"><label>rows</label><textarea name="bulkText" class="bulk-textarea" spellcheck="false" placeholder="10R,100,0603,1%,0.1W\n22R,100,0603,1%,0.1W\n4.7k,200,0603,1%,0.1W\n100k,100,0603,1%,0.1W"></textarea></div>
          <div class="database-actions">
            <button type="button" data-action="preview-bulk">preview</button>
            <button type="button" class="primary-button" data-action="import-bulk">import rows</button>
          </div>
        </form>
        <div id="bulkPreview" class="bulk-preview"></div>
      </section>

      <section class="database-card add-card">
        <h4>external part lookup</h4>
        <p class="small-note">Uses the connector selected in Settings. Nexar works with an application access token; Ultra Librarian and generic REST use a URL template that must return JSON and allow browser CORS.</p>
        <form id="externalLookupForm">
          <div class="form-grid">
            <div class="field"><label>provider</label><select name="provider">
              <option value="nexar" ${provider === "nexar" ? "selected" : ""}>Nexar / Octopart</option>
              <option value="ultralibrarian" ${provider === "ultralibrarian" ? "selected" : ""}>Ultra Librarian template</option>
              <option value="generic" ${provider === "generic" ? "selected" : ""}>Generic REST JSON</option>
            </select></div>
            <div class="field span-2"><label>mpn or search text</label><input name="query" value="${escapeAttr(state.externalLastQuery)}" placeholder="TPS25751D, STM32F103C8T6, RC0603FR-0710KL" /></div>
            <div class="field"><label>manufacturer hint</label><input name="manufacturer" placeholder="Texas Instruments" /></div>
          </div>
          <p class="small-note">provider status: ${apiConfigured ? "configured" : "needs settings"}</p>
          <div class="database-actions">
            <button type="button" data-action="open-api-settings">api settings</button>
            <button type="button" class="primary-button" data-action="lookup-external-part">search</button>
          </div>
        </form>
        ${apiResults}
      </section>
    </div>
  `;
}

function renderExternalResult(item, index) {
  const sub = [item.manufacturer, item.mpn].filter(Boolean).join(" / ") || "unknown manufacturer/mpn";
  const chips = [item.categoryName, item.package, item.footprint].filter(Boolean).map((value) => `<span class="tag-pill">${escapeHtml(value)}</span>`).join("");
  return `<article class="api-result">
    <div>
      <h4>${escapeHtml(item.name || item.mpn || "external part")}</h4>
      <p class="small-note">${escapeHtml(sub)}</p>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      <div class="tag-row">${chips}</div>
    </div>
    <div class="api-result-actions">
      ${item.datasheetUrl ? `<a class="ghost-link" href="${escapeAttr(item.datasheetUrl)}" target="_blank" rel="noreferrer">datasheet</a>` : ""}
      <button type="button" class="primary-button" data-action="add-api-result" data-index="${index}">review + add</button>
    </div>
  </article>`;
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
  const apiCfg = state.externalApiConfig || {};
  const apiTokenPresent = sessionStorage.getItem(STORAGE.externalApiToken) ? "api token active for this tab" : "api token not set";
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
          <h4>external APIs</h4>
          <div class="form-grid">
            <div class="field"><label>default provider</label><select name="apiProvider">
              <option value="nexar" ${apiCfg.provider === "nexar" ? "selected" : ""}>Nexar / Octopart</option>
              <option value="ultralibrarian" ${apiCfg.provider === "ultralibrarian" ? "selected" : ""}>Ultra Librarian template</option>
              <option value="generic" ${apiCfg.provider === "generic" ? "selected" : ""}>Generic REST JSON</option>
            </select></div>
            <div class="field"><label>auth prefix</label><input name="apiBearerPrefix" value="${escapeAttr(apiCfg.bearerPrefix || "Bearer")}" placeholder="Bearer" /></div>
            <div class="field span-2"><label>api token</label><input type="password" name="externalApiToken" placeholder="session only" autocomplete="off" /></div>
            <div class="field span-2"><label>Ultra Librarian URL template</label><input name="ultraUrlTemplate" value="${escapeAttr(apiCfg.ultraUrlTemplate || "")}" placeholder="https://api.example.com/search?q={q}" /></div>
            <div class="field span-2"><label>generic REST URL template</label><input name="genericUrlTemplate" value="${escapeAttr(apiCfg.genericUrlTemplate || "")}" placeholder="https://api.example.com/parts?mpn={q}&mfr={manufacturer}" /></div>
          </div>
          <p class="small-note">${escapeHtml(apiTokenPresent)}. Tokens are kept in sessionStorage only. Do not put client secrets in a public GitHub Pages site.</p>
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


