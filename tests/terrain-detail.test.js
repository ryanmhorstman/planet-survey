import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, calculate } from "../lib/planet.js";
import { createGeography, samplePlanetLocation } from "../lib/geography.js";
import { terrainDetail, terrainSpan } from "../lib/terrain-detail.js";
import { terrainRadius, detailedTerrainRadius } from "../lib/terrain.js";
const make = (changes = {}) => {
  const p = { ...DEFAULTS, ...changes };
  return createGeography(p, calculate(p), 64);
};
test("fine relief repeats across LODs and spherical seams without changing regional geography", () => {
  const m = make(),
    before = [...m.heights],
    sample = samplePlanetLocation(m, -4, 158),
    a = terrainDetail(m, -4, 158);
  assert.deepEqual(a, terrainDetail(m, -4, 158));
  assert.deepEqual(terrainDetail(m, 10, -180), terrainDetail(m, 10, 180));
  assert.deepEqual(terrainDetail(m, 90, -80), terrainDetail(m, 90, 120));
  for (const distance of [0.5, 0.2, 0.06, 0.008, 0.003])
    assert.ok([12, 4, 1, 0.25, 0.0625].includes(terrainSpan(distance)));
  assert.deepEqual(samplePlanetLocation(m, -4, 158), sample);
  assert.deepEqual([...m.heights], before);
});
test("land relief has visible height/material variation while coast/basin classification is preserved", () => {
  const m = make(),
    heights = [],
    colors = [];
  for (let i = 0; i < 24; i++) {
    const lat = -4 + i * 0.005,
      lon = 158,
      s = samplePlanetLocation(m, lat, lon),
      d = terrainDetail(m, lat, lon, s);
    heights.push(d.heightOffsetMeters);
    colors.push(d.color.reduce((a, b) => a + b, 0));
    assert.ok(s.elevationMeters + d.heightOffsetMeters >= 0);
    assert.equal(samplePlanetLocation(m, lat, lon).basin, s.basin);
  }
  assert.ok(
    Math.max(...heights) - Math.min(...heights) > 25,
    "Relief is effectively flat",
  );
  assert.ok(
    Math.max(...colors) - Math.min(...colors) > 10,
    "Material remains one flat color",
  );
});
test("water/ice keep their datum, hostile atmospheres expose no relief, and gravity bounds ridges", () => {
  for (const changes of [
    { water: 100 },
    { water: 100, orbital: "outer edge (very cold)" },
    { atmosphere: "hydrogen-helium envelope", pressureBar: 10, water: 0 },
    { atmosphere: "thick CO2 (Venus-like)", pressureBar: 90 },
  ]) {
    const m = make(changes);
    for (const latitude of [-50, 0, 50]) {
      assert.equal(terrainDetail(m, latitude, 0).heightOffsetMeters, 0);
      assert.equal(
        detailedTerrainRadius(m, latitude, 0),
        terrainRadius(m, latitude, 0),
      );
    }
  }
  const m = make(),
    s = samplePlanetLocation(m, -4, 158),
    heavy = { ...m, physics: { ...m.physics, gravityG: 100 } };
  assert.ok(terrainDetail(heavy, -4, 158, s).amplitudeMeters <= 100);
});
test("zoom refinement allocates progressively smaller regions with a finite closest level", () => {
  assert.equal(terrainSpan(0.5), 12);
  assert.equal(terrainSpan(0.05), 4);
  assert.equal(terrainSpan(0.01), 1);
  assert.equal(terrainSpan(0.003), 0.25);
  assert.equal(terrainSpan(0.0006), 0.0625);
});

test("close zoom levels cover the camera footprint rather than exposing a tiny square patch", () => {
  for (const distance of [
    0.0006, 0.00079, 0.00081, 0.0039, 0.0041, 0.0159, 0.0161, 0.0639,
  ]) {
    const innerRadius = ((terrainSpan(distance) * Math.PI) / 180) * 0.8;
    assert.ok(
      innerRadius > distance * 0.65,
      `Insufficient detail coverage at ${distance}`,
    );
  }
});
