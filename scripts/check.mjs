import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function runNodeCheck(relativePath) {
  execFileSync(process.execPath, ["--check", path.join(root, relativePath)], { stdio: "inherit" });
}

const indexHtml = read("index.html");
const liveScripts = [...indexHtml.matchAll(/<script\s+src="(js\/[^"]+\.js)\?v=\d+"/g)].map((match) => match[1]);
const checkTargets = [...new Set([...liveScripts, "sw.js"])];

if (!liveScripts.length) fail("No live JS scripts found in index.html");
for (const staleHook of ["metricsGrid", "chromeActions", "ambient", "cloud", "grid-film"]) {
  if (indexHtml.includes(staleHook)) fail(`Stale shell artifact remains in index.html: ${staleHook}`);
}
for (const target of checkTargets) runNodeCheck(target);

for (const file of readdirSync(path.join(root, "scripts")).filter((name) => name.endsWith(".mjs"))) {
  runNodeCheck(path.join("scripts", file));
}

const schemaSql = read("schemas/inventory.sql").trim().replace(/\r\n/g, "\n");
const config = read("js/00-config.js").replace(/\r\n/g, "\n");
const embeddedMatch = config.match(/const SCHEMA_SQL = `\n([\s\S]*?)`;/);
if (!embeddedMatch) {
  fail("Could not find embedded SCHEMA_SQL in js/00-config.js");
} else if (embeddedMatch[1].trim() !== schemaSql) {
  fail("Embedded SCHEMA_SQL does not match schemas/inventory.sql");
}

JSON.parse(read("schemas/inventory.schema.json"));
JSON.parse(read("themes/manifest.json"));

for (const removed of ["app.js", path.join("js", "app.js")]) {
  if (existsSync(path.join(root, removed))) fail(`Unused legacy script still exists: ${removed}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Static checks passed.");
