// @ts-check
// Field-researcher tools. The server sends these definitions to Claude; the
// browser executes them against the same physics module the survey uses, so
// tool calls cost nothing and the server only proxies model turns.
import {
  STARS,
  ZONES,
  ATMOSPHERES,
  SECTION_KINDS,
  calculate,
  validateSurvey,
  biosphereSpec,
  InputError,
  roundQuantity,
  surfaceWater,
  habitableZoneText,
  starAppearance,
} from "./planet.js";

export const MAX_AGENT_TURNS = 8;
export const MAX_TOOL_RESULT_CHARS = 6000;
export const CATALOGUE_FILTERS = Object.freeze([
  "all",
  "temperate",
  "earthsize",
  "superearth",
  "trappist",
]);

const WORLD_PROPERTIES = {
  catalogue_planet: {
    type: "string",
    description:
      "Exact pl_name from a search_catalogue result, or an empty string for a fictional world. A catalogue planet fixes mass, radius and orbit; the remaining settings are scenario assumptions.",
  },
  star_type: { type: "string", enum: Object.keys(STARS) },
  orbit: {
    type: "string",
    enum: Object.keys(ZONES),
    description: "Ignored when a catalogue planet supplies its own orbit.",
  },
  atmosphere: { type: "string", enum: Object.keys(ATMOSPHERES) },
  pressure_bar: {
    type: "number",
    description:
      "0 for an airless body; 10 for a hydrogen-helium envelope; otherwise greater than 0 and at most 1000.",
  },
  water_percent: {
    type: "number",
    description:
      "Share of the surface covered by water or ice, 0 to 100. Must be 0 for airless and gas-envelope worlds.",
  },
  mass_earth: { type: "number" },
  radius_earth: { type: "number" },
  tilt_deg: { type: "number", description: "Axial tilt, 0 to 90." },
  rotation_hours: {
    type: "number",
    description:
      "Sidereal rotation period in hours. Set it to the orbital period in hours for a tidally locked world.",
  },
  biosphere: {
    type: "string",
    enum: ["none", "familiar", "alien"],
    description:
      "Art direction for imagined vegetation; it never changes the physics.",
  },
};
const WORLD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(WORLD_PROPERTIES),
  properties: WORLD_PROPERTIES,
};

export const AGENT_TOOLS = Object.freeze([
  {
    name: "search_catalogue",
    description:
      "Search confirmed exoplanets in the NASA Exoplanet Archive (composite parameters). Returns up to 8 planets with radius, mass, orbital period and equilibrium-temperature estimates. Use an empty query to browse a filter.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["query", "filter"],
      properties: {
        query: {
          type: "string",
          description: "Part of a planet name, such as TRAPPIST or Kepler-62.",
        },
        filter: { type: "string", enum: [...CATALOGUE_FILTERS] },
      },
    },
  },
  {
    name: "compute_world",
    description:
      "Run the PSU-7 physics model on one world: temperature, water phase, gravity, escape velocity, density, year and day length, sunlight, the Surface Environment Index and Earth Similarity Index, whether imagined vegetation is allowed, and model warnings. Invalid combinations return an error explaining the constraint.",
    strict: true,
    input_schema: WORLD_SCHEMA,
  },
  {
    name: "submit_field_report",
    description:
      "Finish the survey: submit one world and its field note. The world must be exactly the settings of a compute_world call. The server checks the note against the physics and returns an error to fix if they disagree.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["world_name", "world", "sections", "surface_features"],
      properties: {
        world_name: {
          type: "string",
          description:
            "The catalogue name, or a short invented name for a fictional world.",
        },
        world: WORLD_SCHEMA,
        sections: {
          type: "array",
          description: "Three to five tagged sections.",
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
        surface_features: { type: "string" },
      },
    },
  },
]);
export const AGENT_TOOL_NAMES = Object.freeze(AGENT_TOOLS.map((t) => t.name));

/**
 * Survey parameters from a tool's world object. Catalogue values replace the
 * matching settings, so the model cannot alter measured mass or radius.
 * @param {any} world
 * @param {(name: string) => import("./planet.js").CatalogRecord | null | undefined} findCatalog
 */
