// @ts-check
// Deterministic checks that a field note agrees with the data panel. Used by
// scripts/eval-narratives.js; each check is unit-tested in tests/evals.test.js.
// Checks favor precision over recall: a failure should be a real contradiction
// a reader would notice, so negated mentions ("no clouds") are ignored.
import { biosphereSpec } from "./planet.js";

/**
 * @typedef {{id: string, applies: boolean, pass: boolean, detail?: string}} CheckResult
 * @typedef {{params: import("./planet.js").Params, physics: any,
 *   narrative: import("./planet.js").Narrative}} Sample
 */

const NEGATION =
  /\b(no|not|never|without|nor|none|lacks?|absent|free of)\b[^.;:]{0,40}$/i;

/**
 * Matches of `pattern` that are not negated earlier in the same clause.
 * @param {string} text
 * @param {RegExp} pattern Must have the g flag.
 */
export function assertedMatches(text, pattern) {
  return [...text.matchAll(pattern)]
    .filter((match) => !NEGATION.test(text.slice(0, match.index)))
    .map((match) => match[0]);
}

/** @param {string} text */
export function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const HEDGES =
  /\b(the model (estimates|suggests|indicates)|estimated?|imagined|speculative|illustrative|artistic|interpretation|hypothetical|assum(ed|ption)|may|might|could|perhaps|possibly|not (an? )?(observation|measurement|evidence|prediction))\b/gi;

/** @param {string} text */
export function hedgesPerSentence(text) {
  const count = (text.match(HEDGES) || []).length;
  return count / Math.max(1, sentences(text).length);
}

/** @param {Sample} sample @returns {CheckResult[]} */
export function checkNarrative({ params: p, physics, narrative }) {
  const text = `${narrative.description} ${narrative.surfaceFeatures}`;
  const airless = p.atmosphere.includes("none");
  const biology = biosphereSpec(p, physics);
  /** @type {CheckResult[]} */
  const results = [];
  /** @param {string} id @param {boolean} applies @param {string[]} found */
  const contradiction = (id, applies, found) =>
    results.push({
      id,
      applies,
      pass: !applies || found.length === 0,
      ...(applies && found.length ? { detail: found.join(", ") } : {}),
    });

  contradiction(
    "airless-sky",
    airless,
    assertedMatches(
      text,
      /\b(haze|hazy|clouds?|wind|breeze|rain|mist|fog|blue sky|sky (is|glows) blue|airy)\b/gi,
    ),
  );
  const starLetter = p.starType.charAt(0);
  contradiction(
    "star-colour",
    true,
    assertedMatches(
      text,
      starLetter === "M"
        ? /\b(white|yellow|blue-white|golden)[- ](sun|star|sunlight|starlight)\b/gi
        : starLetter === "K"
          ? /\b(blue-white|red)[- ](sun|star|sunlight|starlight)\b/gi
          : /\b(red|crimson|orange)[- ](sun|star|sunlight|starlight|dwarf)\b/gi,
    ),
  );
  contradiction(
    "synchronous-day",
    physics.solarDayHours == null,
    assertedMatches(
      text,
      /\b(sunrise|sunset|dawn|dusk|nightfall|daybreak|each day|every day|day-night cycle)\b/gi,
    ),
  );
  contradiction(
    "ice-not-liquid",
    physics.waterState === "Ice favored",
    assertedMatches(
      text,
      /\b(waves?|surf|open (sea|ocean|water)s?|liquid (sea|ocean|water)s?|lapping|tides?)\b/gi,
    ),
  );
  contradiction(
    "no-uninvited-life",
    !biology.present,
    assertedMatches(
      text,
      /\b(plants?|forests?|trees?|vegetation|grass(es)?|moss(es)?|ferns?|leaf|leaves|algae|organisms?|creatures?|animals?|lichens?)\b/gi,
    ),
  );
  contradiction(
    "no-acquisition-claims",
    true,
    assertedMatches(
      text,
      /\b(detected|observed|telemetry|sensors?|readings?|scans? (show|reveal)|we measured)\b/gi,
    ),
  );
  contradiction(
    "no-extra-bodies",
    true,
    assertedMatches(
      text,
      /\b(moons?|ring system|planetary rings?|companion planet|settlements?|cities|city|spacecraft|landers?|rovers?)\b/gi,
    ),
  );

  // Every temperature quoted must be one the data panel shows.
  const allowed = [
    physics.temperatureC,
    ...(physics.airlessMeanRangeC || []),
  ].map((t) => Math.round(t));
  const quoted = [...text.matchAll(/([−-])?\s?(\d+(?:\.\d+)?)\s?°\s?C/g)].map(
    ([, sign, value]) => (sign ? -1 : 1) * Number(value),
  );
  const ungrounded = quoted.filter(
    (t) => !allowed.some((a) => Math.abs(a - t) <= 2),
  );
  contradiction(
    "temperatures-grounded",
    quoted.length > 0,
    ungrounded.map((t) => `${t} °C (model ${allowed.join(" / ")})`),
  );

  const last = sentences(narrative.description).at(-1) || "";
  const disclaimer =
    /\b(not (evidence|a prediction|safe|established|observed)|no (evidence|guarantee)|artistic (choice|interpretation)s?|creative assumptions?|speculative)\b/i;
  results.push({
    id: "no-closing-disclaimer",
    applies: true,
    pass: !disclaimer.test(last),
    ...(disclaimer.test(last) ? { detail: last } : {}),
  });
  const hedges = hedgesPerSentence(narrative.description);
  results.push({
    id: "hedges-per-sentence<=0.5",
    applies: true,
    pass: hedges <= 0.5,
    detail: hedges.toFixed(2),
  });
  if (narrative.sections)
    results.push({
      id: "section-count-3-5",
      applies: true,
      pass: narrative.sections.length >= 3 && narrative.sections.length <= 5,
      detail: String(narrative.sections.length),
    });
  return results;
}

/**
 * Wilson score interval for a binomial proportion.
 * @param {number} failures @param {number} n
 */
export function wilson(failures, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = failures / n,
    denominator = 1 + z ** 2 / n,
    centre = (p + z ** 2 / (2 * n)) / denominator,
    margin =
      (z * Math.sqrt((p * (1 - p)) / n + z ** 2 / (4 * n ** 2))) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

/**
 * @param {Sample[]} samples
 * @returns {{id: string, applicable: number, failures: number, rate: number, ci: number[], examples: string[]}[]}
 */
export function summarize(samples) {
  /** @type {Map<string, {applicable: number, failures: number, examples: string[]}>} */
  const byCheck = new Map();
  for (const sample of samples)
    for (const result of checkNarrative(sample)) {
      const row = byCheck.get(result.id) || {
        applicable: 0,
        failures: 0,
        examples: [],
      };
      if (result.applies) {
        row.applicable++;
        if (!result.pass) {
          row.failures++;
          if (row.examples.length < 3 && result.detail)
            row.examples.push(result.detail);
        }
      }
      byCheck.set(result.id, row);
    }
  return [...byCheck].map(([id, row]) => ({
    id,
    ...row,
    rate: row.applicable ? row.failures / row.applicable : 0,
    ci: wilson(row.failures, row.applicable),
  }));
}
