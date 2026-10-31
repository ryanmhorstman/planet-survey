import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  calculate,
  validateParams,
  visualSpec,
  imagePrompt,
  imageViews,
  civilizationSpec,
  sampleReport,
} from "../lib/planet.js";
import { createCartographyRecord } from "../lib/cartography-record.js";
import { paramsFromSeed, seedQuery } from "../lib/seed.js";
import { checkNarrative } from "../lib/narrative-checks.js";
import { earthComparison } from "../lib/visitor.js";
import { fieldNoteFacts } from "../lib/prompts.js";

/** @param {object} changes */
const world = (changes) => {
  const p = validateParams({ ...DEFAULTS, ...changes });
  return /** @type {const} */ ([p, calculate(p)]);
};

test("a civilization is art direction: physics, scores, geography and the globe ignore it", () => {
  const [plain, f] = world({});
  const [built, g] = world({ civilization: "global" });
  assert.equal(
    validateParams({ ...DEFAULTS, civilization: undefined }).civilization,
    "none",
  );
  assert.throws(() => validateParams({ ...DEFAULTS, civilization: "empire" }));
  assert.deepEqual(g, f);
  assert.equal(
    visualSpec(built, g).surfaceSite,
    visualSpec(plain, f).surfaceSite,
  );
  assert.equal(visualSpec(built, g).geography, visualSpec(plain, f).geography);
  assert.deepEqual(
    createCartographyRecord(built, g),
    createCartographyRecord(plain, f),
  );
  assert.equal(civilizationSpec(plain, f), null);
});

test("gravity, air, ice, oceans and a fixed star shape how and where it builds", () => {
  const form = (changes) => {
    const [p, f] = world({ civilization: "cities", ...changes });
    return civilizationSpec(p, f);
  };
  assert.match(
    form({ massEarth: 0.1, radiusEarth: 0.5 }).form,
    /tall, slender towers/,
  );
  assert.match(
    form({ massEarth: 6, radiusEarth: 1.3 }).form,
    /low, broad, squat/,
  );
  assert.match(form({ water: 100 }).form, /floating rafts and platforms/);
  assert.match(
    form({ orbital: "outer edge (very cold)" }).form,
    /carved into the ice/,
  );
  assert.match(
    form({ atmosphere: "none (airless body)", pressureBar: 0, water: 0 }).form,
    /sealed, domed .* against the vacuum/,
  );
  assert.match(
    form({ atmosphere: "thick CO2 (Venus-like)", pressureBar: 90 }).form,
    /sealed, domed .* against the air/,
  );
  assert.match(
    form({ atmosphere: "hydrogen-helium envelope", pressureBar: 10, water: 0 })
      .form,
    /hot-hydrogen balloons/,
  );
  const tether = sampleReport("tether");
  const locked = civilizationSpec(
    { ...tether.params, civilization: "cities" },
    tether.physics,
  );
  assert.match(locked.summary, /twilight band/);
  assert.match(locked.orbital, /day–night terminator/);
});

test("each view shows the civilization its own way, and lifts only the bans it needs", () => {
  const [p, f] = world({ civilization: "cities", biosphere: "alien" });
  const surface = imagePrompt(p, f, "surface");
  assert.match(surface, /Imagined civilization: a city of terraced buildings/);
  assert.match(surface, /No visible inhabitants, vehicles, signs or text/);
  assert.doesNotMatch(surface, /settlements/);
  assert.match(
    imagePrompt(p, f, "orbital"),
    /clusters of warm lights on any night side/,
  );
  const night = imagePrompt(p, f, "night");
  assert.match(night, /A city's warm glow lights the horizon/);
  assert.doesNotMatch(night, /city lights or|lights on the land/);
  assert.match(
    imagePrompt(p, f, "postcard"),
    /the destination itself: a city of/,
  );
  assert.match(
    imagePrompt(p, f, "aftermath"),
    /The empty ruins of the civilization's/,
  );
  // Ruins are dark at night and too small to see from orbit.
  const [r, rf] = world({ civilization: "ruins" });
  assert.match(
    imagePrompt(r, rf, "night"),
    /Dark ruins stand against the stars/,
  );
  assert.match(imagePrompt(r, rf, "night"), /city lights or extra/);
  assert.match(
    imagePrompt(r, rf, "orbital"),
    /far too small to see from orbit/,
  );
  assert.match(imagePrompt(r, rf, "postcard"), /drawn as monumental ruins/);
  // The deep sea and a locked world's dark far side stay untouched.
  assert.equal(
    imagePrompt(p, f, "deep"),
    imagePrompt({ ...p, civilization: "none" }, f, "deep"),
  );
  const tether = sampleReport("tether"),
    lit = { ...tether.params, civilization: "global" };
  assert.match(
    imagePrompt(lit, tether.physics, "night"),
    /No moons, neighboring planets, rings, settlements/,
  );
  // Floating ocean cities are stranded when the sea dries.
  const [o, of] = world({ civilization: "villages", water: 100 });
  assert.ok(imageViews(o, of).includes("aftermath"));
  assert.match(
    imagePrompt(o, of, "aftermath"),
    /now stranded on the dry seabed/,
  );
});

test("Randomize links, field notes and the visitor section carry the civilization", () => {
  const p = paramsFromSeed(42, "alien", "cities");
  assert.equal(p.civilization, "cities");
  assert.equal(paramsFromSeed(42).civilization, "none");
  assert.equal(
    seedQuery({ seed: 42, params: p }),
    "?seed=42&biosphere=alien&civilization=cities",
  );
  assert.equal(seedQuery({ seed: 42, params: paramsFromSeed(42) }), "?seed=42");
  const [c, cf] = world({ civilization: "cities" });
  assert.match(fieldNoteFacts(c, cf, null), /civilization a city of/);
  assert.match(
    fieldNoteFacts(...world({}), null),
    /civilization none; depict no settlements/,
  );
  // Cities in a note are fine only when the world has them.
  const note = (params, physics) =>
    checkNarrative({
      params,
      physics,
      narrative: {
        description: "A city spills down to the bay.",
        surfaceFeatures: "",
        sections: [
          { kind: "imagined", text: "A city spills down to the bay." },
        ],
      },
    }).find((check) => check.id === "no-unsupported-civilization");
  const [plain, pf] = world({});
  assert.equal(note(plain, pf).pass, false);
  assert.equal(note(c, cf).pass, true);
  const locals = (changes) =>
    earthComparison(...world(changes)).find(
      (fact) => fact.label === "The locals",
    );
  assert.equal(locals({}), undefined);
  assert.match(
    locals({ civilization: "cities", massEarth: 6, radiusEarth: 1.3 }).value,
    /mind your head/,
  );
  assert.match(locals({ civilization: "ruins" }).value, /Long gone/);
});
