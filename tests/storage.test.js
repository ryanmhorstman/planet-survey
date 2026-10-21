import { orbitalView } from "../lib/orbital-record.js";
import { expeditionMetadata } from "../lib/expedition-record.js";
import { cartographyId } from "../lib/cartography-record.js";
import test from "node:test";
import assert from "node:assert/strict";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { readFile } from "node:fs/promises";
import {
  storeImage,
  storeOrbitalImage,
  storeExpeditionImage,
  verifiedExpeditionAsset,
  verifiedAsset,
  storeReport,
  readReport,
} from "../lib/storage.js";
import { createReport, DEFAULTS } from "../lib/planet.js";

test("Blob SDK round trip preserves signed images and recomputes report physics", async () => {
  const previous = getGlobalDispatcher(),
    oldToken = process.env.BLOB_READ_WRITE_TOKEN;
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  process.env.BLOB_READ_WRITE_TOKEN =
    "vercel_blob_rw_teststore_testplaceholder";
  const files = new Map(),
    origin = "https://teststore.public.blob.vercel-storage.com";
  mock
    .get("https://vercel.com")
    .intercept({ path: /\/api\/blob\/\?pathname=/, method: "PUT" })
    .reply((options) => {
      const pathname = new URL(
        options.path,
        "https://vercel.com",
      ).searchParams.get("pathname");
      files.set(pathname, options.body);
      return {
        statusCode: 200,
        data: JSON.stringify({
          url: `${origin}/${pathname}`,
          downloadUrl: `${origin}/${pathname}?download=1`,
          pathname,
          contentType: pathname.endsWith(".json")
            ? "application/json"
            : "image/webp",
          contentDisposition: "inline",
          etag: "test",
        }),
        responseOptions: { headers: { "content-type": "application/json" } },
      };
    })
    .persist();
  mock
    .get(origin)
    .intercept({ path: /\/psu7\/reports\//, method: "GET" })
    .reply((options) => {
      const data = files.get(options.path.slice(1));
      return {
        statusCode: data ? 200 : 404,
        data: data || "",
        responseOptions: { headers: { "content-type": "application/json" } },
      };
    })
    .persist();
  try {
    const image = await storeImage(
      (
        await readFile(
          new URL("../assets/sample-orbital.webp", import.meta.url),
        )
      ).toString("base64"),
    );
    assert.deepEqual(verifiedAsset(image), image);
    assert.throws(
      () => verifiedAsset({ ...image, signature: "0".repeat(64) }),
      /verified/,
    );
    assert.throws(
      () =>
        verifiedAsset({
          ...image,
          url: image.url.replace("teststore", "foreign"),
        }),
      /verified/,
    );
    await assert.rejects(
      storeImage(Buffer.from("not a WebP").toString("base64")),
      (e) => e.status === 502,
    );
    const report = createReport({
      params: DEFAULTS,
      name: "Round trip",
      images: { orbital: image, surface: image },
    });
    report.sites = [
      {
        id: "site-1",
        name: "Quiet basin",
        latitude: 23,
        longitude: 45,
        modelId: cartographyId(report.cartography),
      },
    ];
    report.selectedLocation = { latitude: 23, longitude: 45 };
    const metadata = expeditionMetadata(
      report.cartography,
      report.params,
      { latitude: 23, longitude: 45 },
      90,
    );
    const expeditionImage = await storeExpeditionImage(
      (
        await readFile(
          new URL("../assets/sample-orbital.webp", import.meta.url),
        )
      ).toString("base64"),
      metadata.key,
    );
    report.expeditions = [{ ...metadata, asset: expeditionImage }];
    assert.deepEqual(
      verifiedExpeditionAsset(expeditionImage, metadata.key),
      expeditionImage,
    );
    assert.throws(
      () => verifiedExpeditionAsset(expeditionImage, metadata.key + "other"),
      /does not belong/,
    );
    const orbitalImage = await storeOrbitalImage(
      (
        await readFile(
          new URL("../assets/sample-orbital.webp", import.meta.url),
        )
      ).toString("base64"),
      orbitalView(report.cartography),
    );
    assert.deepEqual(verifiedAsset(orbitalImage), orbitalImage);
    report.images.orbital = orbitalImage;
    const otherWorld = createReport({ params: { ...DEFAULTS, water: 50 } });
    assert.throws(
      () =>
        verifiedAsset({
          ...orbitalImage,
          globeView: orbitalView(otherWorld.cartography),
        }),
      /does not belong/,
    );
    assert.throws(
      () =>
        verifiedAsset({
          ...orbitalImage,
          globeView: { ...orbitalImage.globeView, latitude: 30 },
        }),
      /reference/,
    );
    report.physics.score = -1;
    const id = await storeReport(report),
      restored = await readReport(id);
    assert.equal(restored.id, id);
    assert.equal(restored.name, "Round trip");
    assert.equal(restored.physics.score, 100);
    assert.deepEqual(restored.images, report.images);
    assert.deepEqual(restored.cartography, report.cartography);
    assert.deepEqual(restored.expeditions, report.expeditions);
    assert.deepEqual(restored.sites, report.sites);
    assert.deepEqual(restored.selectedLocation, report.selectedLocation);
    assert.deepEqual(restored.params, report.params);
    assert.deepEqual(restored.narrative, report.narrative);
    await assert.rejects(
      readReport("00000000-0000-4000-8000-000000000000"),
      (e) => e.status === 404,
    );
    await assert.rejects(readReport("../../private"), /invalid/);
  } finally {
    setGlobalDispatcher(previous);
    await mock.close();
    if (oldToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = oldToken;
  }
});

test("bundled showcase assets are accepted without widening the local asset allowlist", () => {
  for (const view of ["orbital", "surface"]) {
    const url = `/assets/sample-${view}.webp`;
    assert.deepEqual(verifiedAsset({ url }), { url, kind: "reference" });
  }
  assert.throws(() => verifiedAsset({ url: "/assets/unapproved.webp" }));
});
