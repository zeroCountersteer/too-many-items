"use strict";

const SQLJS_CDN = "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/";
const BUNDLED_DB_PATH = "data/inventory.db";
const VALID_VIEWS = new Set(["parts", "locations", "database", "settings"]);

const STORAGE = {
  dbBase64: "tmi.v3.database.base64",
  dbDirty: "tmi.v3.database.dirty",
  dbSource: "tmi.v3.database.source",
  fallbackInventory: "tmi.v3.inventory.fallback",
  githubConfig: "tmi.v3.github.config",
  githubSha: "tmi.v3.github.sha",
  activeView: "tmi.v3.activeView",
  activeTheme: "tmi.v3.activeTheme",
  customThemes: "tmi.v3.customThemes",
  movingBackground: "tmi.v3.movingBackground",
  token: "tmi.v3.github.token"
};

const DEFAULT_CATEGORIES = [
  "resistor",
  "capacitor",
  "inductor",
  "ic",
  "keyswitch",
  "connector",
  "diode",
  "transistor",
  "module",
  "mechanical",
  "other"
];

const SPEC_CONFIGS = {
  resistor: {
    table: "resistorSpecs",
    dbTable: "resistor_specs",
    fields: [
      ["resistanceOhm", "resistance, ohm", "number", "resistance_ohm"],
      ["tolerancePercent", "tolerance, %", "number", "tolerance_percent"],
      ["powerW", "power, W", "number", "power_w"],
      ["voltageV", "voltage, V", "number", "voltage_v"],
      ["tempcoPpm", "tempco, ppm", "number", "tempco_ppm"]
    ]
  },
  capacitor: {
    table: "capacitorSpecs",
    dbTable: "capacitor_specs",
    fields: [
      ["capacitanceF", "capacitance, F", "number", "capacitance_f"],
      ["voltageV", "voltage, V", "number", "voltage_v"],
      ["tolerancePercent", "tolerance, %", "number", "tolerance_percent"],
      ["dielectric", "dielectric", "text", "dielectric"],
      ["esrOhm", "ESR, ohm", "number", "esr_ohm"]
    ]
  },
  inductor: {
    table: "inductorSpecs",
    dbTable: "inductor_specs",
    fields: [
      ["inductanceH", "inductance, H", "number", "inductance_h"],
      ["currentA", "current, A", "number", "current_a"],
      ["resistanceOhm", "DCR, ohm", "number", "resistance_ohm"],
      ["shielded", "shielded, 0/1", "number", "shielded"]
    ]
  },
  ic: {
    table: "icSpecs",
    dbTable: "ic_specs",
    fields: [
      ["pinCount", "pin count", "number", "pin_count"],
      ["interface", "interface", "text", "interface"],
      ["supplyMinV", "supply min, V", "number", "supply_min_v"],
      ["supplyMaxV", "supply max, V", "number", "supply_max_v"]
    ]
  },
  keyswitch: {
    table: "keyswitchSpecs",
    dbTable: "keyswitch_specs",
    fields: [
      ["switchType", "switch type", "text", "switch_type"],
      ["mount", "mount", "text", "mount"],
      ["actuationForceG", "actuation force, g", "number", "actuation_force_g"],
      ["travelMm", "travel, mm", "number", "travel_mm"]
    ]
  }
};

const THEME_FIELDS = [
  "--bg-base",
  "--bg-soft",
  "--bg-spot-a",
  "--bg-spot-b",
  "--bg-lines",
  "--panel-bg",
  "--panel-bg-strong",
  "--panel-muted",
  "--panel-border",
  "--panel-border-strong",
  "--text",
  "--text-strong",
  "--text-faint",
  "--accent",
  "--accent-2",
  "--accent-3",
  "--ok",
  "--danger",
  "--warning",
  "--shadow",
  "--glow",
  "--radius-xl",
  "--radius-lg",
  "--radius-md",
  "--radius-sm",
  "--font-ui",
  "--font-mono",
  "--font-display"
];

