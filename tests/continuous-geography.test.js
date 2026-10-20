import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, calculate, createReport } from "../lib/planet.js";
import {
  createGeography,
  sampleRelief,
  samplePlanetLocation,
  surfaceColor,
  locationVector,
} from "../lib/geography.js";
import { createRegion, regionCoordinate, REGION_SIZE } from "../lib/region.js";
import { terrainRadius } from "../lib/terrain.js";
import { restoreReport, serializeReport } from "../lib/client-report.js";
const make = () => createGeography(DEFAULTS, calculate(DEFAULTS), 64);
test("continuous field varies within atlas cells and has no seam or polar discontinuity", () => {
  const m = make(),
    a = sampleRelief(m, 12.123, 34.456),
    b = sampleRelief(m, 12.124, 34.457);
  assert.notEqual(a, b);
  assert.ok(Math.abs(a - b) < 0.001);
  assert.ok(
    Math.abs(sampleRelief(m, 12, 179.99999) - sampleRelief(m, 12, -179.99999)) <
      1e-6,
  );
  assert.equal(sampleRelief(m, 90, 42), sampleRelief(m, 90, -70));
  const left = sampleRelief(m, 12, 33.749999),
    right = sampleRelief(m, 12, 33.750001);
  assert.ok(
    Math.abs(left - right) < 1e-6,
    "Terrain jumped at an old atlas-cell edge",
  );
});
test("continuous shore classification follows one scalar field and assigned water coverage", () => {
  const m = make();
  let wet = 0,
    total = 0;
  for (let lat = -88; lat < 90; lat += 2)
    for (let lon = -179; lon < 180; lon += 2) {
      const s = samplePlanetLocation(m, lat, lon),
        area = Math.cos((lat * Math.PI) / 180);
      assert.equal(s.basin, s.relief <= m.seaLevel);
      total += area;
      if (s.basin) wet += area;
    }
  assert.ok(Math.abs((wet / total) * 100 - DEFAULTS.water) < 2);
});
test("regional mesh/material pixels use the same location sampler, including poles", () => {
  const m = make(),
    lat = 23,
    lon = 179,
    region = createRegion(m, lat, lon),
    center = 64 * 129 + 64;
  assert.deepEqual(region, createRegion(m, lat, lon));
  const expected = locationVector(lat, lon).map(
    (n) => n * (terrainRadius(m, lat, lon) + 0.000025),
  );
  expected.forEach((n, i) =>
    assert.ok(Math.abs(n - region.positions[center * 3 + i]) < 1e-6),
  );
  const x = 180,
    y = 190,
    c = regionCoordinate(
      lat,
      lon,
      ((x + 0.5) / REGION_SIZE - 0.5) * 24,
      (0.5 - (y + 0.5) / REGION_SIZE) * 24,
    );
  assert.deepEqual(
    [
      ...region.pixels.subarray(
        (y * REGION_SIZE + x) * 4,
        (y * REGION_SIZE + x) * 4 + 3,
      ),
    ],
    surfaceColor(m, samplePlanetLocation(m, c.latitude, c.longitude)),
  );
  for (const lat of [-90, 90]) {
    const c = regionCoordinate(lat, 0, 12, 12);
    assert.ok(Number.isFinite(sampleRelief(m, c.latitude, c.longitude)));
  }
});
test("v1 saved worlds and expedition associations remain pinned while new worlds use v2", () => {
  const old = createReport({
      params: DEFAULTS,
      geographyVersion: "cartography-1",
    }),
    fresh = createReport({ params: DEFAULTS });
  assert.equal(fresh.cartography.version, "cartography-2");
  assert.deepEqual(
    restoreReport(serializeReport(old)).cartography,
    old.cartography,
  );
  const m = createGeography(
    DEFAULTS,
    calculate(DEFAULTS),
    64,
    undefined,
    "cartography-1",
  );
  assert.equal(sampleRelief(m, 23.1, 45.1), sampleRelief(m, 23.2, 45.2));
  assert.equal(m.id, "cartography-1-2d05364d-64");
});

test("v2 canonical field has a frozen known-answer fixture", () => {
  const m = make();
  assert.equal(m.id, "cartography-2-b5f78a8-64");
  assert.ok(Math.abs(m.heights[0] - 0.1564517617225647) < 1e-7);
  assert.ok(Math.abs(m.seaLevel - 0.36703675985336304) < 1e-7);
});
