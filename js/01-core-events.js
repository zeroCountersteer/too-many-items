"use strict";

const state = {
  SQL: null,
  sqliteError: "",
  inventory: createEmptyInventory(),
  activeView: normalizeView(localStorage.getItem(STORAGE.activeView)),
  query: "",
  categoryFilter: "all",
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
  externalApiConfig: loadJsonFromStorage(STORAGE.externalApiConfig, {
    provider: "nexar",
    genericUrlTemplate: "",
    ultraUrlTemplate: "",
    bearerPrefix: "Bearer"
  }),
  externalResults: [],
  externalLastQuery: "",
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
  document.body.classList.toggle("moving-bg", state.movingBackground);
  bindEvents();
  renderShellLoading();
  await initializeDatabaseEngine();
  await loadInitialDatabase();
  render();
  document.body.dataset.appReady = "true";
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
    case "lookup-external-part":
      lookupExternalPart();
      break;
    case "add-api-result":
      openPartModal(null, state.externalResults[Number(actionTarget.dataset.index)] || null);
      break;
    case "open-api-settings":
      setView("settings");
      break;
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
    renderPartsViewOnly();
  }

  if (target.matches("[data-theme-var]")) {
    updateCustomThemeFromInputs();
  }
}

function handleChange(event) {
  const target = event.target;

  if (target.matches("[data-category-filter]")) {
    state.categoryFilter = target.value;
    renderPartsViewOnly();
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
    document.body.classList.toggle("moving-bg", state.movingBackground);
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
    externalLookupForm: () => lookupExternalPart(),
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

