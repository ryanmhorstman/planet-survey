// Development-only render using the browser already used by the regression suite.
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
let executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) {
  try {
    await access("/usr/bin/chromium");
    executablePath = "/usr/bin/chromium";
  } catch {
    /* Use the Playwright-managed Chromium if installed. */
  }
}
const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox"],
});
const files = new Map([
  ["/scripts/social-card.html", "text/html"],
  ["/assets/sample-orbital.webp", "image/webp"],
  ["/assets/fonts/eb-garamond-latin-400-normal.woff2", "font/woff2"],
  ["/assets/fonts/space-mono-latin-400-normal.woff2", "font/woff2"],
]);
const server = createServer(async (request, response) => {
  const type = files.get(request.url);
  if (!type) {
    response.writeHead(404).end();
    return;
  }
  try {
    response
      .writeHead(200, { "Content-Type": type })
      .end(await readFile(new URL(".." + request.url, import.meta.url)));
  } catch {
    response.writeHead(500).end();
  }
});
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}/scripts/social-card.html`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      document.querySelector("img").complete &&
      document.querySelector("img").naturalWidth > 0,
  );
  await page.screenshot({
    path: fileURLToPath(new URL("../og-image.png", import.meta.url)),
  });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
