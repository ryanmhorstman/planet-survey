import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  calculate,
  localNarrative,
  quantityKind,
  statTile,
  effectiveTemperature,
  habitableZone,
  STARS,
  STAR_ACTIVITY_CAVEAT,
  DARK_PIGMENT_NOTE,
  biosphereSpec,
} from "../lib/planet.js";
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

test("test world: locked, tilt damped, cool star, nightside holds, no moons", () => {
  const f = calculate(redDwarf),
    facts = fieldNoteFacts(redDwarf, f, null);
  assert.equal(f.tidalLock.locked, true);
  assert.equal(f.tiltDeg, 0);
  assert.equal(quantityKind("tilt", f), "imagined");
  assert.equal(quantityKind("tiltDeg", f), "estimated");
  assert.match(facts, /Estimated: .*axial tilt about 0°, damped by tides/);
  assert.doesNotMatch(facts, /Assumed: .*axial tilt/);
  assert.ok(!f.warnings.some((w) => /season/i.test(w)));
  assert.ok(f.star.teffK > 3450 && f.star.teffK < 3500);
  assert.match(facts, /star's effective temperature 3,488 K/);
  assert.deepEqual(f.nightside, { thresholdBar: 0.1, collapses: false });
  assert.match(facts, /nightside: at 1 bar the atmosphere carries enough heat/);
  assert.match(
    localNarrative(redDwarf, f).sections[0].text,
    /keep the nightside from freezing out/,
  );
  assert.equal(f.moons.possible, false);
  assert.match(
    facts,
    /moons: its locked spin means tides would drag any moon inward/,
  );
  // The red-dwarf "inner habitable zone" preset is sunward of Kopparapu's conservative edge.
  assert.equal(
    f.habitableZone.region,
    "in the optimistic zone, sunward of the conservative inner edge",
  );
  // Labels stay consistent with Phase 1's registry.
  assert.equal(
    statTile("solarDayHours", redDwarf, f).kind,
    quantityKind("solarDayHours", f),
  );
});

test("Earth analog: not locked, keeps its tilt, sits inside the conservative zone", () => {
  const f = calculate(DEFAULTS),
    facts = fieldNoteFacts(DEFAULTS, f, null);
  assert.equal(f.tidalLock.locked, false);
  assert.equal(f.tiltDeg, 23);
  assert.equal(quantityKind("tilt", f), "assumed");
  assert.match(facts, /Assumed: .*axial tilt 23°/);
  assert.equal(f.nightside, null);
  assert.equal(Math.round(f.star.teffK), 5772);
  assert.equal(f.habitableZone.region, "inside the conservative zone");
  // Kopparapu et al. 2014 give 0.95–1.67 AU for the Sun.
  assert.ok(Math.abs(f.habitableZone.conservative[0] - 0.95) < 0.01);
  assert.ok(Math.abs(f.habitableZone.conservative[1] - 1.67) < 0.01);
  assert.match(facts, /7% of the way from its inner to its outer edge/);
  assert.equal(f.moons.possible, true);
});

test("a locked world at 0.05 bar collapses on its nightside and scores lower", () => {
  const thin = { ...redDwarf, pressureBar: 0.05 },
    f = calculate(thin),
    thick = calculate(redDwarf);
  assert.equal(f.nightside.collapses, true);
  assert.ok(f.warnings.some((w) => w.includes("Joshi et al. 1997")));
  for (const name of ["Exposed liquid water", "Pressure assumption"])
    assert.equal(f.factors.find((x) => x.name === name).points, 0);
  assert.ok(f.score < thick.score);
  assert.match(
    fieldNoteFacts(thin, f, null),
    /below the 0.1 bar collapse threshold/,
  );
  assert.match(
    localNarrative(thin, f).sections[0].text,
    /freeze out on the nightside/,
  );
});

test("a world too close to its star cannot hold a moon", () => {
  // Hill radius shrinks with distance; at 0.01 AU from a red dwarf half of it
  // falls inside the Roche limit.
  const f = calculate(
    { ...DEFAULTS, starType: "M-type (red dwarf)", rotationHours: 1e6 },
    { pl_name: "Close b", pl_orbsmax: 0.01, pl_bmasse: 1, pl_rade: 1 },
  );
  assert.ok(f.moons.stablePlanetRadii < f.moons.rochePlanetRadii);
  assert.equal(f.moons.reason, "too close to its star to hold a moon");
});

test("T_eff scales from the Sun, and the zone is null outside the fit range", () => {
  assert.equal(
    Math.round(effectiveTemperature(STARS["G-type (Sun-like)"])),
    5772,
  );
  assert.equal(habitableZone(2000, 0.001, 0.03), null);
  assert.equal(calculate(redDwarf, null, "physics-2").habitableZone, null);
});

test("a red-dwarf world shows the star-activity caveat without changing its score", () => {
  const f = calculate(redDwarf);
  assert.equal(f.activityCaveat, STAR_ACTIVITY_CAVEAT);
  assert.equal(
    f.score,
    f.factors.reduce((sum, factor) => sum + factor.points, 0),
  );
  assert.equal(
    worldSummary(redDwarf, null).star_activity_caveat,
    STAR_ACTIVITY_CAVEAT,
  );
  assert.equal(calculate(DEFAULTS).activityCaveat, null);
});

test("red-dwarf vegetation carries the imagined dark-pigment clause", () => {
  const f = calculate(redDwarf),
    vegetation = localNarrative(redDwarf, f).sections.at(-1);
  assert.equal(biosphereSpec(redDwarf, f).pigmentNote, DARK_PIGMENT_NOTE);
  assert.equal(vegetation.kind, "imagined");
  assert.ok(vegetation.text.endsWith(DARK_PIGMENT_NOTE));
  assert.match(fieldNoteFacts(redDwarf, f, null), /Kiang et al\. 2007/);
  assert.equal(biosphereSpec(DEFAULTS, calculate(DEFAULTS)).pigmentNote, null);
  const barren = { ...redDwarf, biosphere: "none" };
  assert.doesNotMatch(fieldNoteFacts(barren, calculate(barren), null), /Kiang/);
});
