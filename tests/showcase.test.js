import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  sampleReport,
  createReport,
  showcaseKey,
  SHOWCASE_WORLDS,
  REFERENCE_ASSETS,
} from "../lib/planet.js";
import {
  serializeReport,
  restoreReport,
  safeAsset,
} from "../lib/client-report.js";
import { validateStoredReport, verifiedAsset } from "../lib/storage.js";

test("curated environments are distinct and each is complete, reproducible and portable", async () => {
  const identities = new Set();
  for (const key of Object.keys(SHOWCASE_WORLDS)) {
    const r = sampleReport(key);
    assert.equal(showcaseKey(r), key);
    assert.equal(r.sample, true);
    assert.deepEqual(sampleReport(key).cartography, r.cartography);
    identities.add(r.cartography.seed);
    const restored = restoreReport(
      JSON.parse(JSON.stringify(serializeReport(r))),
    );
    assert.equal(restored.sample, true);
    assert.equal(showcaseKey(restored), key);
    assert.deepEqual(restored.params, r.params);
    assert.deepEqual(restored.images, r.images);
    assert.deepEqual(validateStoredReport(serializeReport(r)).images, r.images);
    for (const asset of Object.values(r.images)) {
      assert.deepEqual(safeAsset(asset), asset);
      assert.deepEqual(verifiedAsset(asset), asset);
      assert.ok(
        REFERENCE_ASSETS[asset.url].alt.startsWith(r.name.split(" ·")[0]),
      );
      const bytes = await readFile(new URL(".." + asset.url, import.meta.url));
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    }
  }
  assert.equal(identities.size, 5);
  const ice = sampleReport("boreal"),
    dry = sampleReport("cinder"),
    temperate = sampleReport("viridia");
  assert.equal(ice.physics.waterState, "Ice favored");
  assert.equal(dry.params.pressureBar, 0);
  assert.equal(dry.params.biosphere, "none");
  assert.equal(temperate.physics.waterState, "Liquid water plausible");
  assert.equal(temperate.params.biosphere, "alien");
  const locked = sampleReport("tether"),
    hot = sampleReport("kiln");
  assert.equal(locked.physics.tidalLock.locked, true);
  assert.equal(locked.physics.solarDayHours, null);
  assert.equal(hot.physics.waterState, "Vapor favored");
  assert.ok(hot.params.pressureBar > 10);
});

test("reference restoration does not replace edited assumptions with curated parameters", () => {
  const reference = sampleReport("viridia");
  const edited = createReport({
    params: { ...reference.params, massEarth: 2 },
    id: reference.id,
    sample: true,
  });
  const exported = serializeReport(edited);
  const restored = restoreReport(exported);
  assert.equal(restored.sample, false);
  assert.equal(restored.params.massEarth, 2);
  assert.throws(() => sampleReport("__proto__"));
  assert.throws(() => sampleReport("missing"));
  assert.equal(safeAsset({ url: "/assets/cinder-orbital-small.webp" }), null);
});
