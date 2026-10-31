// @ts-check
// Every Claude prompt in PSU-7 lives here: the survey field note, the
// coordinate expedition note and the field-researcher agent. Image prompts are
// built from the same visual specification in lib/planet.js (imagePrompt),
// lib/orbital-reference.js and lib/expedition.js.
//
// Design: the physics model owns every number; Claude owns the prose. Notes
// come back as JSON sections tagged calculated / estimated / assumed /
// imagined. The interface shows the tags, so the prose does not need to hedge
// every clause or end with a disclaimer. Few-shot examples are the curated
// reference notes, rendered from the same fact sheet Claude sees for live
// surveys. The system prompt is byte-stable so it can be cached.
import {
  calculate,
  visualSpec,
  narrativeFromSections,
  SHOWCASE_WORLDS,
  DEFAULTS,
  SECTION_KINDS,
  formatYears,
  formatQuantity,
  habitableZoneText,
  quantityKind,
  surfaceWater,
} from "./planet.js";
import { ServiceError } from "./server.js";

export const CLAUDE_MODEL = "claude-opus-5-5";
export const ANTHROPIC_VERSION = "2026-10-21";
// Server-side refusal fallback: the API re-runs a declined request on the
// recommended fallback model instead of returning the refusal.
const ANTHROPIC_BETA = "server-side-fallback-2026-07-01";
export const FIELD_NOTE_PROMPT_VERSION = "field-note-3";

/** @param {string} apiKey */
export function anthropicHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-beta": ANTHROPIC_BETA,
  };
}

const VOICE = `Write like a good science writer on an expedition: concrete nouns, active verbs, one striking image per section, no filler.

Each section is tagged with where its content comes from. The fact sheet groups every number under the same tags, so a section takes the tag of the line its numbers come from:
- calculated: the Calculated line, derived from the inputs by a formula (distance, sunlight, orbital period, gravity, escape velocity, density).
- estimated: the Estimated line, models with real uncertainty (temperature, water phase, tidal locking).
- assumed: the Assumed line, settings the operator chose, including the rotation and any solar day that follows from it. On NASA planets, everything beyond the catalogue values is assumed.
- imagined: scenery, colours, landforms, weather on the ground and any life.

The interface prints each tag beside its section and explains provenance elsewhere, so:
- Do not restate the tag inside the prose ("the model estimates", "imagined", "speculative", "illustrative", "artistic interpretation").
- Do not end with a disclaimer, caveat or safety note.
- At most one qualifier in the whole note, and only where a reader could otherwise be misled.

Stay consistent with the fact sheet:
- Quote numbers only from the fact sheet, rounded as given. Invent no new quantities.
- Scenery follows the artistic interpretation. Airless worlds have a black sky with no haze, cloud, wind, rain or blue light. Where ice is favored there are no open liquid seas. Plants or other life appear only if the interpretation includes vegetation. Starlight has the colour listed.
- A synchronous world keeps one face toward its star: no sunrise, sunset or day-night cycle.
- No moons, rings, other planets, animals, visitors or spacecraft. Settlements, cities or ruins appear only if the interpretation includes a civilization.
- Nothing on this world was observed or measured. Never write "detected", "observed", "telemetry", "readings" or "sensors show".
- Catalogue values come from the NASA Exoplanet Archive; say so when you use them. They say nothing about the surface.`;

/**
 * A compact, labelled fact sheet. Raw model JSON carries warnings and art
 * direction full of hedges, and the model mirrors the register of its input.
 * @param {import("./planet.js").Params} p
 * @param {any} physics
 * @param {import("./planet.js").CatalogRecord | null} catalog
 */
