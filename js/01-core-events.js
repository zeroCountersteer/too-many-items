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
  selectedPartIds: new Set(),
  bulkOperationPreview: "",
  visibleColumns: loadJsonFromStorage(STORAGE.visibleColumns || "tmi.visibleColumns", DEFAULT_PART_COLUMNS),
  activeProjectId: Number(localStorage.getItem(STORAGE.activeProjectId || "tmi.activeProjectId") || 0),
  activeProjectTab: "overview",
  activeBuildSessionId: 0,
  projectSideFilter: "both",
  projectQuery: "",
  projectMatchFilter: "all",
  selectedBomRowIds: new Set(),
  projectRepairAnalysis: null,
  editorTable: "parts",
  editorSelection: new Set(),
  editorValidationHtml: "",
  renderLimit: Number(localStorage.getItem(STORAGE.renderLimit || "tmi.renderLimit") || PERFORMANCE_DEFAULTS.renderLimit),
  sortKey: "category",
  sortDir: "asc",
  githubSha: localStorage.getItem(STORAGE.githubSha) || "",
  githubConfig: loadJsonFromStorage(STORAGE.githubConfig, {
    owner: DEFAULT_REPO_OWNER,
    repo: DEFAULT_REPO_NAME,
    branch: "main",
    path: BUNDLED_DB_PATH
  }),
  customThemes: loadJsonFromStorage(STORAGE.customThemes, {}),
  activeTheme: localStorage.getItem(STORAGE.activeTheme) || DEFAULT_THEME_ID,
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
    case "preview-bom-import":
      previewBomImport();
      break;
    case "project-tab":
      state.activeProjectTab = actionTarget.dataset.tab || "overview";
      render();
      break;
    case "preview-kicad-source":
      previewKiCadSourceFromForm();
      break;
    case "import-kicad-source":
      importKiCadSourceFromForm();
      break;
    case "create-build-session":
      createBuildSession(id);
      break;
    case "mark-placement-done":
      setPlacementStatus(id, "done");
      break;
    case "mark-placement-skipped":
      setPlacementStatus(id, "skipped");
      break;
    case "mark-placement-pending":
      setPlacementStatus(id, "pending");
      break;
    case "take-placement":
      takePlacementStock(id);
      break;
    case "editor-table":
      state.editorTable = actionTarget.dataset.table || "parts";
      state.editorSelection = new Set();
      state.editorValidationHtml = "";
      render();
      break;
    case "editor-add-row":
      addEditorRow();
      break;
    case "editor-delete-selected":
      deleteSelectedEditorRows();
      break;
    case "editor-paste-tsv":
      pasteEditorTsv();
      break;
    case "editor-validate":
      validateEditorDraft();
      break;
    case "editor-apply":
      applyEditorDraft();
      break;
    case "editor-batch-category":
      editorBatchSet("category");
      break;
    case "editor-batch-location":
      editorBatchSet("location");
      break;
    case "editor-batch-price":
      editorBatchSet("price");
      break;
    case "editor-batch-fitted":
      editorBatchSet("fitted");
      break;
    case "editor-batch-match":
      editorBatchSet("match");
      break;
    case "editor-batch-auto-match":
      editorBatchSet("auto-match");
      break;
    case "select-visible-parts":
      selectVisibleParts();
      break;
    case "clear-part-selection":
      state.selectedPartIds.clear();
      state.bulkOperationPreview = "";
      renderPartsViewOnly();
      break;
    case "preview-bulk-move":
      previewBulkMove();
      break;
    case "apply-bulk-move":
      applyBulkMove();
      break;
    case "bulk-take":
      applyBulkTake();
      break;
    case "bulk-set-min":
      applyBulkMin();
      break;
    case "bulk-set-source":
      applyBulkSource();
      break;
    case "bulk-set-price":
      applyBulkPrice();
      break;
    case "save-columns":
      saveVisibleColumns();
      break;
    case "reset-columns":
      resetVisibleColumns();
      break;
    case "highlight-location":
      highlightLocation(id);
      break;
    case "move-selected-here":
      moveSelectedToLocation(id);
      break;
    case "select-project":
      selectProject(id);
      break;
    case "accept-bom-row-match":
      acceptBomReviewMatches([id]);
      break;
    case "accept-selected-matches":
      acceptBomReviewMatches([...state.selectedBomRowIds]);
      break;
    case "accept-all-exact": {
      const rows = projectBomRows(id).filter((row) => row.fitted !== 0 && !row.partId && getBomMatchCandidates(row, { limit: 1 })[0]?.confidence === "exact").map((row) => row.id);
      acceptBomReviewMatches(rows, { exactOnly: true });
      break;
    }
    case "unlink-selected-matches":
      unlinkSelectedBomMatches();
      break;
    case "clear-bom-review-selection":
      state.selectedBomRowIds.clear();
      render();
      break;
    case "preview-project-repair":
      state.projectRepairAnalysis = analyzeProjectRepair(id);
      state.activeProjectTab = "match";
      render();
      break;
    case "apply-project-repair":
      applySelectedProjectRepair(id);
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
    case "take-bom-row":
      takeBomRow(id);
      break;
    case "open-edit-project":
      openProjectDrawer(id);
      break;
    case "save-project": {
      const form = $("#projectForm");
      if (form) saveProjectFromForm(form);
      break;
    }
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
    case "take-part":
      takePartPrompt(id);
      break;
    case "take-stock-row":
      takeStockRowPrompt(id);
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
    case "add-alias-row":
      addAliasEditorRow();
      break;
    case "remove-alias-row":
      actionTarget.closest(".alias-row-edit")?.remove();
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
    case "restore-repair-backup":
      restoreRepairBackupAction();
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

  if (target.matches("[data-project-match-filter]")) {
    state.projectMatchFilter = target.value || "all";
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

  if (target.matches("[data-part-select]")) {
    const id = Number(target.value);
    if (target.checked) state.selectedPartIds.add(id);
    else state.selectedPartIds.delete(id);
    state.bulkOperationPreview = "";
    renderPartsViewOnly();
    return;
  }

  if (target.matches("[data-select-visible-parts]")) {
    const ids = filteredParts().slice(0, Number(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit)).map((part) => part.id);
    if (target.checked) ids.forEach((id) => state.selectedPartIds.add(id));
    else ids.forEach((id) => state.selectedPartIds.delete(id));
    state.bulkOperationPreview = "";
    renderPartsViewOnly();
    return;
  }

  if (target.matches("[data-bom-map]")) {
    previewBomImport();
    return;
  }

  if (target.matches("[data-project-match-filter]")) {
    state.projectMatchFilter = target.value || "all";
    if (state.activeView === "projects") $("#viewPanel").innerHTML = renderProjectsView();
    return;
  }

  if (target.matches("[data-bom-review-select]")) {
    const rowId = Number(target.value);
    if (target.checked) state.selectedBomRowIds.add(rowId);
    else state.selectedBomRowIds.delete(rowId);
    return;
  }

  if (target.matches("[data-bom-review-select-all]")) {
    $$("[data-bom-review-select]").forEach((input) => {
      input.checked = target.checked;
      const rowId = Number(input.value);
      if (target.checked) state.selectedBomRowIds.add(rowId);
      else state.selectedBomRowIds.delete(rowId);
    });
    return;
  }

  if (target.matches("[data-build-session-select]")) {
    state.activeBuildSessionId = Number(target.value || 0);
    if (state.activeView === "projects") $("#viewPanel").innerHTML = renderProjectsView();
    return;
  }

  if (target.matches("[data-project-side-filter]")) {
    state.projectSideFilter = target.value || "both";
    if (state.activeView === "projects") $("#viewPanel").innerHTML = renderProjectsView();
    return;
  }

  if (target.matches("[data-editor-select-all]")) {
    $$("[data-editor-select]").forEach((input) => {
      input.checked = target.checked;
    });
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
    bomRowForm: () => saveBomRowFromForm(form),
    projectForm: () => saveProjectFromForm(form),
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

function selectedPartIdsArray() {
  const valid = new Set(state.inventory.parts.map((part) => part.id));
  state.selectedPartIds = new Set([...(state.selectedPartIds || [])].filter((id) => valid.has(id)));
  return [...state.selectedPartIds];
}

function acceptBomReviewMatches(rowIds, options = {}) {
  const ids = (rowIds || []).map(Number).filter(Boolean);
  if (!ids.length) {
    toast("select BOM rows first", "error");
    return;
  }
  const projectId = activeProject()?.id || 0;
  const changed = acceptProjectBomMatches(projectId, { rowIds: ids, mode: options.exactOnly ? "exact" : "selected" });
  if (!changed) {
    toast("no selected rows had acceptable candidates", "error");
    return;
  }
  logActivity("accept-bom-matches", "project", projectId, `${changed} reviewed matches accepted`);
  touchInventory();
  if (!persistDatabase("BOM matches accepted", { dirty: true })) return;
  state.selectedBomRowIds.clear();
  render();
}

function unlinkSelectedBomMatches() {
  const ids = [...state.selectedBomRowIds];
  if (!ids.length) {
    toast("select BOM rows first", "error");
    return;
  }
  const changed = unlinkProjectBomRows(ids);
  if (!changed) {
    toast("selected rows had no matches to clear", "error");
    return;
  }
  logActivity("unlink-bom-matches", "project", activeProject()?.id || 0, `${changed} selected matches cleared`);
  touchInventory();
  if (!persistDatabase("BOM matches cleared", { dirty: true })) return;
  state.selectedBomRowIds.clear();
  render();
}

function applySelectedProjectRepair(projectId) {
  const analysis = state.projectRepairAnalysis?.projectId === Number(projectId) ? state.projectRepairAnalysis : analyzeProjectRepair(projectId);
  const selectedIds = new Set($$("[data-repair-select]").filter((input) => input.checked).map((input) => input.value));
  const changes = analysis.changes.filter((change) => selectedIds.has(change.id));
  if (!changes.length) {
    toast("select repair changes first", "error");
    return;
  }
  const applied = applyProjectRepair(projectId, changes);
  if (!applied) {
    toast("repair made no changes", "error");
    return;
  }
  touchInventory();
  if (!persistDatabase("project repair applied", { dirty: true })) return;
  state.projectRepairAnalysis = analyzeProjectRepair(projectId);
  toast(`applied ${applied} repair change${applied === 1 ? "" : "s"}`);
  render();
}

function restoreRepairBackupAction() {
  if (!localStorage.getItem(STORAGE.repairBackup)) {
    toast("no repair backup found", "error");
    return;
  }
  if (!confirm("Restore the inventory snapshot from before the last project repair?")) return;
  if (!restoreLastRepairBackup()) {
    toast("repair backup restore failed", "error");
    return;
  }
  if (!persistDatabase("repair backup restored", { dirty: true })) return;
  toast("repair backup restored");
  render();
}

function selectVisibleParts() {
  filteredParts().slice(0, Number(state.renderLimit || PERFORMANCE_DEFAULTS.renderLimit)).forEach((part) => state.selectedPartIds.add(part.id));
  state.bulkOperationPreview = "";
  renderPartsViewOnly();
}

function bulkLocationValue(selector, anyAsUndefined = false) {
  const value = $(selector)?.value || "";
  if (value === "any") return anyAsUndefined ? undefined : null;
  if (value === "none" || value === "") return null;
  return Number(value);
}

function previewBulkMove() {
  const ids = selectedPartIdsArray();
  const fromLocationId = bulkLocationValue("#bulkFromLocation", true);
  const toLocationId = bulkLocationValue("#bulkToLocation");
  const qty = integerOrZero($("#bulkMoveQty")?.value);
  const rows = [];
  ids.forEach((partId) => {
    const part = state.inventory.parts.find((item) => item.id === partId);
    const candidates = stockRowsForPart(partId, fromLocationId).filter((row) => numberOrZero(row.quantity) > 0 && ((row.locationId ?? null) !== (toLocationId ?? null)));
    let remaining = qty || candidates.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
    candidates.forEach((row) => {
      if (remaining <= 0) return;
      const moveQty = Math.min(remaining, numberOrZero(row.quantity));
      remaining -= moveQty;
      rows.push({ part, row, moveQty });
    });
  });
  state.bulkOperationPreview = rows.length
    ? `<div class="table-wrap mini-preview"><table class="data-table"><thead><tr><th>Part</th><th>From</th><th>To</th><th>Available</th><th>Move qty</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.part?.name || "")}</td><td>${escapeHtml(item.row.locationId ? locationPath(item.row.locationId) : "no location")}</td><td>${escapeHtml(toLocationId ? locationPath(toLocationId) : "no location")}</td><td>${numberOrZero(item.row.quantity)}</td><td><input class="mini-input" data-bulk-move-row data-stock-id="${item.row.id}" type="number" min="0" max="${numberOrZero(item.row.quantity)}" step="1" value="${item.moveQty}" /></td></tr>`).join("")}</tbody></table></div>`
    : `<p class="small-note danger-text">No stock rows match that source.</p>`;
  const target = $("#bulkOperationPreview");
  if (target) target.innerHTML = state.bulkOperationPreview;
  else renderPartsViewOnly();
}

function applyBulkMove() {
  const ids = selectedPartIdsArray();
  const fromLocationId = bulkLocationValue("#bulkFromLocation", true);
  const toLocationId = bulkLocationValue("#bulkToLocation");
  const qty = integerOrZero($("#bulkMoveQty")?.value);
  const rowInputs = [...$$("[data-bulk-move-row]")];
  let changed = 0;
  let moved = 0;
  if (rowInputs.length) {
    rowInputs.forEach((input) => {
      const result = moveStockLotToLocation(input.dataset.stockId, toLocationId, input.value, { notes: "bulk move preview row" });
      if (!result.ok && result.error !== "quantity is required") {
        toast(`move skipped: ${result.error}`, "error");
        return;
      }
      changed += result.changed;
      moved += result.quantity;
    });
    if (!moved) {
      toast("nothing moved", "error");
      return;
    }
    logActivity("bulk-move", "stock", null, `${moved} items across ${changed} stock rows`);
    state.bulkOperationPreview = "";
    touchInventory();
    if (!persistDatabase("bulk move applied", { dirty: true })) return;
    render();
    return;
  }
  for (const partId of ids) {
    const result = moveStockFromRows(partId, fromLocationId, toLocationId, { all: qty <= 0, quantity: qty, notes: "bulk move" });
    if (!result.ok && result.error !== "quantity is required") {
      toast(`move skipped: ${result.error}`, "error");
      continue;
    }
    changed += result.changed;
    moved += result.quantity;
  }
  if (!moved) {
    toast("nothing moved", "error");
    return;
  }
  logActivity("bulk-move", "stock", null, `${moved} items across ${changed} stock rows`);
  state.bulkOperationPreview = "";
  touchInventory();
  if (!persistDatabase("bulk move applied", { dirty: true })) return;
  render();
}

function applyBulkTake() {
  const ids = selectedPartIdsArray();
  const locationId = bulkLocationValue("#bulkFromLocation", true);
  const qty = integerOrZero($("#bulkTakeQty")?.value);
  if (qty <= 0) {
    toast("take quantity is required", "error");
    return;
  }
  let taken = 0;
  for (const partId of ids) {
    const result = takeStock(partId, { locationId, quantity: qty, notes: "bulk take" });
    if (!result.ok) {
      toast(`take skipped: ${result.error}`, "error");
      continue;
    }
    taken += result.quantity;
  }
  if (!taken) return;
  logActivity("bulk-take", "stock", null, `${taken} items taken`);
  touchInventory();
  if (!persistDatabase("parts taken", { dirty: true })) return;
  render();
}

function applyBulkMin() {
  const count = setStockRowsMin(selectedPartIdsArray(), $("#bulkMinQty")?.value);
  if (!count) {
    toast("no stock rows selected", "error");
    return;
  }
  logActivity("bulk-set-min", "stock", null, `${count} stock rows`);
  touchInventory();
  if (!persistDatabase("minimum stock updated", { dirty: true })) return;
  render();
}

function applyBulkSource() {
  const count = setStockRowsSource(selectedPartIdsArray(), $("#bulkSourceText")?.value);
  if (!count) {
    toast("no stock rows selected", "error");
    return;
  }
  logActivity("bulk-set-source", "stock", null, `${count} stock rows`);
  touchInventory();
  if (!persistDatabase("stock source updated", { dirty: true })) return;
  render();
}

function applyBulkPrice() {
  const count = setStockRowsPrice(selectedPartIdsArray(), $("#bulkUnitPrice")?.value, $("#bulkCurrency")?.value);
  if (!count) {
    toast("no stock rows selected", "error");
    return;
  }
  logActivity("bulk-set-price", "stock", null, `${count} stock rows`);
  touchInventory();
  if (!persistDatabase("stock price updated", { dirty: true })) return;
  render();
}

function takePartPrompt(partId) {
  const part = state.inventory.parts.find((item) => item.id === Number(partId));
  if (!part) return;
  const qty = integerOrZero(prompt(`Take quantity for "${part.name}"`, "1"));
  if (qty <= 0) return;
  const result = takeStock(part.id, { quantity: qty, notes: "part row take" });
  if (!result.ok) {
    toast(`take failed: ${result.error}`, "error");
    return;
  }
  logActivity("take-part", "part", part.id, `${result.quantity} taken`);
  touchInventory();
  if (!persistDatabase("part taken", { dirty: true })) return;
  render();
}

function takeStockRowPrompt(stockRowId) {
  const row = state.inventory.stock.find((item) => item.id === Number(stockRowId));
  if (!row) return;
  const part = state.inventory.parts.find((item) => item.id === row.partId);
  const qty = integerOrZero(prompt(`Take quantity from ${part?.name || "stock row"}`, "1"));
  if (qty <= 0) return;
  if (numberOrZero(row.quantity) < qty) {
    toast(`take failed: only ${numberOrZero(row.quantity)} available`, "error");
    return;
  }
  row.quantity = numberOrZero(row.quantity) - qty;
  recordStockMovement({ movementType: "take", partId: row.partId, fromLocationId: row.locationId ?? null, quantity: qty, notes: "stock lot take" });
  logActivity("take-stock-row", "stock", row.id, `${qty} taken`);
  touchInventory();
  if (!persistDatabase("stock lot taken", { dirty: true })) return;
  closeModal();
  render();
}

function moveSelectedToLocation(locationId) {
  const ids = selectedPartIdsArray();
  if (!ids.length) {
    toast("select parts in Inventory first", "error");
    return;
  }
  let moved = 0;
  ids.forEach((partId) => {
    const result = moveStockFromRows(partId, "any", locationId, { all: true, notes: "move selected from location view" });
    if (result.ok) moved += result.quantity;
  });
  if (!moved) {
    toast("nothing moved", "error");
    return;
  }
  logActivity("move-selected-here", "location", locationId, `${moved} items moved`);
  touchInventory();
  if (!persistDatabase("stock moved to location", { dirty: true })) return;
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
    version: APP_VERSION,
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
