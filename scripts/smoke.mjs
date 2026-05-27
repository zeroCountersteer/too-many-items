import { createStaticServer } from "./static-server.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run npm install before npm run test:smoke.");
  }
}

async function launchBrowser(chromium) {
  const attempts = [
    () => chromium.launch({ headless: true }),
    () => chromium.launch({ headless: true, channel: "chrome" }),
    () => chromium.launch({ headless: true, channel: "msedge" })
  ];
  let lastError;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const port = Number(process.env.PORT || 8766);
const host = "127.0.0.1";
const server = createStaticServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});

let browser;
try {
  const { chromium } = await loadPlaywright();
  browser = await launchBrowser(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const messages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

  await page.goto(`http://${host}:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "true", { timeout: 20000 });

  const checkNoHorizontalOverflow = async (label) => {
    const offenders = await page.evaluate(() => {
      const selectors = [
        "html",
        "body",
        ".app-shell",
        ".main-window",
        ".content-card",
        ".view-stack",
        ".panel",
        ".view-toolbar",
        ".table-wrap",
        ".drawer-card",
        "form"
      ];
      const seen = new Set();
      return selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).filter((element) => {
        if (seen.has(element)) return false;
        seen.add(element);
        if (!element.clientWidth) return false;
        const overflowX = getComputedStyle(element).overflowX;
        const diff = element.scrollWidth - element.clientWidth;
        if (diff <= 2) return false;
        if (["hidden", "clip"].includes(overflowX) && diff <= 48) return false;
        return true;
      }).slice(0, 6).map((element) => ({
        tag: element.tagName.toLowerCase(),
        classes: element.className || "",
        width: Math.round(element.clientWidth),
        scroll: Math.round(element.scrollWidth)
      }));
    });
    if (offenders.length) throw new Error(`Horizontal overflow at ${label}: ${JSON.stringify(offenders)}`);
  };

  const matcherProbe = await page.evaluate(() => {
    const rows = [
      { referencesText: "R1 R2", value: "5.1k", footprint: "Resistor_SMD:R_0603_1608Metric_Pad0.98x0.95mm_HandSolder" },
      { referencesText: "R1 R2", value: "5K1", footprint: "Resistor_SMD:R_1608Metric" },
      { referencesText: "R9", value: "4k7", footprint: "R_0603_1608Metric" },
      { referencesText: "R3 R4", value: "22R", footprint: "Resistor_SMD:R_0603_1608Metric_Pad0.98x0.95mm_HandSolder" },
      { referencesText: "R5 R6", value: "100k", footprint: "Resistor_SMD:R_0603_1608Metric_Pad0.98x0.95mm_HandSolder" },
      { referencesText: "R7 R8", value: "10k", footprint: "Resistor_SMD:R_0603_1608Metric_Pad0.98x0.95mm_HandSolder" },
      { referencesText: "C1 C2", value: "100n", footprint: "Capacitor_SMD:C_1608Metric" },
      { referencesText: "C1 C2", value: "104", footprint: "Capacitor_SMD:C_0603_1608Metric" },
      { referencesText: "C1 C2", value: "10uF 10V", footprint: "Capacitor_SMD:C_0603_1608Metric_Pad1.08x0.95mm_HandSolder" },
      { referencesText: "C3 C4", value: "0.1uF 50V", footprint: "Capacitor_SMD:C_0603_1608Metric_Pad1.08x0.95mm_HandSolder" }
    ];
    return rows.map((row) => {
      const candidate = window.getBomMatchCandidates(row, { limit: 1 })[0];
      return { value: row.value, name: candidate?.partName || "", confidence: candidate?.confidence || "", score: candidate?.score || 0 };
    });
  });
  for (const expected of ["5.1k", "4.7k", "22R", "100k", "10k", "10uF", "100nF"]) {
    if (!matcherProbe.some((item) => item.name.includes(expected) && item.confidence === "exact")) {
      throw new Error(`BOM matcher did not resolve ${expected}; got ${JSON.stringify(matcherProbe)}`);
    }
  }
  const badMatch = await page.evaluate(() => window.findBestPartForBomRow({ referencesText: "C", value: "C", footprint: "" })?.name || "");
  if (badMatch) throw new Error(`BOM matcher should not resolve a one-letter placeholder value, got ${badMatch}.`);
  const dnpProbe = await page.evaluate(() => window.parseKiCadSchematic('(kicad_sch (symbol (property "Reference" "R1") (property "Value" "10k") (property "Footprint" "Resistor_SMD:R_0603_1608Metric") (dnp no)))')[0]?.dnp);
  if (dnpProbe !== false) throw new Error("KiCad DNP parser treated explicit dnp=no as DNP.");

  const navViews = await page.$$eval("[data-view]", (buttons) => buttons.map((button) => button.dataset.view));
  const expectedNavViews = ["parts", "projects", "locations", "database", "settings"];
  if (JSON.stringify(navViews) !== JSON.stringify(expectedNavViews)) {
    throw new Error(`Left rail should expose exactly five core views; got ${JSON.stringify(navViews)}`);
  }

  for (const view of expectedNavViews) {
    await page.click(`[data-view="${view}"]`);
    await page.waitForFunction((name) => document.querySelector(`[data-view="${name}"]`)?.classList.contains("active"), view);
    const title = await page.textContent("#windowTitle");
    if (!title || !title.trim()) throw new Error(`No window title after opening ${view}`);
    await checkNoHorizontalOverflow(`core view ${view}`);
  }

  await page.click('[data-view="locations"]');
  await page.click('[data-action="open-add-location"]');
  await page.fill('#locationForm [name="name"]', "Smoke drawer");
  await page.click('#locationForm [data-action="save-location"]');
  await page.waitForSelector("#locationForm", { state: "detached", timeout: 10000 });
  if (!await page.locator("text=Smoke drawer").count()) throw new Error("Location create flow did not render the new location.");

  await page.click('[data-view="parts"]');
  await page.click('[data-action="open-add-part"]');
  await page.fill('#partForm [name="name"]', "Smoke 10k resistor");
  await page.fill('#partForm [name="package"]', "0603");
  await page.fill('#partForm [name="footprint"]', "R_0603_1608Metric");
  await page.fill('#partForm [name="stock.quantity"]', "5");
  await page.click('#partForm [data-action="save-part"]');
  await page.waitForSelector("#partForm", { state: "detached", timeout: 10000 });
  await page.fill("[data-search]", "Smoke 10k resistor");
  await page.waitForTimeout(250);
  if (!await page.locator("text=Smoke 10k resistor").count()) throw new Error("Part create flow did not render the new part.");

  await page.check('[data-part-select]');
  await page.fill("#bulkUnitPrice", "0.015");
  await page.fill("#bulkCurrency", "USD");
  await page.click('[data-action="bulk-set-price"]');
  await page.waitForTimeout(250);
  await page.selectOption("#bulkToLocation", { label: "Smoke drawer" });
  await page.click('[data-action="preview-bulk-move"]');
  if (!await page.locator("#bulkOperationPreview", { hasText: "Smoke drawer" }).count()) throw new Error("Bulk move preview did not show destination.");
  await page.fill('[data-bulk-move-row]', "3");
  await page.click('[data-action="apply-bulk-move"]');
  await page.waitForTimeout(250);
  const movedLocationText = await page.textContent(".compact-parts-table");
  if (!movedLocationText?.includes("Smoke drawer")) throw new Error("Bulk move did not update the part location.");
  await page.fill("#bulkTakeQty", "1");
  await page.click('[data-action="bulk-take"]');
  await page.waitForTimeout(250);
  const postTakeText = await page.textContent(".compact-parts-table");
  if (!postTakeText?.includes("4")) throw new Error("Bulk take did not decrement visible stock.");

  await page.click('[data-action="open-edit-part"]');
  await page.waitForSelector("#partForm", { timeout: 10000 });
  const priceValue = await page.inputValue('#partForm [name="stock.unitPrice"]');
  if (Number(priceValue) !== 0.015) throw new Error("Part drawer did not expose stock lot price editing.");
  await page.locator('#partForm [data-action="close-modal"]').first().click();
  await page.waitForSelector("#partForm", { state: "detached", timeout: 10000 });

  await page.click('[data-view="parts"]');
  await page.click('[data-action="open-inventory-imports"]');
  await page.waitForSelector("#inventoryImportTools[open]", { timeout: 10000 });
  await checkNoHorizontalOverflow("inventory import tools");
  await page.fill('#kicadBomForm [name="projectName"]', "Smoke Board");
  await page.fill('#kicadBomForm [name="revision"]', "rev smoke");
  await page.fill('#kicadBomForm [name="bomCsv"]', readFileSync(path.join(root, "scripts", "fixtures", "existing-project-bom.csv"), "utf8"));
  await page.click('#kicadBomForm [data-action="preview-bom-import"]');
  await page.selectOption('[data-bom-map="references"]', { label: "RefList" });
  await page.selectOption('[data-bom-map="value"]', { label: "Thing" });
  await page.selectOption('[data-bom-map="footprint"]', { label: "LandPattern" });
  if (!await page.locator("#bomPreview", { hasText: "R1 R2" }).count()) throw new Error("Generic BOM preview did not render parsed rows.");
  await page.click('#kicadBomForm [data-action="import-kicad-bom"]');
  await page.waitForFunction(() => document.querySelector('[data-view="projects"]')?.classList.contains("active"), { timeout: 10000 });
  if (!await page.locator("text=Smoke Board").count()) throw new Error("BOM import did not route to Projects.");
  await page.locator(".match-review-panel", { hasText: "Match Review" }).waitFor({ timeout: 10000 });
  const reviewBeforeAccept = await page.textContent(".match-review-panel");
  if (!reviewBeforeAccept?.includes("unmatched")) throw new Error("Review-first BOM import should not persist matches before approval.");
  await page.click('[data-action="accept-all-exact"]');
  await page.waitForTimeout(250);
  const reviewAfterAccept = await page.textContent(".match-review-panel");
  if (!reviewAfterAccept?.includes("10k")) throw new Error("Accept all exact did not apply reviewed BOM matches.");
  await page.click('[data-action="preview-project-repair"]');
  await page.waitForTimeout(250);
  if (!await page.locator(".repair-preview", { hasText: "DNP flag" }).count()) throw new Error("Repair preview did not detect stale DNP candidate.");
  await page.click('[data-action="apply-project-repair"]');
  await page.waitForTimeout(250);
  await page.click('[data-action="accept-all-exact"]');
  await page.waitForTimeout(250);
  const repairProbe = await page.evaluate(() => ({
    hasBackup: !!localStorage.getItem("tmi.v3.repair.backup"),
    analysis: window.analyzeProjectRepair(window.activeProject().id)
  }));
  if (!repairProbe.hasBackup) throw new Error("Project repair did not create a local backup.");
  if (repairProbe.analysis.health.dnpRows !== 0) throw new Error("Project repair did not clear the stale DNP row.");
  const projectText = await page.textContent(".project-detail");
  if (!projectText?.includes("BOM total")) throw new Error("Project cost summary did not render.");
  if (!projectText?.includes("USD")) throw new Error("Project cost summary did not use the default currency.");

  await page.click('[data-action="project-tab"][data-tab="source"]');
  await page.selectOption('#kicadSourceForm [name="projectMode"]', "create");
  await page.fill('#kicadSourceForm [name="projectName"]', "KiCad Smoke Source");
  await page.setInputFiles('#kicadSourceForm [name="kicadFolder"]', path.join(root, "scripts", "fixtures", "kicad-smoke"));
  await page.click('[data-action="preview-kicad-source"]');
  await page.locator("#kicadSourcePreview", { hasText: "R1" }).waitFor({ timeout: 10000 });
  await page.click('[data-action="import-kicad-source"]');
  await page.locator(".match-review-panel", { hasText: "Match Review" }).waitFor({ timeout: 10000 });
  const sourceReviewText = await page.textContent(".match-review-panel");
  if (!sourceReviewText?.includes("unmatched")) throw new Error("KiCad source import should route to match review before build guide.");
  await page.click('[data-action="accept-all-exact"]');
  await page.waitForTimeout(250);
  await page.click('[data-action="project-tab"][data-tab="bom"]');
  await page.locator(".bom-editor-panel", { hasText: "BOM editor" }).waitFor({ timeout: 10000 });
  await page.locator('.bom-table [data-action="match-bom-row"]').first().click();
  await page.locator("#bomMatcherForm", { hasText: "manual match" }).waitFor({ timeout: 10000 });
  await page.fill("[data-bom-matcher-search]", "100n");
  await page.waitForTimeout(250);
  if (!await page.locator("#bomMatcherResults", { hasText: "100n" }).count()) throw new Error("Manual BOM matcher did not search inventory candidates.");
  await page.locator('#bomMatcherResults [data-action="apply-bom-manual-match"]').first().click();
  await page.waitForSelector("#bomMatcherForm", { state: "detached", timeout: 10000 });
  await page.click('[data-action="project-tab"][data-tab="guide"]');
  await page.waitForFunction(() => document.querySelector(".build-guide-panel"), { timeout: 10000 });
  const guideText = await page.textContent(".build-guide-panel");
  if (!guideText?.includes("R1") || !guideText?.includes("iBOM build guide")) throw new Error("KiCad source import did not route to the build guide.");
  const pcbRenderProbe = await page.evaluate(() => ({
    footprints: document.querySelectorAll(".placement-footprint .footprint-body").length,
    boardEdges: document.querySelectorAll(".board-outline, .board-edge-line").length
  }));
  if (pcbRenderProbe.footprints < 2 || pcbRenderProbe.boardEdges < 1) throw new Error(`PCB render did not draw board and footprint bodies: ${JSON.stringify(pcbRenderProbe)}`);
  if (!await page.locator('.build-placement-table [data-action="mark-placement-done"]').first().isDisabled()) throw new Error("Build guide actions should be disabled until a build session exists.");
  {
    const answers = ["Smoke build", "1"];
    const handler = async (dialog) => dialog.accept(answers.shift() || "");
    page.on("dialog", handler);
    await page.click('[data-action="create-build-session"]');
    await page.waitForTimeout(250);
    page.off("dialog", handler);
  }
  await page.waitForTimeout(500);
  if (!await page.locator(".build-guide-panel", { hasText: "Smoke build" }).count()) throw new Error("Build session was not created.");
  const buildGuideLayout = await page.evaluate(() => ({
    firstRowHeight: Math.round(document.querySelector(".build-guide-table tbody tr")?.getBoundingClientRect().height || 0),
    boardHeight: Math.round(document.querySelector(".board-panel")?.getBoundingClientRect().height || 0)
  }));
  if (buildGuideLayout.firstRowHeight > 76) throw new Error(`Build guide rows are too tall: ${buildGuideLayout.firstRowHeight}px`);
  if (buildGuideLayout.boardHeight > 430) throw new Error(`Build guide board panel is too tall: ${buildGuideLayout.boardHeight}px`);
  await page.locator('.build-placement-table [data-action="mark-placement-done"]').first().click();
  await page.waitForTimeout(250);
  if (!await page.locator(".build-guide-panel", { hasText: "done" }).count()) throw new Error("Build guide did not track done progress.");
  const beforeGuideTake = await page.textContent(".build-guide-panel");
  {
    const handler = async (dialog) => dialog.accept("1");
    page.on("dialog", handler);
    await page.locator('.build-placement-table [data-action="take-placement"]').first().click();
    await page.waitForTimeout(250);
    page.off("dialog", handler);
  }
  await page.waitForTimeout(250);
  const afterGuideTake = await page.textContent(".build-guide-panel");
  if (beforeGuideTake === afterGuideTake || !afterGuideTake?.includes("took")) throw new Error("Build guide take did not record taken quantity.");

  await page.click('[data-view="parts"]');
  await page.click('[data-action="set-view"][data-target-view="editor"]');
  await page.waitForFunction(() => document.querySelector("#windowTitle")?.textContent?.includes("Advanced Editor"), { timeout: 10000 });
  await page.click('[data-action="editor-table"][data-table="stock"]');
  await page.locator('[data-editor-select]').first().check();
  await page.fill("#editorBatchPrice", "0.025");
  await page.fill("#editorBatchCurrency", "USD");
  await page.click('[data-action="editor-batch-price"]');
  await page.click('[data-action="editor-validate"]');
  if (!await page.locator("#editorValidation", { hasText: "Validation passed" }).count()) throw new Error("Advanced editor validation did not pass after batch edit.");
  await page.click('[data-action="editor-apply"]');
  await page.waitForTimeout(250);
  if (!await page.locator("text=advanced editor changes applied").count()) throw new Error("Advanced editor did not apply changes.");

  await page.click('[data-view="database"]');
  await page.waitForFunction(() => document.querySelector('[data-view="database"]')?.classList.contains("active"), { timeout: 10000 });
  const healthText = await page.textContent(".ok-card, .warn-card");
  if (!healthText) throw new Error("Database health panel did not render.");

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 820, height: 900 },
    { width: 390, height: 760 }
  ]) {
    await page.setViewportSize(viewport);
    for (const view of expectedNavViews) {
      await page.click(`[data-view="${view}"]`);
      await page.waitForFunction((name) => document.querySelector(`[data-view="${name}"]`)?.classList.contains("active"), view);
      await page.waitForTimeout(120);
      const layout = await page.evaluate(() => {
        const scrolling = document.scrollingElement;
        const panel = document.querySelector("#viewPanel");
        const shell = document.querySelector(".app-shell");
        const panelBox = panel?.getBoundingClientRect();
        const shellBox = shell?.getBoundingClientRect();
        return {
          pageScrollsY: scrolling.scrollHeight > scrolling.clientHeight + 1,
          pageScrollsX: scrolling.scrollWidth > scrolling.clientWidth + 1,
          panelVisible: !!panelBox?.height && panelBox.height > 80,
          shellFits: !!shellBox && shellBox.width <= window.innerWidth + 1 && shellBox.height <= window.innerHeight + 1
        };
      });
      if (layout.pageScrollsY) throw new Error(`Page scrolls vertically at ${viewport.width}x${viewport.height} on ${view}; only app panels should scroll.`);
      if (layout.pageScrollsX) throw new Error(`Page scrolls horizontally at ${viewport.width}x${viewport.height} on ${view}; tables should scroll inside panels.`);
      if (!layout.panelVisible) throw new Error(`View panel is not visible at ${viewport.width}x${viewport.height} on ${view}.`);
      if (!layout.shellFits) throw new Error(`App shell escapes the viewport at ${viewport.width}x${viewport.height} on ${view}.`);
      await checkNoHorizontalOverflow(`${viewport.width}x${viewport.height} ${view}`);
    }
    await page.click('[data-view="parts"]');
    await page.click('[data-action="open-inventory-imports"]');
    await page.waitForSelector("#inventoryImportTools[open]", { timeout: 10000 });
    await checkNoHorizontalOverflow(`${viewport.width}x${viewport.height} inventory imports`);
  }

  const seriousMessages = messages.filter((message) => !/favicon|Failed to load resource/.test(message));
  if (seriousMessages.length) throw new Error(`Browser console issues:\n${seriousMessages.join("\n")}`);
  console.log("Browser smoke test passed.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