export function fieldNoteFacts(p, physics, catalog) {
  const spec = visualSpec(p, physics);
  const lines = [];
  lines.push(
    catalog
      ? `World: ${catalog.pl_name}, a confirmed exoplanet orbiting ${catalog.hostname} (NASA Exoplanet Archive).`
      : "World: fictional.",
  );
  if (catalog) {
    const measured = [
      ["radius", catalog.pl_rade, "Earth radii"],
      ["mass", catalog.pl_bmasse, "Earth masses"],
      ["orbital period", catalog.pl_orbper, "days"],
      ["semi-major axis", catalog.pl_orbsmax, "AU"],
      ["equilibrium temperature", catalog.pl_eqt, "K (archive estimate)"],
      ["stellar spectral type", catalog.st_spectype, ""],
    ].filter(([, value]) => value != null);
    lines.push(
      `Catalogue values: ${measured.map(([name, value, unit]) => `${name} ${value}${unit ? " " + unit : ""}`).join("; ")}.`,
    );
  }
  const q = formatQuantity,
    locked = physics.tidalLock?.locked === true,
    water = surfaceWater(p, physics);
  /** @type {Record<"assumed" | "calculated" | "estimated", string[]>} */
  const facts = { assumed: [], calculated: [], estimated: [] };
  facts.assumed.push(
    `${p.starType} star`,
    ...(catalog ? [] : [`${p.orbital} orbit`]),
    `${p.atmosphere} atmosphere at ${q("pressureBar", p.pressureBar)} bar`,
    `water enough to cover ${p.water}% of the surface`,
    ...(locked ? [] : [`axial tilt ${p.tilt}°`]),
    locked
      ? `initial rotation period ${q("rotationHours", p.rotationHours)} h`
      : `rotation period ${q("rotationHours", p.rotationHours)} h`,
    `biosphere mode ${p.biosphere}`,
    `civilization mode ${p.civilization}`,
  );
  facts[quantityKind("solarDayHours", physics)].push(
    locked
      ? `tidally locked, one face always toward the star (locking takes about ${formatYears(physics.tidalLock.lockYears)}, against an assumed ${formatYears(physics.tidalLock.ageYears)} system age)`
      : physics.solarDayHours == null
        ? "rotation matches the orbit: one face always toward the star"
        : `solar day ${q("solarDayHours", physics.solarDayHours)} h`,
  );
  facts.calculated.push(
    `distance ${q("au", physics.au)} AU`,
    `sunlight ${q("sunlight", physics.star.luminosity / physics.au ** 2)}× Earth's`,
    `year ${q("yearDays", physics.yearDays)} Earth days (${catalog?.pl_orbper != null ? "NASA catalogue" : "Kepler's third law"})`,
    `surface gravity ${q("gravityG", physics.gravityG)} g`,
    `escape velocity ${q("escapeKms", physics.escapeKms)} km/s`,
    `bulk density ${q("density", physics.density)} g/cm³${physics.densityNote ? ` (low for its size: ${physics.densityNote})` : ""}`,
    `star's apparent diameter ${q("angularDiameter", physics.angularDiameter)}°`,
    ...(physics.star.teffK
      ? [`star's effective temperature ${q("teffK", physics.star.teffK)} K`]
      : []),
  );
  facts.estimated.push(
    physics.airlessMeanRangeC
      ? `equilibrium temperature ${q("temperatureC", physics.temperatureC)} °C, an upper bound: with no air to carry heat the mean surface temperature lies between ${q("temperatureC", physics.airlessMeanRangeC[0])} °C and ${q("temperatureC", physics.airlessMeanRangeC[1])} °C`
      : `${locked ? "global mean" : "mean"} temperature ${q("temperatureC", physics.temperatureC)} °C (greenhouse warming ${q("greenhouseK", physics.greenhouseK)} K${physics.albedo == null ? "" : `, Bond albedo ${q("albedo", physics.albedo)} from ${physics.albedoSource}`})${locked && !physics.airlessMeanRangeC ? ", with a warmer dayside and a colder nightside" : ""}`,
    `water phase: ${physics.waterState.toLowerCase()}; ${water.text}`,
    `class ${physics.classification}`,
  );
  if (locked)
    facts.estimated.push(
      `axial tilt about 0°, damped by tides (the ${p.tilt}° tilt setting is imagined and not used; there are no seasons)`,
    );
  if (physics.nightside)
    facts.estimated.push(
      physics.nightside.collapses
        ? `nightside: below the ${physics.nightside.thresholdBar} bar collapse threshold (Joshi et al. 1997), air and water would freeze out on the nightside`
        : `nightside: at ${q("pressureBar", p.pressureBar)} bar the atmosphere is thick enough not to collapse, that is freeze out as frost, on the nightside (threshold about ${physics.nightside.thresholdBar} bar, Joshi et al. 1997); the nightside surface temperature is not modelled and is colder than the mean`,
    );
  if (physics.runaway?.lost)
    facts.estimated.push(
      `oceans: sunward of the recent-Venus limit (${q("au", physics.runaway.limitAu)} AU, Kopparapu et al. 2014) a runaway greenhouse boils the oceans away and their hydrogen escapes, so no liquid water remains; the true surface temperature is far hotter than the simple energy balance`,
    );
  if (physics.retention && !physics.retention.retained)
    facts.estimated.push(
      `atmosphere: beyond the cosmic shoreline (Zahnle & Catling 2017); keeping air under this much sunlight needs an escape velocity of about ${q("escapeKms", physics.retention.minEscapeKms)} km/s, so the assumed air and water would escape over time`,
    );
  if (physics.tidalLock) facts.estimated.push(habitableZoneText(physics));
  if (physics.moons) facts.estimated.push(`moons: ${physics.moons.reason}`);
  lines.push(
    `Assumed: ${facts.assumed.join("; ")}.`,
    `Calculated: ${facts.calculated.join("; ")}.`,
    `Estimated: ${facts.estimated.join("; ")}.`,
  );
  lines.push(
    `Starlight: ${spec.star.colour}; the star looks ${formatQuantity("widthVsSun", spec.star.widthVsSun)}× as wide as the Sun from Earth.`,
  );
  const life = spec.biology.present
    ? `${spec.biology.forms}, coloured ${spec.biology.palette}; ${spec.biology.habitat}${spec.biology.pigmentNote ? ` ${spec.biology.pigmentNote}` : ""}`
    : "none; depict no plants or life";
  lines.push(
    `Artistic interpretation: palette ${spec.palette}; terrain ${spec.terrain}; sky ${spec.sky}; vegetation ${life.replace(/\.$/, "")}; civilization ${spec.civilization ? spec.civilization.summary : "none; depict no settlements, cities or ruins"}.`,
  );
  return lines.join("\n");
}

