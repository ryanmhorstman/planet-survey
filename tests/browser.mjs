import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { createReport, DEFAULTS, paramsFromCatalog } from "../lib/planet.js";

const port = process.env.TEST_PORT || "3002",
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["scripts/dev-server.js"], {
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});
const errors = [],
  results = [];
let browser;
const image = await readFile(
  new URL("../assets/sample-orbital.webp", import.meta.url),
);
const orbital = {
  url: "https://teststore.public.blob.vercel-storage.com/psu7/images/abc1.webp",
  signature: "a".repeat(64),
};
const surface = { ...orbital, url: orbital.url.replace("abc1", "abc2") };
const catalog = {
  pl_name: "Measured b",
  hostname: "Measured",
  pl_rade: 3.7123,
  pl_bmasse: 12.8432,
  pl_orbper: 12.3,
  pl_orbsmax: 0.12,
  st_mass: 0.7,
  st_spectype: "K2",
};
const narrative = {
  description: "A speculative field interpretation for this model world.",
  surfaceFeatures: "Dark basins and exposed terrain.",
};
const id = "00000000-0000-4000-8000-000000000001";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, message) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
}
async function context(options = {}, live = false) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    ...options,
  });
  await context.route("**/api/capabilities", (route) =>
    route.fulfill({ json: { analysis: live, images: live, sharing: live } }),
  );
  await context.route("https://*.public.blob.vercel-storage.com/**", (route) =>
    route.fulfill({
      contentType: "image/webp",
      body: image,
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await context.route("**/api/exoplanets?*", (route) =>
    route.fulfill({ json: { planets: [catalog] } }),
  );
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  return context;
}
async function a11y(page, name) {
  const result = await new AxeBuilder({ page }).analyze();
  await writeFile(
    `test-results/axe-${name}.json`,
    JSON.stringify(result.violations, null, 2),
  );
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
    `${name}: accessibility violations`,
  );
  results.push(`${name}: zero axe violations`);
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Horizontal viewport overflow",
  );
}
try {
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "error").then(([error]) => {
      throw error;
    }),
    delay(10000).then(() => {
      throw new Error("Development server did not start");
    }),
  ]);
  let executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath)
    try {
      await access("/usr/bin/chromium");
      executablePath = "/usr/bin/chromium";
    } catch {
      /* Playwright-managed browser on CI. */
    }
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  await mkdir("test-results", { recursive: true });
  // Cartography is isolated and lazy; selection does not call paid providers.
  for (const fallback of [false, true]) {
    const ctx = await context(
        {
          viewport: {
            width: fallback ? 375 : 1440,
            height: fallback ? 812 : 1000,
          },
        },
        true,
      ),
      page = await ctx.newPage();
    await ctx.route("**/api/image", (route) =>
      route.fulfill({ json: { asset: orbital } }),
    );
    await ctx.route("**/api/analyze", (route) =>
      route.fulfill({ json: { narrative } }),
    );
    const fetched = [];
    let paid = 0;
    ctx.on("request", (req) => {
      fetched.push(req.url());
      if (/\/api\/(image|analyze)$/.test(req.url())) paid++;
    });
    if (fallback)
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type.startsWith("webgl")
            ? null
            : original.call(this, type, ...args);
        };
      });
    await page.goto(origin + "/?sample=boreal");
    await page.locator("#planetNameDisplay").waitFor();
    assert.ok(
      !fetched.some((url) =>
        /globe.js|geography-worker|three.module/.test(url),
      ),
      "Cartography loaded before activation",
    );
    await page.locator("#tabIllustration").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() =>
      document
        .querySelector(".cartography-selection")
        ?.textContent.includes("cartography-1"),
    );
    await page.waitForFunction(() =>
      /3D model globe|3D graphics unavailable/.test(
        document.querySelector(".cartography-status")?.textContent,
      ),
    );
    if (!fallback)
      assert.match(
        await page.locator(".cartography-status").textContent(),
        /3D model globe/,
        "WebGL prototype did not initialize",
      );
    await page.locator('[name="latitude"]').fill("23");
    await page.locator('[name="longitude"]').fill("45");
    await page.getByRole("button", { name: "Inspect location" }).click();
    const facts = await page.locator(".cartography-facts").textContent();
    await a11y(page, `cartography-${fallback ? "fallback" : "globe"}`);
    await noOverflow(page);
    await page.screenshot({
      path: `test-results/cartography-${fallback ? "fallback" : "globe"}.png`,
      fullPage: true,
    });
    if (!fallback) {
      for (const viewport of [
        { width: 375, height: 812 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        await noOverflow(page);
        await a11y(page, `cartography-${viewport.width}`);
        await page.screenshot({
          path: `test-results/cartography-${viewport.width}.png`,
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: "Rotate globe west" }).click();
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      assert.equal(
        await page.locator(".cartography-facts").textContent(),
        facts,
      );
      await page.getByRole("button", { name: "Center on site" }).click();
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const globeCanvas = page.locator(".cartography-stage canvas").last();
      const bounds = await globeCanvas.boundingBox();
      await globeCanvas.click({
        position: { x: bounds.width / 2, y: bounds.height / 2 },
      });
      assert.ok(
        Math.abs(
          Number(await page.locator('[name="latitude"]').inputValue()) - 23,
        ) < 1,
      );
      assert.ok(
        Math.abs(
          Number(await page.locator('[name="longitude"]').inputValue()) - 45,
        ) < 1,
      );
      // Restore the exact saved coordinate after testing raycast picking.
      await page.locator('[name="latitude"]').fill("23");
      await page.locator('[name="longitude"]').fill("45");
      await page.getByRole("button", { name: "Inspect location" }).click();
      await page.getByRole("button", { name: "2D atlas" }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "2D atlas" })
          .getAttribute("aria-pressed"),
        "true",
      );
    }
    await page.locator("#tabIllustration").click();
    assert.ok(await page.locator("#imageOpen").isVisible());
    await page.locator("#tabCartography").click();
    await page.waitForFunction(() =>
      document
        .querySelector(".cartography-selection")
        ?.textContent.includes("23.00°"),
    );
    assert.equal(await page.locator(".cartography-facts").textContent(), facts);
    assert.equal(paid, 0);
    await page.reload();
    await page.locator("#tabCartography").click();
    await page.waitForFunction(() =>
      document
        .querySelector(".cartography-selection")
        ?.textContent.includes("23.00°"),
    );
    assert.equal(await page.locator(".cartography-facts").textContent(), facts);
    const launchCapabilities = page.waitForResponse((response) =>
      response.url().endsWith("/api/capabilities"),
    );
    await page.locator("#generateBtn").click();
    await launchCapabilities;
    await page.waitForFunction(() =>
      document
        .querySelector("#planetNameDisplay")
        .textContent.startsWith("PSU-"),
    );
    await page.waitForFunction(() =>
      document
        .querySelector(".cartography-selection")
        ?.textContent.includes("cartography-1"),
    );
    await page.waitForFunction(
      () => !document.querySelector("#generateBtn").disabled,
    );
    assert.equal(
      paid,
      0,
      "Starting a survey from Cartography called a paid provider",
    );
    await ctx.close();
    results.push(
      `Cartography ${fallback ? "2D fallback" : "3D globe"}: lazy loading, keyboard tabs, deterministic selection, refresh, isolation and no paid requests passed`,
    );
  }
  for (const [width, height] of [
    [320, 740],
    [375, 812],
    [390, 844],
    [844, 390],
    [568, 320],
    [768, 1024],
    [1440, 1000],
    [1920, 1080],
  ]) {
    const ctx = await context({ viewport: { width, height } }),
      page = await ctx.newPage();
    await page.goto(origin);
    await page.locator("#generateBtn").waitFor();
    await noOverflow(page);
    assert.ok(
      (await page.locator("#generateBtn").boundingBox()).y < height - 60,
      "First action is outside first screen",
    );
    if ([375, 1440].includes(width)) {
      await a11y(page, `welcome-${width}`);
      await page.screenshot({
        path: `test-results/welcome-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.locator(".reference-btn").click();
    await page.locator("#planetImage").waitFor();
    await waitFor(
      () =>
        page
          .locator("#planetImage")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
      "Reference image did not load",
    );
    await noOverflow(page);
    assert.equal(
      await page.locator("#planetNameDisplay").textContent(),
      "Boreal · Reference 07",
    );
    if ([320, 375, 568, 844, 1440].includes(width)) {
      await a11y(page, `report-${width}`);
      await page.screenshot({
        path: `test-results/report-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.locator("#imageOpen").click();
      await a11y(page, `lightbox-${width}`);
      const bounds = await page.locator("#lightbox").boundingBox();
      assert.ok(
        bounds.y >= 0 && bounds.y + bounds.height <= height + 1,
        "Lightbox exceeds viewport",
      );
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Tab");
        assert.ok(
          await page.evaluate(
            () => document.activeElement.closest("dialog")?.id === "lightbox",
          ),
          "Focus escaped lightbox",
        );
      }
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Shift+Tab");
        assert.ok(
          await page.evaluate(
            () => document.activeElement.closest("dialog")?.id === "lightbox",
          ),
          "Reverse focus escaped lightbox",
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "imageOpen",
      );
      await page.locator("#shareBtn").click();
      await a11y(page, `share-${width}`);
      assert.match(
        await page.locator("#shareURL").inputValue(),
        /\?sample=boreal$/,
      );
      await page.keyboard.press("Escape");
      await page.locator("#browseBtn").click();
      await page.locator(".browse-item").waitFor();
      await a11y(page, `catalogue-${width}`);
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press("Tab");
        assert.ok(
          await page.evaluate(
            () =>
              document.activeElement.closest("dialog")?.id === "browseModal",
          ),
          "Focus escaped the modal",
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "browseBtn",
      );
    }
    await page.reload();
    await page.locator("#planetNameDisplay").waitFor();
    assert.equal(
      await page.locator("#planetNameDisplay").textContent(),
      "Boreal · Reference 07",
    );
    results.push(
      `${width}px: initial action, report, overflow and refresh passed`,
    );
    await ctx.close();
  }
  // Artistic mode reaches both providers and persists independently of numerical estimates.
  const modes = await context(
      { viewport: { width: 1440, height: 1000 } },
      true,
    ),
    mp = await modes.newPage();
  const sentModes = [];
  await modes.route("**/api/analyze", (route) => {
    sentModes.push(route.request().postDataJSON().params.biosphere);
    return route.fulfill({ json: { narrative } });
  });
  await modes.route("**/api/image", (route) => {
    sentModes.push(route.request().postDataJSON().params.biosphere);
    return route.fulfill({ json: { asset: orbital } });
  });
  await mp.goto(origin);
  await mp.locator("#imaginedBiosphere").selectOption("alien");
  await mp.locator("#starType").selectOption("M-type (red dwarf)");
  assert.match(
    await mp.locator("#biosphereHelp").textContent(),
    /membrane fans/,
  );
  await mp.locator("#generateBtn").click();
  await mp.locator("#planetImage").waitFor();
  await waitFor(
    () => sentModes.length === 2,
    "Mode did not reach both providers",
  );
  assert.deepEqual(sentModes, ["alien", "alien"]);
  await mp.reload();
  await mp.locator("#planetNameDisplay").waitFor();
  assert.equal(await mp.locator("#imaginedBiosphere").inputValue(), "alien");
  assert.match(await mp.locator("#sourceFacts").textContent(), /Alien mode/);
  await mp.locator("#randomizeBtn").click();
  assert.equal(await mp.locator("#imaginedBiosphere").inputValue(), "alien");
  await mp.locator("#imaginedBiosphere").selectOption("none");
  assert.match(
    await mp.locator("#biosphereHelp").textContent(),
    /intentionally omitted/,
  );
  results.push(
    "Biosphere control reaches both APIs, persists on refresh and survives randomization",
  );
  await modes.close();
  // The reduced mode is explicit, and a failed startup capability request is recoverable.
  const offline = await context(),
    op = await offline.newPage();
  let offlineCalls = 0;
  offline.on("request", (request) => {
    if (/\/api\/(analyze|image)$/.test(request.url())) offlineCalls++;
  });
  await op.goto(origin);
  await op.locator("#generateBtn").click();
  await waitFor(
    async () =>
      (await op.locator("#reportServiceNotice").textContent()).includes(
        "Model reports only",
      ),
    "Missing model-only availability message",
  );
  assert.equal(offlineCalls, 0);
  await offline.close();
  const recovered = await context({}, true),
    cp = await recovered.newPage();
  let capabilityCalls = 0,
    recoveredAnalysis = 0,
    recoveredImages = 0;
  await recovered.route("**/api/capabilities", (route) => {
    capabilityCalls++;
    return route.fulfill(
      capabilityCalls === 1
        ? { status: 503, json: { error: "Temporarily unavailable" } }
        : { json: { analysis: true, images: true, sharing: true } },
    );
  });
  await recovered.route("**/api/analyze", (route) => {
    recoveredAnalysis++;
    return route.fulfill({ json: { narrative } });
  });
  await recovered.route("**/api/image", (route) => {
    recoveredImages++;
    return route.fulfill({ json: { asset: orbital } });
  });
  await cp.goto(origin);
  await waitFor(
    async () =>
      (await cp.locator("#serviceNotice").textContent()).includes(
        "could not be reached",
      ),
    "Startup failure did not appear",
  );
  await cp.locator("#generateBtn").click();
  await waitFor(
    () => recoveredAnalysis === 1 && recoveredImages === 1,
    "Initiate Survey did not recover both AI requests",
  );
  await cp.locator("#planetImage").waitFor();
  assert.equal(capabilityCalls, 2);
  results.push(
    "Model-only mode is explicit; Initiate Survey recovers from a failed capability request",
  );
  await recovered.close();
  // Server failures and retries preserve the model; a surface can finish before an orbit.
  const ctx = await context({ viewport: { width: 1440, height: 1000 } }, true),
    page = await ctx.newPage();
  let analysisCalls = 0,
    orbitalCalls = 0,
    surfaceCalls = 0,
    saved;
  await ctx.route("**/api/analyze", (route) => {
    analysisCalls++;
    return route.fulfill(
      analysisCalls === 1
        ? {
            status: 502,
            json: { error: "Interpretation interrupted. Please retry." },
          }
        : { json: { narrative } },
    );
  });
  await ctx.route("**/api/image", (route) => {
    const view = route.request().postDataJSON().view;
    if (view === "surface") {
      surfaceCalls++;
      return route.fulfill({ json: { asset: surface } });
    }
    orbitalCalls++;
    return route.fulfill(
      orbitalCalls === 1
        ? { status: 503, json: { error: "Image service busy. Please retry." } }
        : { json: { asset: orbital } },
    );
  });
  await ctx.route("**/api/reports", async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id } });
  });
  await page.goto(origin);
  await page.locator("#generateBtn").click();
  await page.locator("#analysisRetry").waitFor();
  await page.locator("#imageRetry").waitFor();
  assert.match(await page.locator("#habScore").textContent(), /100/);
  await page.locator("#btnSurface").click();
  await page.locator("#planetImage").waitFor();
  assert.equal(
    await page.locator("#planetImage").getAttribute("src"),
    surface.url,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#downloadBtn").click();
  assert.match((await downloadPromise).suggestedFilename(), /-surface.webp$/);
  await page.locator("#analysisRetry").click();
  await waitFor(
    async () =>
      (await page.locator("#analysisBody").textContent()) ===
      narrative.description,
    "Narrative retry failed",
  );
  await page.locator("#btnOrbital").click();
  await page.locator("#imageRetry").click();
  await page.locator("#planetImage").waitFor();
  await page.locator("#btnSurface").click();
  assert.equal(surfaceCalls, 1);
  assert.equal(orbitalCalls, 2);
  await page.locator("#shareBtn").click();
  await page.locator("#publishShare").click();
  await page.locator("#shareURL").waitFor();
  const shareURL = await page.locator("#shareURL").inputValue();
  assert.equal(shareURL, `${origin}/?report=${id}`);
  assert.ok(saved.images.orbital && saved.images.surface);
  await page.keyboard.press("Escape");
  const fresh = await context({}, true);
  await fresh.route("**/api/reports?*", (route) =>
    route.fulfill({ json: { report: { ...saved, id } } }),
  );
  const shared = await fresh.newPage();
  await shared.goto(shareURL);
  await shared.locator("#planetImage").waitFor();
  assert.equal(
    await shared.locator("#analysisBody").textContent(),
    narrative.description,
  );
  await shared.locator("#btnSurface").click();
  assert.equal(
    await shared.locator("#planetImage").getAttribute("src"),
    surface.url,
  );
  await fresh.close();
  await page.reload();
  await page.locator("#planetImage").waitFor();
  await page.locator("#btnSurface").click();
  assert.equal(
    await page.locator("#planetImage").getAttribute("src"),
    surface.url,
  );
  results.push(
    "API failures, independent surface, retries, active-view download, durable share and local refresh passed",
  );
  // Measured values exceed the old sliders and must remain exact in both controls and requests.
  await page.locator("#browseBtn").click();
  await page.locator(".browse-item").click();
  await waitFor(
    async () =>
      (await page.locator("#planetNameDisplay").textContent()) ===
      catalog.pl_name,
    "Catalogue selection failed",
  );
  assert.equal(
    await page.locator("#planetMass").inputValue(),
    String(catalog.pl_bmasse),
  );
  assert.equal(
    await page.locator("#planetRadius").inputValue(),
    String(catalog.pl_rade),
  );
  assert.equal(await page.locator("#planetMass").isDisabled(), true);
  assert.match(
    await page.locator("#statYear").textContent(),
    /12.3 Earth days/,
  );
  assert.equal(await page.locator("#habScore").textContent(), "Not rated");
  results.push(
    "NASA name, precise measurements, period and gas-envelope rating passed",
  );
  await ctx.close();
  // Hold one response while switching to another report: late results belong to their origin.
  const race = await context({}, true),
    rp = await race.newPage();
  let release,
    started = false;
  await race.route("**/api/analyze", async (route) => {
    started = true;
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: { narrative } });
  });
  await race.route("**/api/image", (route) =>
    route.fulfill({ json: { asset: orbital } }),
  );
  await rp.goto(origin);
  await rp.locator("#generateBtn").click();
  await waitFor(() => started, "Analysis request did not start");
  const originalName = await rp.locator("#planetNameDisplay").textContent();
  await rp.locator(".reference-btn").click();
  const referenceNote = await rp.locator("#analysisBody").textContent();
  release();
  await waitFor(
    async () =>
      (
        await rp.evaluate(() => localStorage.getItem("psu7-reports-v2"))
      ).includes(narrative.description),
    "Late response did not persist",
  );
  assert.equal(
    await rp.locator("#planetNameDisplay").textContent(),
    "Boreal · Reference 07",
  );
  assert.equal(await rp.locator("#analysisBody").textContent(), referenceNote);
  await rp.locator(".history-item").filter({ hasText: originalName }).click();
  assert.equal(
    await rp.locator("#analysisBody").textContent(),
    narrative.description,
  );
  results.push(
    "Late responses remain attached to their originating history record",
  );
  await race.close();
  // Surface request deduplication and reference modifications survive refresh.
  const views = await context({}, true),
    vp = await views.newPage();
  let releaseSurface,
    surfaceRequests = 0;
  await views.route("**/api/image", async (route) => {
    surfaceRequests++;
    await new Promise((resolve) => {
      releaseSurface = resolve;
    });
    await route.fulfill({ json: { asset: surface } });
  });
  await vp.goto(origin + "/?sample=boreal");
  await vp.locator("#planetImage").waitFor();
  await vp.locator("#btnSurface").click();
  await waitFor(() => Boolean(releaseSurface), "Surface request did not begin");
  await vp.locator("#btnSurface").click();
  await vp.locator("#btnOrbital").click();
  releaseSurface();
  await waitFor(
    async () =>
      (
        await vp.evaluate(() => localStorage.getItem("psu7-reports-v2"))
      ).includes(surface.url),
    "Surface response did not persist",
  );
  assert.equal(surfaceRequests, 1);
  assert.equal(
    await vp.locator("#btnOrbital").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await vp.locator("#planetImage").getAttribute("src"),
    "/assets/sample-orbital.webp",
  );
  assert.equal(
    new URL(vp.url()).search,
    "",
    "Changed reference retained stale sample link",
  );
  await vp.reload();
  await vp.locator("#planetImage").waitFor();
  await vp.locator("#btnSurface").click();
  assert.equal(
    await vp.locator("#planetImage").getAttribute("src"),
    surface.url,
  );
  results.push(
    "Repeated surface clicks deduplicate; late imagery respects selection; modified reference survives refresh",
  );
  await views.close();
  // A failed saved image reload must not buy another generation.
  const broken = await context({}, true),
    bp = await broken.newPage();
  let allowImage = false,
    imageRequests = 0;
  await broken.route("https://*.public.blob.vercel-storage.com/**", (route) =>
    route.fulfill({
      contentType: "image/webp",
      body: allowImage ? image : Buffer.from("broken image"),
    }),
  );
  await broken.route("**/api/analyze", (route) =>
    route.fulfill({ json: { narrative } }),
  );
  await broken.route("**/api/image", (route) => {
    imageRequests++;
    return route.fulfill({ json: { asset: orbital } });
  });
  await bp.goto(origin);
  await bp.locator("#generateBtn").click();
  await bp.locator("#imageRetry").waitFor();
  assert.equal(
    await bp.locator("#imageRetry").textContent(),
    "Reload saved image",
  );
  allowImage = true;
  await bp.locator("#imageRetry").click();
  await bp.locator("#planetImage").waitFor();
  await waitFor(
    () =>
      bp
        .locator("#planetImage")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    "Image reload failed",
  );
  assert.equal(imageRequests, 1);
  results.push(
    "Image decode failure has a working reload without another generation",
  );
  await broken.close();
  // Guard the first-screen layout against deferred-script/font shifts on a mobile connection.
  const slow = await context({ viewport: { width: 390, height: 844 } }),
    sp = await slow.newPage();
  const cdp = await slow.newCDPSession(sp);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 200000,
    uploadThroughput: 100000,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await sp.addInitScript(() => {
    window.metrics = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.metrics.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (!entry.hadRecentInput) window.metrics.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await sp.goto(origin);
  await sp.waitForFunction(
    () => document.querySelector(".reference-image img").complete,
  );
  await sp.evaluate(() => document.fonts.ready);
  await delay(1000);
  const metrics = await sp.evaluate(() => window.metrics);
  assert.ok(metrics.cls < 0.1, `Mobile initial layout shifted: ${metrics.cls}`);
  await writeFile(
    "test-results/mobile-performance.json",
    JSON.stringify(
      {
        conditions:
          "Local Chromium; 390px; 4x CPU, 150ms latency, 200KB/s; synthetic, not field metrics",
        ...metrics,
      },
      null,
      2,
    ),
  );
  results.push(
    `Slow mobile initial render: CLS ${metrics.cls.toFixed(3)}, LCP ${Math.round(metrics.lcp)}ms (synthetic)`,
  );
  await slow.close();
  assert.deepEqual(errors, [], "Uncaught browser errors");
  await writeFile(
    "test-results/browser-summary.json",
    JSON.stringify(results, null, 2),
  );
  console.log(results.join("\n"));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
