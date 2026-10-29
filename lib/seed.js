// Seeded worlds: one 32-bit seed reproduces the same parameters, name and
// report on any device, so a permalink needs only the seed.
import {
  STARS,
  ZONES,
  ATMOSPHERES,
  DEFAULTS,
  createReport,
  validateSeed,
} from "./planet.js";

/** Mulberry32: a small, fast, well-distributed 32-bit generator. */
/** @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh random seed. */
export function randomSeed() {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * The same distribution the Randomize button has always used.
 * @param {number} seed
 * @param {"none" | "familiar" | "alien"} [biosphere]
 * @returns {import("./planet.js").Params}
 */
export function paramsFromSeed(seed, biosphere = "familiar") {
  const random = mulberry32(validateSeed(seed));
  /** @template T @param {T[]} values */
  const choose = (values) => values[Math.floor(random() * values.length)];
  const starType = choose(Object.keys(STARS)),
    orbital = choose(Object.keys(ZONES)),
    atmosphere = choose(Object.keys(ATMOSPHERES)),
    mass = Math.round((0.3 + random() * 2.7) * 10) / 10,
    tilt = Math.floor(random() * 70),
    water = Math.floor(random() * 101);
  return {
    ...DEFAULTS,
    biosphere,
    starType,
    orbital,
    atmosphere,
    massEarth: mass,
    radiusEarth: Math.round(mass ** 0.28 * 10) / 10,
    tilt,
    water: /none|hydrogen/.test(atmosphere) ? 0 : water,
    pressureBar: ATMOSPHERES[atmosphere].pressure,
  };
}

/** @param {number} seed */
export function seedName(seed) {
  return `PSU-${10000 + (validateSeed(seed) % 90000)}`;
}

/**
 * @param {number} seed
 * @param {"none" | "familiar" | "alien"} [biosphere]
 */
export function seededReport(seed, biosphere = "familiar") {
  return createReport({
    params: paramsFromSeed(seed, biosphere),
    name: seedName(seed),
    id: `seed-${seed}-${biosphere}`,
    seed,
  });
}

/** The permalink query for a seeded report. */
/** @param {{seed: number, params: {biosphere: string}}} report */
export function seedQuery(report) {
  return `?seed=${report.seed}${report.params.biosphere === "familiar" ? "" : `&biosphere=${report.params.biosphere}`}`;
}