export const FIELD_NOTE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["sections", "surfaceFeatures"],
  properties: {
    sections: {
      type: "array",
      description: "Three to five sections, each one to two sentences.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text"],
        properties: {
          kind: { type: "string", enum: [...SECTION_KINDS] },
          text: { type: "string" },
        },
      },
    },
    surfaceFeatures: {
      type: "string",
      description:
        "One sentence listing concrete visible surface features, with no qualifiers.",
    },
  },
});

/** The curated reference notes, paired with the fact sheets they describe. */
function referenceExamples() {
  return Object.entries(SHOWCASE_WORLDS)
    .map(([key, world]) => {
      const params = /** @type {import("./planet.js").Params} */ ({
        ...DEFAULTS,
        ...world.params,
      });
      const facts = fieldNoteFacts(params, calculate(params), null);
      const note = JSON.stringify({
        sections: world.sections,
        surfaceFeatures: world.surfaceFeatures,
      });
      return `<example world="${key}">\n<fact_sheet>\n${facts}\n</fact_sheet>\n<field_note>\n${note}\n</field_note>\n</example>`;
    })
    .join("\n\n");
}

export const FIELD_NOTE_SYSTEM = `You write the field notes for PSU-7, a survey instrument for imagined planets. A deterministic physics model has already computed every number; you turn its fact sheet into a short note a curious reader will enjoy.

Write three to five sections of one or two sentences each, about 90 to 140 words in all, then one surfaceFeatures sentence.

${VOICE}

These curated notes show the register and length to aim for:

${referenceExamples()}`;

/**
 * Request body for the survey field note.
 * @param {import("./planet.js").Params} p
 * @param {any} physics
 * @param {import("./planet.js").CatalogRecord | null} catalog
 */
export function fieldNoteRequest(p, physics, catalog) {
  return {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    fallbacks: "default",
    system: [
      {
        type: "text",
        text: FIELD_NOTE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: FIELD_NOTE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `<fact_sheet>\n${fieldNoteFacts(p, physics, catalog)}\n</fact_sheet>`,
      },
    ],
  };
}

/**
 * The JSON text of a completed Messages API response.
 * @param {any} response
 * @param {string} failure User-facing message for an unusable response.
 */
function responseJSON(response, failure) {
  if (response?.stop_reason === "refusal")
    throw new ServiceError(
      502,
      "The interpretation service declined this survey. The model note remains available.",
      "REFUSED",
    );
  if (response?.stop_reason !== "end_turn" || !Array.isArray(response.content))
    throw new ServiceError(502, failure, "INVALID_RESPONSE");
  try {
    return JSON.parse(
      response.content
        .filter((/** @type {any} */ block) => block.type === "text")
        .map((/** @type {any} */ block) => block.text)
        .join("")
        .trim(),
    );
  } catch {
    throw new ServiceError(502, failure, "INVALID_RESPONSE");
  }
}

