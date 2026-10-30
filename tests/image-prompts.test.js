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
  giantClouds,
  imageViews,
  viewLabel,
  postcardTagline,
  aftermathFate,
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
  for (const world of ["boreal", "cinder", "viridia", "tether", "kiln", "gyre"])
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
  assert.match(site({ water: 100 }), /no islands/);
  assert.match(site(fixtures.gas), /no solid ground/);
  assert.match(site(fixtures.glacial), /ice|glacier/);
  assert.match(site(fixtures.airless), /no open liquid seas/);
});
test("surface scenes vary between worlds and fit each world's land, water and gravity", () => {
  const scenes = new Map();
  for (const water of [10, 30, 50, 70, 90])
    for (const massEarth of [0.3, 0.6, 1, 1.6, 2.5, 4])
      for (const tilt of [5, 23, 40]) {
        const p = { ...DEFAULTS, water, massEarth, tilt },
          f = calculate(p),
          site = visualSpec(p, f).surfaceSite;
        const kind = /shore of/.test(site)
          ? "shore"
          : /sea-cliff/.test(site)
            ? "islands"
            : /escarpment/.test(site)
              ? "valley"
              : /canyon/.test(site)
                ? "canyon"
                : /mountain ridge/.test(site)
                  ? "mountains"
                  : /delta/.test(site)
                    ? "delta"
                    : assert.fail(site);
        scenes.set(kind, (scenes.get(kind) ?? 0) + 1);
        // Island views need water to look down on; canyons and ranges need land.
        if (kind === "islands") assert.ok(water >= 40);
        if (["canyon", "mountains"].includes(kind)) assert.ok(water <= 70);
        if (kind === "mountains")
          assert.match(
            site,
            f.gravityG < 0.7
              ? /tall, steep, jagged/
              : f.gravityG > 1.5
                ? /low, broad, rounded/
                : /rugged/,
          );
      }
  assert.equal(scenes.size, 6, JSON.stringify([...scenes]));
  const shares = [...scenes.values()].map((n) => n / 90);
  assert.ok(Math.max(...shares) < 0.35, JSON.stringify([...scenes]));
  // An airless world has no wind to build dunes.
  for (const massEarth of [0.05, 0.1, 0.2, 0.3, 0.5, 0.8]) {
    const p = { ...DEFAULTS, ...fixtures.airless, massEarth };
    assert.doesNotMatch(visualSpec(p, calculate(p)).surfaceSite, /dunes/);
  }
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
    /If the star is in frame, draw it as a warm white disc about the Sun's apparent width: still small in the sky, and too bright to look at\./,
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

test("a giant planet is banded, sized and coloured by its cloud chemistry", () => {
  const giant = {
      ...DEFAULTS,
      orbital: "outer habitable zone",
      atmosphere: "hydrogen-helium envelope",
      pressureBar: 10,
      water: 0,
      massEarth: 95,
      radiusEarth: 9,
      biosphere: "none",
    },
    physics = calculate(giant),
    orbital = imagePrompt(giant, physics, "orbital"),
    surface = imagePrompt(giant, physics, "surface");
  assert.match(
    orbital,
    /darker belts running straight and parallel to the equator/,
  );
  assert.match(orbital, /bright water-ice and water cloud decks/);
  assert.match(
    surface,
    /planet 9× Earth's width, at a scale far beyond Earth weather/,
  );
  assert.match(surface, /must not read as Earth clouds seen from an airliner/);
  // Sudarsky et al. 2000: ammonia, water, clear, alkali-dark, silicate.
  assert.deepEqual(
    [120, 200, 600, 1000, 1600].map((k) => giantClouds(k).palette),
    [
      "cream, tan and rust-brown",
      "bright white and slate blue",
      "deep azure with sparse thin haze",
      "dark blue-grey and charcoal",
      "grey-white with a dull red glow",
    ],
  );
  // A hot Jupiter from the archive takes its colour from pl_eqt.
  const hot = calculate(giant, {
    pl_name: "Example b",
    hostname: "Example",
    pl_eqt: 1500,
  });
  assert.match(visualSpec(giant, hot).terrain, /silicate cloud decks/);
});

test("deep-sea and night-sky views are offered only where they make sense", () => {
  const views = (changes) => {
    const p = { ...DEFAULTS, ...changes };
    return imageViews(p, calculate(p));
  };
  assert.deepEqual(views({}), [
    "orbital",
    "surface",
    "deep",
    "night",
    "postcard",
    "aftermath",
  ]);
  // Ice-covered oceans keep a dark sea beneath them; airless skies are clear.
  assert.ok(views(fixtures.glacial).includes("deep"));
  assert.deepEqual(views(fixtures.airless), [
    "orbital",
    "surface",
    "night",
    "postcard",
  ]);
  assert.deepEqual(views(fixtures.gas), [
    "orbital",
    "surface",
    "night",
    "postcard",
  ]);
  // A Venus-like overcast hides the stars and boils the oceans.
  assert.deepEqual(views(fixtures.venus), ["orbital", "surface", "postcard"]);
  const venus = { ...DEFAULTS, ...fixtures.venus };
  assert.throws(() => imagePrompt(venus, calculate(venus), "night"), {
    message: /too hazy to see the stars/,
  });
  assert.throws(() => imagePrompt(venus, calculate(venus), "deep"), {
    message: /no ocean/,
  });
  assert.throws(() => imagePrompt(DEFAULTS, calculate(DEFAULTS), "moon"));
  const giant = { ...DEFAULTS, ...fixtures.gas };
  assert.deepEqual(
    ["orbital", "surface", "deep", "night"].map((view) =>
      viewLabel(giant, calculate(giant), view),
    ),
    ["Orbital", "Cloud deck", "Deep sea", "Night sky"],
  );
});
test("the deep sea shows vents in the dark, with life only as the biosphere setting allows", () => {
  const prompt = (changes) => {
    const p = { ...DEFAULTS, ...changes };
    return imagePrompt(p, calculate(p), "deep");
  };
  const temperate = prompt({});
  assert.match(temperate, /hydrothermal vent field/);
  assert.match(temperate, /No sky, no water surface and no star are visible/);
  assert.match(temperate, /recognizable as vent life/);
  assert.doesNotMatch(temperate, /No animals/);
  // Vent life feeds on chemistry, so it can be imagined under ice where the
  // surface shows none.
  const glacial = prompt({ ...fixtures.glacial, biosphere: "alien" });
  assert.match(glacial, /sealed beneath a thick ice shell/);
  assert.match(glacial, /ALIEN morphology is essential/);
  const bare = prompt({ biosphere: "none" });
  assert.match(bare, /The vents are bare/);
  assert.match(bare, /No animals/);
  assert.doesNotMatch(bare, /bioluminescence/);
});
test("the night sky follows the air, and a locked world's night is its far side", () => {
  const prompt = (changes) => {
    const p = { ...DEFAULTS, ...changes };
    return imagePrompt(p, calculate(p), "night");
  };
  const temperate = prompt({});
  assert.match(temperate, /no recognizable Earth constellations/);
  assert.match(temperate, /The star is below the horizon/);
  assert.match(temperate, /No moons.*No stellar disk/);
  assert.match(temperate, /Silhouettes of the imagined vegetation/);
  assert.match(prompt(fixtures.airless), /sharp, unflickering stars/);
  assert.match(prompt(fixtures.gas), /lightning flashing deep inside it/);
  const locked = prompt(fixtures.locked);
  assert.match(locked, /permanent nightside: the star never rises/);
  assert.match(locked, /permanently dark far hemisphere/);
  assert.match(locked, /No plants grow on the permanent nightside/);
  assert.doesNotMatch(locked, /Silhouettes of the imagined vegetation/);
});
test("rotating worlds get a repeatable time of day; locked and overcast ones do not", () => {
  const spec = (changes) => {
    const p = { ...DEFAULTS, ...changes };
    return visualSpec(p, calculate(p));
  };
  const times = new Set();
  for (const water of [10, 30, 50, 70, 90])
    for (const massEarth of [0.5, 1, 2]) {
      const s = spec({ water, massEarth });
      times.add(s.timeOfDay);
      assert.equal(s.timeOfDay, spec({ water, massEarth }).timeOfDay);
    }
  assert.ok(times.size >= 3, [...times].join(" | "));
  const p = { ...DEFAULTS, water: 50 },
    f = calculate(p);
  assert.ok(imagePrompt(p, f, "surface").includes(visualSpec(p, f).timeOfDay));
  assert.ok(!imagePrompt(p, f, "orbital").includes(visualSpec(p, f).timeOfDay));
  assert.equal(spec(fixtures.locked).timeOfDay, null);
  assert.equal(spec(fixtures.venus).timeOfDay, null);
});
test("cool giants can carry imagined floating life, never hot ones or with no biosphere", () => {
  const giant = {
      ...DEFAULTS,
      ...fixtures.gas,
      orbital: "outer habitable zone",
    },
    f = calculate(giant),
    surface = imagePrompt(giant, f, "surface");
  assert.match(surface, /life floats: enormous translucent gas-bag organisms/);
  assert.doesNotMatch(surface, /spacecraft, animals/);
  assert.match(imagePrompt(giant, f, "orbital"), /spacecraft, animals/);
  assert.match(imagePrompt(giant, f, "night"), /floating gas-bag organisms/);
  const alien = { ...giant, biosphere: "alien" };
  assert.match(
    imagePrompt(alien, calculate(alien), "surface"),
    /no resemblance to Earth jellyfish/,
  );
  const none = { ...giant, biosphere: "none" };
  assert.equal(visualSpec(none, calculate(none)).floaters, false);
  const hot = calculate(giant, {
    pl_name: "Example b",
    hostname: "Example",
    pl_eqt: 1500,
  });
  assert.equal(visualSpec(giant, hot).floaters, false);
});

test("a postcard is a poster with one tagline, and its tourist dresses for the world", () => {
  const card = (changes) => {
    const p = { ...DEFAULTS, ...changes };
    return [
      imagePrompt(p, calculate(p), "postcard"),
      postcardTagline(p, calculate(p)),
    ];
  };
  const [earth, earthLine] = card({});
  assert.match(earth, /vintage travel poster/);
  assert.match(earth, /in ordinary holiday clothes/);
  assert.ok(earth.includes(`The only text is "${earthLine}"`));
  assert.doesNotMatch(earth, /Photorealistic/);
  const [hot, hotLine] = card(fixtures.venus);
  assert.match(hot, /in a spacesuit/);
  assert.equal(hotLine, "THE WARMEST WELCOME IN THE GALAXY");
  assert.equal(card(fixtures.locked)[1], "WHERE THE SUN NEVER SETS");
  assert.equal(card(fixtures.airless)[1], "NO AIR. NO CROWDS.");
  assert.equal(card(fixtures.gas)[1], "RIDE THE STORMS");
  assert.equal(card(fixtures.glacial)[1], "THE GREAT WHITE GETAWAY");
});
test("an aftermath shows the same place after its seas are gone, by the fate its star and size allow", () => {
  const p = { ...DEFAULTS, biosphere: "alien" },
    f = calculate(p),
    after = imagePrompt(p, f, "aftermath");
  assert.ok(after.includes(visualSpec(p, f).surfaceSite));
  assert.match(after, /same local setting as the surface view/);
  assert.match(after, /brightened past the runaway-greenhouse limit/);
  assert.match(after, /bleached, petrified remains/);
  assert.match(after, /No liquid water/);
  assert.equal(aftermathFate(p, f), "boiled");
  // Red dwarfs flare; small worlds cannot hold their air.
  const red = { ...DEFAULTS, starType: "M-type (red dwarf)" },
    small = { ...DEFAULTS, massEarth: 0.1, radiusEarth: 0.5 };
  assert.equal(aftermathFate(red, calculate(red)), "stripped");
  assert.equal(aftermathFate(small, calculate(small)), "stripped");
  assert.match(
    imagePrompt(small, calculate(small), "aftermath"),
    /flares and wind stripped most of the air away/,
  );
  const glacial = { ...DEFAULTS, ...fixtures.glacial };
  assert.throws(() => imagePrompt(glacial, calculate(glacial), "aftermath"), {
    message: /no living seas to lose/,
  });
});