export function worldFromToolInput(world, findCatalog) {
  const name =
    typeof world?.catalogue_planet === "string"
      ? world.catalogue_planet.trim()
      : "";
  const catalog = name ? findCatalog(name) : null;
  if (name && !catalog)
    throw new InputError(
      `"${name}" is not in any search_catalogue result yet. Search for it first, or use an empty string for a fictional world.`,
    );
  const params = {
    starType: world.star_type,
    orbital: world.orbit,
    atmosphere: world.atmosphere,
    pressureBar: world.pressure_bar,
    water: world.water_percent,
    massEarth: catalog?.pl_bmasse ?? world.mass_earth,
    radiusEarth: catalog?.pl_rade ?? world.radius_earth,
    tilt: world.tilt_deg,
    rotationHours: world.rotation_hours,
    biosphere: world.biosphere,
  };
  return validateSurvey({ params, catalog });
}

/** @param {number} value @param {number} digits */

/**
 * Compact physics summary: what the agent needs to reason and to write.
 * @param {import("./planet.js").Params} params
 * @param {any} catalog
 */
export function worldSummary(params, catalog) {
  const f = calculate(params, catalog);
  const biology = biosphereSpec(params, f);
  return {
    classification: f.classification,
    temperature_c: roundQuantity("temperatureC", f.temperatureC),
    temperature_kind: f.temperatureKind,
    ...(f.airlessMeanRangeC
      ? {
          airless_mean_range_c: f.airlessMeanRangeC.map((t) =>
            roundQuantity("temperatureC", t),
          ),
        }
      : {}),
    water_phase: f.waterState,
    surface_water_percent: surfaceWater(params, f).percent,
    distance_au: roundQuantity("au", f.au),
    sunlight_vs_earth: roundQuantity("sunlight", f.star.luminosity / f.au ** 2),
    year_days: roundQuantity("yearDays", f.yearDays),
    solar_day_hours:
      f.solarDayHours == null
        ? null
        : roundQuantity("solarDayHours", f.solarDayHours),
    tidally_locked: f.tidalLock?.locked ?? null,
    axial_tilt_deg: roundQuantity("tiltDeg", f.tiltDeg),
    star_effective_temperature_k: roundQuantity("teffK", f.star.teffK),
    habitable_zone: f.tidalLock ? habitableZoneText(f) : null,
    nightside_collapse: f.nightside?.collapses ?? null,
    moons: f.moons?.reason ?? null,
    gravity_g: roundQuantity("gravityG", f.gravityG),
    escape_km_s: roundQuantity("escapeKms", f.escapeKms),
    density_g_cm3: roundQuantity("density", f.density),
    starlight: starAppearance(params, f).colour,
    surface_environment_index: f.score,
    star_activity_caveat: f.activityCaveat,
    earth_similarity_index: f.esi == null ? null : roundQuantity("esi", f.esi),
    imagined_vegetation: biology.present
      ? `${biology.forms}, coloured ${biology.palette}`
      : null,
    warnings: f.warnings,
  };
}

/**
 * Execute one tool call in the browser. Never throws: failures become
 * is_error results the model can read and correct.
 * @param {{name: string, input: any}} call
 * @param {{searchCatalogue: (query: string, filter: string) => Promise<any[]>,
 *   catalogs: Map<string, any>}} context
 * @returns {Promise<{content: string, is_error?: true}>}
 */
export async function runAgentTool(call, context) {
  try {
    if (call.name === "search_catalogue") {
      const planets = await context.searchCatalogue(
        String(call.input.query || "").slice(0, 80),
        CATALOGUE_FILTERS.includes(call.input.filter)
          ? call.input.filter
          : "all",
      );
      const shown = planets.slice(0, 8);
      for (const planet of shown) context.catalogs.set(planet.pl_name, planet);
      return result({
        planets: shown.map((p) => ({
          pl_name: p.pl_name,
          host: p.hostname,
          spectral_type: p.st_spectype,
          radius_earth: p.pl_rade,
          mass_earth: p.pl_bmasse,
          orbital_period_days: p.pl_orbper,
          equilibrium_temperature_k: p.pl_eqt,
        })),
        more: planets.length > shown.length,
      });
    }
    if (call.name === "compute_world") {
      const { params, catalog } = worldFromToolInput(call.input, (name) =>
        context.catalogs.get(name),
      );
      return result(worldSummary(params, catalog));
    }
    return {
      content: `Unknown tool ${call.name}. Use ${AGENT_TOOL_NAMES.join(", ")}.`,
      is_error: true,
    };
  } catch (error) {
    return {
      content: error instanceof Error ? error.message : String(error),
      is_error: true,
    };
  }
}

/** @param {unknown} value */
function result(value) {
  const content = JSON.stringify(value);
  return content.length > MAX_TOOL_RESULT_CHARS
    ? {
        content:
          content.slice(0, MAX_TOOL_RESULT_CHARS - 20) + '..."truncated"',
      }
    : { content };
}