/**
 * @param {any} response A Messages API response for fieldNoteRequest().
 * @returns {import("./planet.js").Narrative}
 */
export function parseFieldNote(response) {
  const failure =
    "The interpretation did not match the survey format. Please retry.";
  const output = responseJSON(response, failure);
  try {
    if (
      !Array.isArray(output.sections) ||
      output.sections.length < 2 ||
      output.sections.length > 6
    )
      throw new Error("section count");
    return narrativeFromSections(
      output.sections.map((/** @type {any} */ section) => ({
        kind: section.kind,
        text: String(section.text).trim(),
      })),
      output.surfaceFeatures,
    );
  } catch {
    throw new ServiceError(502, failure, "INVALID_RESPONSE");
  }
}

export const EXPEDITION_NOTE_SYSTEM = `You write expedition notes for PSU-7, a survey instrument for imagined planets. The operator has picked one coordinate on a procedurally generated globe and a camera heading. The server sampled the local terrain model there; you describe what an expedition standing at that spot would see.

Return a description of two or three sentences (at most 900 characters) and one surfaceFeatures sentence (at most 350 characters). The interface already labels these notes as imagined scenery built on model estimates.

${VOICE}

Expedition specifics:
- Use only the local sample: elevation, material, water or ice, slope and lighting at this point. Neighbouring regions may lie beyond the horizon; do not describe distant mapped features as if visible.
- Respect the illumination: if the sample says the site is on the night side, describe it in starlight or darkness.`;

export const EXPEDITION_NOTE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["description", "surfaceFeatures"],
  properties: {
    description: { type: "string" },
    surfaceFeatures: { type: "string" },
  },
});

/**
 * @param {any} prepared Output of prepareExpedition()
 * @param {any} context Output of expeditionContext()
 */
export function expeditionNoteRequest(prepared, context) {
  return {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    fallbacks: "default",
    system: [
      {
        type: "text",
        text: EXPEDITION_NOTE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: EXPEDITION_NOTE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          `<fact_sheet>\n${fieldNoteFacts(prepared.params, prepared.physics, prepared.catalog)}\n</fact_sheet>`,
          `<camera>${JSON.stringify(prepared.metadata)}</camera>`,
          `<local_sample>${JSON.stringify(context)}</local_sample>`,
        ].join("\n"),
      },
    ],
  };
}

/** @param {any} response */
export function parseExpeditionNote(response) {
  return responseJSON(
    response,
    "The expedition notes were incomplete or invalid. Please retry.",
  );
}

export const AGENT_SYSTEM = `You are PSU-7's field researcher. An operator gives you a short brief, such as "a NASA planet that might hold liquid water around a red dwarf" or "design a cold ocean world". Use the tools to explore, then write up one world.

How to work:
- search_catalogue finds confirmed exoplanets; compute_world runs the physics model on a candidate. Compare a few candidates before choosing; a typical survey needs three to six tool calls.
- Before each tool call, write one short sentence telling the operator what you are checking and why. The operator sees these sentences as your log.
- Every number in your write-up must come from a compute_world result. If a setting is rejected, read the error and adjust.
- Finish by calling submit_field_report exactly once, with the world settings exactly as you last computed them. If the server returns an error, fix the note and submit again.
- If the brief is not about surveying planets, reply with one sentence saying you only survey planets, and call no tools.

The field note in submit_field_report has three to five sections of one or two sentences each, about 90 to 140 words in all, and one surface_features sentence. Field notes follow these rules:

${VOICE}`;

/**
 * One field-researcher turn. The server owns the system prompt, tools, model
 * and limits; the browser supplies only the conversation it is continuing.
 * @param {any[]} messages Validated by api/agent.js
 * @param {readonly any[]} tools
 */
export function agentRequest(messages, tools) {
  return {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    fallbacks: "default",
    tools,
    tool_choice: { type: "auto" },
    system: [
      {
        type: "text",
        text: AGENT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { effort: "medium" },
    // Also cache the growing conversation, which each turn resends.
    cache_control: { type: "ephemeral" },
    messages,
  };
}
