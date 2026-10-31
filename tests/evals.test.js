import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, calculate, createReport } from "../lib/planet.js";
import {
  checkNarrative,
  hedgesPerSentence,
  assertedMatches,
  wilson,
} from "../lib/narrative-checks.js";
import { sampleWorlds, report } from "../scripts/eval-narratives.js";

const sample = (changes, description, surfaceFeatures = "Bare rock.") => {
  const params = { ...DEFAULTS, ...changes };
  return {
    params,
    physics: calculate(params),
    narrative: { description, surfaceFeatures },
  };
};
const failed = (s) =>
  checkNarrative(s)
    .filter((r) => !r.pass)
    .map((r) => r.id);
const airless = {
  atmosphere: "none (airless body)",
  pressureBar: 0,
  water: 0,
  biosphere: "none",
};

test("contradictions with the data panel are caught", () => {
  assert.deepEqual(
    failed(sample(airless, "Thin haze drifts over the basalt plains.")),
    ["airless-sky"],
  );
  assert.deepEqual(
    failed(
      sample(
        { starType: "M-type (red dwarf)", biosphere: "none" },
        "A white sun climbs over the ridge.",
      ),
    ),
    ["star-colour"],
  );
  const lockedParams = {
    ...DEFAULTS,
    biosphere: "none",
    rotationHours: calculate(DEFAULTS).yearDays * 24,
  };
  assert.deepEqual(
    failed(sample(lockedParams, "Each sunset paints the cliffs copper.")),
    ["synchronous-day"],
  );
  assert.deepEqual(
    failed(
      sample(
        { orbital: "outer edge (very cold)", biosphere: "none" },
        "Waves break against the ice shelf.",
      ),
    ),
    ["ice-not-liquid"],
  );
  assert.deepEqual(
    failed(sample(airless, "Lichens cling to the crater rim.")),
    ["no-uninvited-life"],
  );
  assert.deepEqual(
    failed(sample({ biosphere: "none" }, "Sensors detected a methane plume.")),
    ["no-acquisition-claims"],
  );
  assert.deepEqual(
    failed(sample({ biosphere: "none" }, "Two moons hang over the bay.")),
    ["no-unlisted-moons"],
  );
  assert.deepEqual(
    failed(sample({ biosphere: "none" }, "Noon reaches 40 °C on the plain.")),
    ["temperatures-grounded"],
  );
});

test("negated mentions are not contradictions", () => {
  assert.deepEqual(
    failed(
      sample(
        airless,
        "No haze softens the horizon. Without wind, dust stays where it fell.",
      ),
    ),
    [],
  );
  assert.deepEqual(
    assertedMatches(
      "There are no plants, but ferns of frost.",
      /ferns?|plants?/g,
    ),
    [],
  );
});

test("hedging and closing disclaimers are measured; the previous Boreal note fails the hedge check", () => {
  // The Boreal reference note as committed in 8e195ba, before this rewrite.
  const previous =
    "At 1.4 times Earth’s distance from a Sun-like star, Boreal receives roughly half the sunlight that reaches Earth. The model estimates a mean temperature near −25°C: its generous water inventory favors ice, not an open ocean. An imagined journey to the surface depicts blue glacier walls, wind-scoured snow and charcoal rock warmed to ochre by the light. The scenery is an artistic interpretation of the cold model, not a measured landscape; local weather and exact landforms are not calculated. No biosphere is assumed.";
  assert.equal(hedgesPerSentence(previous), 1);
  const result = failed(
    sample(
      { orbital: "outer habitable zone", water: 85, biosphere: "none" },
      previous.replace("−25°C", "−43 °C"),
    ),
  );
  assert.ok(result.includes("hedges-per-sentence<=0.5"));
  assert.equal(
    failed(
      sample(
        { biosphere: "none" },
        "Pale cliffs fall to the sea. These landforms are artistic choices, not evidence of geology.",
      ),
    ).includes("no-closing-disclaimer"),
    true,
  );
});

test("Wilson intervals bound small samples honestly", () => {
  const [low, high] = wilson(0, 3);
  assert.equal(low, 0);
  assert.ok(high > 0.5 && high < 0.6);
  const [l2, h2] = wilson(5, 100);
  assert.ok(l2 < 0.05 && h2 > 0.05);
});

test("sampled worlds are valid, repeatable and cover every atmosphere", () => {
  const worlds = sampleWorlds(24, 7);
  assert.deepEqual(worlds, sampleWorlds(24, 7));
  for (const params of worlds) createReport({ params });
  assert.equal(new Set(worlds.map((w) => w.atmosphere)).size, 6);
  assert.ok(worlds.some((w) => calculate(w).solarDayHours == null));
});

test("the report renders a table for replayed records", () => {
  const text = report([
    {
      params: DEFAULTS,
      promptVersion: "test",
      narrative: { description: "Mild seas.", surfaceFeatures: "Seas." },
    },
    { params: DEFAULTS, promptVersion: "test", error: "timeout" },
  ]);
  assert.match(text, /2 notes · 1 unusable responses/);
  assert.match(text, /\| airless-sky \| 0 \| 0 \|/);
});
