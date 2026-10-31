import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  calculate,
  validateParams,
  imagePrompt,
  sampleReport,
} from "../lib/planet.js";
import { moonSystem, describeMoons } from "../lib/moons.js";
import { paramsFromSeed } from "../lib/seed.js";
import { fieldNoteFacts } from "../lib/prompts.js";
import { checkNarrative } from "../lib/narrative-checks.js";
import { earthComparison } from "../lib/visitor.js";

/** @param {object} changes */
const world = (changes) => {
  const p = validateParams({ ...DEFAULTS, ...changes });
  return /** @type {const} */ ([p, calculate(p)]);
};
const jupiter = {
  orbital: "outer edge (very cold)",
  atmosphere: "hydrogen-helium envelope",
  pressureBar: 10,
  water: 0,
  massEarth: 318,
  radiusEarth: 11.2,
  biosphere: "none",
};

test("a Jupiter-like giant gets a Galilean-like system inside its stable zone", () => {
  const [p, f] = world(jupiter),
    { moons, origin } = moonSystem(p, f),
    total = moons.reduce((sum, moon) => sum + moon.massEarth, 0);
  assert.ok(moons.length >= 2 && moons.length <= 5);
  assert.match(origin, /disk of gas and dust/);
  // Canup & Ward 2006: about 1e-4 of the planet's mass.
  assert.ok(Math.abs(total / p.massEarth - 1e-4) < 1e-6);
  for (const moon of moons) {
    assert.ok(moon.distancePlanetRadii > f.moons.rochePlanetRadii);
    assert.ok(moon.distancePlanetRadii < f.moons.stablePlanetRadii);
    // Io to Callisto span about 1.8 to 17 days, 1,600 to 2,600 km.
    assert.ok(
      moon.periodDays > 1 && moon.periodDays < 40,
      `${moon.periodDays}`,
    );
    assert.ok(moon.radiusKm > 800 && moon.radiusKm < 3000, `${moon.radiusKm}`);
  }
});

test("rocky worlds sometimes get one impact moon; small worlds catch moonlets", () => {
  let withMoon = 0,
    rocky = 0;
  for (let i = 0; i < 200; i++) {
    const [p, f] = world({ massEarth: 0.6 + (i % 20) * 0.1, tilt: i % 60 });
    if (!f.moons.possible) continue;
    rocky++;
    const { moons } = moonSystem(p, f);
    if (!moons.length) continue;
    withMoon++;
    assert.equal(moons.length, 1);
    assert.equal(moons[0].kind, "rocky");
    // No heavier, relative to its planet, than Earth's Moon.
    assert.ok(moons[0].massEarth / p.massEarth <= 0.0121);
  }
  assert.ok(
    withMoon / rocky > 0.2 && withMoon / rocky < 0.5,
    `${withMoon}/${rocky}`,
  );
  for (let i = 0; i < 40; i++) {
    const [p, f] = world({ massEarth: 0.1, radiusEarth: 0.5, tilt: i });
    for (const moon of moonSystem(p, f).moons) {
      assert.equal(moon.kind, "captured");
      assert.ok(moon.radiusKm >= 5 && moon.radiusKm <= 30);
    }
  }
});

test("moons are repeatable, ignore the art modes, and never orbit a locked world", () => {
  const [p, f] = world(jupiter);
  assert.deepEqual(moonSystem(p, f), moonSystem({ ...p }, f));
  assert.deepEqual(
    moonSystem({ ...p, biosphere: "alien", civilization: "cities" }, f),
    moonSystem(p, f),
  );
  const tether = sampleReport("tether");
  assert.deepEqual(moonSystem(tether.params, tether.physics).moons, []);
  assert.match(
    describeMoons(tether.physics, moonSystem(tether.params, tether.physics)),
    /^None: its locked spin/,
  );
  let possible = 0;
  for (let i = 0; i < 100; i++) {
    const p = paramsFromSeed(9000 + i * 7919),
      f = calculate(p);
    if (!f.moons?.possible) assert.deepEqual(moonSystem(p, f).moons, []);
    else possible++;
  }
  assert.ok(possible > 0);
});

test("skies, field notes and the visitor section show exactly the moons there are", () => {
  const gyre = sampleReport("gyre"),
    { params: g, physics: gf } = gyre,
    surface = imagePrompt(g, gf, "surface");
  assert.match(surface, /Five moons show pale in the daytime sky/);
  assert.match(surface, /pale, icy worlds/);
  assert.match(surface, /\nNo neighboring planets/);
  // From orbit they lie far outside the frame.
  assert.match(imagePrompt(g, gf, "orbital"), /No moons, neighboring planets/);
  assert.match(
    imagePrompt(g, gf, "night"),
    /moonlight softly lights the scene/,
  );
  // A moonless world keeps its bans; an overcast one hides any moons.
  const [plain, pf] = world({ tilt: 1 });
  if (!moonSystem(plain, pf).moons.length)
    assert.match(imagePrompt(plain, pf, "surface"), /No moons, neighboring/);
  const [haze, hf] = world({ ...jupiter, pressureBar: 20 });
  assert.match(imagePrompt(haze, hf, "surface"), /No moons, neighboring/);
  assert.match(
    fieldNoteFacts(g, gf, null),
    /moons Five moons, formed with the planet/,
  );
  const note = (params, physics) =>
    checkNarrative({
      params,
      physics,
      narrative: {
        description: "Two moons hang over the clouds.",
        surfaceFeatures: "",
        sections: [
          { kind: "imagined", text: "Two moons hang over the clouds." },
        ],
      },
    }).find((check) => check.id === "no-unlisted-moons");
  assert.equal(note(g, gf).pass, true);
  const viridia = sampleReport("viridia");
  assert.equal(note(viridia.params, viridia.physics).pass, false);
  assert.match(
    earthComparison(g, gf).find((fact) => fact.label === "Moons").value,
    /largest looks 1.1× as wide as our Moon, circling every 1.8 days/,
  );
});
