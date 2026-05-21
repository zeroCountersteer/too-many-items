"use strict";

function allThemes() {
  return [...Object.values(BUILTIN_THEMES), ...Object.values(state.customThemes)];
}

function getTheme(id) {
  return BUILTIN_THEMES[id] || state.customThemes[id] || null;
}

function applyTheme(id) {
  const theme = getTheme(id) || BUILTIN_THEMES[DEFAULT_THEME_ID];
  state.activeTheme = theme.id;
  localStorage.setItem(STORAGE.activeTheme, theme.id);
  THEME_FIELDS.forEach((key) => {
    const value = theme.variables[key];
    if (value) document.documentElement.style.setProperty(key, value);
  });
  document.body.dataset.theme = theme.id;
}

function updateCustomThemeFromInputs() {
  const current = getTheme(state.activeTheme) || BUILTIN_THEMES[DEFAULT_THEME_ID];
  const customId = current.id.startsWith("custom") ? current.id : "customLocal";
  const custom = state.customThemes[customId] || {
    id: customId,
    name: current.id.startsWith("custom") ? current.name : `${current.name} custom`,
    description: "local edited theme",
    variables: { ...current.variables }
  };

  $$('[data-theme-var]').forEach((input) => {
    custom.variables[input.dataset.themeVar] = input.value;
  });

  state.customThemes[customId] = custom;
  localStorage.setItem(STORAGE.customThemes, JSON.stringify(state.customThemes));
  applyTheme(customId);
}

function exportCurrentTheme() {
  const theme = getTheme(state.activeTheme) || BUILTIN_THEMES[DEFAULT_THEME_ID];
  downloadText(`${theme.id}.theme.json`, JSON.stringify(theme, null, 2) + "\n", "application/json");
  setStatus("theme exported");
}

async function importThemeFile(event) {
  const files = [...(event.target.files || [])];
  event.target.value = "";
  if (!files.length) return;

  let imported = 0;
  let lastImportedId = "";

  for (const file of files) {
    try {
      const parsed = JSON.parse(await file.text());
      const themes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.themes)
          ? parsed.themes
          : [parsed];

      for (const theme of themes) {
        if (!theme.id || !theme.name || !theme.variables || typeof theme.variables !== "object") {
          throw new Error("theme requires id, name and variables");
        }
        const id = theme.id.startsWith("custom") ? theme.id : `custom_${theme.id}`;
        state.customThemes[id] = { ...theme, id };
        lastImportedId = id;
        imported += 1;
      }
    } catch (error) {
      toast(`theme import failed: ${file.name}: ${error.message}`, "error");
    }
  }

  if (imported) {
    localStorage.setItem(STORAGE.customThemes, JSON.stringify(state.customThemes));
    applyTheme(lastImportedId);
    setStatus(`${imported} theme${imported === 1 ? "" : "s"} imported`);
    render();
  }
}

function resetCustomTheme() {
  if (!confirm("Remove all imported and edited custom themes?")) return;
  state.customThemes = {};
  localStorage.removeItem(STORAGE.customThemes);
  applyTheme(DEFAULT_THEME_ID);
  setStatus("custom themes reset");
  render();
}

function setStatus(text) {
  state.lastStatus = text;
  const navState = $("#navDbState");
  if (navState) navState.textContent = databaseStateLabel();
}

function databaseStateLabel() {
  if (state.sqliteError) return "engine unavailable";
  if (state.dbDirty) return "local changes";
  if (state.dbBytes) return "saved";
  return state.lastStatus || "ready";
}

function toast(message, type = "ok") {
  let stack = $(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 5200);
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  downloadBlob(filename, blob);
}

function downloadBytes(filename, bytes, type) {
  const blob = new Blob([bytes], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function nextId(items) {
  const max = items.reduce((value, item) => Math.max(value, Number(item.id) || 0), 0);
  return max + 1;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function integerOrZero(value) {
  return Math.max(0, Math.floor(numberOrZero(value)));
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textValue(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  const text = textValue(value);
  return text ? text : null;
}

function sqlValue(value) {
  if (value === undefined || value === "") return null;
  return value;
}

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function loadJsonFromStorage(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeView(view) {
  return VALID_VIEWS.has(view) ? view : "parts";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}
