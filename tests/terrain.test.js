import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, calculate } from "../lib/planet.js";
import {
  createGeography,
  samplePlanetLocation,
  locationVector,
} from "../lib/geography.js";
import {
  terrainAvailable,
  terrainRadius,
  detailedTerrainRadius,
  terrainView,
  TERRAIN_RELIEF_CAP,
} from "../lib/terrain.js";
const world = (changes = {}) => {
  const p = { ...DEFAULTS, ...changes };
  return createGeography(p, calculate(p), 64);
};
test("terrain display derives from unchanged canonical elevations and leaves basins flat", () => {
  const model = world(),
    before = [...model.heights];
  let land = 0,
    basins = 0;
  for (let lat = -80; lat <= 80; lat += 10)
    for (let lon = -180; lon < 180; lon += 10) {
      const s = samplePlanetLocation(model, lat, lon),
        r = terrainRadius(model, lat, lon);
      assert.equal(
        r,
        1 +
          Math.min(
            TERRAIN_RELIEF_CAP,
            (Math.max(0, s.elevationMeters ?? 0) * 4) /
              (model.params.radiusEarth * 6371000),
          ),
      );
      if (s.basin) {
        assert.equal(r, 1);
        basins++;
      } else if (r > 1) land++;
    }
  assert.ok(land > 0 && basins > 0);
  assert.deepEqual([...model.heights], before);
});
test("terrain camera remains repeatable and above the surface, including poles and seam", () => {
  const model = world();
  for (const [lat, lon] of [
    [23, 45],
    [90, 0],
    [-90, 0],
    [0, -180],
    [0, 180],
  ]) {
    const view = terrainView(model, lat, lon);
    assert.deepEqual(view, terrainView(model, lat, lon));
    assert.ok(Math.hypot(...view.position) > Math.hypot(...view.target));
    assert.deepEqual(view.up, locationVector(lat, lon));
    assert.ok(
      Math.abs(
        Math.hypot(...view.target) - detailedTerrainRadius(model, lat, lon),
      ) < 1e-10,
    );
  }
});
test("gas and dense atmospheres never expose solid terrain; airless and icy worlds can", () => {
  for (const changes of [
    { atmosphere: "hydrogen-helium envelope", pressureBar: 10, water: 0 },
    { atmosphere: "thick CO2 (Venus-like)", pressureBar: 90 },
  ]) {
    const model = world(changes);
    assert.equal(terrainAvailable(model), false);
    assert.equal(terrainRadius(model, 23, 45), 1);
  }
  for (const changes of [
    { atmosphere: "none (airless body)", pressureBar: 0, water: 0 },
    { orbital: "outer edge (very cold)" },
  ])
    assert.equal(terrainAvailable(world(changes)), true);
});