const ANGEL_CLOUD_VARIABLES = {
  "--bg-base": "#dcecff",
  "--bg-soft": "#f7fbff",
  "--bg-spot-a": "rgba(151, 205, 255, 0.55)",
  "--bg-spot-b": "rgba(229, 237, 255, 0.78)",
  "--bg-lines": "rgba(116, 151, 190, 0.14)",
  "--panel-bg": "rgba(255, 255, 255, 0.82)",
  "--panel-bg-strong": "rgba(255, 255, 255, 0.95)",
  "--panel-muted": "rgba(244, 249, 255, 0.72)",
  "--panel-border": "rgba(166, 178, 196, 0.68)",
  "--panel-border-strong": "rgba(134, 153, 180, 0.82)",
  "--text": "#77859a",
  "--text-strong": "#5c6f8c",
  "--text-faint": "#9aa9bb",
  "--accent": "#8fc9ff",
  "--accent-2": "#c6b7ff",
  "--accent-3": "#ff94d4",
  "--ok": "#59b879",
  "--danger": "#e35d82",
  "--warning": "#bf9845",
  "--shadow": "rgba(79, 98, 124, 0.25)",
  "--glow": "rgba(143, 201, 255, 0.48)",
  "--radius-xl": "24px",
  "--radius-lg": "18px",
  "--radius-md": "12px",
  "--radius-sm": "8px",
  "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
  "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
  "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
};
const BUILTIN_THEMES = {
  "angelCloud": {
    "id": "angelCloud",
    "name": "Angel cloud",
    "description": "pale blue glass, rounded panels, soft webcore",
    "variables": {
      "--bg-base": "#dcecff",
      "--bg-soft": "#f7fbff",
      "--bg-spot-a": "rgba(151, 205, 255, 0.55)",
      "--bg-spot-b": "rgba(229, 237, 255, 0.78)",
      "--bg-lines": "rgba(116, 151, 190, 0.14)",
      "--panel-bg": "rgba(255, 255, 255, 0.82)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.95)",
      "--panel-muted": "rgba(244, 249, 255, 0.72)",
      "--panel-border": "rgba(166, 178, 196, 0.68)",
      "--panel-border-strong": "rgba(134, 153, 180, 0.82)",
      "--text": "#77859a",
      "--text-strong": "#5c6f8c",
      "--text-faint": "#9aa9bb",
      "--accent": "#8fc9ff",
      "--accent-2": "#c6b7ff",
      "--accent-3": "#ff94d4",
      "--ok": "#59b879",
      "--danger": "#e35d82",
      "--warning": "#bf9845",
      "--shadow": "rgba(79, 98, 124, 0.25)",
      "--glow": "rgba(143, 201, 255, 0.48)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "violetNight": {
    "id": "violetNight",
    "name": "Violet night",
    "description": "dark cyber inventory",
    "variables": {
      "--bg-base": "#0d0b1f",
      "--bg-soft": "#171229",
      "--bg-spot-a": "rgba(116, 74, 184, 0.38)",
      "--bg-spot-b": "rgba(47, 117, 155, 0.28)",
      "--bg-lines": "rgba(192, 156, 255, 0.13)",
      "--panel-bg": "rgba(18, 16, 36, 0.82)",
      "--panel-bg-strong": "rgba(29, 24, 52, 0.96)",
      "--panel-muted": "rgba(31, 26, 58, 0.74)",
      "--panel-border": "rgba(141, 111, 189, 0.52)",
      "--panel-border-strong": "rgba(178, 139, 240, 0.72)",
      "--text": "#c7c0dd",
      "--text-strong": "#f3ecff",
      "--text-faint": "#948cab",
      "--accent": "#80f4ff",
      "--accent-2": "#b59aff",
      "--accent-3": "#ff7ecb",
      "--ok": "#a5ff8b",
      "--danger": "#ff5a89",
      "--warning": "#e8d666",
      "--shadow": "rgba(0, 0, 0, 0.42)",
      "--glow": "rgba(128, 244, 255, 0.38)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "graphiteLab": {
    "id": "graphiteLab",
    "name": "Graphite lab",
    "description": "neutral grey UI for longer work sessions",
    "variables": {
      "--bg-base": "#e7ebef",
      "--bg-soft": "#fbfcfd",
      "--bg-spot-a": "rgba(170, 185, 200, 0.44)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.82)",
      "--bg-lines": "rgba(116, 151, 190, 0.14)",
      "--panel-bg": "rgba(255, 255, 255, 0.82)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.95)",
      "--panel-muted": "rgba(244, 249, 255, 0.72)",
      "--panel-border": "rgba(166, 178, 196, 0.68)",
      "--panel-border-strong": "rgba(134, 153, 180, 0.82)",
      "--text": "#657182",
      "--text-strong": "#2f3a49",
      "--text-faint": "#8f9aaa",
      "--accent": "#4b88d1",
      "--accent-2": "#8c7ac9",
      "--accent-3": "#cd6c9d",
      "--ok": "#2c9a60",
      "--danger": "#c84e68",
      "--warning": "#9a7830",
      "--shadow": "rgba(44, 55, 70, 0.2)",
      "--glow": "rgba(75, 136, 209, 0.28)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "terminalGreen": {
    "id": "terminalGreen",
    "name": "Terminal green",
    "description": "compact black-green inventory terminal",
    "variables": {
      "--bg-base": "#03100c",
      "--bg-soft": "#071812",
      "--bg-spot-a": "rgba(51, 255, 167, 0.16)",
      "--bg-spot-b": "rgba(80, 170, 120, 0.12)",
      "--bg-lines": "rgba(102, 255, 178, 0.12)",
      "--panel-bg": "rgba(4, 18, 13, 0.88)",
      "--panel-bg-strong": "rgba(7, 28, 20, 0.96)",
      "--panel-muted": "rgba(8, 33, 23, 0.72)",
      "--panel-border": "rgba(84, 212, 143, 0.48)",
      "--panel-border-strong": "rgba(132, 255, 184, 0.68)",
      "--text": "#9fd7b7",
      "--text-strong": "#d9ffe7",
      "--text-faint": "#6fa786",
      "--accent": "#86ffb5",
      "--accent-2": "#83d0ff",
      "--accent-3": "#f5ff8c",
      "--ok": "#86ff83",
      "--danger": "#ff6b8d",
      "--warning": "#d5dc6a",
      "--shadow": "rgba(0, 0, 0, 0.5)",
      "--glow": "rgba(134, 255, 181, 0.24)",
      "--radius-xl": "12px",
      "--radius-lg": "8px",
      "--radius-md": "5px",
      "--radius-sm": "3px",
      "--font-ui": "Consolas, \"Lucida Console\", monospace",
      "--font-mono": "Consolas, \"Lucida Console\", monospace",
      "--font-display": "Consolas, \"Lucida Console\", monospace"
    }
  },
  "pearlWindow": {
    "id": "pearlWindow",
    "name": "Pearl window",
    "description": "white plastic shell with soft blue shadows",
    "variables": {
      "--bg-base": "#edf5ff",
      "--bg-soft": "#ffffff",
      "--bg-spot-a": "rgba(167, 210, 255, 0.56)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.9)",
      "--bg-lines": "rgba(130, 160, 190, 0.1)",
      "--panel-bg": "rgba(255, 255, 255, 0.88)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.98)",
      "--panel-muted": "rgba(240, 247, 255, 0.74)",
      "--panel-border": "rgba(190, 199, 211, 0.85)",
      "--panel-border-strong": "rgba(155, 169, 190, 0.92)",
      "--text": "#8090a6",
      "--text-strong": "#60738f",
      "--text-faint": "#a2adbc",
      "--accent": "#9ad2ff",
      "--accent-2": "#d4d7ff",
      "--accent-3": "#ffb8de",
      "--ok": "#59b879",
      "--danger": "#e35d82",
      "--warning": "#bf9845",
      "--shadow": "rgba(80, 95, 116, 0.22)",
      "--glow": "rgba(255,255,255,0.72)",
      "--radius-xl": "28px",
      "--radius-lg": "22px",
      "--radius-md": "15px",
      "--radius-sm": "10px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "frostMint": {
    "id": "frostMint",
    "name": "Frost mint",
    "description": "mint glass and low-contrast cold UI",
    "variables": {
      "--bg-base": "#dcfff6",
      "--bg-soft": "#f8fffd",
      "--bg-spot-a": "rgba(104, 234, 202, 0.45)",
      "--bg-spot-b": "rgba(194, 226, 255, 0.58)",
      "--bg-lines": "rgba(67, 148, 140, 0.13)",
      "--panel-bg": "rgba(247, 255, 253, 0.82)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.96)",
      "--panel-muted": "rgba(229, 252, 246, 0.78)",
      "--panel-border": "rgba(136, 194, 184, 0.68)",
      "--panel-border-strong": "rgba(91, 170, 157, 0.82)",
      "--text": "#668981",
      "--text-strong": "#40736b",
      "--text-faint": "#93aaa6",
      "--accent": "#5edfc7",
      "--accent-2": "#8db7ff",
      "--accent-3": "#dba4ff",
      "--ok": "#32a86f",
      "--danger": "#dc6277",
      "--warning": "#9c8843",
      "--shadow": "rgba(39, 86, 80, 0.2)",
      "--glow": "rgba(94, 223, 199, 0.42)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "sakuraGlass": {
    "id": "sakuraGlass",
    "name": "Sakura glass",
    "description": "soft pink window UI",
    "variables": {
      "--bg-base": "#ffe8f3",
      "--bg-soft": "#fffafd",
      "--bg-spot-a": "rgba(255, 159, 207, 0.42)",
      "--bg-spot-b": "rgba(230, 214, 255, 0.62)",
      "--bg-lines": "rgba(178, 101, 137, 0.13)",
      "--panel-bg": "rgba(255, 252, 254, 0.83)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.97)",
      "--panel-muted": "rgba(255, 238, 247, 0.75)",
      "--panel-border": "rgba(218, 158, 188, 0.72)",
      "--panel-border-strong": "rgba(202, 118, 160, 0.84)",
      "--text": "#9b7888",
      "--text-strong": "#835f73",
      "--text-faint": "#b99dad",
      "--accent": "#ff91c8",
      "--accent-2": "#cab9ff",
      "--accent-3": "#80d6ff",
      "--ok": "#56ad78",
      "--danger": "#d95e82",
      "--warning": "#b18a43",
      "--shadow": "rgba(114, 64, 88, 0.18)",
      "--glow": "rgba(255, 145, 200, 0.38)",
      "--radius-xl": "26px",
      "--radius-lg": "20px",
      "--radius-md": "14px",
      "--radius-sm": "9px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "lavenderMilk": {
    "id": "lavenderMilk",
    "name": "Lavender milk",
    "description": "washed lavender and blue-grey text",
    "variables": {
      "--bg-base": "#eee8ff",
      "--bg-soft": "#fbfaff",
      "--bg-spot-a": "rgba(195, 169, 255, 0.43)",
      "--bg-spot-b": "rgba(204, 230, 255, 0.6)",
      "--bg-lines": "rgba(126, 94, 184, 0.13)",
      "--panel-bg": "rgba(253, 251, 255, 0.84)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.97)",
      "--panel-muted": "rgba(241, 235, 255, 0.76)",
      "--panel-border": "rgba(176, 158, 216, 0.72)",
      "--panel-border-strong": "rgba(146, 119, 200, 0.84)",
      "--text": "#817891",
      "--text-strong": "#635a7c",
      "--text-faint": "#a29ab0",
      "--accent": "#b69aff",
      "--accent-2": "#91cbff",
      "--accent-3": "#ffa8d0",
      "--ok": "#55a878",
      "--danger": "#d8618c",
      "--warning": "#a68d3c",
      "--shadow": "rgba(77, 61, 112, 0.18)",
      "--glow": "rgba(182, 154, 255, 0.38)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "aeroBlue": {
    "id": "aeroBlue",
    "name": "Aero blue",
    "description": "transparent blue desktop shell",
    "variables": {
      "--bg-base": "#cfeaff",
      "--bg-soft": "#eef8ff",
      "--bg-spot-a": "rgba(74, 167, 238, 0.46)",
      "--bg-spot-b": "rgba(240, 250, 255, 0.78)",
      "--bg-lines": "rgba(49, 111, 164, 0.15)",
      "--panel-bg": "rgba(237, 248, 255, 0.76)",
      "--panel-bg-strong": "rgba(250, 254, 255, 0.95)",
      "--panel-muted": "rgba(218, 238, 253, 0.78)",
      "--panel-border": "rgba(105, 155, 197, 0.64)",
      "--panel-border-strong": "rgba(59, 124, 183, 0.82)",
      "--text": "#55728b",
      "--text-strong": "#315a78",
      "--text-faint": "#84a0b5",
      "--accent": "#4eb6ff",
      "--accent-2": "#80e7ff",
      "--accent-3": "#c9a3ff",
      "--ok": "#37a874",
      "--danger": "#d94b77",
      "--warning": "#aa8535",
      "--shadow": "rgba(30, 82, 124, 0.24)",
      "--glow": "rgba(78, 182, 255, 0.48)",
      "--radius-xl": "22px",
      "--radius-lg": "16px",
      "--radius-md": "10px",
      "--radius-sm": "6px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "memoryBlue": {
    "id": "memoryBlue",
    "name": "Memory card blue",
    "description": "deep blue plastic and pale labels",
    "variables": {
      "--bg-base": "#162845",
      "--bg-soft": "#213a62",
      "--bg-spot-a": "rgba(97, 160, 255, 0.28)",
      "--bg-spot-b": "rgba(117, 230, 255, 0.12)",
      "--bg-lines": "rgba(151, 198, 255, 0.11)",
      "--panel-bg": "rgba(21, 35, 59, 0.86)",
      "--panel-bg-strong": "rgba(32, 51, 82, 0.97)",
      "--panel-muted": "rgba(43, 64, 96, 0.74)",
      "--panel-border": "rgba(122, 159, 211, 0.48)",
      "--panel-border-strong": "rgba(166, 197, 237, 0.72)",
      "--text": "#b4c6df",
      "--text-strong": "#edf6ff",
      "--text-faint": "#7f95b0",
      "--accent": "#84cbff",
      "--accent-2": "#9bb4ff",
      "--accent-3": "#ffc3e8",
      "--ok": "#7fe69b",
      "--danger": "#ff6e91",
      "--warning": "#ecd071",
      "--shadow": "rgba(0, 0, 0, 0.44)",
      "--glow": "rgba(132, 203, 255, 0.34)",
      "--radius-xl": "16px",
      "--radius-lg": "12px",
      "--radius-md": "7px",
      "--radius-sm": "4px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "pcbGreen": {
    "id": "pcbGreen",
    "name": "PCB green",
    "description": "green solder mask with copper accents",
    "variables": {
      "--bg-base": "#0c1d13",
      "--bg-soft": "#12271a",
      "--bg-spot-a": "rgba(61, 180, 104, 0.22)",
      "--bg-spot-b": "rgba(231, 172, 88, 0.12)",
      "--bg-lines": "rgba(117, 220, 141, 0.13)",
      "--panel-bg": "rgba(12, 30, 19, 0.86)",
      "--panel-bg-strong": "rgba(20, 45, 29, 0.97)",
      "--panel-muted": "rgba(20, 55, 33, 0.72)",
      "--panel-border": "rgba(103, 162, 108, 0.52)",
      "--panel-border-strong": "rgba(183, 142, 76, 0.78)",
      "--text": "#aec9b4",
      "--text-strong": "#e6ffe9",
      "--text-faint": "#7f9c86",
      "--accent": "#65d977",
      "--accent-2": "#e3ac5e",
      "--accent-3": "#80dfff",
      "--ok": "#8dff95",
      "--danger": "#ff6d7c",
      "--warning": "#e3ac5e",
      "--shadow": "rgba(0,0,0,0.5)",
      "--glow": "rgba(101, 217, 119, 0.24)",
      "--radius-xl": "14px",
      "--radius-lg": "10px",
      "--radius-md": "6px",
      "--radius-sm": "3px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "fr4Purple": {
    "id": "fr4Purple",
    "name": "FR4 purple",
    "description": "purple PCB mask and cyan silkscreen",
    "variables": {
      "--bg-base": "#180f27",
      "--bg-soft": "#25183b",
      "--bg-spot-a": "rgba(161, 89, 255, 0.28)",
      "--bg-spot-b": "rgba(84, 230, 255, 0.12)",
      "--bg-lines": "rgba(206, 174, 255, 0.12)",
      "--panel-bg": "rgba(25, 15, 41, 0.86)",
      "--panel-bg-strong": "rgba(41, 26, 64, 0.97)",
      "--panel-muted": "rgba(50, 32, 77, 0.75)",
      "--panel-border": "rgba(166, 116, 225, 0.52)",
      "--panel-border-strong": "rgba(120, 234, 255, 0.72)",
      "--text": "#c8b9da",
      "--text-strong": "#fbf5ff",
      "--text-faint": "#9c8bad",
      "--accent": "#68e8ff",
      "--accent-2": "#be82ff",
      "--accent-3": "#ff8fd6",
      "--ok": "#8ef29b",
      "--danger": "#ff6f91",
      "--warning": "#e0d36d",
      "--shadow": "rgba(0,0,0,0.46)",
      "--glow": "rgba(104, 232, 255, 0.32)",
      "--radius-xl": "16px",
      "--radius-lg": "11px",
      "--radius-md": "7px",
      "--radius-sm": "4px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "blackSolder": {
    "id": "blackSolder",
    "name": "Black solder",
    "description": "black solder mask and gold pads",
    "variables": {
      "--bg-base": "#070806",
      "--bg-soft": "#10120d",
      "--bg-spot-a": "rgba(218, 165, 65, 0.16)",
      "--bg-spot-b": "rgba(78, 118, 92, 0.1)",
      "--bg-lines": "rgba(218, 185, 95, 0.1)",
      "--panel-bg": "rgba(8, 9, 8, 0.9)",
      "--panel-bg-strong": "rgba(17, 19, 15, 0.98)",
      "--panel-muted": "rgba(24, 26, 20, 0.74)",
      "--panel-border": "rgba(171, 142, 72, 0.5)",
      "--panel-border-strong": "rgba(230, 191, 96, 0.8)",
      "--text": "#c7bea4",
      "--text-strong": "#fff6d4",
      "--text-faint": "#8d856f",
      "--accent": "#e8bd5e",
      "--accent-2": "#91c693",
      "--accent-3": "#5cc7d7",
      "--ok": "#9ee68b",
      "--danger": "#ff7070",
      "--warning": "#e8bd5e",
      "--shadow": "rgba(0,0,0,0.62)",
      "--glow": "rgba(232, 189, 94, 0.25)",
      "--radius-xl": "14px",
      "--radius-lg": "9px",
      "--radius-md": "5px",
      "--radius-sm": "3px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "datasheetPaper": {
    "id": "datasheetPaper",
    "name": "Datasheet paper",
    "description": "low-ink technical document style",
    "variables": {
      "--bg-base": "#f5f1e7",
      "--bg-soft": "#fffcf4",
      "--bg-spot-a": "rgba(198, 207, 209, 0.44)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.68)",
      "--bg-lines": "rgba(80, 90, 100, 0.09)",
      "--panel-bg": "rgba(255, 253, 247, 0.9)",
      "--panel-bg-strong": "rgba(255, 254, 249, 0.98)",
      "--panel-muted": "rgba(244, 240, 229, 0.78)",
      "--panel-border": "rgba(160, 151, 134, 0.62)",
      "--panel-border-strong": "rgba(103, 100, 91, 0.76)",
      "--text": "#5d625f",
      "--text-strong": "#262b2a",
      "--text-faint": "#8d918d",
      "--accent": "#2466a8",
      "--accent-2": "#4e8372",
      "--accent-3": "#a54d73",
      "--ok": "#347b50",
      "--danger": "#b24545",
      "--warning": "#89671f",
      "--shadow": "rgba(68, 61, 50, 0.16)",
      "--glow": "rgba(36, 102, 168, 0.18)",
      "--radius-xl": "8px",
      "--radius-lg": "6px",
      "--radius-md": "4px",
      "--radius-sm": "3px",
      "--font-ui": "Georgia, \"Times New Roman\", serif",
      "--font-mono": "Consolas, monospace",
      "--font-display": "Georgia, \"Times New Roman\", serif"
    }
  },
  "coffeeBench": {
    "id": "coffeeBench",
    "name": "Coffee bench",
    "description": "warm beige workbench theme",
    "variables": {
      "--bg-base": "#ead9c5",
      "--bg-soft": "#fff7ed",
      "--bg-spot-a": "rgba(210, 152, 94, 0.34)",
      "--bg-spot-b": "rgba(255, 241, 210, 0.7)",
      "--bg-lines": "rgba(139, 103, 67, 0.12)",
      "--panel-bg": "rgba(255, 249, 239, 0.84)",
      "--panel-bg-strong": "rgba(255, 253, 247, 0.97)",
      "--panel-muted": "rgba(245, 231, 210, 0.75)",
      "--panel-border": "rgba(180, 142, 103, 0.65)",
      "--panel-border-strong": "rgba(151, 108, 70, 0.82)",
      "--text": "#806b5b",
      "--text-strong": "#5d4737",
      "--text-faint": "#a08e80",
      "--accent": "#c98542",
      "--accent-2": "#6fae9c",
      "--accent-3": "#b9719c",
      "--ok": "#4a9c63",
      "--danger": "#c35757",
      "--warning": "#aa7b27",
      "--shadow": "rgba(87, 59, 35, 0.2)",
      "--glow": "rgba(201, 133, 66, 0.28)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "amberDos": {
    "id": "amberDos",
    "name": "Amber DOS",
    "description": "black amber service terminal",
    "variables": {
      "--bg-base": "#100900",
      "--bg-soft": "#1a0f00",
      "--bg-spot-a": "rgba(255, 170, 52, 0.16)",
      "--bg-spot-b": "rgba(255, 220, 80, 0.09)",
      "--bg-lines": "rgba(255, 178, 64, 0.1)",
      "--panel-bg": "rgba(18, 10, 0, 0.9)",
      "--panel-bg-strong": "rgba(30, 17, 0, 0.98)",
      "--panel-muted": "rgba(45, 27, 0, 0.76)",
      "--panel-border": "rgba(220, 143, 44, 0.5)",
      "--panel-border-strong": "rgba(255, 184, 73, 0.78)",
      "--text": "#d8a967",
      "--text-strong": "#ffe4a8",
      "--text-faint": "#9f7845",
      "--accent": "#ffb84f",
      "--accent-2": "#ffd775",
      "--accent-3": "#ff7c7c",
      "--ok": "#b7ff7a",
      "--danger": "#ff675e",
      "--warning": "#ffd775",
      "--shadow": "rgba(0,0,0,0.58)",
      "--glow": "rgba(255, 184, 79, 0.24)",
      "--radius-xl": "10px",
      "--radius-lg": "7px",
      "--radius-md": "4px",
      "--radius-sm": "2px",
      "--font-ui": "Consolas, \"Lucida Console\", monospace",
      "--font-mono": "Consolas, \"Lucida Console\", monospace",
      "--font-display": "Consolas, \"Lucida Console\", monospace"
    }
  },
  "orangeCrt": {
    "id": "orangeCrt",
    "name": "Orange CRT",
    "description": "dark warm CRT and phosphor orange",
    "variables": {
      "--bg-base": "#18090a",
      "--bg-soft": "#24100f",
      "--bg-spot-a": "rgba(255, 102, 54, 0.2)",
      "--bg-spot-b": "rgba(255, 190, 90, 0.1)",
      "--bg-lines": "rgba(255, 103, 64, 0.11)",
      "--panel-bg": "rgba(24, 9, 9, 0.88)",
      "--panel-bg-strong": "rgba(39, 16, 14, 0.98)",
      "--panel-muted": "rgba(54, 22, 18, 0.74)",
      "--panel-border": "rgba(225, 92, 58, 0.5)",
      "--panel-border-strong": "rgba(255, 142, 86, 0.78)",
      "--text": "#d5aaa0",
      "--text-strong": "#ffede8",
      "--text-faint": "#9f766f",
      "--accent": "#ff8a5f",
      "--accent-2": "#ffd36f",
      "--accent-3": "#ff7eb8",
      "--ok": "#9bff85",
      "--danger": "#ff4d5d",
      "--warning": "#ffd36f",
      "--shadow": "rgba(0,0,0,0.54)",
      "--glow": "rgba(255, 138, 95, 0.3)",
      "--radius-xl": "14px",
      "--radius-lg": "10px",
      "--radius-md": "6px",
      "--radius-sm": "3px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "redAlert": {
    "id": "redAlert",
    "name": "Red alert",
    "description": "critical dark red dashboard",
    "variables": {
      "--bg-base": "#110306",
      "--bg-soft": "#1d060b",
      "--bg-spot-a": "rgba(255, 40, 84, 0.18)",
      "--bg-spot-b": "rgba(255, 140, 60, 0.08)",
      "--bg-lines": "rgba(255, 71, 111, 0.11)",
      "--panel-bg": "rgba(20, 4, 8, 0.9)",
      "--panel-bg-strong": "rgba(34, 8, 13, 0.98)",
      "--panel-muted": "rgba(54, 14, 20, 0.74)",
      "--panel-border": "rgba(198, 55, 82, 0.52)",
      "--panel-border-strong": "rgba(255, 80, 116, 0.82)",
      "--text": "#d4a7b0",
      "--text-strong": "#fff0f3",
      "--text-faint": "#a07881",
      "--accent": "#ff4c78",
      "--accent-2": "#ffba68",
      "--accent-3": "#8ee6ff",
      "--ok": "#83f184",
      "--danger": "#ff315d",
      "--warning": "#ffba68",
      "--shadow": "rgba(0,0,0,0.58)",
      "--glow": "rgba(255, 76, 120, 0.28)",
      "--radius-xl": "12px",
      "--radius-lg": "8px",
      "--radius-md": "5px",
      "--radius-sm": "2px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "deepSea": {
    "id": "deepSea",
    "name": "Deep sea",
    "description": "dark teal and dim blue panels",
    "variables": {
      "--bg-base": "#03151d",
      "--bg-soft": "#092331",
      "--bg-spot-a": "rgba(54, 179, 208, 0.2)",
      "--bg-spot-b": "rgba(41, 96, 165, 0.16)",
      "--bg-lines": "rgba(108, 207, 234, 0.11)",
      "--panel-bg": "rgba(4, 21, 30, 0.88)",
      "--panel-bg-strong": "rgba(9, 35, 49, 0.98)",
      "--panel-muted": "rgba(12, 47, 62, 0.75)",
      "--panel-border": "rgba(80, 148, 166, 0.52)",
      "--panel-border-strong": "rgba(110, 213, 238, 0.74)",
      "--text": "#a4c5cc",
      "--text-strong": "#e2fbff",
      "--text-faint": "#759aa3",
      "--accent": "#5bd9ee",
      "--accent-2": "#75a7ff",
      "--accent-3": "#b991ff",
      "--ok": "#7ef0b2",
      "--danger": "#ff6d8e",
      "--warning": "#e7cc6d",
      "--shadow": "rgba(0,0,0,0.52)",
      "--glow": "rgba(91, 217, 238, 0.26)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "7px",
      "--radius-sm": "4px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "cyberIce": {
    "id": "cyberIce",
    "name": "Cyber ice",
    "description": "black glass with cyan-white edges",
    "variables": {
      "--bg-base": "#040b14",
      "--bg-soft": "#091322",
      "--bg-spot-a": "rgba(53, 216, 255, 0.2)",
      "--bg-spot-b": "rgba(230, 249, 255, 0.08)",
      "--bg-lines": "rgba(129, 231, 255, 0.12)",
      "--panel-bg": "rgba(5, 12, 21, 0.88)",
      "--panel-bg-strong": "rgba(9, 20, 34, 0.98)",
      "--panel-muted": "rgba(13, 31, 50, 0.76)",
      "--panel-border": "rgba(91, 190, 230, 0.5)",
      "--panel-border-strong": "rgba(177, 239, 255, 0.82)",
      "--text": "#b6d5e2",
      "--text-strong": "#effcff",
      "--text-faint": "#7f9ead",
      "--accent": "#73e8ff",
      "--accent-2": "#d4f7ff",
      "--accent-3": "#a898ff",
      "--ok": "#8effc1",
      "--danger": "#ff6c95",
      "--warning": "#ffe07e",
      "--shadow": "rgba(0,0,0,0.55)",
      "--glow": "rgba(115, 232, 255, 0.34)",
      "--radius-xl": "20px",
      "--radius-lg": "14px",
      "--radius-md": "8px",
      "--radius-sm": "5px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "neonMagenta": {
    "id": "neonMagenta",
    "name": "Neon magenta",
    "description": "dark nightclub magenta UI",
    "variables": {
      "--bg-base": "#120517",
      "--bg-soft": "#210928",
      "--bg-spot-a": "rgba(255, 73, 202, 0.22)",
      "--bg-spot-b": "rgba(78, 221, 255, 0.1)",
      "--bg-lines": "rgba(255, 112, 213, 0.11)",
      "--panel-bg": "rgba(19, 5, 25, 0.88)",
      "--panel-bg-strong": "rgba(34, 9, 43, 0.98)",
      "--panel-muted": "rgba(49, 13, 61, 0.75)",
      "--panel-border": "rgba(204, 84, 177, 0.52)",
      "--panel-border-strong": "rgba(255, 112, 213, 0.8)",
      "--text": "#d7b1d0",
      "--text-strong": "#fff0fb",
      "--text-faint": "#9f7a99",
      "--accent": "#ff70d5",
      "--accent-2": "#6ee8ff",
      "--accent-3": "#a8ff75",
      "--ok": "#a8ff75",
      "--danger": "#ff557f",
      "--warning": "#ffd86d",
      "--shadow": "rgba(0,0,0,0.55)",
      "--glow": "rgba(255, 112, 213, 0.32)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "7px",
      "--radius-sm": "4px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "minimalEink": {
    "id": "minimalEink",
    "name": "Minimal e-ink",
    "description": "almost monochrome high-readability theme",
    "variables": {
      "--bg-base": "#eef0ef",
      "--bg-soft": "#fafafa",
      "--bg-spot-a": "rgba(90, 100, 105, 0.1)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.78)",
      "--bg-lines": "rgba(0, 0, 0, 0.06)",
      "--panel-bg": "rgba(255, 255, 255, 0.9)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.98)",
      "--panel-muted": "rgba(238, 240, 240, 0.78)",
      "--panel-border": "rgba(120, 126, 128, 0.48)",
      "--panel-border-strong": "rgba(70, 74, 76, 0.68)",
      "--text": "#565d60",
      "--text-strong": "#1f2426",
      "--text-faint": "#858b8d",
      "--accent": "#345f7d",
      "--accent-2": "#6c7680",
      "--accent-3": "#8a5370",
      "--ok": "#39704d",
      "--danger": "#9a3b47",
      "--warning": "#775d1e",
      "--shadow": "rgba(40, 45, 48, 0.14)",
      "--glow": "rgba(52, 95, 125, 0.16)",
      "--radius-xl": "10px",
      "--radius-lg": "8px",
      "--radius-md": "5px",
      "--radius-sm": "3px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "candyWeb": {
    "id": "candyWeb",
    "name": "Candy web",
    "description": "pastel candy cyan and pink",
    "variables": {
      "--bg-base": "#fce7ff",
      "--bg-soft": "#f7fdff",
      "--bg-spot-a": "rgba(255, 128, 216, 0.38)",
      "--bg-spot-b": "rgba(117, 236, 255, 0.46)",
      "--bg-lines": "rgba(166, 93, 190, 0.12)",
      "--panel-bg": "rgba(255, 252, 255, 0.82)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.96)",
      "--panel-muted": "rgba(250, 235, 255, 0.74)",
      "--panel-border": "rgba(207, 157, 222, 0.68)",
      "--panel-border-strong": "rgba(174, 105, 202, 0.8)",
      "--text": "#8c7892",
      "--text-strong": "#6c5278",
      "--text-faint": "#ad9ab3",
      "--accent": "#ff7ed5",
      "--accent-2": "#69e5ff",
      "--accent-3": "#baff8f",
      "--ok": "#58bb6e",
      "--danger": "#df5c82",
      "--warning": "#b9973b",
      "--shadow": "rgba(111, 62, 128, 0.18)",
      "--glow": "rgba(255, 126, 213, 0.36)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "cobaltService": {
    "id": "cobaltService",
    "name": "Cobalt service",
    "description": "industrial blue service tool",
    "variables": {
      "--bg-base": "#102033",
      "--bg-soft": "#162b43",
      "--bg-spot-a": "rgba(55, 125, 220, 0.26)",
      "--bg-spot-b": "rgba(113, 147, 190, 0.12)",
      "--bg-lines": "rgba(135, 182, 235, 0.12)",
      "--panel-bg": "rgba(16, 30, 47, 0.88)",
      "--panel-bg-strong": "rgba(26, 45, 68, 0.98)",
      "--panel-muted": "rgba(35, 55, 81, 0.75)",
      "--panel-border": "rgba(91, 135, 187, 0.52)",
      "--panel-border-strong": "rgba(132, 183, 240, 0.74)",
      "--text": "#b5c3d3",
      "--text-strong": "#edf4ff",
      "--text-faint": "#8495aa",
      "--accent": "#62a9ff",
      "--accent-2": "#8bd4ff",
      "--accent-3": "#ffb06d",
      "--ok": "#83df9b",
      "--danger": "#ff6b7d",
      "--warning": "#e7c16a",
      "--shadow": "rgba(0,0,0,0.42)",
      "--glow": "rgba(98, 169, 255, 0.28)",
      "--radius-xl": "10px",
      "--radius-lg": "7px",
      "--radius-md": "4px",
      "--radius-sm": "2px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "amberCrt": {
    "id": "amberCrt",
    "name": "Amber CRT",
    "description": "black and amber hardware terminal",
    "variables": {
      "--bg-base": "#120b03",
      "--bg-soft": "#1e1205",
      "--bg-spot-a": "rgba(255, 173, 64, 0.15)",
      "--bg-spot-b": "rgba(160, 84, 24, 0.14)",
      "--bg-lines": "rgba(255, 184, 82, 0.12)",
      "--panel-bg": "rgba(22, 13, 4, 0.88)",
      "--panel-bg-strong": "rgba(34, 20, 7, 0.96)",
      "--panel-muted": "rgba(42, 25, 8, 0.76)",
      "--panel-border": "rgba(200, 132, 45, 0.48)",
      "--panel-border-strong": "rgba(255, 184, 82, 0.70)",
      "--text": "#d9b987",
      "--text-strong": "#ffe9bb",
      "--text-faint": "#9d7c4d",
      "--accent": "#ffbf5f",
      "--accent-2": "#ffe083",
      "--accent-3": "#ff776a",
      "--ok": "#bedf75",
      "--danger": "#ff5e69",
      "--warning": "#ffd36b",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(255, 191, 95, 0.24)",
      "--radius-xl": "10px",
      "--radius-lg": "7px",
      "--radius-md": "4px",
      "--radius-sm": "2px",
      "--font-ui": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "Consolas, \"Lucida Console\", Monaco, monospace"
    }
  },
  "blackGlass": {
    "id": "blackGlass",
    "name": "Black glass",
    "description": "low saturation transparent black",
    "variables": {
      "--bg-base": "#080a0e",
      "--bg-soft": "#10131a",
      "--bg-spot-a": "rgba(88, 108, 130, 0.16)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.06)",
      "--bg-lines": "rgba(255, 255, 255, 0.06)",
      "--panel-bg": "rgba(12, 14, 19, 0.80)",
      "--panel-bg-strong": "rgba(18, 21, 28, 0.96)",
      "--panel-muted": "rgba(24, 27, 35, 0.76)",
      "--panel-border": "rgba(150, 160, 174, 0.28)",
      "--panel-border-strong": "rgba(210, 218, 230, 0.44)",
      "--text": "#afb6c2",
      "--text-strong": "#f0f3f8",
      "--text-faint": "#757e8d",
      "--accent": "#d6e5ff",
      "--accent-2": "#9ba8bd",
      "--accent-3": "#ffffff",
      "--ok": "#8ad095",
      "--danger": "#e36b7a",
      "--warning": "#d6be6e",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(214, 229, 255, 0.15)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "bloodMoon": {
    "id": "bloodMoon",
    "name": "Blood moon",
    "description": "dark red laboratory mode",
    "variables": {
      "--bg-base": "#160507",
      "--bg-soft": "#250a0d",
      "--bg-spot-a": "rgba(202, 44, 72, 0.22)",
      "--bg-spot-b": "rgba(91, 15, 30, 0.26)",
      "--bg-lines": "rgba(255, 83, 100, 0.11)",
      "--panel-bg": "rgba(27, 7, 10, 0.86)",
      "--panel-bg-strong": "rgba(42, 11, 16, 0.96)",
      "--panel-muted": "rgba(51, 15, 20, 0.76)",
      "--panel-border": "rgba(181, 72, 83, 0.44)",
      "--panel-border-strong": "rgba(255, 95, 112, 0.66)",
      "--text": "#d3b8b9",
      "--text-strong": "#ffeded",
      "--text-faint": "#9e7b7d",
      "--accent": "#ff5b73",
      "--accent-2": "#ff9c6f",
      "--accent-3": "#b993ff",
      "--ok": "#9ee37d",
      "--danger": "#ff415f",
      "--warning": "#efbd5f",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(255, 91, 115, 0.27)",
      "--radius-xl": "16px",
      "--radius-lg": "10px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "blueberryIce": {
    "id": "blueberryIce",
    "name": "Blueberry ice",
    "description": "cold blue-violet bright theme",
    "variables": {
      "--bg-base": "#dae7ff",
      "--bg-soft": "#f8fbff",
      "--bg-spot-a": "rgba(118, 154, 255, 0.40)",
      "--bg-spot-b": "rgba(185, 222, 255, 0.56)",
      "--bg-lines": "rgba(88, 112, 190, 0.12)",
      "--panel-bg": "rgba(250, 252, 255, 0.84)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.97)",
      "--panel-muted": "rgba(232, 239, 255, 0.76)",
      "--panel-border": "rgba(128, 151, 211, 0.62)",
      "--panel-border-strong": "rgba(96, 124, 196, 0.78)",
      "--text": "#6d7791",
      "--text-strong": "#4b5c86",
      "--text-faint": "#94a0bc",
      "--accent": "#7394ff",
      "--accent-2": "#78d4ff",
      "--accent-3": "#c98fff",
      "--ok": "#4ea86e",
      "--danger": "#d95979",
      "--warning": "#a9892e",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(115, 148, 255, 0.35)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "ceramicLab": {
    "id": "ceramicLab",
    "name": "Ceramic lab",
    "description": "clean off-white lab panels",
    "variables": {
      "--bg-base": "#edf0ee",
      "--bg-soft": "#ffffff",
      "--bg-spot-a": "rgba(182, 205, 198, 0.34)",
      "--bg-spot-b": "rgba(239, 244, 236, 0.80)",
      "--bg-lines": "rgba(96, 118, 108, 0.10)",
      "--panel-bg": "rgba(252, 253, 251, 0.88)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.98)",
      "--panel-muted": "rgba(241, 245, 242, 0.78)",
      "--panel-border": "rgba(158, 174, 168, 0.60)",
      "--panel-border-strong": "rgba(116, 139, 130, 0.75)",
      "--text": "#6c7772",
      "--text-strong": "#42534c",
      "--text-faint": "#94a09b",
      "--accent": "#3f9f9a",
      "--accent-2": "#86a7d8",
      "--accent-3": "#c789b5",
      "--ok": "#3e9b69",
      "--danger": "#bd5a68",
      "--warning": "#a17a2a",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(63, 159, 154, 0.25)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "classicBlue": {
    "id": "classicBlue",
    "name": "Classic blue",
    "description": "old desktop dialog blue-grey",
    "variables": {
      "--bg-base": "#cfd7e7",
      "--bg-soft": "#edf2fa",
      "--bg-spot-a": "rgba(87, 126, 178, 0.28)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.54)",
      "--bg-lines": "rgba(48, 77, 118, 0.13)",
      "--panel-bg": "rgba(231, 237, 247, 0.88)",
      "--panel-bg-strong": "rgba(247, 250, 255, 0.96)",
      "--panel-muted": "rgba(218, 226, 239, 0.78)",
      "--panel-border": "rgba(92, 112, 143, 0.66)",
      "--panel-border-strong": "rgba(48, 78, 132, 0.78)",
      "--text": "#49566b",
      "--text-strong": "#25374f",
      "--text-faint": "#718095",
      "--accent": "#315fbd",
      "--accent-2": "#75a6ff",
      "--accent-3": "#d66ab0",
      "--ok": "#2f8e5a",
      "--danger": "#b83556",
      "--warning": "#92701f",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(49, 95, 189, 0.22)",
      "--radius-xl": "8px",
      "--radius-lg": "6px",
      "--radius-md": "4px",
      "--radius-sm": "2px",
      "--font-ui": "Tahoma, \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "Tahoma, \"Segoe UI\", Arial, sans-serif"
    }
  },
  "cyberLime": {
    "id": "cyberLime",
    "name": "Cyber lime",
    "description": "neon lime and purple debug screen",
    "variables": {
      "--bg-base": "#080711",
      "--bg-soft": "#121020",
      "--bg-spot-a": "rgba(160, 255, 54, 0.18)",
      "--bg-spot-b": "rgba(154, 86, 255, 0.22)",
      "--bg-lines": "rgba(186, 255, 73, 0.13)",
      "--panel-bg": "rgba(14, 12, 25, 0.86)",
      "--panel-bg-strong": "rgba(22, 18, 40, 0.96)",
      "--panel-muted": "rgba(28, 22, 52, 0.78)",
      "--panel-border": "rgba(169, 255, 72, 0.44)",
      "--panel-border-strong": "rgba(208, 255, 90, 0.70)",
      "--text": "#cdd7bf",
      "--text-strong": "#f3ffe9",
      "--text-faint": "#97a183",
      "--accent": "#b5ff3e",
      "--accent-2": "#9b7cff",
      "--accent-3": "#ff63d8",
      "--ok": "#9dff70",
      "--danger": "#ff477d",
      "--warning": "#ffe95b",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(181, 255, 62, 0.30)",
      "--radius-xl": "8px",
      "--radius-lg": "6px",
      "--radius-md": "3px",
      "--radius-sm": "1px",
      "--font-ui": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "Consolas, \"Lucida Console\", Monaco, monospace"
    }
  },
  "glassSnow": {
    "id": "glassSnow",
    "name": "Glass snow",
    "description": "white frosted interface with pale blue shadows",
    "variables": {
      "--bg-base": "#eef7ff",
      "--bg-soft": "#ffffff",
      "--bg-spot-a": "rgba(184, 225, 255, 0.62)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.9)",
      "--bg-lines": "rgba(136, 163, 197, 0.10)",
      "--panel-bg": "rgba(255, 255, 255, 0.88)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.98)",
      "--panel-muted": "rgba(246, 249, 255, 0.72)",
      "--panel-border": "rgba(186, 201, 220, 0.78)",
      "--panel-border-strong": "rgba(151, 174, 205, 0.86)",
      "--text": "#7a8796",
      "--text-strong": "#556b86",
      "--text-faint": "#a7b3c2",
      "--accent": "#9bd5ff",
      "--accent-2": "#d5e8ff",
      "--accent-3": "#f7b9dd",
      "--ok": "#58ad86",
      "--danger": "#d86884",
      "--warning": "#b9964e",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(155, 213, 255, 0.42)",
      "--radius-xl": "28px",
      "--radius-lg": "22px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "magentaSynth": {
    "id": "magentaSynth",
    "name": "Magenta synth",
    "description": "black magenta synthwave setup",
    "variables": {
      "--bg-base": "#100515",
      "--bg-soft": "#1c0924",
      "--bg-spot-a": "rgba(255, 0, 178, 0.20)",
      "--bg-spot-b": "rgba(106, 83, 255, 0.18)",
      "--bg-lines": "rgba(255, 80, 217, 0.12)",
      "--panel-bg": "rgba(23, 8, 31, 0.86)",
      "--panel-bg-strong": "rgba(38, 13, 50, 0.96)",
      "--panel-muted": "rgba(47, 17, 60, 0.76)",
      "--panel-border": "rgba(225, 72, 203, 0.46)",
      "--panel-border-strong": "rgba(255, 99, 232, 0.70)",
      "--text": "#dac5db",
      "--text-strong": "#fff3ff",
      "--text-faint": "#a485a8",
      "--accent": "#ff4fd8",
      "--accent-2": "#7d68ff",
      "--accent-3": "#49eaff",
      "--ok": "#88ff9f",
      "--danger": "#ff4c64",
      "--warning": "#ffd35e",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(255, 79, 216, 0.30)",
      "--radius-xl": "12px",
      "--radius-lg": "8px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "matrixBlue": {
    "id": "matrixBlue",
    "name": "Matrix blue",
    "description": "cyan grid with electric blue text",
    "variables": {
      "--bg-base": "#020817",
      "--bg-soft": "#061129",
      "--bg-spot-a": "rgba(0, 162, 255, 0.20)",
      "--bg-spot-b": "rgba(0, 255, 209, 0.14)",
      "--bg-lines": "rgba(0, 199, 255, 0.13)",
      "--panel-bg": "rgba(4, 12, 30, 0.86)",
      "--panel-bg-strong": "rgba(6, 18, 42, 0.96)",
      "--panel-muted": "rgba(7, 22, 50, 0.78)",
      "--panel-border": "rgba(64, 170, 225, 0.44)",
      "--panel-border-strong": "rgba(106, 222, 255, 0.70)",
      "--text": "#a8cbe5",
      "--text-strong": "#e9faff",
      "--text-faint": "#7498b4",
      "--accent": "#39caff",
      "--accent-2": "#65ffd9",
      "--accent-3": "#a087ff",
      "--ok": "#74ff9e",
      "--danger": "#ff6184",
      "--warning": "#e1d85a",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(57, 202, 255, 0.30)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "Consolas, \"Lucida Console\", Monaco, monospace"
    }
  },
  "midnightChrome": {
    "id": "midnightChrome",
    "name": "Midnight chrome",
    "description": "dark blue chrome panels",
    "variables": {
      "--bg-base": "#06111f",
      "--bg-soft": "#0d1a2a",
      "--bg-spot-a": "rgba(61, 127, 207, 0.28)",
      "--bg-spot-b": "rgba(131, 208, 255, 0.16)",
      "--bg-lines": "rgba(120, 176, 235, 0.12)",
      "--panel-bg": "rgba(10, 22, 37, 0.86)",
      "--panel-bg-strong": "rgba(14, 29, 48, 0.96)",
      "--panel-muted": "rgba(16, 34, 56, 0.76)",
      "--panel-border": "rgba(95, 139, 185, 0.46)",
      "--panel-border-strong": "rgba(145, 190, 235, 0.66)",
      "--text": "#b8c5d6",
      "--text-strong": "#eff7ff",
      "--text-faint": "#8190a4",
      "--accent": "#6dbbff",
      "--accent-2": "#8fe7ff",
      "--accent-3": "#d98aff",
      "--ok": "#78e695",
      "--danger": "#ff6880",
      "--warning": "#e9c95f",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(109, 187, 255, 0.32)",
      "--radius-xl": "20px",
      "--radius-lg": "14px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "mintCream": {
    "id": "mintCream",
    "name": "Mint cream",
    "description": "green-white soft inventory desk",
    "variables": {
      "--bg-base": "#dcfff1",
      "--bg-soft": "#fbfffd",
      "--bg-spot-a": "rgba(105, 235, 176, 0.44)",
      "--bg-spot-b": "rgba(200, 255, 236, 0.72)",
      "--bg-lines": "rgba(64, 150, 116, 0.13)",
      "--panel-bg": "rgba(250, 255, 253, 0.84)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.97)",
      "--panel-muted": "rgba(229, 255, 245, 0.74)",
      "--panel-border": "rgba(119, 190, 162, 0.62)",
      "--panel-border-strong": "rgba(68, 165, 126, 0.78)",
      "--text": "#607f73",
      "--text-strong": "#3e6958",
      "--text-faint": "#8bab9d",
      "--accent": "#4ad79c",
      "--accent-2": "#95d7ff",
      "--accent-3": "#d79cff",
      "--ok": "#3aae6e",
      "--danger": "#d65a82",
      "--warning": "#a9882d",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(74, 215, 156, 0.36)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "monochromeInk": {
    "id": "monochromeInk",
    "name": "Monochrome ink",
    "description": "sharp black and white catalog mode",
    "variables": {
      "--bg-base": "#efefef",
      "--bg-soft": "#ffffff",
      "--bg-spot-a": "rgba(0, 0, 0, 0.06)",
      "--bg-spot-b": "rgba(255, 255, 255, 0.95)",
      "--bg-lines": "rgba(0, 0, 0, 0.12)",
      "--panel-bg": "rgba(255, 255, 255, 0.9)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.98)",
      "--panel-muted": "rgba(242, 242, 242, 0.86)",
      "--panel-border": "rgba(40, 40, 40, 0.45)",
      "--panel-border-strong": "rgba(0, 0, 0, 0.68)",
      "--text": "#555555",
      "--text-strong": "#161616",
      "--text-faint": "#858585",
      "--accent": "#111111",
      "--accent-2": "#747474",
      "--accent-3": "#b6b6b6",
      "--ok": "#2b7a42",
      "--danger": "#a9273e",
      "--warning": "#8a681d",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(0, 0, 0, 0.13)",
      "--radius-xl": "6px",
      "--radius-lg": "4px",
      "--radius-md": "2px",
      "--radius-sm": "0px",
      "--font-ui": "Arial, \"Helvetica Neue\", sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "Arial, \"Helvetica Neue\", sans-serif"
    }
  },
  "nordFrost": {
    "id": "nordFrost",
    "name": "Nord frost",
    "description": "cool blue-grey night mode",
    "variables": {
      "--bg-base": "#202936",
      "--bg-soft": "#2a3443",
      "--bg-spot-a": "rgba(136, 192, 208, 0.18)",
      "--bg-spot-b": "rgba(129, 161, 193, 0.14)",
      "--bg-lines": "rgba(216, 222, 233, 0.08)",
      "--panel-bg": "rgba(39, 49, 63, 0.86)",
      "--panel-bg-strong": "rgba(48, 60, 76, 0.96)",
      "--panel-muted": "rgba(55, 68, 86, 0.76)",
      "--panel-border": "rgba(129, 161, 193, 0.40)",
      "--panel-border-strong": "rgba(163, 190, 216, 0.64)",
      "--text": "#c7d0dc",
      "--text-strong": "#eceff4",
      "--text-faint": "#94a1b2",
      "--accent": "#88c0d0",
      "--accent-2": "#81a1c1",
      "--accent-3": "#b48ead",
      "--ok": "#a3be8c",
      "--danger": "#bf616a",
      "--warning": "#ebcb8b",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(136, 192, 208, 0.22)",
      "--radius-xl": "16px",
      "--radius-lg": "10px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "paperLedger": {
    "id": "paperLedger",
    "name": "Paper ledger",
    "description": "paper catalog for component bins",
    "variables": {
      "--bg-base": "#e7dfcd",
      "--bg-soft": "#fbf7ea",
      "--bg-spot-a": "rgba(208, 190, 142, 0.34)",
      "--bg-spot-b": "rgba(255, 255, 246, 0.82)",
      "--bg-lines": "rgba(126, 108, 75, 0.16)",
      "--panel-bg": "rgba(255, 251, 238, 0.88)",
      "--panel-bg-strong": "rgba(255, 252, 244, 0.98)",
      "--panel-muted": "rgba(239, 231, 208, 0.76)",
      "--panel-border": "rgba(171, 151, 108, 0.64)",
      "--panel-border-strong": "rgba(137, 114, 74, 0.82)",
      "--text": "#746b5e",
      "--text-strong": "#574b3a",
      "--text-faint": "#9b907f",
      "--accent": "#4f83a2",
      "--accent-2": "#9d8c58",
      "--accent-3": "#bd6c7b",
      "--ok": "#5f8d55",
      "--danger": "#b9555a",
      "--warning": "#a97924",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(79, 131, 162, 0.24)",
      "--radius-xl": "14px",
      "--radius-lg": "10px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "Georgia, \"Times New Roman\", serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "Georgia, \"Times New Roman\", serif"
    }
  },
  "peachSoda": {
    "id": "peachSoda",
    "name": "Peach soda",
    "description": "warm orange-pink translucent panels",
    "variables": {
      "--bg-base": "#ffe4d2",
      "--bg-soft": "#fff9ed",
      "--bg-spot-a": "rgba(255, 156, 116, 0.48)",
      "--bg-spot-b": "rgba(255, 229, 152, 0.48)",
      "--bg-lines": "rgba(178, 113, 72, 0.13)",
      "--panel-bg": "rgba(255, 250, 242, 0.84)",
      "--panel-bg-strong": "rgba(255, 255, 250, 0.97)",
      "--panel-muted": "rgba(255, 236, 219, 0.73)",
      "--panel-border": "rgba(219, 159, 121, 0.66)",
      "--panel-border-strong": "rgba(208, 123, 84, 0.78)",
      "--text": "#88705f",
      "--text-strong": "#6c4936",
      "--text-faint": "#ad917f",
      "--accent": "#ff946b",
      "--accent-2": "#ffd36d",
      "--accent-3": "#ff86ba",
      "--ok": "#5da969",
      "--danger": "#d45364",
      "--warning": "#c08a23",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(255, 148, 107, 0.36)",
      "--radius-xl": "26px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "roseTerminal": {
    "id": "roseTerminal",
    "name": "Rose terminal",
    "description": "red-pink terminal with soft contrast",
    "variables": {
      "--bg-base": "#130812",
      "--bg-soft": "#211020",
      "--bg-spot-a": "rgba(255, 96, 170, 0.18)",
      "--bg-spot-b": "rgba(255, 162, 209, 0.14)",
      "--bg-lines": "rgba(255, 118, 188, 0.11)",
      "--panel-bg": "rgba(24, 10, 23, 0.86)",
      "--panel-bg-strong": "rgba(37, 16, 36, 0.96)",
      "--panel-muted": "rgba(46, 21, 44, 0.75)",
      "--panel-border": "rgba(219, 92, 160, 0.42)",
      "--panel-border-strong": "rgba(255, 131, 196, 0.66)",
      "--text": "#d8bdcc",
      "--text-strong": "#fff0f8",
      "--text-faint": "#a78394",
      "--accent": "#ff79bd",
      "--accent-2": "#ffb1d8",
      "--accent-3": "#9fb7ff",
      "--ok": "#91f09b",
      "--danger": "#ff5272",
      "--warning": "#f1c563",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(255, 121, 189, 0.26)",
      "--radius-xl": "18px",
      "--radius-lg": "12px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "Consolas, \"Lucida Console\", Monaco, monospace"
    }
  },
  "sakuraDesk": {
    "id": "sakuraDesk",
    "name": "Sakura desk",
    "description": "pale pink desktop stationery",
    "variables": {
      "--bg-base": "#ffeaf2",
      "--bg-soft": "#fff9fb",
      "--bg-spot-a": "rgba(255, 172, 205, 0.46)",
      "--bg-spot-b": "rgba(195, 222, 255, 0.48)",
      "--bg-lines": "rgba(180, 104, 132, 0.12)",
      "--panel-bg": "rgba(255, 251, 253, 0.86)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.97)",
      "--panel-muted": "rgba(255, 239, 246, 0.74)",
      "--panel-border": "rgba(219, 154, 180, 0.64)",
      "--panel-border-strong": "rgba(204, 116, 154, 0.78)",
      "--text": "#8a6c7c",
      "--text-strong": "#6f445d",
      "--text-faint": "#b192a3",
      "--accent": "#ff8dbc",
      "--accent-2": "#9bcaff",
      "--accent-3": "#c2a0ff",
      "--ok": "#55aa79",
      "--danger": "#d6537d",
      "--warning": "#b6903e",
      "--shadow": "rgba(74, 89, 110, 0.22)",
      "--glow": "rgba(255, 141, 188, 0.38)",
      "--radius-xl": "24px",
      "--radius-lg": "18px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "solarCircuit": {
    "id": "solarCircuit",
    "name": "Solar circuit",
    "description": "warm dark solarized electronics UI",
    "variables": {
      "--bg-base": "#102027",
      "--bg-soft": "#17313a",
      "--bg-spot-a": "rgba(230, 165, 66, 0.19)",
      "--bg-spot-b": "rgba(39, 151, 157, 0.19)",
      "--bg-lines": "rgba(212, 172, 87, 0.10)",
      "--panel-bg": "rgba(15, 31, 37, 0.86)",
      "--panel-bg-strong": "rgba(23, 45, 52, 0.96)",
      "--panel-muted": "rgba(27, 54, 61, 0.75)",
      "--panel-border": "rgba(141, 139, 96, 0.46)",
      "--panel-border-strong": "rgba(204, 171, 92, 0.64)",
      "--text": "#bdc5b5",
      "--text-strong": "#f5f2df",
      "--text-faint": "#87918a",
      "--accent": "#e6b65d",
      "--accent-2": "#4ec2c7",
      "--accent-3": "#d87aa1",
      "--ok": "#91d76e",
      "--danger": "#ea6a6a",
      "--warning": "#efcf72",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(230, 182, 93, 0.25)",
      "--radius-xl": "14px",
      "--radius-lg": "9px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  },
  "transparentGhost": {
    "id": "transparentGhost",
    "name": "Transparent ghost",
    "description": "very pale translucent ghost UI",
    "variables": {
      "--bg-base": "#e9f2ff",
      "--bg-soft": "#fdfdff",
      "--bg-spot-a": "rgba(255, 255, 255, 0.72)",
      "--bg-spot-b": "rgba(184, 203, 255, 0.42)",
      "--bg-lines": "rgba(130, 148, 175, 0.09)",
      "--panel-bg": "rgba(255, 255, 255, 0.58)",
      "--panel-bg-strong": "rgba(255, 255, 255, 0.82)",
      "--panel-muted": "rgba(255, 255, 255, 0.44)",
      "--panel-border": "rgba(177, 190, 212, 0.48)",
      "--panel-border-strong": "rgba(143, 164, 198, 0.68)",
      "--text": "#7c8492",
      "--text-strong": "#5f6e87",
      "--text-faint": "#a3acbb",
      "--accent": "#9ac5ff",
      "--accent-2": "#d7baff",
      "--accent-3": "#ffadd8",
      "--ok": "#63a982",
      "--danger": "#d66b85",
      "--warning": "#b39242",
      "--shadow": "rgba(73, 92, 124, 0.16)",
      "--glow": "rgba(154, 197, 255, 0.30)",
      "--radius-xl": "30px",
      "--radius-lg": "24px",
      "--radius-md": "12px",
      "--radius-sm": "8px",
      "--font-ui": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif",
      "--font-mono": "\"Lucida Console\", Monaco, Consolas, monospace",
      "--font-display": "\"Trebuchet MS\", \"Segoe UI\", Arial, sans-serif"
    }
  },
  "vaporDusk": {
    "id": "vaporDusk",
    "name": "Vapor dusk",
    "description": "purple sunset vapor panels",
    "variables": {
      "--bg-base": "#180b28",
      "--bg-soft": "#2b1641",
      "--bg-spot-a": "rgba(255, 103, 191, 0.24)",
      "--bg-spot-b": "rgba(72, 202, 255, 0.18)",
      "--bg-lines": "rgba(255, 139, 214, 0.12)",
      "--panel-bg": "rgba(31, 15, 48, 0.84)",
      "--panel-bg-strong": "rgba(47, 24, 70, 0.96)",
      "--panel-muted": "rgba(58, 30, 82, 0.74)",
      "--panel-border": "rgba(224, 112, 213, 0.46)",
      "--panel-border-strong": "rgba(255, 146, 225, 0.68)",
      "--text": "#d9c4e4",
      "--text-strong": "#fff0ff",
      "--text-faint": "#a98cb6",
      "--accent": "#ff7fd4",
      "--accent-2": "#6de7ff",
      "--accent-3": "#ffbd6d",
      "--ok": "#8bffaa",
      "--danger": "#ff5a70",
      "--warning": "#ffd463",
      "--shadow": "rgba(0, 0, 0, 0.46)",
      "--glow": "rgba(255, 127, 212, 0.32)",
      "--radius-xl": "22px",
      "--radius-lg": "16px",
      "--radius-md": "8px",
      "--radius-sm": "4px",
      "--font-ui": "\"Segoe UI\", Arial, sans-serif",
      "--font-mono": "Consolas, \"Lucida Console\", Monaco, monospace",
      "--font-display": "\"Segoe UI\", Arial, sans-serif"
    }
  }
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "app_meta" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "locations" (
  "id" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "parent_id" INTEGER,
  "notes" TEXT,
  FOREIGN KEY("parent_id") REFERENCES "locations"("id")
);

CREATE TABLE IF NOT EXISTS "parts" (
  "id" INTEGER PRIMARY KEY,
  "category_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "manufacturer" TEXT,
  "mpn" TEXT,
  "footprint" TEXT,
  "package" TEXT,
  "description" TEXT,
  "datasheet_url" TEXT,
  "notes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  FOREIGN KEY("category_id") REFERENCES "categories"("id")
);

CREATE TABLE IF NOT EXISTS "stock" (
  "id" INTEGER PRIMARY KEY,
  "part_id" INTEGER NOT NULL,
  "location_id" INTEGER,
  "quantity" INTEGER NOT NULL DEFAULT 0 CHECK("quantity" >= 0),
  "min_quantity" INTEGER NOT NULL DEFAULT 0 CHECK("min_quantity" >= 0),
  "source" TEXT,
  "order_number" TEXT,
  "unit_price" REAL,
  "currency" TEXT,
  "date_added" TEXT DEFAULT CURRENT_DATE,
  "notes" TEXT,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE,
  FOREIGN KEY("location_id") REFERENCES "locations"("id")
);

CREATE TABLE IF NOT EXISTS "resistor_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "resistance_ohm" REAL NOT NULL,
  "tolerance_percent" REAL,
  "power_w" REAL,
  "voltage_v" REAL,
  "tempco_ppm" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "capacitor_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "capacitance_f" REAL NOT NULL,
  "voltage_v" REAL,
  "tolerance_percent" REAL,
  "dielectric" TEXT,
  "esr_ohm" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "inductor_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "inductance_h" REAL NOT NULL,
  "current_a" REAL,
  "resistance_ohm" REAL,
  "shielded" INTEGER CHECK("shielded" IN (0, 1)),
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "ic_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "pin_count" INTEGER,
  "interface" TEXT,
  "supply_min_v" REAL,
  "supply_max_v" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "keyswitch_specs" (
  "part_id" INTEGER PRIMARY KEY,
  "switch_type" TEXT,
  "mount" TEXT,
  "actuation_force_g" REAL,
  "travel_mm" REAL,
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "attributes" (
  "part_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "value_num" REAL,
  "unit" TEXT,
  "value_text" TEXT,
  PRIMARY KEY("part_id", "name"),
  FOREIGN KEY("part_id") REFERENCES "parts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_parts_category" ON "parts" ("category_id");
CREATE INDEX IF NOT EXISTS "idx_parts_mpn" ON "parts" ("mpn");
CREATE INDEX IF NOT EXISTS "idx_parts_footprint" ON "parts" ("footprint");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_parts_unique_mpn" ON "parts" ("manufacturer", "mpn") WHERE "mpn" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_stock_part" ON "stock" ("part_id");
CREATE INDEX IF NOT EXISTS "idx_stock_location" ON "stock" ("location_id");

CREATE VIEW IF NOT EXISTS "parts_overview" AS
SELECT
  p."id",
  c."name" AS "category",
  p."name",
  p."manufacturer",
  p."mpn",
  p."footprint",
  p."package",
  p."description",
  p."datasheet_url",
  COALESCE(st."total_quantity", 0) AS "total_quantity",
  COALESCE(st."locations", '') AS "locations"
FROM "parts" p
JOIN "categories" c ON c."id" = p."category_id"
LEFT JOIN (
  SELECT
    s."part_id",
    SUM(s."quantity") AS "total_quantity",
    GROUP_CONCAT(COALESCE(l."name", 'no location') || ': ' || s."quantity", '; ') AS "locations"
  FROM "stock" s
  LEFT JOIN "locations" l ON l."id" = s."location_id"
  GROUP BY s."part_id"
) st ON st."part_id" = p."id";
`;

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
  document.body.addEventListener("submit", handleSubmit);
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
  if (event.target.id === "partForm") {
    event.preventDefault();
    savePartFromForm(event.target);
  }

  if (event.target.id === "locationForm") {
    event.preventDefault();
    saveLocationFromForm(event.target);
  }

  if (event.target.id === "settingsForm") {
    event.preventDefault();
    saveSettings(event.target);
  }
}

function setView(view) {
  state.activeView = normalizeView(view);
  localStorage.setItem(STORAGE.activeView, state.activeView);
  render();
}

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
    actions.push(`<button type="button" class="primary-button" data-action="open-add-part">+ add part</button>`);
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

function openPartModal(partId = null) {
  const part = partId ? state.inventory.parts.find((item) => item.id === partId) : null;
  const title = part ? "edit part" : "add part";
  const categoryId = part?.categoryId || state.inventory.categories[0]?.id || 1;
  const categoryName = getCategoryName(categoryId);
  const stockRows = part ? state.inventory.stock.filter((row) => row.partId === part.id) : [];
  const rowHtml = stockRows.length ? stockRows.map(renderStockEditorRow).join("") : renderStockEditorRow(null);
  const categoryOptions = state.inventory.categories.map((category) => `<option value="${category.id}" ${category.id === categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("");

  openModal(`
    <form id="partForm" class="modal-card">
      <div class="modal-head">
        <div><p class="path-line">inventory / part editor</p><h3>${title}</h3></div>
        <button type="button" class="icon-button" data-action="close-modal">×</button>
      </div>
      <input type="hidden" name="id" value="${part ? part.id : ""}" />
      <div class="form-grid">
        <div class="field span-2"><label>name</label><input name="name" required value="${escapeAttr(part?.name || "")}" placeholder="100nF 50V X7R 0603" /></div>
        <div class="field"><label>category</label><select name="categoryId" id="partCategorySelect">${categoryOptions}</select></div>
        <div class="field"><label>package</label><input name="package" value="${escapeAttr(part?.package || "")}" placeholder="0603, QFN-48, SOT-23" /></div>
        <div class="field"><label>manufacturer</label><input name="manufacturer" value="${escapeAttr(part?.manufacturer || "")}" placeholder="Texas Instruments" /></div>
        <div class="field"><label>mpn</label><input name="mpn" value="${escapeAttr(part?.mpn || "")}" placeholder="TPS25751D" /></div>
        <div class="field"><label>footprint</label><input name="footprint" value="${escapeAttr(part?.footprint || "")}" placeholder="C_0603_1608Metric" /></div>
        <div class="field"><label>datasheet url</label><input name="datasheetUrl" value="${escapeAttr(part?.datasheetUrl || "")}" placeholder="https://..." /></div>
        <div class="field span-2"><label>description</label><input name="description" value="${escapeAttr(part?.description || "")}" /></div>
        <div class="field span-2"><label>notes</label><textarea name="notes">${escapeHtml(part?.notes || "")}</textarea></div>
      </div>

      <p class="section-title">category specific specs</p>
      <div class="spec-box" id="specFields">${renderSpecFields(part, categoryName)}</div>

      <p class="section-title">stock</p>
      <div class="stock-editor" id="stockRows">${rowHtml}</div>
      <button type="button" class="ghost-button" data-action="add-stock-row">+ stock row</button>

      <div class="form-actions">
        ${part ? `<button type="button" class="danger-button" data-action="delete-part" data-id="${part.id}">delete</button>` : ""}
        <button type="button" class="ghost-button" data-action="close-modal">cancel</button>
        <button type="submit" class="primary-button">save part</button>
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
  const spec = part ? getSpec(part.id, kind) : null;
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

  openModal(`
    <form id="locationForm" class="modal-card">
      <div class="modal-head">
        <div><p class="path-line">inventory / location editor</p><h3>${location ? "edit location" : "add location"}</h3></div>
        <button type="button" class="icon-button" data-action="close-modal">×</button>
      </div>
      <input type="hidden" name="id" value="${location ? location.id : ""}" />
      <div class="form-grid">
        <div class="field"><label>name</label><input name="name" required value="${escapeAttr(location?.name || "")}" placeholder="A01 capacitors" /></div>
        <div class="field"><label>parent</label><select name="parentId">${parentOptions}</select></div>
        <div class="field span-2"><label>notes</label><textarea name="notes">${escapeHtml(location?.notes || "")}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost-button" data-action="close-modal">cancel</button>
        <button type="submit" class="primary-button">save location</button>
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
    parentId: parentRaw ? Number(parentRaw) : null,
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

  if (existing) Object.assign(existing, location);
  else state.inventory.locations.push(location);

  touchInventory();
  if (!persistDatabase(existing ? "location updated" : "location added", { dirty: true })) return;
  closeModal();
  render();
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
  $("#modalRoot").innerHTML = `<div class="modal-layer">${html}</div>`;
}

function closeModal() {
  $("#modalRoot").innerHTML = "";
}

async function initializeDatabaseEngine() {
  if (typeof initSqlJs !== "function") {
    throw new Error("sql.js was not loaded. Check the CDN script or vendor sql-wasm.js locally.");
  }
  state.SQL = await initSqlJs({ locateFile: (file) => `${SQLJS_CDN}${file}` });
  state.sqliteError = "";
}

async function loadInitialDatabase() {
  const cached = localStorage.getItem(STORAGE.dbBase64);
  if (cached) {
    try {
      loadDatabaseBytes(base64ToBytes(cached), {
        source: localStorage.getItem(STORAGE.dbSource) || "browser local copy",
        fileName: "inventory.db",
        dirty: localStorage.getItem(STORAGE.dbDirty) === "1",
        cache: false
      });
      setStatus("database loaded from browser");
      return;
    } catch (error) {
      console.warn("cached database failed", error);
      localStorage.removeItem(STORAGE.dbBase64);
    }
  }

  await loadBundledDatabase({ makeDirty: false, quiet: true });
}

async function loadBundledDatabase(options = {}) {
  requireSql();
  try {
    const response = await fetch(`${BUNDLED_DB_PATH}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error("bundled database is empty");
    loadDatabaseBytes(bytes, {
      source: BUNDLED_DB_PATH,
      fileName: "inventory.db",
      dirty: !!options.makeDirty,
      cache: true
    });
    setStatus("bundled database loaded");
    if (!options.quiet) render();
  } catch (error) {
    state.inventory = createEmptyInventory();
    persistDatabase("new local database created", { dirty: !!options.makeDirty });
    if (!options.quiet) {
      toast(`bundled database not loaded; empty database created: ${error.message}`, "error");
      render();
    }
  }
}

function loadDatabaseBytes(bytes, options = {}) {
  requireSql();
  const db = new state.SQL.Database(bytes);
  let inventory;
  try {
    inventory = databaseToInventory(db);
  } finally {
    db.close();
  }
  state.inventory = normalizeInventory(inventory);
  state.dbBytes = new Uint8Array(bytes);
  state.dbFileName = options.fileName || "inventory.db";
  state.dbSource = options.source || "SQLite file";
  state.dbDirty = !!options.dirty;
  if (options.sha !== undefined) state.githubSha = options.sha || "";
  if (options.cache !== false) cacheDatabaseBytes(state.dbBytes, state.dbSource, state.dbDirty);
  setStatus(`database loaded: ${state.dbSource}`);
}

function persistDatabase(message = "database saved", options = {}) {
  if (!state.SQL) {
    localStorage.setItem(STORAGE.fallbackInventory, inventoryJson());
    setStatus("saved fallback inventory");
    return null;
  }
  ensureInventoryShape(state.inventory);
  const validation = validateInventory(state.inventory);
  if (!validation.ok) {
    toast(`database not saved: ${validation.errors[0]}`, "error");
    return null;
  }
  let bytes;
  try {
    bytes = inventoryToDatabaseBytes(state.inventory);
  } catch (error) {
    setStatus("database save failed");
    toast(`database not saved: ${error.message}`, "error");
    return null;
  }
  state.dbBytes = bytes;
  state.dbFileName = "inventory.db";
  state.dbSource = state.dbSource || "browser local copy";
  state.dbDirty = options.dirty ?? true;
  cacheDatabaseBytes(bytes, state.dbSource, state.dbDirty);
  setStatus(message);
  return bytes;
}

function cacheDatabaseBytes(bytes, source, dirty) {
  localStorage.setItem(STORAGE.dbBase64, bytesToBase64(bytes));
  localStorage.setItem(STORAGE.dbSource, source || "browser local copy");
  localStorage.setItem(STORAGE.dbDirty, dirty ? "1" : "0");
}

async function importDatabaseFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    loadDatabaseBytes(bytes, {
      source: `local file: ${file.name}`,
      fileName: file.name,
      dirty: true,
      cache: true
    });
    render();
  } catch (error) {
    toast(`database import failed: ${error.message}`, "error");
  }
}

function exportDatabase() {
  const validation = validateInventory(state.inventory);
  if (!validation.ok) {
    toast(`fix database first: ${validation.errors[0]}`, "error");
    return;
  }
  const bytes = persistDatabase("database exported", { dirty: state.dbDirty });
  if (!bytes) return;
  downloadBytes("inventory.db", bytes, "application/vnd.sqlite3");
}

function newDatabase() {
  const ok = confirm("Create a new empty database? Current local data will be replaced. Export first if needed.");
  if (!ok) return;
  state.inventory = createEmptyInventory();
  state.githubSha = "";
  state.dbSource = "new local database";
  localStorage.removeItem(STORAGE.githubSha);
  if (!persistDatabase("new empty database created", { dirty: true })) return;
  render();
}

function clearLocalCache() {
  if (!confirm("Clear the local browser copy? Export or commit first if needed.")) return;
  localStorage.removeItem(STORAGE.dbBase64);
  localStorage.removeItem(STORAGE.dbDirty);
  localStorage.removeItem(STORAGE.dbSource);
  localStorage.removeItem(STORAGE.fallbackInventory);
  state.dbDirty = false;
  setStatus("local copy cleared");
  render();
}

function databaseToInventory(db) {
  const metaRows = tableExists(db, "app_meta") ? selectTable(db, "app_meta", { key: "key", value: "value" }) : [];
  const metaMap = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));

  const raw = {
    schemaVersion: Number(metaMap.schemaVersion || 1),
    meta: {
      app: metaMap.app || "too-many-items",
      createdAt: metaMap.createdAt || metaMap.created_at || new Date().toISOString(),
      updatedAt: metaMap.updatedAt || metaMap.updated_at || new Date().toISOString()
    },
    categories: selectTable(db, "categories", { id: "id", name: "name" }, "ORDER BY \"id\""),
    locations: selectTable(db, "locations", { id: "id", name: "name", parentId: "parent_id", notes: "notes" }, "ORDER BY \"id\""),
    parts: selectTable(db, "parts", {
      id: "id",
      categoryId: "category_id",
      name: "name",
      manufacturer: "manufacturer",
      mpn: "mpn",
      footprint: "footprint",
      package: "package",
      description: "description",
      datasheetUrl: "datasheet_url",
      notes: "notes",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }, "ORDER BY \"id\""),
    stock: selectTable(db, "stock", {
      id: "id",
      partId: "part_id",
      locationId: "location_id",
      quantity: "quantity",
      minQuantity: "min_quantity",
      source: "source",
      orderNumber: "order_number",
      unitPrice: "unit_price",
      currency: "currency",
      dateAdded: "date_added",
      notes: "notes"
    }, "ORDER BY \"id\""),
    resistorSpecs: selectTable(db, "resistor_specs", {
      partId: "part_id",
      resistanceOhm: "resistance_ohm",
      tolerancePercent: "tolerance_percent",
      powerW: "power_w",
      voltageV: "voltage_v",
      tempcoPpm: "tempco_ppm"
    }, "ORDER BY \"part_id\""),
    capacitorSpecs: selectTable(db, "capacitor_specs", {
      partId: "part_id",
      capacitanceF: "capacitance_f",
      voltageV: "voltage_v",
      tolerancePercent: "tolerance_percent",
      dielectric: "dielectric",
      esrOhm: "esr_ohm"
    }, "ORDER BY \"part_id\""),
    inductorSpecs: selectTable(db, "inductor_specs", {
      partId: "part_id",
      inductanceH: "inductance_h",
      currentA: "current_a",
      resistanceOhm: "resistance_ohm",
      shielded: "shielded"
    }, "ORDER BY \"part_id\""),
    icSpecs: selectTable(db, "ic_specs", {
      partId: "part_id",
      pinCount: "pin_count",
      interface: "interface",
      supplyMinV: "supply_min_v",
      supplyMaxV: "supply_max_v",
      oldFootprint: "footprint"
    }, "ORDER BY \"part_id\""),
    keyswitchSpecs: [],
    attributes: selectTable(db, "attributes", {
      partId: "part_id",
      name: "name",
      valueNum: "value_num",
      unit: "unit",
      valueText: "value_text"
    }, "ORDER BY \"part_id\", \"name\"")
  };

  const keyswitchTable = tableExists(db, "keyswitch_specs") ? "keyswitch_specs" : (tableExists(db, "keyswitch_spec") ? "keyswitch_spec" : null);
  if (keyswitchTable) {
    raw.keyswitchSpecs = selectTable(db, keyswitchTable, {
      partId: "part_id",
      switchType: "switch_type",
      mount: "mount",
      actuationForceG: "actuation_force_g",
      travelMm: "travel_mm"
    }, "ORDER BY \"part_id\"");
  }

  raw.icSpecs.forEach((spec) => {
    if (!spec.oldFootprint) return;
    const part = raw.parts.find((item) => Number(item.id) === Number(spec.partId));
    if (part && !part.footprint) part.footprint = spec.oldFootprint;
  });

  return normalizeInventory(raw);
}

function inventoryToDatabaseBytes(inventory) {
  requireSql();
  const inv = normalizeInventory(inventory);
  const db = new state.SQL.Database();
  runSqlScript(db, SCHEMA_SQL);
  db.run("PRAGMA foreign_keys=OFF");
  db.run("BEGIN TRANSACTION");
  try {
    const meta = {
      app: inv.meta.app || "too-many-items",
      schemaVersion: String(inv.schemaVersion || 1),
      createdAt: inv.meta.createdAt || new Date().toISOString(),
      updatedAt: inv.meta.updatedAt || new Date().toISOString()
    };
    Object.entries(meta).forEach(([key, value]) => {
      db.run("INSERT INTO \"app_meta\" (\"key\", \"value\") VALUES (?, ?)", [key, sqlValue(value)]);
    });

    inv.categories.forEach((row) => {
      db.run("INSERT INTO \"categories\" (\"id\", \"name\") VALUES (?, ?)", [row.id, row.name]);
    });

    inv.locations.forEach((row) => {
      db.run("INSERT INTO \"locations\" (\"id\", \"name\", \"parent_id\", \"notes\") VALUES (?, ?, ?, ?)", [row.id, row.name, sqlValue(row.parentId), sqlValue(row.notes)]);
    });

    inv.parts.forEach((row) => {
      db.run(`INSERT INTO "parts" ("id", "category_id", "name", "manufacturer", "mpn", "footprint", "package", "description", "datasheet_url", "notes", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.categoryId,
        row.name,
        sqlValue(row.manufacturer),
        sqlValue(row.mpn),
        sqlValue(row.footprint),
        sqlValue(row.package),
        sqlValue(row.description),
        sqlValue(row.datasheetUrl),
        sqlValue(row.notes),
        row.createdAt || new Date().toISOString(),
        sqlValue(row.updatedAt)
      ]);
    });

    inv.stock.forEach((row) => {
      db.run(`INSERT INTO "stock" ("id", "part_id", "location_id", "quantity", "min_quantity", "source", "order_number", "unit_price", "currency", "date_added", "notes") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        row.id,
        row.partId,
        sqlValue(row.locationId),
        integerOrZero(row.quantity),
        integerOrZero(row.minQuantity),
        sqlValue(row.source),
        sqlValue(row.orderNumber),
        sqlValue(row.unitPrice),
        sqlValue(row.currency),
        row.dateAdded || new Date().toISOString().slice(0, 10),
        sqlValue(row.notes)
      ]);
    });

    insertSpecRows(db, inv, "resistor");
    insertSpecRows(db, inv, "capacitor");
    insertSpecRows(db, inv, "inductor");
    insertSpecRows(db, inv, "ic");
    insertSpecRows(db, inv, "keyswitch");

    inv.attributes.forEach((row) => {
      db.run(`INSERT INTO "attributes" ("part_id", "name", "value_num", "unit", "value_text") VALUES (?, ?, ?, ?, ?)`, [
        row.partId,
        row.name,
        sqlValue(row.valueNum),
        sqlValue(row.unit),
        sqlValue(row.valueText)
      ]);
    });

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    db.close();
    throw error;
  }
  const bytes = db.export();
  db.close();
  return bytes;
}

function insertSpecRows(db, inv, kind) {
  const config = SPEC_CONFIGS[kind];
  const rows = inv[config.table] || [];
  if (!rows.length) return;
  const columns = ["part_id"].concat(config.fields.map((field) => field[3]));
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${qid(config.dbTable)} (${columns.map(qid).join(", ")}) VALUES (${placeholders})`;
  rows.forEach((row) => {
    const values = [row.partId].concat(config.fields.map(([name]) => sqlValue(row[name])));
    const hasValue = values.slice(1).some((value) => value !== null && value !== undefined && value !== "");
    const requiredFirstValue = values[1];
    const requiresFirstValue = kind === "resistor" || kind === "capacitor" || kind === "inductor";
    if (!hasValue) return;
    if (requiresFirstValue && (requiredFirstValue === null || requiredFirstValue === undefined || requiredFirstValue === "")) return;
    db.run(sql, values);
  });
}

function runSqlScript(db, script) {
  script.split(/;\s*(?:\n|$)/).forEach((statement) => {
    const sql = statement.trim();
    if (sql) db.run(sql);
  });
}

function requireSql() {
  if (!state.SQL) throw new Error(state.sqliteError || "SQLite engine is not ready");
}

function tableExists(db, table) {
  return queryRows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]).length > 0;
}

function tableColumns(db, table) {
  return new Set(queryRows(db, `PRAGMA table_info(${qid(table)})`).map((row) => row.name));
}

function selectTable(db, table, fieldMap, orderBy = "") {
  if (!tableExists(db, table)) return [];
  const columns = tableColumns(db, table);
  const expressions = Object.entries(fieldMap)
    .filter(([, column]) => columns.has(column))
    .map(([key, column]) => `${qid(column)} AS ${qid(key)}`);
  if (!expressions.length) return [];
  const sql = `SELECT ${expressions.join(", ")} FROM ${qid(table)} ${orderBy}`;
  return queryRows(db, sql);
}

function queryRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];
  try {
    if (params.length) statement.bind(params);
    while (statement.step()) rows.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return rows;
}

function qid(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function filteredParts() {
  const query = state.query.trim().toLowerCase();
  return state.inventory.parts
    .filter((part) => state.categoryFilter === "all" || String(part.categoryId) === String(state.categoryFilter))
    .filter((part) => {
      if (!query) return true;
      const haystack = [
        part.name,
        part.manufacturer,
        part.mpn,
        part.footprint,
        part.package,
        part.description,
        part.notes,
        getCategoryName(part.categoryId),
        specSummary(part),
        stockSummary(part.id).locations
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => getCategoryName(a.categoryId).localeCompare(getCategoryName(b.categoryId)) || a.name.localeCompare(b.name));
}

function stockSummary(partId) {
  const rows = state.inventory.stock.filter((row) => row.partId === partId);
  const total = rows.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const min = rows.reduce((sum, row) => sum + numberOrZero(row.minQuantity), 0);
  const locations = rows
    .map((row) => `${row.locationId ? locationPath(row.locationId) : "no location"}: ${numberOrZero(row.quantity)}`)
    .join("; ");
  return { total, min, locations };
}

function specSummary(part) {
  const kind = categoryKind(getCategoryName(part.categoryId));
  if (!kind) return "";
  const spec = getSpec(part.id, kind);
  if (!spec) return "";
  const pairs = Object.entries(spec).filter(([key, value]) => key !== "partId" && value !== null && value !== undefined && value !== "");
  return pairs.slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(" / ");
}

function getSpec(partId, kind) {
  const table = SPEC_CONFIGS[kind]?.table;
  if (!table) return null;
  return state.inventory[table].find((spec) => spec.partId === partId) || null;
}

function categoryKind(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("resistor")) return "resistor";
  if (lower.includes("capacitor")) return "capacitor";
  if (lower.includes("inductor")) return "inductor";
  if (lower === "ic" || lower.includes("micro") || lower.includes("controller") || lower.includes("chip")) return "ic";
  if (lower.includes("switch") || lower.includes("keyswitch")) return "keyswitch";
  return null;
}

function getCategoryName(categoryId) {
  return state.inventory.categories.find((category) => category.id === Number(categoryId))?.name || "other";
}

function locationPath(locationId, visited = new Set()) {
  const location = state.inventory.locations.find((item) => item.id === Number(locationId));
  if (!location) return "unknown";
  if (visited.has(location.id)) return location.name;
  visited.add(location.id);
  return location.parentId ? `${locationPath(location.parentId, visited)} / ${location.name}` : location.name;
}

function getMetrics() {
  const stock = state.inventory.stock;
  const quantity = stock.reduce((sum, row) => sum + numberOrZero(row.quantity), 0);
  const lowStock = state.inventory.parts.filter((part) => {
    const summary = stockSummary(part.id);
    return summary.min > 0 && summary.total <= summary.min;
  }).length;
  return {
    parts: state.inventory.parts.length,
    quantity,
    locations: state.inventory.locations.length,
    lowStock,
    categories: state.inventory.categories.length,
    stockRecords: stock.length,
    attributes: state.inventory.attributes.length
  };
}

function createEmptyInventory() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    meta: {
      app: "too-many-items",
      createdAt: now,
      updatedAt: now
    },
    categories: DEFAULT_CATEGORIES.map((name, index) => ({ id: index + 1, name })),
    locations: [],
    parts: [],
    resistorSpecs: [],
    capacitorSpecs: [],
    inductorSpecs: [],
    icSpecs: [],
    keyswitchSpecs: [],
    stock: [],
    attributes: []
  };
}

function normalizeInventory(raw) {
  const base = createEmptyInventory();
  if (!raw || typeof raw !== "object") return base;
  const inv = { ...base, ...raw };
  inv.meta = { ...base.meta, ...(raw.meta || {}) };
  inv.categories = normalizeCategories(raw.categories || base.categories);
  inv.locations = normalizeLocations(raw.locations || []);
  inv.parts = normalizeParts(raw.parts || []);
  inv.stock = normalizeStock(raw.stock || []);
  inv.resistorSpecs = normalizeSpecs(raw.resistorSpecs || raw.resistor_specs || [], "resistor");
  inv.capacitorSpecs = normalizeSpecs(raw.capacitorSpecs || raw.capacitor_specs || [], "capacitor");
  inv.inductorSpecs = normalizeSpecs(raw.inductorSpecs || raw.inductor_specs || [], "inductor");
  inv.icSpecs = normalizeSpecs(raw.icSpecs || raw.ic_specs || [], "ic");
  inv.keyswitchSpecs = normalizeSpecs(raw.keyswitchSpecs || raw.keyswitch_specs || raw.keyswitch_spec || [], "keyswitch");
  inv.attributes = normalizeAttributes(raw.attributes || []);
  ensureInventoryShape(inv);
  normalizeReferences(inv);
  return inv;
}

function ensureInventoryShape(inv) {
  inv.schemaVersion = inv.schemaVersion || 1;
  inv.meta = inv.meta || {};
  inv.meta.app = inv.meta.app || "too-many-items";
  inv.meta.createdAt = inv.meta.createdAt || new Date().toISOString();
  inv.meta.updatedAt = inv.meta.updatedAt || inv.meta.createdAt;
  ["categories", "locations", "parts", "stock", "resistorSpecs", "capacitorSpecs", "inductorSpecs", "icSpecs", "keyswitchSpecs", "attributes"].forEach((key) => {
    if (!Array.isArray(inv[key])) inv[key] = [];
  });
  if (!inv.categories.length) inv.categories = DEFAULT_CATEGORIES.map((name, index) => ({ id: index + 1, name }));
}

function normalizeReferences(inv) {
  const categoryIds = new Set(inv.categories.map((category) => category.id));
  let other = inv.categories.find((category) => category.name === "other");
  if (!other) {
    other = { id: nextId(inv.categories), name: "other" };
    inv.categories.push(other);
    categoryIds.add(other.id);
  }
  inv.parts.forEach((part) => {
    if (!categoryIds.has(part.categoryId)) part.categoryId = other.id;
  });
  const partIds = new Set(inv.parts.map((part) => part.id));
  inv.stock = inv.stock.filter((row) => partIds.has(row.partId));
  inv.attributes = inv.attributes.filter((row) => partIds.has(row.partId));
  Object.values(SPEC_CONFIGS).forEach((config) => {
    inv[config.table] = inv[config.table].filter((row) => partIds.has(row.partId));
  });
}

function normalizeCategories(items) {
  const result = [];
  items.forEach((item, index) => {
    const name = textValue(item.name || item.Name || `category_${index + 1}`).toLowerCase();
    if (!name) return;
    if (result.some((category) => category.name.toLowerCase() === name)) return;
    result.push({ id: Number(item.id || index + 1), name });
  });
  DEFAULT_CATEGORIES.forEach((name) => {
    if (!result.some((category) => category.name === name)) result.push({ id: nextId(result), name });
  });
  return result;
}

function normalizeLocations(items) {
  return items.map((item, index) => ({
    id: Number(item.id || index + 1),
    name: textValue(item.name || item.Name || `location_${index + 1}`),
    parentId: nullableNumber(item.parentId ?? item.parent_id),
    notes: nullableText(item.notes)
  })).filter((item) => item.name);
}

function normalizeParts(items) {
  return items.map((item, index) => ({
    id: Number(item.id || index + 1),
    categoryId: Number(item.categoryId ?? item.category_id ?? 11),
    name: textValue(item.name || item.Name || `part_${index + 1}`),
    manufacturer: nullableText(item.manufacturer ?? item.Manufacturer),
    mpn: nullableText(item.mpn ?? item.partnumber ?? item.Partnumber),
    footprint: nullableText(item.footprint ?? item.Footprint),
    package: nullableText(item.package ?? item.Package),
    description: nullableText(item.description),
    datasheetUrl: nullableText(item.datasheetUrl ?? item.datasheet_url),
    notes: nullableText(item.notes),
    createdAt: item.createdAt ?? item.created_at ?? new Date().toISOString(),
    updatedAt: item.updatedAt ?? item.updated_at ?? null
  })).filter((item) => item.name && Number.isFinite(item.id));
}

function normalizeStock(items) {
  return items.map((item, index) => ({
    id: Number(item.id || index + 1),
    partId: Number(item.partId ?? item.part_id),
    locationId: nullableNumber(item.locationId ?? item.location_id),
    quantity: integerOrZero(item.quantity),
    minQuantity: integerOrZero(item.minQuantity ?? item.min_quantity),
    source: nullableText(item.source),
    orderNumber: nullableText(item.orderNumber ?? item.order_number),
    unitPrice: nullableNumber(item.unitPrice ?? item.unit_price),
    currency: nullableText(item.currency),
    dateAdded: item.dateAdded ?? item.date_added ?? new Date().toISOString().slice(0, 10),
    notes: nullableText(item.notes)
  })).filter((item) => Number.isFinite(item.partId));
}

function normalizeSpecs(items, kind) {
  const config = SPEC_CONFIGS[kind];
  return items.map((item) => {
    const spec = { partId: Number(item.partId ?? item.part_id) };
    config.fields.forEach(([name, , type, column]) => {
      const raw = item[name] ?? item[column] ?? item[camelToSnake(name)];
      if (raw === undefined || raw === null || raw === "") return;
      spec[name] = type === "number" ? Number(raw) : String(raw);
    });
    return spec;
  }).filter((spec) => Number.isFinite(spec.partId));
}

function normalizeAttributes(items) {
  return items.map((item) => ({
    partId: Number(item.partId ?? item.part_id),
    name: textValue(item.name),
    valueNum: nullableNumber(item.valueNum ?? item.value_num),
    unit: nullableText(item.unit),
    valueText: nullableText(item.valueText ?? item.value_text)
  })).filter((item) => Number.isFinite(item.partId) && item.name);
}

function validateInventory(inv) {
  const errors = [];
  const categoryIds = new Set(inv.categories.map((category) => category.id));
  const partIds = new Set(inv.parts.map((part) => part.id));
  const locationIds = new Set(inv.locations.map((location) => location.id));

  inv.parts.forEach((part) => {
    if (!part.name) errors.push(`part ${part.id} has no name`);
    if (!categoryIds.has(part.categoryId)) errors.push(`part ${part.id} references missing category ${part.categoryId}`);
  });

  inv.stock.forEach((row) => {
    if (!partIds.has(row.partId)) errors.push(`stock row ${row.id} references missing part ${row.partId}`);
    if (row.locationId !== null && row.locationId !== undefined && !locationIds.has(row.locationId)) errors.push(`stock row ${row.id} references missing location ${row.locationId}`);
    if (row.quantity < 0) errors.push(`stock row ${row.id} has negative quantity`);
  });

  inv.locations.forEach((location) => {
    if (location.parentId !== null && location.parentId !== undefined && !locationIds.has(location.parentId)) errors.push(`location ${location.id} references missing parent ${location.parentId}`);
  });

  return { ok: errors.length === 0, errors };
}

function touchInventory() {
  state.inventory.meta.updatedAt = new Date().toISOString();
}

function inventoryJson() {
  return JSON.stringify(state.inventory, null, 2) + "\n";
}

async function importInventoryJsonFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    state.inventory = normalizeInventory(JSON.parse(text));
    state.githubSha = "";
    state.dbSource = `imported json: ${file.name}`;
    localStorage.removeItem(STORAGE.githubSha);
    if (!persistDatabase("json imported into database", { dirty: true })) return;
    render();
  } catch (error) {
    toast(`json import failed: ${error.message}`, "error");
  }
}

function exportInventoryJson() {
  downloadText("inventory.snapshot.json", inventoryJson(), "application/json");
  setStatus("json snapshot exported");
}

function saveSettings(form) {
  const fd = new FormData(form);
  state.githubConfig = {
    owner: textValue(fd.get("owner")),
    repo: textValue(fd.get("repo")),
    branch: textValue(fd.get("branch")) || "main",
    path: textValue(fd.get("path")) || BUNDLED_DB_PATH
  };
  localStorage.setItem(STORAGE.githubConfig, JSON.stringify(state.githubConfig));
  const token = textValue(fd.get("token"));
  if (token) sessionStorage.setItem(STORAGE.token, token);
  setStatus("settings saved");
  render();
}

function captureSettingsFormIfPresent() {
  const form = $("#settingsForm");
  if (!form) return;
  const fd = new FormData(form);
  state.githubConfig = {
    owner: textValue(fd.get("owner")),
    repo: textValue(fd.get("repo")),
    branch: textValue(fd.get("branch")) || "main",
    path: textValue(fd.get("path")) || BUNDLED_DB_PATH
  };
  localStorage.setItem(STORAGE.githubConfig, JSON.stringify(state.githubConfig));
  const token = textValue(fd.get("token"));
  if (token) sessionStorage.setItem(STORAGE.token, token);
}

function requireGitHubConfig() {
  const token = sessionStorage.getItem(STORAGE.token);
  const cfg = state.githubConfig;
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.path) throw new Error("fill owner, repo, branch and path in Settings first");
  if (!token) throw new Error("enter GitHub token in Settings first");
  return { ...cfg, token };
}

async function loadFromGitHub() {
  try {
    captureSettingsFormIfPresent();
    const cfg = requireGitHubConfig();
    setStatus("loading database from github...");
    const { bytes, sha } = await githubLoadBytes(cfg);
    loadDatabaseBytes(bytes, {
      source: `github: ${cfg.owner}/${cfg.repo}/${cfg.path}`,
      fileName: cfg.path.split("/").pop() || "inventory.db",
      sha,
      dirty: false,
      cache: true
    });
    state.githubSha = sha;
    localStorage.setItem(STORAGE.githubSha, sha);
    localStorage.setItem(STORAGE.dbDirty, "0");
    render();
  } catch (error) {
    setStatus("github load failed");
    toast(error.message, "error");
  }
}

async function commitToGitHub() {
  try {
    captureSettingsFormIfPresent();
    const cfg = requireGitHubConfig();
    const validation = validateInventory(state.inventory);
    if (!validation.ok) throw new Error(`inventory is invalid: ${validation.errors[0]}`);
    setStatus("committing database to github...");
    touchInventory();
    const bytes = persistDatabase("database prepared", { dirty: true });
    if (!bytes) return;
    let sha = state.githubSha;
    if (!sha) sha = await githubTryGetSha(cfg);
    const result = await githubSaveBytes({
      ...cfg,
      sha,
      bytes,
      message: `inventory: update database ${new Date().toISOString().slice(0, 19).replace("T", " ")}`
    });
    state.githubSha = result.content?.sha || state.githubSha;
    state.dbDirty = false;
    localStorage.setItem(STORAGE.githubSha, state.githubSha);
    cacheDatabaseBytes(bytes, state.dbSource, false);
    setStatus("database committed to github");
    render();
  } catch (error) {
    setStatus("github commit failed");
    toast(error.message, "error");
  }
}

async function githubLoadBytes({ owner, repo, branch, path, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const file = await githubRequest(url, token);
  if (!file.content) throw new Error("GitHub response did not include file content; keep inventory.db reasonably small or use a raw-file workflow");
  return { bytes: base64ToBytes(file.content), sha: file.sha || "" };
}

async function githubTryGetSha({ owner, repo, branch, path, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  try {
    const file = await githubRequest(url, token);
    return file.sha || "";
  } catch (error) {
    if (String(error.message).startsWith("404")) return "";
    throw error;
  }
}

async function githubSaveBytes({ owner, repo, branch, path, token, bytes, sha, message }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const body = {
    message,
    branch,
    content: bytesToBase64(bytes)
  };
  if (sha) body.sha = sha;
  return githubRequest(url, token, { method: "PUT", body: JSON.stringify(body) });
}

async function githubRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 400)}`);
  }
  return response.json();
}

function encodePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

function allThemes() {
  return [...Object.values(BUILTIN_THEMES), ...Object.values(state.customThemes)];
}

function getTheme(id) {
  return BUILTIN_THEMES[id] || state.customThemes[id] || null;
}

function applyTheme(id) {
  const theme = getTheme(id) || BUILTIN_THEMES.angelCloud;
  state.activeTheme = theme.id;
  localStorage.setItem(STORAGE.activeTheme, theme.id);
  THEME_FIELDS.forEach((key) => {
    const value = theme.variables[key];
    if (value) document.documentElement.style.setProperty(key, value);
  });
  document.body.dataset.theme = theme.id;
}

function updateCustomThemeFromInputs() {
  const current = getTheme(state.activeTheme) || BUILTIN_THEMES.angelCloud;
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
  const theme = getTheme(state.activeTheme) || BUILTIN_THEMES.angelCloud;
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
  applyTheme("angelCloud");
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
