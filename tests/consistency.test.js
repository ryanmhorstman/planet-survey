import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  calculate,
  localNarrative,
  statTile,
  quantityKind,
  formatQuantity,
  surfaceWater,
  imagePrompt,
} from "../lib/planet.js";
import { createGeography } from "../lib/geography.js";
import { fieldNoteFacts } from "../lib/prompts.js";
import { worldSummary } from "../lib/agent-tools.js";

// 0.30 M☉ red dwarf, L 0.012, R★ 0.30, a = 0.104 AU; 0.61 M⊕ / 0.99 R⊕, 1 bar.
const redDwarf = {
  ...DEFAULTS,
  starType: "M-type (red dwarf)",
  orbital: "inner habitable zone",
  massEarth: 0.61,
  radiusEarth: 0.99,
  water: 36,
};
const worlds = { redDwarf, earth: DEFAULTS };
const NUMERIC_TILES = /** @type {const} */ ([
  ["gravityG", "g"],
  ["escapeKms", "km/s"],
  ["yearDays", "Earth days"],
  ["density", "g/cm³"],
]);
/** @param {string} facts @param {string} kind */
const factLine = (facts, kind) =>
  facts
    .split("\n")
    .find((line) =>
      line.startsWith(kind.charAt(0).toUpperCase() + kind.slice(1) + ":"),
    ) ?? "";

for (const [name, p] of Object.entries(worlds)) {
  test(`${name}: every tile value sits on the fact-sheet line with the tile's tag`, () => {
    const f = calculate(p),
      facts = fieldNoteFacts(p, f, null);
    for (const [key, unit] of NUMERIC_TILES) {
      const tile = statTile(key, p, f);
      assert.match(tile.label, new RegExp(`· ${tile.kind}\\b`));
      assert.ok(
        factLine(facts, tile.kind).includes(
          `${formatQuantity(key, f[key])} ${unit}`,
        ),
        `${key} ${tile.value} not on the ${tile.kind} line`,
      );
    }
    const temperature = statTile("temperatureC", p, f);
    assert.equal(temperature.kind, "estimated");
    assert.ok(
      factLine(facts, "estimated").includes(
        `${formatQuantity("temperatureC", f.temperatureC)} °C`,
      ),
    );
  });

  test(`${name}: the model field note tags match the tiles`, () => {
    const f = calculate(p),
      [climate, day] = localNarrative(p, f).sections;
    assert.equal(climate.kind, statTile("temperatureC", p, f).kind);
    assert.equal(day.kind, statTile("solarDayHours", p, f).kind);
  });
}

test("the orbital period is calculated from Kepler's law, and a NASA period names its source", () => {
  const f = calculate(redDwarf);
  assert.equal(
    statTile("yearDays", redDwarf, f).label,
    "Orbital period · calculated",
  );
  assert.match(
    factLine(fieldNoteFacts(redDwarf, f, null), "calculated"),
    /year 22\.4 Earth days \(Kepler's third law\)/,
  );
  const catalog = {
    pl_name: "Test b",
    hostname: "Test",
    pl_orbper: 22.4,
    pl_bmasse: 0.61,
    pl_rade: 0.99,
  };
  const g = calculate(redDwarf, catalog);
  assert.equal(
    statTile("yearDays", redDwarf, g, catalog).label,
    "Orbital period · calculated · NASA catalogue",
  );
});

test("one precision per quantity across tiles, fact sheet, note and agent", () => {
  const f = calculate(redDwarf);
  assert.ok(Math.abs(f.escapeKms - 8.78) < 0.01);
  assert.equal(statTile("escapeKms", redDwarf, f).value, "8.8 km/s");
  assert.match(fieldNoteFacts(redDwarf, f, null), /escape velocity 8\.8 km\/s/);
  const summary = worldSummary(redDwarf, null);
  assert.equal(summary.escape_km_s, 8.8);
  assert.equal(
    summary.gravity_g,
    Number(formatQuantity("gravityG", f.gravityG)),
  );
  assert.equal(formatQuantity("temperatureC", -0.4), "0");
  const earth = calculate(DEFAULTS);
  assert.match(
    localNarrative(DEFAULTS, earth).sections[1].text,
    /solar day of 24\.1 hours/,
  );
  assert.equal(
    statTile("solarDayHours", DEFAULTS, earth).value,
    "24.1 Earth hours",
  );
});

test("water is reported as a share of the surface, the same figure the globe and prompts use", () => {
  const f = calculate(redDwarf),
    water = surfaceWater(redDwarf, f);
  assert.deepEqual(water, {
    percent: 36,
    form: "liquid water",
    text: "liquid water covers 36% of the surface",
  });
  assert.equal(createGeography(redDwarf, f, 64).coverage, 36);
  const facts = fieldNoteFacts(redDwarf, f, null);
  assert.doesNotMatch(facts, /basins/);
  assert.match(facts, /water enough to cover 36% of the surface/);
  assert.match(facts, /liquid water covers 36% of the surface/);
  assert.match(
    imagePrompt(redDwarf, f, "orbital"),
    /liquid water covers 36% of the surface/,
  );
  const frozen = { ...redDwarf, orbital: "outer edge (very cold)" },
    g = calculate(frozen);
  assert.equal(surfaceWater(frozen, g).text, "ice covers 36% of the surface");
  const airless = {
    ...redDwarf,
    atmosphere: "none (airless body)",
    pressureBar: 0,
    water: 0,
  };
  assert.equal(
    surfaceWater(airless, calculate(airless)).text,
    "no standing water at the surface",
  );
});

test("free rotation is assumed; a tidal lock is estimated", () => {
  assert.equal(quantityKind("solarDayHours", calculate(DEFAULTS)), "assumed");
  assert.equal(quantityKind("solarDayHours", calculate(redDwarf)), "estimated");
});
