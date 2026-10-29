import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  calculate,
  localNarrative,
  statTile,
  tidalLockEstimate,
  STARS,
} from "../lib/planet.js";
import { fieldNoteFacts } from "../lib/prompts.js";

// 0.30 M☉ red dwarf, a = 0.104 AU, 22.4-day orbit, 0.61 M⊕ / 0.99 R⊕.
const redDwarf = {
  ...DEFAULTS,
  starType: "M-type (red dwarf)",
  orbital: "inner habitable zone",
  massEarth: 0.61,
  radiusEarth: 0.99,
};

test("the red-dwarf example is tidally locked and has no solar day", () => {
  const f = calculate(redDwarf);
  assert.ok(Math.abs(f.au - 0.104) < 0.001);
  assert.ok(Math.abs(f.yearDays - 22.4) < 0.1);
  assert.equal(f.tidalLock.locked, true);
  assert.ok(f.tidalLock.lockYears < 2e6);
  assert.equal(f.solarDayHours, null);
  assert.deepEqual(statTile("solarDayHours", redDwarf, f), {
    label: "Solar day · estimated",
    value: "Tidally locked · permanent dayside",
    kind: "estimated",
  });
  // From a 12-hour initial spin, the published estimate is about 1–2 Myr.
  const fromTwelveHours = tidalLockEstimate(
    { ...redDwarf, rotationHours: 12 },
    STARS[redDwarf.starType],
    f.au,
  );
  assert.ok(fromTwelveHours.lockYears > 1e6 && fromTwelveHours.lockYears < 2e6);
});

test("a locked world's field note fixes the star and qualifies the mean", () => {
  const f = calculate(redDwarf),
    { sections } = localNarrative(redDwarf, f);
  assert.deepEqual(sections[1], {
    kind: "estimated",
    text: "It keeps one face turned toward its star, so the star hangs fixed in the sky.",
  });
  assert.match(
    sections[0].text,
    /global mean .* warmer dayside and a colder nightside/,
  );
  const facts = fieldNoteFacts(redDwarf, f, null);
  assert.match(facts, /Estimated: .*tidally locked/);
  assert.doesNotMatch(facts, /solar day/);
  assert.match(facts, /initial rotation period 24 h/);
});

test("physics-2 reports keep their free-rotation solar day", () => {
  const f = calculate(redDwarf, null, "physics-2");
  assert.equal(f.tidalLock, null);
  assert.ok(Math.abs(f.solarDayHours - 25.1) < 0.05);
});

test("an Earth analog is not locked and keeps a 24-hour day from its assumed rotation", () => {
  const f = calculate(DEFAULTS);
  assert.equal(f.tidalLock.locked, false);
  assert.ok(f.tidalLock.lockYears > 1e10);
  assert.ok(Math.abs(f.solarDayHours - 24) < 0.1);
  assert.equal(
    statTile("solarDayHours", DEFAULTS, f).label,
    "Solar day · assumed",
  );
  const day = localNarrative(DEFAULTS, f).sections[1];
  assert.equal(day.kind, "assumed");
  assert.match(
    day.text,
    /assumed 24-hour rotation gives a solar day of 24.1 hours/,
  );
  assert.match(
    fieldNoteFacts(DEFAULTS, f, null),
    /Assumed: .*rotation period 24 h;.*solar day 24\.1 h\./,
  );
});

test("a Mercury analog reports as locked", () => {
  // Mercury is in a 3:2 spin-orbit resonance, not synchronous. The model has
  // no eccentricity, so it cannot find the resonance and reports a lock; the
  // lock time (about 0.5 Gyr) sits within a factor of two of the 1 Gyr age.
  const mercury = {
    ...DEFAULTS,
    atmosphere: "none (airless body)",
    pressureBar: 0,
    water: 0,
    massEarth: 0.0553,
    radiusEarth: 0.383,
    rotationHours: 12,
  };
  const f = calculate(mercury, {
    pl_name: "Mercury analog",
    pl_orbsmax: 0.387,
    st_mass: 1,
    st_rad: 1,
    st_lum: 0,
    pl_bmasse: 0.0553,
    pl_rade: 0.383,
  });
  assert.ok(Math.abs(f.yearDays - 88) < 0.5);
  assert.equal(f.tidalLock.locked, true);
  assert.ok(f.tidalLock.lockYears > 2e8 && f.tidalLock.lockYears < 1e9);
});

test("a low bulk density for an Earth-size world gets a soft note", () => {
  const f = calculate(redDwarf);
  assert.ok(f.density < 4.5);
  assert.equal(
    f.densityNote,
    "implies a small iron core or a volatile-rich interior",
  );
  assert.ok(f.warnings.some((w) => w.includes("small iron core")));
  assert.match(fieldNoteFacts(redDwarf, f, null), /low for its size/);
  assert.equal(calculate(DEFAULTS).densityNote, null);
});
