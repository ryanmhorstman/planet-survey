import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, calculate, imagePrompt } from "../lib/planet.js";
import { CONSISTENCY_RULES, checkConsistency } from "../lib/consistency.js";
import {
  paramsFromSeed,
  seededReport,
  seedName,
  seedQuery,
} from "../lib/seed.js";
import { imageCacheKey } from "../lib/image-cache.js";
import {
  serializeReport,
  restoreReport,
  safeAsset,
} from "../lib/client-report.js";
import { cachePath } from "../lib/storage.js";

// 0.30 M☉ red dwarf, L 0.012, R★ 0.30, a = 0.104 AU; 0.61 M⊕ / 0.99 R⊕, 1 bar.
const redDwarf = {
  ...DEFAULTS,
  starType: "M-type (red dwarf)",
  orbital: "inner habitable zone",
  massEarth: 0.61,
  radiusEarth: 0.99,
  water: 36,
};
const locked = calculate(redDwarf);
/** @param {string} id @param {any} physics @param {any} [p] */
const fires = (id, physics, p = redDwarf) =>
  checkConsistency({ p, physics }).some((finding) => finding.id === id);

test("the model's own worlds raise no contradictions", () => {
  for (const p of [
    redDwarf,
    DEFAULTS,
    { ...redDwarf, pressureBar: 0.05 },
    { ...DEFAULTS, starType: "F-type (yellow-white)", tilt: 80 },
    {
      ...DEFAULTS,
      atmosphere: "none (airless body)",
      pressureBar: 0,
      water: 0,
    },
    {
      ...DEFAULTS,
      atmosphere: "hydrogen-helium envelope",
      pressureBar: 10,
      water: 0,
      massEarth: 95,
      radiusEarth: 9,
    },
  ])
    assert.deepEqual(
      checkConsistency({ p, physics: calculate(p) }).filter(
        (finding) => finding.kind === "contradiction",
      ),
      [],
    );
});

// One test per rule: each one fires on a deliberately broken world.
const broken = {
  "lock-matches-age": {
    ...locked,
    tidalLock: { ...locked.tidalLock, lockYears: 2e9 },
  },
  "locked-has-no-solar-day": { ...locked, solarDayHours: 24 },
  "locked-tilt-is-damped": { ...locked, tiltDeg: 23 },
  "locked-world-holds-no-moon": {
    ...locked,
    moons: { ...locked.moons, possible: true },
  },
  "collapsed-nightside-scores-zero": {
    ...locked,
    nightside: { thresholdBar: 0.1, collapses: true },
  },
  "runaway-has-no-oceans": {
    ...locked,
    runaway: { limitAu: 0.2, lost: true },
  },
  "escaped-air-scores-zero": {
    ...locked,
    retention: { minEscapeKms: 20, retained: false },
  },
  "star-temperature-matches": {
    ...locked,
    star: { ...locked.star, teffK: 5772 },
  },
  "red-dwarf-activity-caveat": { ...locked, activityCaveat: null },
  "habitable-zone-nested": {
    ...locked,
    habitableZone: {
      ...locked.habitableZone,
      optimistic: [0.2, 0.21],
    },
  },
};
for (const [id, physics] of Object.entries(broken))
  test(`rule ${id} catches its contradiction`, () => {
    assert.equal(fires(id, locked), false);
    assert.equal(fires(id, physics), true);
  });

test("rule habitable-zone-vs-temperature notes a mild world outside the conservative zone", () => {
  const [finding] = checkConsistency({ p: redDwarf, physics: locked }).filter(
    (f) => f.id === "habitable-zone-vs-temperature",
  );
  assert.equal(finding.kind, "note");
  assert.match(finding.message, /sunward of the conservative.*gives 21 °C/);
  assert.equal(
    fires("habitable-zone-vs-temperature", calculate(DEFAULTS), DEFAULTS),
    false,
  );
  const cold = {
      ...DEFAULTS,
      orbital: "outer edge (very cold)",
      pressureBar: 5,
    },
    farWarm = { ...calculate(cold), temperatureC: 10 };
  assert.equal(fires("habitable-zone-vs-temperature", farWarm, cold), true);
});

test("every rule has a test", () => {
  assert.deepEqual(
    CONSISTENCY_RULES.map((rule) => rule.id).sort(),
    [...Object.keys(broken), "habitable-zone-vs-temperature"].sort(),
  );
});

test("the same seed gives an identical report and image cache keys", () => {
  const seed = 2718281828,
    a = seededReport(seed),
    b = seededReport(seed);
  /** @param {any} r */
  const content = ({ createdAt: _created, ...rest }) => rest;
  assert.deepEqual(content(a), content(b));
  assert.equal(a.name, seedName(seed));
  assert.equal(a.seed, seed);
  assert.deepEqual(a.params, paramsFromSeed(seed));
  const key = (/** @type {any} */ r) =>
    imageCacheKey(r.seed, [
      "model",
      "1536x1024",
      imagePrompt(r.params, r.physics, "surface"),
      null,
    ]);
  assert.equal(key(a), key(b));
  assert.match(key(a), /^2718281828-[0-9a-f]{32}$/);
  assert.notEqual(key(a), key(seededReport(seed + 1)));
  assert.notEqual(seededReport(seed, "alien").id, a.id);
  assert.equal(seedQuery(a), "?seed=2718281828");
  // Cached images must pass the generated-image URL check the app applies.
  for (const cacheKey of [key(a), imageCacheKey(null, ["model"])])
    assert.ok(
      safeAsset({
        url: `https://store.public.blob.vercel-storage.com/${cachePath(cacheKey)}`,
      }),
    );
  assert.equal(
    seedQuery(seededReport(seed, "none")),
    "?seed=2718281828&biosphere=none",
  );
  // The seed survives a save and restore.
  assert.equal(restoreReport(serializeReport(a)).seed, seed);
});

test("seeds are validated", () => {
  for (const bad of [-1, 1.5, 2 ** 32, Number.NaN])
    assert.throws(() => paramsFromSeed(bad), /whole number/);
  for (const seed of [0, 1, 4294967295]) assert.ok(seededReport(seed).params);
});
