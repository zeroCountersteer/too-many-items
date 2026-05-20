"use strict";

const state = {
  SQL: null,
  sqliteError: "",
  inventory: createEmptyInventory(),
  activeView: normalizeView(localStorage.getItem(STORAGE.activeView)),
  query: "",
  categoryFilter: "all",
  stockFilter: "all",
  packageFilter: "",
  specFilterMin: "",
  specFilterMax: "",
  specFilterExtra: "",
  selectedBulkRow: 0,
  visibleColumns: loadJsonFromStorage(STORAGE.visibleColumns || "tmi.visibleColumns", DEFAULT_PART_COLUMNS),
  activeProjectId: Number(localStorage.getItem(STORAGE.activeProjectId || "tmi.activeProjectId") || 0),
  projectQuery: "",
  renderLimit: Number(localStorage.getItem(STORAGE.renderLimit || "tmi.renderLimit") || PERFORMANCE_DEFAULTS.renderLimit),
  sortKey: "category",
  sortDir: "asc",
  githubSha: localStorage.getItem(STORAGE.githubSha) || "",
  githubConfig: loadJsonFromStorage(STORAGE.githubConfig, {
    owner: "",
    repo: "",
    branch: "main",
    path: BUNDLED_DB_PATH
  }),
  customThemes: loadJsonFromStorage(STORAGE.customThemes, {}),
  activeTheme: localStorage.getItem(STORAGE.activeTheme) || "angelCloud",
  movingBackground: localStorage.getItem(STORAGE.movingBackground) !== "off",
  dbSource: localStorage.getItem(STORAGE.dbSource) || "not loaded",
  dbFileName: "inventory.db",
  dbDirty: localStorage.getItem(STORAGE.dbDirty) === "1",
  dbBytes: null,
  lastStatus: "initializing"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

window.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    state.sqliteError = error.message;
    state.lastStatus = "database engine failed";
    render();
    toast(error.message, "error");
  });
});

async function init() {
  if (location.search && /[?&](name|parentId|notes|categoryId|mpn|manufacturer)=/.test(location.search)) {
    history.replaceState(null, document.title, location.pathname + location.hash);
  }
  applyTheme(state.activeTheme);
  document.body.classList.toggle("moving-bg", false);
  bindEvents();
  renderShellLoading();
  await initializeDatabaseEngine();
  await loadInitialDatabase();
  render();
  document.body.dataset.appReady = "true";
}

let partsRenderTimer = 0;

function schedulePartsRender() {
  clearTimeout(partsRenderTimer);
  partsRenderTimer = setTimeout(() => {
    renderPartsViewOnly();
  }, PERFORMANCE_DEFAULTS.debounceMs);
}

function bindEvents() {
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("input", handleInput);
  document.body.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit, true);
  $("#dbFileInput").addEventListener("change", importDatabaseFile);
  $("#jsonFileInput").addEventListener("change", importInventoryJsonFile);
  $("#themeFileInput").addEventListener("change", importThemeFile);
}

function handleClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setView(viewButton.dataset.view);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  const id = actionTarget.dataset.id ? Number(actionTarget.dataset.id) : null;

  switch (action) {
    case "set-view":
      setView(actionTarget.dataset.targetView || "parts");
      break;
    case "preview-bulk":
      previewBulkImport();
      break;
    case "import-bulk":
      importBulkParts();
      break;
    case "add-bulk-line":
      addBulkLine();
      break;
    case "clone-bulk-line":
      cloneBulkLine(id);
      break;
    case "remove-bulk-line":
      removeBulkLine(id);
      break;
    case "generate-series":
      generateBulkSeries();
      break;
    case "import-kicad-bom":
      importKiCadBomFromForm();
      break;
    case "save-columns":
      saveVisibleColumns();
      break;
    case "highlight-location":
      highlightLocation(id);
      break;
    case "select-project":
      selectProject(id);
      break;
    case "delete-project":
      deleteProject(id);
      break;
    case "reserve-project":
      reserveProjectParts(id);
      break;
    case "release-project":
      releaseProjectReservations(id);
      break;
    case "apply-project-consumption":
      applyProjectConsumption(id);
      break;
    case "show-more-parts":
      state.renderLimit = Number(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit) + PERFORMANCE_DEFAULTS.renderLimit;
      localStorage.setItem(STORAGE.renderLimit || "tmi.renderLimit", String(state.renderLimit));
      renderPartsViewOnly();
      break;
    case "reset-render-limit":
      state.renderLimit = PERFORMANCE_DEFAULTS.renderLimit;
      localStorage.setItem(STORAGE.renderLimit || "tmi.renderLimit", String(state.renderLimit));
      renderPartsViewOnly();
      break;
    case "export-csv":
      exportPartsCsv();
      break;
    case "copy-debug":
      copyDebugSnapshot();
      break;
    case "clear-service-worker":
      clearServiceWorkerCaches();
      break;
    case "match-bom-row":
      matchBomRow(id);
      break;
    case "unlink-bom-row":
      unlinkBomRow(id);
      break;
    case "delete-bom-row":
      deleteBomRow(id);
      break;
    case "open-edit-bom-row":
      openBomRowModal(id);
      break;
    case "save-bom-row": {
      const form = $("#bomRowForm");
      if (form) saveBomRowFromForm(form);
      break;
    }
    case "open-add-part":
      openPartModal();
      break;
    case "open-edit-part":
      openPartModal(id);
      break;
    case "delete-part":
      deletePart(id);
      break;
    case "open-add-location":
      openLocationModal();
      break;
    case "open-edit-location":
      openLocationModal(id);
      break;
    case "delete-location":
      deleteLocation(id);
      break;
    case "save-part": {
      const form = $("#partForm");
      if (form) savePartFromForm(form);
      break;
    }
    case "save-location": {
      const form = $("#locationForm");
      if (form) saveLocationFromForm(form);
      break;
    }
    case "save-settings": {
      const form = $("#settingsForm");
      if (form) saveSettings(form);
      break;
    }
    case "close-modal":
      closeModal();
      break;
    case "add-stock-row":
      addStockEditorRow();
      break;
    case "remove-stock-row":
      actionTarget.closest(".stock-row-edit")?.remove();
      break;
    case "add-category":
      addCategoryPrompt();
      break;
    case "import-db":
      $("#dbFileInput").click();
      break;
    case "export-db":
      exportDatabase();
      break;
    case "save-local-db":
      persistDatabase("database saved locally", { dirty: state.dbDirty });
      render();
      break;
    case "new-database":
      newDatabase();
      break;
    case "load-bundled-db":
      loadBundledDatabase({ makeDirty: false });
      break;
    case "load-github":
      loadFromGitHub();
      break;
    case "commit-github":
      commitToGitHub();
      break;
    case "import-json":
      $("#jsonFileInput").click();
      break;
    case "export-json":
      exportInventoryJson();
      break;
    case "select-theme":
      applyTheme(actionTarget.dataset.themeId);
      render();
      break;
    case "export-theme":
      exportCurrentTheme();
      break;
    case "import-theme":
      $("#themeFileInput").click();
      break;
    case "reset-theme":
      resetCustomTheme();
      break;
    case "clear-cache":
      clearLocalCache();
      break;
    default:
      break;
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.matches("[data-search]")) {
    state.query = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-package-filter]")) {
    state.packageFilter = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-spec-min]")) {
    state.specFilterMin = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-spec-max]")) {
    state.specFilterMax = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-spec-extra]")) {
    state.specFilterExtra = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-bulk-input]")) {
    updateBulkPreviewFromGrid();
    return;
  }

  if (target.matches("[data-project-search]")) {
    state.projectQuery = target.value;
    if (state.activeView === "projects") $("#viewPanel").innerHTML = renderProjectsView();
    return;
  }

  if (target.matches("[data-render-limit]")) {
    const value = Math.max(50, Number(target.value) || PERFORMANCE_DEFAULTS.renderLimit);
    state.renderLimit = value;
    localStorage.setItem(STORAGE.renderLimit || "tmi.renderLimit", String(value));
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-theme-var]")) {
    updateCustomThemeFromInputs();
  }
}

