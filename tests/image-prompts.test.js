import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  calculate,
  geographySpec,
  visualSpec,
  imagePrompt,
  waterState,
  starAppearance,
} from "../lib/planet.js";
import { fieldNoteRequest, FIELD_NOTE_SYSTEM } from "../lib/prompts.js";
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
          /(Tidally locked|Synchronous rotation \(assumed\)).*stands still in the sky/,
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
  const catalog = {
    pl_name: "Example b",
    hostname: "Example",
    pl_eqt: 260,
  };
  const request = fieldNoteRequest(
      DEFAULTS,
      calculate(DEFAULTS, catalog),
      catalog,
    ),
    facts = request.messages[0].content;
  assert.equal(request.system[0].text, FIELD_NOTE_SYSTEM);
  assert.deepEqual(request.system[0].cache_control, { type: "ephemeral" });
  assert.equal(request.output_config.format.type, "json_schema");
  assert.match(FIELD_NOTE_SYSTEM, /Never write "detected", "observed"/);
  assert.match(FIELD_NOTE_SYSTEM, /NASA Exoplanet Archive/);
  // Curated reference notes are the few-shot examples.
  for (const world of ["boreal", "cinder", "viridia"])
    assert.ok(FIELD_NOTE_SYSTEM.includes(`<example world="${world}">`));
  assert.match(facts, /World: Example b, a confirmed exoplanet/);
  assert.match(facts, /equilibrium temperature 260 K \(archive estimate\)/);
  // The fact sheet carries no hedged art-direction prose or raw model JSON.
  assert.doesNotMatch(facts, /not inferred biology|"warnings"/);
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
test("star colour, size and sky follow T_eff; a locked world gets a terminator and a fixed star", () => {
  const redDwarf = {
      ...DEFAULTS,
      starType: "M-type (red dwarf)",
      orbital: "inner habitable zone",
      massEarth: 0.61,
      radiusEarth: 0.99,
      water: 36,
    },
    f = calculate(redDwarf),
    star = starAppearance(redDwarf, f),
    surface = imagePrompt(redDwarf, f, "surface"),
    orbital = imagePrompt(redDwarf, f, "orbital");
  assert.equal(star.colour, "orange");
  assert.match(surface, /pale peach near the star/);
  assert.match(surface, /orange illumination from a 3,488 K star/);
  assert.match(
    surface,
    /The star hangs fixed \d+° above the horizon as a large orange disc 2\.9× the Sun's apparent width, about 13% as bright per unit area as the Sun, so you could almost look at it; it never rises or sets/,
  );
  assert.match(surface, /No second star/);
  assert.match(orbital, /sharp day–night terminator/);
  assert.match(orbital, /No stellar disk/);
  assert.match(surface, /Tidally locked: one hemisphere always faces the star/);
  assert.match(surface, /Kiang et al\. 2007/);
  assert.equal(
    visualSpec(redDwarf, f).starElevationDeg,
    visualSpec(redDwarf, calculate(redDwarf)).starElevationDeg,
  );
  // The fact sheet and the agent quote the same colour.
  assert.match(
    fieldNoteRequest(redDwarf, f, null).messages[0].content,
    /Starlight: orange; the star looks 2\.9× as wide as the Sun from Earth\./,
  );

  const earth = calculate(DEFAULTS),
    earthSurface = imagePrompt(DEFAULTS, earth, "surface");
  assert.match(earthSurface, /a blue sky, from Rayleigh scattering/);
  assert.match(
    earthSurface,
    /If the star is in frame, draw it as a warm white disc about the Sun's apparent width\./,
  );
  assert.doesNotMatch(earthSurface, /could almost look at it|hangs fixed/);
  assert.doesNotMatch(imagePrompt(DEFAULTS, earth, "orbital"), /terminator/);

  const binary = { ...DEFAULTS, starType: "binary star system" };
  assert.match(
    imagePrompt(binary, calculate(binary), "surface"),
    /No stellar disk/,
  );
});

test("a hot, thick-atmosphere world is drawn dry and fully overcast, without blue water", () => {
  const venus = {
      ...DEFAULTS,
      atmosphere: "thick CO2 (Venus-like)",
      pressureBar: 90,
      water: 43,
    },
    physics = calculate(venus);
  assert.equal(physics.waterState, "Vapor favored");
  for (const view of /** @type {const} */ (["orbital", "surface"])) {
    const prompt = imagePrompt(venus, physics, view);
    assert.doesNotMatch(prompt, /deep blue/);
    assert.match(prompt, /no blue sky, cloud gaps or light shafts/);
    assert.match(
      prompt,
      /no open liquid-water seas, rain, puddles or wet sheen/,
    );
  }
  // Open water is still blue when the oceans are liquid.
  assert.match(visualSpec(DEFAULTS, calculate(DEFAULTS)).palette, /deep blue/);
});
