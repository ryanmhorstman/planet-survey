import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, siteOrigin } from "../scripts/build.js";
test("production build emits absolute social metadata and only public files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "psu7-build-"));
  try {
    await build(dir, { VERCEL: "1", SITE_URL: "https://survey.example" });
    const html = await readFile(join(dir, "index.html"), "utf8");
    assert.match(
      html,
      /property="og:image" content="https:\/\/survey.example\/og-image.png"/,
    );
    assert.match(html, /rel="canonical" href="https:\/\/survey.example\/"/);
    assert.deepEqual((await readdir(join(dir, "lib"))).sort(), [
      "agent-tools.js",
      "cartography-record.js",
      "client-report.js",
      "consistency.js",
      "expedition-record.js",
      "field-researcher.js",
      "geography-worker.js",
      "geography.js",
      "globe.js",
      "orbital-record.js",
      "planet.js",
      "region.js",
      "seed.js",
      "terrain-detail.js",
      "terrain.js",
      "visitor.js",
      "water-phase.js",
    ]);
    assert.ok(
      !(await readdir(dir)).some((file) =>
        ["api", ".env.local", "node_modules"].includes(file),
      ),
    );
    assert.equal(
      siteOrigin({
        VERCEL_PROJECT_PRODUCTION_URL: "production.example",
        VERCEL_URL: "preview.example",
      }),
      "https://production.example",
    );
    assert.throws(() =>
      siteOrigin({ SITE_URL: "https://user:password@example.org" }),
    );
    assert.throws(() => siteOrigin({ SITE_URL: "javascript:alert(1)" }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
