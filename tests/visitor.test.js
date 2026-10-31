import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, calculate, sampleReport } from "../lib/planet.js";
import { survival, hazards, earthComparison, lasting } from "../lib/visitor.js";

const world = (changes) => {
  const p = { ...DEFAULTS, ...changes };
  return [p, calculate(p)];
};

test("an Earth-like world is walkable, and the reference worlds rank by their fastest hazard", () => {
  const earth = survival(...world({}));
  assert.equal(earth.survivable, true);
  assert.match(earth.headline, /walk around here in a light jacket/);
  const headline = (key) => {
    const r = sampleReport(key);
    return survival(r.params, r.physics).headline;
  };
  assert.match(headline("viridia"), /walk around/);
  assert.match(headline("cinder"), /about 15 seconds/);
  assert.match(headline("kiln"), /about 5 seconds/);
  assert.match(headline("gyre"), /about 30 seconds/);
  assert.match(headline("boreal"), /a few hours/);
  // A locked world's mean hides a hot dayside and a cold nightside.
  const tether = sampleReport("tether");
  assert.match(
    survival(tether.params, tether.physics).reasons.at(-1),
    /dayside would be hotter/,
  );
});

test("hazards follow air, pressure, temperature and gravity", () => {
  const first = (changes) => hazards(...world(changes))[0]?.text ?? "";
  assert.match(
    first({ atmosphere: "none (airless body)", pressureBar: 0, water: 0 }),
    /water in your body starts to boil/,
  );
  // Below the Armstrong limit even Earth air cannot keep you conscious.
  assert.match(first({ pressureBar: 0.05 }), /boil/);
  assert.match(
    first({ pressureBar: 0.2 }),
    /thinner than at the top of Everest/,
  );
  assert.match(first({ pressureBar: 0.5 }), /high mountain/);
  assert.match(
    first({ atmosphere: "thin nitrogen", pressureBar: 0.8 }),
    /no oxygen/,
  );
  assert.match(first({ pressureBar: 9 }), /seizures/);
  assert.match(
    first({ massEarth: 30, radiusEarth: 2.5 }),
    /barely lift your own body/,
  );
  assert.match(
    first({ orbital: "outer edge (very cold)" }),
    /hypothermia|freezes/,
  );
  assert.equal(hazards(...world({})).length, 0);
  assert.equal(lasting(15), "about 15 seconds");
  assert.equal(lasting(600), "a few minutes");
  assert.equal(lasting(86400), "a few days");
});

test("the Earth comparison reads Earth back as Earth and scales with the world", () => {
  const facts = (changes) =>
    Object.fromEntries(
      earthComparison(...world(changes)).map((f) => [f.label, f.value]),
    );
  const earth = facts({});
  assert.match(earth["Your weight"], /feel like 70 kg/);
  assert.match(earth["Jumping"], /just as high/);
  assert.match(earth["Your age"], /you'd be 30 here/);
  assert.equal(
    earth["The star"],
    "It looks about the size of the Sun, and the planet gets about Earth's sunlight.",
  );
  const tether = sampleReport("tether");
  assert.match(
    earthComparison(tether.params, tether.physics).find(
      (fact) => fact.label === "The star",
    ).value,
    /2.9× as wide as the Sun/,
  );
  const light = facts({ massEarth: 0.1, radiusEarth: 0.5 });
  assert.match(light["Jumping"], /jump 2.5× as high/);
  // Year and day live in the stat tiles, not here.
  assert.equal(earth["A year"], undefined);
  assert.equal(earth["A day"], undefined);
});
