// Model consistency rules, shown under "Model notes". Each rule reads one
// computed world and returns a message when it finds something to report, or
// null. A "contradiction" means two parts of the model disagree, which is a
// bug; a "note" is a real tension between models worth telling the reader.
// Add a rule by appending to CONSISTENCY_RULES.
import { formatQuantity, effectiveTemperature, isRedDwarf } from "./planet.js";

/**
 * @typedef {{p: import("./planet.js").Params, physics: any}} World
 * @typedef {{id: string, kind: "contradiction" | "note",
 *   check: (world: World) => string | null}} Rule
 * @typedef {{id: string, kind: "contradiction" | "note", message: string}} Finding
 */

/** @type {Rule[]} */
export const CONSISTENCY_RULES = [
  {
    id: "lock-matches-age",
    kind: "contradiction",
    check: ({ physics }) => {
      const lock = physics.tidalLock;
      return lock && lock.locked !== lock.lockYears < lock.ageYears
        ? "The tidal-lock verdict disagrees with the lock time and system age."
        : null;
    },
  },
  {
    id: "locked-has-no-solar-day",
    kind: "contradiction",
    check: ({ physics }) =>
      physics.tidalLock?.locked && physics.solarDayHours != null
        ? `The world is tidally locked, yet a ${formatQuantity("solarDayHours", physics.solarDayHours)}-hour solar day is reported.`
        : null,
  },
  {
    id: "locked-tilt-is-damped",
    kind: "contradiction",
    check: ({ physics }) =>
      physics.tidalLock?.locked &&
      (physics.tiltDeg !== 0 ||
        physics.warnings.some((/** @type {string} */ w) => /season/i.test(w)))
        ? "The world is tidally locked, yet it keeps a tilt or seasons."
        : null,
  },
  {
    id: "locked-world-holds-no-moon",
    kind: "contradiction",
    check: ({ physics }) =>
      physics.tidalLock?.locked && physics.moons?.possible
        ? "The world is tidally locked, yet a stable moon is allowed; its synchronous orbit lies outside every stable moon orbit."
        : null,
  },
  {
    id: "collapsed-nightside-scores-zero",
    kind: "contradiction",
    check: ({ physics }) =>
      physics.nightside?.collapses &&
      physics.factors.some(
        (/** @type {any} */ f) =>
          ["Exposed liquid water", "Pressure assumption"].includes(f.name) &&
          f.points > 0,
      )
        ? "The nightside collapses, yet the score still credits liquid water or pressure."
        : null,
  },
  {
    id: "runaway-has-no-oceans",
    kind: "contradiction",
    check: ({ physics }) =>
      physics.runaway?.lost &&
      (physics.waterState === "Liquid water plausible" ||
        physics.factors.some(
          (/** @type {any} */ f) =>
            ["Exposed liquid water", "Mean temperature"].includes(f.name) &&
            f.points > 0,
        ))
        ? "The oceans are lost to a runaway greenhouse, yet the model still credits liquid water or the temperature."
        : null,
  },
  {
    id: "escaped-air-scores-zero",
    kind: "contradiction",
    check: ({ physics }) =>
      physics.retention &&
      !physics.retention.retained &&
      physics.factors.some(
        (/** @type {any} */ f) => f.name !== "Mean temperature" && f.points > 0,
      )
        ? "The world cannot keep its air, yet the score still credits water, pressure or the atmosphere."
        : null,
  },
  {
    id: "star-temperature-matches",
    kind: "contradiction",
    check: ({ physics }) =>
      Math.abs(physics.star.teffK - effectiveTemperature(physics.star)) > 1
        ? "The star's effective temperature does not follow from its luminosity and radius."
        : null,
  },
  {
    id: "red-dwarf-activity-caveat",
    kind: "contradiction",
    check: ({ physics }) =>
      isRedDwarf(physics) !== Boolean(physics.activityCaveat)
        ? "The star-activity caveat does not match the star's temperature."
        : null,
  },
  {
    id: "habitable-zone-nested",
    kind: "contradiction",
    check: ({ physics }) => {
      const hz = physics.habitableZone;
      return hz &&
        !(
          hz.optimistic[0] < hz.conservative[0] &&
          hz.conservative[0] < hz.conservative[1] &&
          hz.conservative[1] < hz.optimistic[1]
        )
        ? "The conservative habitable zone does not sit inside the optimistic one."
        : null;
    },
  },
  {
    id: "habitable-zone-vs-temperature",
    kind: "note",
    check: ({ p, physics }) => {
      const hz = physics.habitableZone;
      if (!hz || /none|hydrogen/.test(p.atmosphere)) return null;
      const t = `${formatQuantity("temperatureC", physics.temperatureC)} °C`;
      if (
        physics.au < hz.conservative[0] &&
        physics.temperatureC < 60 &&
        !physics.runaway?.lost
      )
        return `This orbit is sunward of the conservative habitable zone's inner edge (runaway greenhouse, Kopparapu et al. 2014), yet the simple energy balance gives ${t}. Their climate model includes water-vapour feedback that this estimate leaves out, so read the mild temperature as optimistic.`;
      if (physics.au > hz.conservative[1] && physics.temperatureC > 0)
        return `This orbit is beyond the conservative habitable zone's outer edge (maximum greenhouse, Kopparapu et al. 2014), yet the simple energy balance gives ${t}. Keeping the surface above freezing that far out needs more greenhouse warming than a CO₂ atmosphere can provide.`;
      return null;
    },
  },
];

/**
 * @param {World} world
 * @param {Rule[]} [rules]
 * @returns {Finding[]}
 */
export function checkConsistency(world, rules = CONSISTENCY_RULES) {
  return rules.flatMap((rule) => {
    const message = rule.check(world);
    return message ? [{ id: rule.id, kind: rule.kind, message }] : [];
  });
}
