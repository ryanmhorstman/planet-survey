import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  createReport,
  calculate,
  sampleReport,
} from "../lib/planet.js";
import { createGeography, samplePlanetLocation } from "../lib/geography.js";
import { restoreReport, serializeReport } from "../lib/client-report.js";
import { validateStoredReport } from "../lib/storage.js";
import { cartographyId, MAX_SITES } from "../lib/cartography-record.js";
const make = () => createReport({ params: DEFAULTS, name: "Persistent world" });
const siteFor = (r) => ({
  id: "site-1",
  name: "Basin station",
  modelId: cartographyId(r.cartography),
  latitude: 23.123456,
  longitude: 45.123456,
});
test("legacy reports without cartographic metadata acquire the unchanged v1 identity", () => {
  const r = make(),
    legacy = serializeReport(r);
  legacy.version = 2;
  delete legacy.cartography;
  delete legacy.sites;
  delete legacy.selectedLocation;
  const restored = restoreReport(legacy);
  const old = createReport({
    params: DEFAULTS,
    geographyVersion: "cartography-1",
  });
  assert.deepEqual(restored.cartography, old.cartography);
  assert.deepEqual(validateStoredReport(legacy).cartography, old.cartography);
  assert.deepEqual(restored.sites, []);
  assert.equal(restored.selectedLocation, null);
  assert.equal(old.cartography.seed, 0x2d05364d);
  assert.equal(r.cartography.version, "cartography-2");
});
test("named sites and selected coordinates survive export, import and server validation", () => {
  const r = make();
  r.sites = [siteFor(r)];
  r.selectedLocation = { latitude: 23.123456, longitude: 45.123456 };
  const exported = JSON.parse(JSON.stringify(serializeReport(r)));
  for (const restored of [
    restoreReport(exported),
    validateStoredReport(exported),
  ]) {
    assert.deepEqual(restored.cartography, r.cartography);
    assert.deepEqual(restored.sites, r.sites);
    assert.deepEqual(restored.selectedLocation, r.selectedLocation);
  }
  const reference = sampleReport();
  reference.sites = [siteFor(reference)];
  assert.deepEqual(
    restoreReport(serializeReport(reference)).sites,
    reference.sites,
  );
  assert.equal(restoreReport(serializeReport(reference)).sample, false);
  assert.equal(restoreReport(serializeReport(sampleReport())).sample, true);
});
test("persisted environment protects existing geography from later physics changes", () => {
  const r = make();
  const before = createGeography(r.params, r.physics, 512, r.cartography);
  const changedPhysics = {
    ...calculate(DEFAULTS),
    temperatureC: 300,
    yearDays: 999,
    waterState: "Vapor favored",
    gravityG: 4,
    solarDayHours: null,
  };
  const after = createGeography(
    r.params,
    changedPhysics,
    512,
    JSON.parse(JSON.stringify(r.cartography)),
  );
  assert.equal(after.id, before.id);
  assert.equal(after.seaLevel, before.seaLevel);
  assert.deepEqual(after.heights, before.heights);
  assert.deepEqual(
    samplePlanetLocation(after, 23, 45),
    samplePlanetLocation(before, 23, 45),
  );
});
test("unsupported or mismatched identities fail explicitly instead of replacing the world", () => {
  const r = make();
  for (const changed of [
    { ...r.cartography, version: "cartography-99" },
    { ...r.cartography, seed: r.cartography.seed + 1 },
    { ...r.cartography, width: 128 },
    {
      ...r.cartography,
      environment: { ...r.cartography.environment, temperatureC: NaN },
    },
  ]) {
    assert.throws(() =>
      restoreReport({ ...serializeReport(r), cartography: changed }),
    );
    assert.throws(() =>
      validateStoredReport({ ...serializeReport(r), cartography: changed }),
    );
  }
  assert.throws(
    () =>
      createReport({
        params: { ...DEFAULTS, water: 20 },
        cartography: r.cartography,
      }),
    /does not match/,
  );
});
test("sites are bounded, canonicalized and tied to their planetary model", () => {
  const r = make(),
    site = siteFor(r),
    payload = serializeReport(r);
  for (const sites of [
    [{ ...site, modelId: "other-world" }],
    [{ ...site, latitude: 91 }],
    [{ ...site, longitude: Infinity }],
    [{ ...site, name: " " }],
    [{ ...site, name: "x".repeat(81) }],
    [site, site],
    Array.from({ length: MAX_SITES + 1 }, (_, i) => ({
      ...site,
      id: `site-${i}`,
    })),
  ]) {
    assert.throws(() => restoreReport({ ...payload, sites }));
    assert.throws(() => validateStoredReport({ ...payload, sites }));
  }
  const normalized = restoreReport({
    ...payload,
    sites: [{ ...site, latitude: 90, longitude: 180 }],
    selectedLocation: { latitude: -90, longitude: -45 },
  });
  assert.equal(normalized.sites[0].longitude, 0);
  assert.equal(normalized.selectedLocation.longitude, 0);
  assert.throws(() =>
    restoreReport({
      ...payload,
      selectedLocation: { latitude: 0, longitude: NaN },
    }),
  );
});

test("v3 reports require identities and migrate v2 without dropping new fields", () => {
  const r = make(),
    payload = serializeReport(r);
  assert.equal(payload.version, 5);
  const missing = { ...payload };
  delete missing.cartography;
  assert.throws(() => restoreReport(missing), /missing.*identity/);
  assert.throws(() => validateStoredReport(missing), /missing.*identity/);
  r.sites = [siteFor(r)];
  const v2 = { ...serializeReport(r), version: 2 };
  assert.equal(restoreReport(v2).version, 5);
  assert.equal(restoreReport(v2).physicsVersion, "physics-1");
  assert.deepEqual(restoreReport(v2).sites, r.sites);
  assert.deepEqual(validateStoredReport(v2).sites, r.sites);
});
