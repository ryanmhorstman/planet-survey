import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_MODEL } from "../lib/server.js";
import { inflateSync } from "node:zlib";
import { DEFAULTS, createReport, calculate } from "../lib/planet.js";
import { createGeography } from "../lib/geography.js";
import {
  orbitalReference,
  orbitalImagePrompt,
  renderOrbitalPixels,
  iceEdgeSample,
  ORBITAL_REFERENCE_WIDTH as width,
  ORBITAL_REFERENCE_HEIGHT as height,
} from "../lib/orbital-reference.js";
import { orbitalView, validateOrbitalView } from "../lib/orbital-record.js";
import {
  restoreReport,
  serializeReport,
  safeAsset,
} from "../lib/client-report.js";
import { createImageHandler } from "../api/image.js";
function rows(png) {
  const data = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      data.push(png.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  return inflateSync(Buffer.concat(data));
}
const response = () => ({
  statusCode: 200,
  setHeader() {},
  status(n) {
    this.statusCode = n;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});
const asset = {
  url: "https://teststore.public.blob.vercel-storage.com/psu7/images/abc1.webp",
  signature: "a".repeat(64),
  referenceSignature: "b".repeat(64),
  kind: "generated",
};
test("orbital renders repeat from pinned v1/v2 geography with stable framing and no markers", () => {
  for (const geographyVersion of ["cartography-1", "cartography-2"]) {
    const r = createReport({ params: DEFAULTS, geographyVersion }),
      a = orbitalReference(r.params, r.physics, r.cartography),
      b = orbitalReference(r.params, r.physics, r.cartography);
    assert.deepEqual(a, b);
    assert.deepEqual(a.view, orbitalView(r.cartography));
    const pixels = rows(a.png);
    assert.equal(pixels.length, (width * 3 + 1) * height);
    const rgb = (x, y) => [
      ...pixels.subarray(
        y * (width * 3 + 1) + 1 + x * 3,
        y * (width * 3 + 1) + 1 + x * 3 + 3,
      ),
    ];
    assert.deepEqual(rgb(0, 0), [9, 13, 16]);
    assert.deepEqual(rgb(width - 1, height - 1), [9, 13, 16]);
    assert.notDeepEqual(rgb(width / 2, height / 2), [9, 13, 16]);
    let minY = height,
      maxY = 0;
    for (let y = 0; y < height; y++)
      if (rgb(width / 2, y).join() !== "9,13,16") {
        minY = Math.min(minY, y);
        maxY = y;
      }
    assert.ok(
      minY > 50 && maxY < height - 50,
      "Reference limb is clipped or lacks black margins",
    );
    assert.equal(
      a.view.modelId,
      createGeography(r.params, r.physics, 512, r.cartography).id,
    );
  }
});
test("a locked world's guide globe has an unlit nightside", () => {
  const r = createReport({
      params: {
        ...DEFAULTS,
        starType: "M-type (red dwarf)",
        orbital: "inner habitable zone",
      },
    }),
    locked = createGeography(r.params, r.physics, 512, r.cartography),
    view = orbitalView(r.cartography);
  assert.equal(locked.physics.solarDayHours, null);
  /** @param {any} model */
  const nightLimb = (model) => {
    const pixels = renderOrbitalPixels(model, view),
      y = height / 2,
      at = (/** @type {number} */ x) =>
        pixels.subarray(
          y * (width * 3 + 1) + 1 + x * 3,
          y * (width * 3 + 1) + 4 + x * 3,
        );
    let x = width - 1;
    while (at(x).join() === "9,13,16") x--;
    return [...at(x - 4)].reduce((sum, n) => sum + n, 0);
  };
  const spinning = {
    ...locked,
    physics: { ...locked.physics, solarDayHours: 24 },
  };
  assert.ok(nightLimb(locked) < 30, "Nightside should be close to black");
  assert.ok(nightLimb(spinning) > 2 * nightLimb(locked));
});
test("the guide roughens ice edges without changing ice far from freezing", () => {
  const r = createReport({ params: DEFAULTS }),
    model = createGeography(r.params, r.physics, 512, r.cartography),
    sample = (
      /** @type {number} */ temperatureC,
      /** @type {number} */ longitude,
    ) =>
      iceEdgeSample(model, {
        latitude: 60,
        longitude,
        temperatureC,
        surface: "Ocean",
        ice: false,
      }).ice;
  const longitudes = Array.from({ length: 180 }, (_, i) => i * 2 - 180),
    edge = longitudes.map((longitude) => sample(1, longitude));
  assert.ok(edge.includes(true) && edge.includes(false), "Edge is a circle");
  assert.ok(longitudes.every((longitude) => !sample(15, longitude)));
  assert.ok(longitudes.every((longitude) => sample(-15, longitude)));
});
test("orbital conditioning retains eight environmental families and replaces competing geography recipes", () => {
  for (const changes of [
    {},
    { massEarth: 2, biosphere: "alien" },
    { atmosphere: "none (airless body)", pressureBar: 0, water: 0 },
    { atmosphere: "thick CO2 (Venus-like)", pressureBar: 90 },
    { orbital: "outer edge (very cold)" },
    { water: 100 },
    { atmosphere: "hydrogen-helium envelope", pressureBar: 10, water: 0 },
    { rotationHours: calculate(DEFAULTS).yearDays * 24 },
  ]) {
    const r = createReport({ params: { ...DEFAULTS, ...changes } }),
      prompt = orbitalImagePrompt(
        r.params,
        r.physics,
        orbitalView(r.cartography),
      );
    assert.match(prompt, /authoritative rendered globe/);
    assert.match(prompt, /continental silhouettes/);
    assert.match(prompt, /day\/night boundary/);
    assert.doesNotMatch(prompt, /Shared regional anchor/);
    for (let n = 1; n <= 7; n++) assert.ok(prompt.includes(`${n}. `));
    if (changes.atmosphere?.includes("none"))
      assert.match(prompt, /no clouds|no haze|no atmospheric/i);
    if (changes.atmosphere?.includes("hydrogen"))
      assert.match(prompt, /No invented solid surface/);
  }
});
test("orbital API makes one multipart request and saves its pinned reference metadata", async () => {
  const old = { ...process.env };
  process.env.OPENAI_API_KEY = "test";
  process.env.BLOB_READ_WRITE_TOKEN = "test";
  try {
    const r = createReport({
      params: DEFAULTS,
      geographyVersion: "cartography-1",
    });
    let calls = 0,
      released = 0,
      saved;
    const handler = createImageHandler({
      lookup: async () => null,
      quota: async () => async () => released++,
      request: async (url, options) => {
        calls++;
        assert.equal(url, "https://api.openai.com/v1/images/edits");
        assert.ok(options.body instanceof FormData);
        assert.equal(options.headers["Content-Type"], undefined);
        assert.equal(options.body.get("n"), "1");
        assert.equal(options.body.get("model"), IMAGE_MODEL);
        assert.equal(options.body.get("input_fidelity"), null);
        assert.equal(options.body.get("size"), "1536x1024");
        assert.equal(options.body.get("image").type, "image/png");
        assert.ok(options.body.get("image").size > 1000);
        assert.match(
          options.body.get("prompt"),
          new RegExp(r.cartography.version),
        );
        return { data: [{ b64_json: "encoded" }] };
      },
      saveOrbital: async (bytes, view) => {
        assert.equal(bytes, "encoded");
        saved = view;
        return { ...asset, globeView: view };
      },
    });
    const res = response();
    await handler(
      {
        method: "POST",
        body: { params: r.params, cartography: r.cartography, view: "orbital" },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.asset.globeView, saved);
    assert.equal(saved.modelId, orbitalView(r.cartography).modelId);
    assert.equal(calls, 1);
    assert.equal(released, 1);
    for (const change of [
      { cartography: { ...r.cartography, seed: 0 } },
      { camera: { latitude: 90 } },
      { prompt: "override" },
    ]) {
      const bad = response();
      await handler(
        {
          method: "POST",
          body: {
            params: r.params,
            cartography: r.cartography,
            view: "orbital",
            ...change,
          },
        },
        bad,
      );
      assert.equal(bad.statusCode, 400);
    }
    assert.equal(calls, 1);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  }
});
test("orbital camera metadata survives report persistence and rejects world/camera swaps", () => {
  const r = createReport({ params: DEFAULTS }),
    globeView = orbitalView(r.cartography);
  r.images.orbital = { ...asset, globeView };
  assert.deepEqual(
    restoreReport(serializeReport(r)).images.orbital,
    r.images.orbital,
  );
  assert.deepEqual(safeAsset(r.images.orbital), r.images.orbital);
  for (const change of [
    { latitude: 30 },
    { distance: 2 },
    { extra: "custom" },
    { modelId: "other" },
  ])
    assert.throws(() =>
      validateOrbitalView({ ...globeView, ...change }, r.cartography),
    );
  const other = createReport({ params: { ...DEFAULTS, water: 50 } });
  assert.throws(() => createReport({ ...other, images: r.images }));
  assert.throws(() =>
    createReport({ ...r, images: { surface: r.images.orbital } }),
  );
  const legacy = { ...asset };
  delete legacy.referenceSignature;
  assert.ok(safeAsset(legacy));
});
