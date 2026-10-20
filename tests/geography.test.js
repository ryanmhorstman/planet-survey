import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, calculate } from "../lib/planet.js";
import {
  createGeography,
  samplePlanetLocation,
  normalizeCoordinates,
  locationVector,
  atlasPixels,
  hashText,
} from "../lib/geography.js";
const modelFor = (changes) => {
  const p = { ...DEFAULTS, ...changes };
  return createGeography(p, calculate(p), 64);
};
test("canonical geography repeats independently of parameter order and biosphere mode", () => {
  const model = modelFor({}),
    p = Object.fromEntries(Object.entries(DEFAULTS).reverse());
  const second = createGeography(p, calculate(p), 64),
    noLife = modelFor({ biosphere: "none" });
  assert.equal(model.id, second.id);
  assert.deepEqual(model.heights, second.heights);
  assert.deepEqual(model.heights, noLife.heights);
  assert.equal(model.seaLevel, noLife.seaLevel);
  assert.deepEqual(
    samplePlanetLocation(model, 23, 45),
    samplePlanetLocation(second, 23, 45),
  );
  assert.notEqual(model.id, modelFor({ tilt: 24 }).id);
  assert.notEqual(
    model.id,
    createGeography(
      DEFAULTS,
      calculate(DEFAULTS, { pl_name: "b", pl_eqt: 200 }),
      64,
    ).id,
  );
  assert.equal(hashText("hello"), 1335831723);
});
test("coordinate normalization and vector conventions cover seam and poles", () => {
  assert.deepEqual(normalizeCoordinates(90, 55), normalizeCoordinates(90, -60));
  assert.deepEqual(normalizeCoordinates(0, 180), normalizeCoordinates(0, -180));
  assert.deepEqual(normalizeCoordinates(10, 361), {
    latitude: 10,
    longitude: 1,
  });
  for (const [lat, lon] of [
    [NaN, 0],
    [0, Infinity],
    [91, 0],
  ])
    assert.throws(() => normalizeCoordinates(lat, lon));
  assert.deepEqual(locationVector(0, 0), [1, 0, -0]);
  assert.ok(Math.abs(locationVector(0, -90)[2] - 1) < 1e-10);
  const model = modelFor({});
  assert.deepEqual(
    samplePlanetLocation(model, 30, 180),
    samplePlanetLocation(model, 30, -180),
  );
});
test("area-weighted basin coverage tracks assignments including endpoints", () => {
  for (const water of [0, 10, 70, 90, 100]) {
    const model = modelFor({ water });
    let total = 0,
      wet = 0;
    for (let row = 0; row < model.height; row++)
      for (let col = 0; col < model.width; col++) {
        const lat = 90 - ((row + 0.5) / model.height) * 180,
          lon = ((col + 0.5) / model.width) * 360 - 180;
        const area = Math.cos((lat * Math.PI) / 180);
        total += area;
        if (samplePlanetLocation(model, lat, lon).basin) wet += area;
      }
    assert.ok(
      Math.abs((wet / total) * 100 - water) < 0.2,
      `${water}: ${(wet / total) * 100}`,
    );
  }
});
test("all world families preserve critical phase, surface and biological rules", () => {
  const fixtures = [
    {},
    { massEarth: 2, biosphere: "alien" },
    { atmosphere: "none (airless body)", pressureBar: 0, water: 0 },
    { atmosphere: "thick CO2 (Venus-like)", pressureBar: 90 },
    { orbital: "outer edge (very cold)" },
    { water: 100 },
    { atmosphere: "hydrogen-helium envelope", pressureBar: 10, water: 0 },
    { rotationHours: calculate(DEFAULTS).yearDays * 24 },
  ];
  for (const p of fixtures) {
    const model = modelFor(p),
      pixels = atlasPixels(model);
    assert.equal(pixels.length, model.width * model.height * 4);
    for (const lat of [-90, -45, 0, 45, 90])
      for (const lon of [-180, -45, 0, 90]) {
        const s = samplePlanetLocation(model, lat, lon);
        assert.ok(s.temperatureC === null || s.temperatureC >= -273.15);
        if (model.gas) {
          assert.equal(s.surface, "Cloud deck");
          assert.equal(s.elevationMeters, null);
          assert.equal(s.pressureBar, null);
          assert.equal(s.biology, false);
        }
        if (model.params.atmosphere.includes("none")) {
          assert.equal(s.pressureBar, 0);
          assert.equal(s.temperatureC, null);
          assert.equal(s.biology, false);
          assert.equal(s.basin, false);
        }
        if (model.physics.waterState === "Ice favored" && s.basin) {
          assert.equal(s.ice, true);
          assert.equal(s.biology, false);
        }
        if (s.surface === "Ocean")
          assert.equal(s.waterPhase, "Liquid water plausible");
        if (model.params.water === 100) assert.equal(s.basin, true);
        if (s.biology) assert.equal(model.biology.present, true);
      }
  }
});
test("synchronous model has repeatable longitudinal climate variation", () => {
  const model = modelFor({
    water: 100,
    rotationHours: calculate(DEFAULTS).yearDays * 24,
  });
  assert.notEqual(
    samplePlanetLocation(model, 0, 0).temperatureC,
    samplePlanetLocation(model, 0, 180).temperatureC,
  );
});

test("v1 canonical atlas has a frozen known-answer fixture", () => {
  const model = createGeography(
    DEFAULTS,
    calculate(DEFAULTS),
    64,
    undefined,
    "cartography-1",
  );
  assert.equal(model.id, "cartography-1-2d05364d-64");
  assert.ok(Math.abs(model.heights[0] - 0.5041544437408447) < 1e-6);
  assert.ok(Math.abs(model.seaLevel - 0.5906397700309753) < 1e-6);
  assert.equal(samplePlanetLocation(model, 23, 45).surface, "Ocean");
});
