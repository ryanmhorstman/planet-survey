import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  calculate,
  geographySpec,
  visualSpec,
  imagePrompt,
  analysisPrompt,
  waterState,
} from "../lib/planet.js";
const fixtures = {
  temperate: {},
  highGravity: { massEarth: 1.63, radiusEarth: 1.039, biosphere: "alien" },
  airless: { atmosphere: "none (airless body)", pressureBar: 0, water: 0 },
  venus: { atmosphere: "thick CO2 (Venus-like)", pressureBar: 90 },
  glacial: { orbital: "outer edge (very cold)" },
  ocean: { water: 100, biosphere: "alien" },
  gas: { atmosphere: "hydrogen-helium envelope", pressureBar: 10, water: 0 },
  locked: { rotationHours: calculate(DEFAULTS).yearDays * 24 },
};
for (const [name, changes] of Object.entries(fixtures))
  test(`${name}: both prompt views preserve environmental constraints`, () => {
    const p = { ...DEFAULTS, ...changes },
      f = calculate(p),
      spec = visualSpec(p, f);
    assert.equal(
      geographySpec(p, f),
      geographySpec(Object.fromEntries(Object.entries(p).reverse()), f),
    );
    assert.equal(
      geographySpec(p, f),
      geographySpec({ ...p, biosphere: "none" }, f),
    );
    for (const view of ["orbital", "surface"]) {
      const prompt = imagePrompt(p, f, view);
      for (let section = 1; section <= 7; section++)
        assert.ok(prompt.includes(`${section}. `));
      for (const field of ["geography", "terrain", "sky", "biosphere"])
        assert.ok(prompt.includes(spec[field]), field);
      assert.match(prompt, /No moons.*rings, settlements, spacecraft/);
      assert.match(prompt, /No recognizable Earth continents/);
      if (name === "airless")
        assert.match(prompt, /black sky.*no clouds or atmospheric haze/);
      if (name === "venus") assert.match(prompt, /limited surface visibility/);
      if (name === "glacial")
        assert.match(prompt, /Continuous ice.*no open blue liquid seas/);
      if (name === "ocean") assert.match(prompt, /no exposed land or islands/);
      if (name === "gas") assert.match(prompt, /no visible solid surface/);
      if (name === "highGravity")
        assert.match(
          prompt,
          /low interlocking cushions and squat radial domes/,
        );
      if (name === "locked")
        assert.match(
          prompt,
          /Synchronous rotation: fixed illumination geometry/,
        );
    }
  });
test("geography provides procedural diversity and positive fictional arrangements", () => {
  const layouts = new Set();
  for (let tilt = 0; tilt <= 90; tilt++) {
    const p = { ...DEFAULTS, tilt },
      g = geographySpec(p, calculate(p));
    assert.match(
      g,
      /Fictional arrangement:.*70% liquid-water coverage and 30% exposed land/,
    );
    layouts.add(g);
  }
  assert.ok(layouts.size > 80);
});
test("interpretation prompt separates catalogue evidence, assumptions and imagined scenery", () => {
  const prompt = analysisPrompt(DEFAULTS, calculate(DEFAULTS), {
    pl_name: "Example b",
    pl_eqt: 260,
  });
  assert.match(
    prompt,
    /No actual observation, detection, measurement or acquired telemetry/,
  );
  assert.match(
    prompt,
    /attribute supplied catalogue measurements to the catalogue/,
  );
  assert.match(prompt, /catalogue equilibrium temperatures are estimates/);
});
test("gravity does not silently alter the surface rubric; ESI remains distinct", () => {
  const earth = calculate(DEFAULTS),
    heavy = calculate({ ...DEFAULTS, massEarth: 1.63 });
  assert.equal(heavy.score, earth.score);
  assert.notEqual(heavy.esi, earth.esi);
});
test("water saturation approximation has conservative extreme-domain behavior", () => {
  for (const pressure of [220.64, 500, 1000]) {
    assert.equal(
      waterState(20, pressure, 70),
      "Water phase outside model range",
    );
    assert.equal(
      waterState(400, pressure, 70),
      "Supercritical conditions possible",
    );
  }
  assert.equal(waterState(400, 90, 70), "Vapor favored");
  assert.equal(waterState(10000, 1, 70), "Vapor favored");
  assert.equal(waterState(20, 0.00612, 70), "Water phase outside model range");
  assert.equal(waterState(20, 0.01, 70), "Vapor favored");
  assert.equal(waterState(100, 2, 70), "Liquid water plausible");
  assert.equal(waterState(360, 90, 70), "Vapor favored");
});

test("offline quality checklist is opt-in and leaves every verdict unreviewed", async () => {
  const { imageQualityReview } =
    await import("../scripts/image-quality-review.js");
  assert.equal(imageQualityReview({ params: DEFAULTS }), null);
  const review = imageQualityReview({ params: DEFAULTS }, { enabled: true });
  assert.equal(review.checks.length, 6);
  assert.ok(review.checks.every((check) => check.verdict === "unreviewed"));
});

test("wet land layouts favor broad interiors instead of elongated continent recipes", () => {
  for (let tilt = 0; tilt <= 90; tilt++) {
    const p = { ...DEFAULTS, tilt },
      geography = geographySpec(p, calculate(p));
    assert.match(
      geography,
      /comparable length and width, substantial interiors/,
    );
    assert.doesNotMatch(
      geography,
      /horseshoe plateau|interlocking crescent|necklace of six|elongated offshore|two long arms|spiral basin/,
    );
  }
});
test("regional anchors repeat and respect all eight fixture environments", () => {
  for (const changes of Object.values(fixtures)) {
    const p = { ...DEFAULTS, ...changes },
      f = calculate(p),
      spec = visualSpec(p, f);
    assert.equal(
      spec.surfaceSite,
      visualSpec({ ...p, biosphere: "none" }, f).surfaceSite,
    );
    for (const view of ["orbital", "surface"])
      assert.ok(imagePrompt(p, f, view).includes(spec.surfaceSite));
    assert.match(
      imagePrompt(p, f, "surface"),
      /Render only this local setting/,
    );
  }
  const site = (changes) => {
    const p = { ...DEFAULTS, ...changes };
    return visualSpec(p, calculate(p)).surfaceSite;
  };
  assert.match(site({}), /shore of the largest compact landmass/);
  assert.match(site({ water: 90 }), /one small compact island/);
  assert.match(site({ water: 100 }), /no islands/);
  assert.match(site(fixtures.gas), /no solid ground/);
  assert.match(site(fixtures.glacial), /ice-basin margin/);
  assert.match(site(fixtures.airless), /dry basin/);
});