function handleChange(event) {
  const target = event.target;

  if (target.matches("[data-category-filter]")) {
    state.categoryFilter = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-stock-filter]")) {
    state.stockFilter = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-sort-key]")) {
    state.sortKey = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-sort-dir]")) {
    state.sortDir = target.value;
    schedulePartsRender();
    return;
  }

  if (target.matches("[data-column-toggle]")) {
    const column = target.value;
    const active = new Set(state.visibleColumns || DEFAULT_PART_COLUMNS);
    if (target.checked) active.add(column);
    else if (column !== "actions") active.delete(column);
    state.visibleColumns = [...active];
    saveVisibleColumns();
    schedulePartsRender();
    return;
  }

  if (target.id === "partCategorySelect") {
    const categoryName = getCategoryName(Number(target.value));
    const form = target.closest("form");
    const partId = Number(form?.querySelector("[name='id']")?.value || 0);
    const part = state.inventory.parts.find((item) => item.id === partId) || null;
    const specContainer = $("#specFields");
    if (specContainer) specContainer.innerHTML = renderSpecFields(part, categoryName);
    return;
  }

  if (target.id === "movingToggleSettings") {
    state.movingBackground = target.checked;
    localStorage.setItem(STORAGE.movingBackground, state.movingBackground ? "on" : "off");
    document.body.classList.toggle("moving-bg", false);
    setStatus("appearance updated");
    return;
  }

  if (target.id === "themeSelect") {
    applyTheme(target.value);
    render();
  }
}

function handleSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  const target = event.target;
  const form = target instanceof HTMLFormElement
    ? target
    : target?.closest?.("form");

  if (!form) return false;

  const handlers = {
    bulkImportForm: () => importBulkParts(),
    partForm: () => savePartFromForm(form),
    locationForm: () => saveLocationFromForm(form),
    settingsForm: () => saveSettings(form)
  };

  const handler = handlers[form.id];
  if (handler) {
    handler();
    return false;
  }

  // Modal/editor forms must never fall through to native GET navigation.
  // Unknown forms are simply cancelled and reported in the status line.
  console.warn("Cancelled unknown form submit", form.id || form.className || form);
  setStatus("form submit cancelled");
  return false;
}

function setView(view) {
  state.activeView = normalizeView(view);
  localStorage.setItem(STORAGE.activeView, state.activeView);
  render();
}



function exportPartsCsv() {
  const rows = filteredParts();
  const header = ["id", "name", "category", "value", "package", "footprint", "quantity", "location", "manufacturer", "mpn", "notes"];
  const csv = [header.join(",")].concat(rows.map((part) => {
    const stock = stockSummary(part.id);
    const cells = [
      part.id,
      part.name,
      getCategoryName(part.categoryId),
      specSummary(part),
      part.package,
      part.footprint,
      stock.total,
      stock.locations,
      part.manufacturer,
      part.mpn,
      part.notes
    ];
    return cells.map(csvCell).join(",");
  })).join("\n") + "\n";
  downloadBytes("inventory-parts.csv", new TextEncoder().encode(csv), "text/csv");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function copyDebugSnapshot() {
  const metrics = getMetrics();
  const snapshot = {
    version: "v17",
    dbSource: state.dbSource,
    dbDirty: state.dbDirty,
    activeView: state.activeView,
    metrics,
    projects: projectStats(),
    serviceWorker: !!navigator.serviceWorker,
    userAgent: navigator.userAgent
  };
  await navigator.clipboard?.writeText(JSON.stringify(snapshot, null, 2));
  toast("debug snapshot copied");
}

async function clearServiceWorkerCaches() {
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  toast("service worker/cache cleared");
}
