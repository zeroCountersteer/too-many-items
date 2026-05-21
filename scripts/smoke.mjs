import { createStaticServer } from "./static-server.mjs";

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

  for (const view of ["parts", "add", "locations", "projects", "database", "settings"]) {
    await page.click(`[data-view="${view}"]`);
    await page.waitForFunction((name) => document.querySelector(`[data-view="${name}"]`)?.classList.contains("active"), view);
    const title = await page.textContent("#windowTitle");
    if (!title || !title.trim()) throw new Error(`No window title after opening ${view}`);
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
  await page.fill('#partForm [name="stock.quantity"]', "5");
  await page.click('#partForm [data-action="save-part"]');
  await page.waitForSelector("#partForm", { state: "detached", timeout: 10000 });
  await page.fill("[data-search]", "Smoke 10k resistor");
  await page.waitForTimeout(250);
  if (!await page.locator("text=Smoke 10k resistor").count()) throw new Error("Part create flow did not render the new part.");
  await page.click('[data-action="open-edit-part"]');
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('#partForm [data-action="delete-part"]');
  await page.waitForSelector("#partForm", { state: "detached", timeout: 10000 });

  await page.click('[data-view="add"]');
  await page.fill('#kicadBomForm [name="projectName"]', "Smoke Board");
  await page.fill('#kicadBomForm [name="revision"]', "rev smoke");
  await page.fill('#kicadBomForm [name="bomCsv"]', [
    '"Id","Designator","Package","Quantity","Designation","Supplier and ref"',
    '"1","R1 R2","R_0603_1608Metric","2","10k",""',
    '"2","C1","C_0603_1608Metric","1","100nF",""'
  ].join("\n"));
  await page.click('#kicadBomForm [data-action="import-kicad-bom"]');
  await page.waitForFunction(() => document.querySelector('[data-view="projects"]')?.classList.contains("active"), { timeout: 10000 });
  if (!await page.locator("text=Smoke Board").count()) throw new Error("KiCad BOM import did not route to Projects.");

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
    for (const view of ["parts", "add", "locations", "projects", "database", "settings"]) {
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
    }
  }

  const seriousMessages = messages.filter((message) => !/favicon|Failed to load resource/.test(message));
  if (seriousMessages.length) throw new Error(`Browser console issues:\n${seriousMessages.join("\n")}`);
  console.log("Browser smoke test passed.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
