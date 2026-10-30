import { orbitalAssetMetadata } from "./orbital-record.js";
import { validateExpeditions } from "./expedition-record.js";
import { waterStateV1 as waterState } from "./water-phase.js";
// visitor.js imports this module too; neither uses the other at load time.
import { survival } from "./visitor.js";
export { waterState };
import {
  validateCartography,
  createCartographyRecord,
  validateSites,
  validateLocation,
} from "./cartography-record.js";
// Shared by the browser and API. These are educational estimates, not a climate model.

/**
 * @typedef {{starType: string, orbital: string, atmosphere: string, water: number,
 *   massEarth: number, radiusEarth: number, tilt: number, rotationHours: number,
 *   pressureBar: number, biosphere: "none" | "familiar" | "alien"}} Params
 * @typedef {{pl_name: string, hostname: string, st_spectype: string | null,
 *   pl_rade: number | null, pl_bmasse: number | null, pl_eqt: number | null,
 *   pl_orbper: number | null, pl_orbsmax: number | null, st_mass: number | null,
 *   st_rad: number | null, st_lum: number | null, signature?: string}} CatalogRecord
 * @typedef {"calculated" | "estimated" | "assumed" | "imagined"} SectionKind
 * @typedef {{kind: SectionKind, text: string}} NarrativeSection
 * @typedef {{description: string, surfaceFeatures: string,
 *   sections?: NarrativeSection[], signature?: string}} Narrative
 */

// Persisted report envelope. v5 adds physicsVersion so saved reports keep the
// numbers they were written with when the physics model changes.
export const MODEL_VERSION = 5;
export const SUPPORTED_REPORT_VERSIONS = [2, 3, 4, MODEL_VERSION];
export const LEGACY_REPORT_VERSION = 2;
// physics-1: Bond albedo from the atmosphere class alone.
// physics-2: ice-covered basins brighten icy worlds.
// physics-3: tidal locking estimate; locked worlds have no solar day, their
//   tilt is damped to ~0° and a thin atmosphere collapses on the nightside.
// physics-4: oceans sunward of the recent-Venus limit are lost to a runaway
//   greenhouse, and a world below the cosmic shoreline cannot keep its air.
export const PHYSICS_VERSIONS = Object.freeze([
  "physics-1",
  "physics-2",
  "physics-3",
  "physics-4",
]);
export const PHYSICS_VERSION = "physics-4";
const ICE_ALBEDO = 0.55;
// Mean surface temperature of an airless body relative to T_eq. A slow rotator
// with no heat storage (dayside T proportional to cos^(1/4) of the solar zenith
// angle, cold night) averages sqrt(2) * 0.4 = 0.566 T_eq; a fast rotator or high
// thermal inertia approaches 0.989 T_eq. The area mean of T^4 is fixed at T_eq^4,
// so the mean of T can never exceed T_eq.
const AIRLESS_MEAN_FACTORS = Object.freeze([0.5657, 0.9888]);
// Tidal locking time (Gladman et al. 1996):
//   t_lock = ω a^6 I Q / (3 G M★^2 k2 R^5), with I = 0.33 M R^2.
// ω is the initial spin, taken from the assumed rotation period. Q and k2 are
// rocky-planet defaults. The catalogue query carries no stellar age, so every
// system is assumed to be 1 Gyr old. Eccentricity and spin-orbit resonances
// are not modelled: Mercury, in a 3:2 resonance, reports as locked.
export const TIDES = Object.freeze({
  Q: 100,
  k2: 0.3,
  inertiaFactor: 0.33,
  systemAgeYears: 1e9,
});
const LOW_DENSITY = Object.freeze({ minRadiusEarth: 0.8, maxDensity: 4.5 });
// A locked world's atmosphere carries enough heat to its nightside to avoid
// freezing out above about 0.1 bar (Joshi, Haberle & Reynolds 1997, Icarus 129, 450).
export const NIGHTSIDE_COLLAPSE_BAR = 0.1;
// The cosmic shoreline (Zahnle & Catling 2017, ApJ 843, 122): bodies keep an
// atmosphere when escape velocity beats the starlight they receive, along a line
// I ∝ v_esc⁴. This normalization, v_esc = 6.1 km/s at Earth's sunlight, is our
// fit to the Solar System: it separates the Moon, Mercury and Callisto from
// Earth, Venus, Titan and Pluto. Mars and Ganymede sit close to the line.
export const SHORELINE_KMS = 6.1;
// Habitable-zone fluxes, S_eff = S_eff☉ + a T + b T² + c T³ + d T⁴ with
// T = T_eff − 5780 K, valid for 2600–7200 K. Coefficients for a 1 M⊕ planet from
// the coefficient table of Kopparapu et al. 2014, ApJL 787, L29 (arXiv:1404.5292v2).
// Conservative: runaway greenhouse to maximum greenhouse.
// Optimistic: recent Venus to early Mars.
const HZ_LIMITS = Object.freeze({
  recentVenus: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
  runawayGreenhouse: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
  maximumGreenhouse: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  earlyMars: [0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
});
const HZ_TEFF_RANGE = Object.freeze([2600, 7200]);
// M dwarfs: effective temperatures below about 3900 K.
const RED_DWARF_TEFF_K = 3900;
/** @param {any} physics */
export const isRedDwarf = (physics) =>
  (physics.star?.teffK ?? 0) > 0 && physics.star.teffK < RED_DWARF_TEFF_K;
// Colour of a star to the eye, by effective temperature (upper bounds in K).
const STAR_COLOURS = Object.freeze([
  [3200, "deep red-orange"],
  [4000, "orange"],
  [5300, "yellow-orange"],
  [6200, "warm white"],
  [7500, "white"],
  [Infinity, "blue-white"],
]);
// A clear sky is Rayleigh-scattered starlight, so a cooler star, with little
// blue light to scatter, gives a paler, warmer sky. Illustrative, not radiative transfer.
const SKY_COLOURS = Object.freeze([
  [
    4000,
    "a muted sky, pale peach near the star fading to dusky mauve overhead",
  ],
  [5300, "a soft pale-blue sky, warmer toward the horizon"],
  [6200, "a blue sky"],
  [Infinity, "a deep, saturated blue sky"],
]);
const SUN_ANGULAR_DIAMETER = 0.533;
/**
 * How the star looks from the surface: colour and sky from T_eff, size from
 * its angular diameter relative to the Sun seen from Earth, and surface
 * brightness per unit area relative to the Sun's, (T_eff / 5772)^4.
 * Binary systems are a combined point source, so they get no disc.
 * @param {Params} p @param {any} physics
 */
export function starAppearance(p, physics) {
  const t = physics.star.teffK,
    /** @param {readonly (readonly [number, string])[]} bins */
    pick = (bins) =>
      /** @type {[number, string]} */ (bins.find(([max]) => t < max))[1];
  const widthVsSun = physics.angularDiameter / SUN_ANGULAR_DIAMETER,
    brightness = (t / 5772) ** 4;
  if (p.starType.includes("binary"))
    return {
      colour: physics.star.light,
      sky: null,
      widthVsSun,
      brightness,
      disc: null,
    };
  const size =
      widthVsSun >= 1.5 ? "large " : widthVsSun <= 0.67 ? "small " : "",
    colour = pick(STAR_COLOURS);
  return {
    colour,
    sky: pick(SKY_COLOURS),
    widthVsSun,
    brightness,
    disc: `a ${size}${colour} disc ${Math.abs(widthVsSun - 1) < 0.1 ? "about" : `${formatQuantity("widthVsSun", widthVsSun)}×`} the Sun's apparent width${brightness < 0.5 ? `, about ${formatQuantity("percent", brightness * 100)}% as bright per unit area as the Sun, so you could almost look at it` : ": still small in the sky, and too bright to look at"}`,
  };
}
// Shown beside the Surface Environment Index; it does not change the score.
export const STAR_ACTIVITY_CAVEAT =
  "Red dwarfs flare often and stay active for billions of years. Flares and stellar wind can strip an atmosphere and irradiate the surface, and this index does not account for them.";
// Kiang et al. 2007 (Astrobiology 7, 252) suggest photosynthesis under dim red
// starlight could favour dark pigments that absorb across the visible and near
// infrared. The app uses this only as art direction.
export const DARK_PIGMENT_NOTE =
  "The dark pigments are imagined, after the suggestion of Kiang et al. 2007 that plants under dim red starlight might absorb every colour they can.";

// One precision per reported quantity. Stat tiles, the fact sheet Claude writes
// from, the model field note, image prompts and the agent all format through
// here, so a value never appears with two roundings.
const QUANTITY_DIGITS = Object.freeze({
  temperatureC: 0,
  greenhouseK: 0,
  albedo: 2,
  gravityG: 2,
  escapeKms: 1,
  yearDays: 1,
  solarDayHours: 1,
  rotationHours: 1,
  density: 2,
  au: 3,
  sunlight: 2,
  angularDiameter: 2,
  pressureBar: 2,
  esi: 3,
  teffK: 0,
  tiltDeg: 0,
  widthVsSun: 1,
  radiusEarth: 2,
  percent: 0,
});
/** @typedef {keyof typeof QUANTITY_DIGITS} QuantityKey */
/** @param {QuantityKey} key @param {number} value */
export function roundQuantity(key, value) {
  return Number(value.toFixed(QUANTITY_DIGITS[key])) || 0;
}
/** @param {QuantityKey} key @param {number} value */
export function formatQuantity(key, value) {
  return roundQuantity(key, value).toLocaleString("en-US", {
    maximumFractionDigits: QUANTITY_DIGITS[key],
  });
}
export const STARS = {
  "G-type (Sun-like)": {
    mass: 1,
    luminosity: 1,
    radius: 1,
    light: "warm white",
  },
  "K-type (orange dwarf)": {
    mass: 0.7,
    luminosity: 0.25,
    radius: 0.7,
    light: "warm cream",
  },
  "M-type (red dwarf)": {
    mass: 0.3,
    luminosity: 0.012,
    radius: 0.3,
    light: "warm orange-white",
  },
  "F-type (yellow-white)": {
    mass: 1.3,
    luminosity: 2.5,
    radius: 1.3,
    light: "white",
  },
  "binary star system": {
    mass: 1.7,
    luminosity: 1.8,
    radius: 1,
    light: "white and amber",
  },
};
export const ZONES = {
  "inner edge (very hot)": 0.72,
  "inner habitable zone": 0.95,
  "middle habitable zone": 1,
  "outer habitable zone": 1.4,
  "outer edge (very cold)": 1.7,
};
export const ATMOSPHERES = {
  "nitrogen-oxygen (Earth-like)": {
    pressure: 1,
    albedo: 0.3,
    greenhouse: 33,
    suitability: 1,
  },
  "thick CO2 (Venus-like)": {
    pressure: 90,
    albedo: 0.65,
    greenhouse: 420,
    suitability: 0.1,
  },
  "thin nitrogen": {
    pressure: 0.2,
    albedo: 0.3,
    greenhouse: 5,
    suitability: 0.6,
  },
  "methane-rich": {
    pressure: 1.5,
    albedo: 0.3,
    greenhouse: 80,
    suitability: 0.3,
  },
  "hydrogen-helium envelope": {
    pressure: 10,
    albedo: 0.5,
    greenhouse: 60,
    suitability: 0,
  },
  "none (airless body)": {
    pressure: 0,
    albedo: 0.1,
    greenhouse: 0,
    suitability: 0,
  },
};
export const DEFAULTS = Object.freeze({
  starType: "G-type (Sun-like)",
  orbital: "middle habitable zone",
  atmosphere: "nitrogen-oxygen (Earth-like)",
  water: 70,
  massEarth: 1,
  radiusEarth: 1,
  tilt: 23,
  rotationHours: 24,
  pressureBar: 1,
  biosphere: "familiar",
});

export class InputError extends Error {}
export function object(value, name = "Input") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError(`${name} must be an object.`);
  return value;
}
export function finite(value, min, max, name) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new InputError(`${name} must be between ${min} and ${max}.`);
  return value;
}
export function shortText(value, max, name) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new InputError(
      `${name} must be nonempty text of at most ${max} characters.`,
    );
  return value.trim();
}
/**
 * @param {any} input
 * @returns {Params}
 */
export function validateParams(input) {
  object(input, "Parameters");
  /** @type {any} */
  const result = {};
  for (const [key, choices] of Object.entries({
    starType: STARS,
    orbital: ZONES,
    atmosphere: ATMOSPHERES,
  })) {
    if (typeof input[key] !== "string" || !Object.hasOwn(choices, input[key]))
      throw new InputError(`Choose a supported ${key}.`);
    result[key] = input[key];
  }
  for (const [key, min, max] of [
    ["water", 0, 100],
    ["massEarth", 0.001, 10000],
    ["radiusEarth", 0.01, 100],
    ["tilt", 0, 90],
    ["rotationHours", 1, 1000000],
    ["pressureBar", 0, 1000],
  ]) {
    result[key] = finite(input[key], min, max, key);
  }
  result.biosphere =
    input.biosphere === undefined ? "familiar" : input.biosphere;
  if (!["none", "familiar", "alien"].includes(result.biosphere))
    throw new InputError(
      "Choose None, Familiar or Alien for the imagined biosphere.",
    );
  if (result.atmosphere.includes("none")) {
    if (result.pressureBar !== 0 || result.water !== 0)
      throw new InputError(
        "An airless surface requires zero pressure and exposed water coverage.",
      );
  } else if (result.pressureBar <= 0)
    throw new InputError(
      "An atmosphere requires a positive pressure assumption.",
    );
  if (result.atmosphere.includes("hydrogen") && result.water !== 0)
    throw new InputError(
      "A gas envelope has no assigned surface-water coverage.",
    );
  return result;
}

const CATALOG_FIELDS = {
  pl_rade: [0.01, 100],
  pl_bmasse: [0.001, 10000],
  pl_eqt: [1, 10000],
  pl_orbper: [0.001, 1e8],
  pl_orbsmax: [0.00001, 100000],
  st_mass: [0.001, 1000],
  st_rad: [0.001, 10000],
  st_lum: [-12, 12],
};
/**
 * @param {any} input
 * @returns {CatalogRecord | null}
 */
export function validateCatalog(input) {
  if (input == null) return null;
  object(input, "Catalogue record");
  /** @type {any} */
  const record = {
    pl_name: shortText(input.pl_name, 100, "Planet name"),
    hostname: shortText(input.hostname || input.pl_name, 100, "Host name"),
    st_spectype:
      typeof input.st_spectype === "string"
        ? input.st_spectype.slice(0, 40)
        : null,
  };
  for (const [key, [min, max]] of Object.entries(CATALOG_FIELDS))
    record[key] = input[key] == null ? null : finite(input[key], min, max, key);
  // Server attestation that the record came from the NASA archive (lib/provenance.js).
  if (
    typeof input.signature === "string" &&
    /^[a-f0-9]{64}$/.test(input.signature)
  )
    record.signature = input.signature;
  return record;
}
/**
 * A world seed: an unsigned 32-bit integer (lib/seed.js).
 * @param {unknown} value
 */
export function validateSeed(value) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0xffffffff
  )
    throw new InputError(
      "A world seed is a whole number from 0 to 4294967295.",
    );
  return value;
}
/** @param {unknown} value */
export function validatePhysicsVersion(value) {
  if (value === undefined) return PHYSICS_VERSION;
  if (typeof value !== "string" || !PHYSICS_VERSIONS.includes(value))
    throw new InputError("This physics model version is not supported.");
  return value;
}
/** @param {any} input */
export function validateSurvey(input) {
  object(input);
  if (
    Object.keys(input).some(
      (key) => !["params", "catalog", "view", "physicsVersion"].includes(key),
    )
  )
    throw new InputError("Send survey parameters, not a custom prompt.");
  const params = validateParams(input.params),
    catalog = validateCatalog(input.catalog),
    physicsVersion = validatePhysicsVersion(input.physicsVersion);
  for (const [field, key] of [
    ["massEarth", "pl_bmasse"],
    ["radiusEarth", "pl_rade"],
  ]) {
    if (catalog?.[key] != null && params[field] !== catalog[key])
      throw new InputError(
        "Catalogue mass and radius must be preserved. Detach the catalogue record to create a fictional variation.",
      );
  }
  return { params, catalog, physicsVersion };
}
/** @param {any} record */
export function paramsFromCatalog(record) {
  const c = /** @type {CatalogRecord} */ (validateCatalog(record));
  const match = Object.keys(STARS).find((s) =>
    s.startsWith((c.st_spectype || "").charAt(0).toUpperCase() + "-type"),
  );
  /** @type {Params} */
  const params = {
    ...DEFAULTS,
    starType: match || DEFAULTS.starType,
    massEarth: c.pl_bmasse ?? 1,
    radiusEarth: c.pl_rade ?? 1,
  };
  if (params.radiusEarth > 2.5) {
    params.atmosphere = "hydrogen-helium envelope";
    params.water = 0;
    params.pressureBar = 10;
  }
  return params;
}
export function calcESI(mass, radius, escapeKms, temperatureC) {
  const quantities = [
    [radius, 1, 0.57],
    [mass / radius ** 3, 1, 1.07],
    [escapeKms, 11.186, 0.7],
    [temperatureC + 273.15, 288, 5.58],
  ];
  return quantities.reduce(
    (score, [value, reference, weight]) =>
      score *
      Math.max(0, 1 - Math.abs(value - reference) / (value + reference)) **
        (weight / 4),
    1,
  );
}

export function classify(p, physics) {
  if (p.atmosphere.includes("hydrogen")) return "CLASS J — GAS-SHROUDED";
  if (p.atmosphere.includes("none")) return "CLASS D — AIRLESS";
  if (physics.temperatureC < 0)
    return p.water > 0 ? "CLASS P — GLACIAL" : "CLASS K — COLD DESERT";
  if (physics.temperatureC > 60) return "CLASS H — HOTHOUSE";
  if (p.water <= 20) return "CLASS K — ARID";
  if (physics.temperatureC > 35) return "CLASS W — WARM";
  if (p.water > 80) return "CLASS O — OCEANIC";
  return "CLASS M — TEMPERATE";
}
/**
 * @param {Params} p
 * @param {{mass: number}} star
 * @param {number} au
 */
export function tidalLockEstimate(p, star, au) {
  const mass = p.massEarth * 5.9722e24,
    radius = p.radiusEarth * 6.371e6,
    spin = (2 * Math.PI) / (p.rotationHours * 3600),
    inertia = TIDES.inertiaFactor * mass * radius ** 2,
    seconds =
      (spin * (au * 1.495978707e11) ** 6 * inertia * TIDES.Q) /
      (3 * 6.6743e-11 * (star.mass * 1.98847e30) ** 2 * TIDES.k2 * radius ** 5),
    lockYears = seconds / 3.15576e7;
  return {
    lockYears,
    ageYears: TIDES.systemAgeYears,
    locked: lockYears < TIDES.systemAgeYears,
  };
}
/**
 * Stellar effective temperature from luminosity and radius in solar units,
 * scaled from the Sun's 5772 K (IAU 2015 nominal value).
 * @param {{luminosity: number, radius: number}} star
 */
export function effectiveTemperature(star) {
  return 5772 * (star.luminosity / star.radius ** 2) ** 0.25;
}
/**
 * Kopparapu et al. 2014 habitable-zone edges in AU, and where the planet sits.
 * position is the planet's fraction of the way across the conservative zone
 * (0 at the inner edge, 1 at the outer edge). Null outside the fit's T_eff range.
 * @param {number} teffK @param {number} luminosity @param {number} au
 */
export function habitableZone(teffK, luminosity, au) {
  if (teffK < HZ_TEFF_RANGE[0] || teffK > HZ_TEFF_RANGE[1]) return null;
  const t = teffK - 5780;
  /** @param {readonly number[]} c */
  const edge = ([s, a, b, c, d]) =>
    Math.sqrt(luminosity / (s + a * t + b * t ** 2 + c * t ** 3 + d * t ** 4));
  const conservative = [
      edge(HZ_LIMITS.runawayGreenhouse),
      edge(HZ_LIMITS.maximumGreenhouse),
    ],
    optimistic = [edge(HZ_LIMITS.recentVenus), edge(HZ_LIMITS.earlyMars)];
  const region =
    au < optimistic[0]
      ? "sunward of the optimistic inner edge"
      : au < conservative[0]
        ? "in the optimistic zone, sunward of the conservative inner edge"
        : au <= conservative[1]
          ? "inside the conservative zone"
          : au <= optimistic[1]
            ? "in the optimistic zone, beyond the conservative outer edge"
            : "beyond the optimistic outer edge";
  return {
    conservative,
    optimistic,
    position: (au - conservative[0]) / (conservative[1] - conservative[0]),
    region,
  };
}
/**
 * Whether a moon could survive. Prograde moons stay bound out to about half the
 * Hill radius; a moon closer than the Roche limit (2.44 R, for a moon as dense
 * as the planet) is torn apart. A locked planet spins once per orbit, so its
 * synchronous orbit lies at 3^(1/3) r_H, outside every stable moon orbit, and
 * tides drag any moon inward.
 * @param {Params} p @param {{mass: number}} star @param {number} au
 * @param {boolean} locked
 */
export function moonStability(p, star, au, locked) {
  const hillPlanetRadii =
      (au *
        1.495978707e11 *
        (p.massEarth / 332946 / (3 * star.mass)) ** (1 / 3)) /
      (p.radiusEarth * 6.371e6),
    stablePlanetRadii = hillPlanetRadii / 2,
    rochePlanetRadii = 2.44;
  return {
    hillPlanetRadii,
    stablePlanetRadii,
    rochePlanetRadii,
    possible: stablePlanetRadii > rochePlanetRadii && !locked,
    reason:
      stablePlanetRadii <= rochePlanetRadii
        ? "too close to its star to hold a moon"
        : locked
          ? "its locked spin means tides would drag any moon inward"
          : `moons could orbit stably out to about ${Math.round(stablePlanetRadii)} planet radii`,
  };
}
/**
 * One sentence placing the planet in its habitable zone, shared by the fact
 * sheet, the provenance panel and the agent.
 * @param {any} physics
 */
export function habitableZoneText(physics) {
  const hz = physics.habitableZone;
  if (!hz)
    return "habitable zone not computed: the star is outside the 2600–7200 K range of the Kopparapu et al. 2014 fit";
  /** @param {number[]} range */
  const span = ([inner, outer]) =>
    `${formatQuantity("au", inner)}–${formatQuantity("au", outer)} AU`;
  const where =
    hz.region === "inside the conservative zone"
      ? `${hz.region}, ${Math.round(hz.position * 100)}% of the way from its inner to its outer edge`
      : hz.region;
  return `habitable zone (Kopparapu et al. 2014): conservative ${span(hz.conservative)}, optimistic ${span(hz.optimistic)}; at ${formatQuantity("au", physics.au)} AU the planet is ${where}`;
}
/** @param {number} years */
export function formatYears(years) {
  return years < 1e9
    ? `${Number((years / 1e6).toPrecision(2))} Myr`
    : `${Number((years / 1e9).toPrecision(2))} Gyr`;
}
/**
 * @param {any} input Survey parameters
 * @param {any} [catalogInput]
 * @param {string} [physicsVersionInput] Defaults to the current model.
 */
export function calculate(input, catalogInput = null, physicsVersionInput) {
  const {
      params: p,
      catalog,
      physicsVersion,
    } = validateSurvey({
      params: input,
      catalog: catalogInput,
      physicsVersion: physicsVersionInput,
    }),
    atmosphere = ATMOSPHERES[p.atmosphere];
  const star = { ...STARS[p.starType], teffK: 0 };
  if (catalog?.st_mass != null) star.mass = catalog.st_mass;
  if (catalog?.st_lum != null) star.luminosity = 10 ** catalog.st_lum;
  if (catalog?.st_rad != null) star.radius = catalog.st_rad;
  const au =
    catalog?.pl_orbsmax ??
    (catalog?.pl_orbper != null
      ? ((catalog.pl_orbper / 365.25) ** 2 *
          (star.mass + p.massEarth / 332946)) **
        (1 / 3)
      : ZONES[p.orbital] * Math.sqrt(star.luminosity));
  const yearDays =
    catalog?.pl_orbper ??
    365.25 * Math.sqrt(au ** 3 / (star.mass + p.massEarth / 332946));
  const greenhouseK =
    atmosphere.pressure === 0
      ? 0
      : (atmosphere.greenhouse * Math.log1p(p.pressureBar)) /
        Math.log1p(atmosphere.pressure);
  /** @param {number} bondAlbedo */
  const balance = (bondAlbedo) => {
    const equilibriumK =
      catalog?.pl_eqt ??
      (278.5 * (star.luminosity * (1 - bondAlbedo)) ** 0.25) / Math.sqrt(au);
    const temperatureC = equilibriumK + greenhouseK - 273.15;
    return {
      equilibriumK,
      temperatureC,
      phase: waterState(temperatureC, p.pressureBar, p.water),
    };
  };
  let albedo = atmosphere.albedo,
    albedoSource = "atmosphere class";
  let { equilibriumK, temperatureC, phase } = balance(albedo);
  // One deterministic pass, not an ice-albedo feedback simulation: when the
  // atmosphere-only estimate favors ice, ice-covered basins brighten the world.
  if (
    physicsVersion !== "physics-1" &&
    catalog?.pl_eqt == null &&
    phase === "Ice favored" &&
    p.water > 0
  ) {
    const blended =
      atmosphere.albedo * (1 - p.water / 100) + ICE_ALBEDO * (p.water / 100);
    if (blended > albedo) {
      albedo = blended;
      albedoSource = `atmosphere class blended with ${p.water}% ice cover`;
      ({ equilibriumK, temperatureC, phase } = balance(albedo));
    }
  }
  const gravityG = p.massEarth / p.radiusEarth ** 2;
  const escapeKms =
    Math.sqrt(
      (2 * 6.6743e-11 * p.massEarth * 5.9722e24) / (p.radiusEarth * 6.371e6),
    ) / 1000;
  const density = (5.514 * p.massEarth) / p.radiusEarth ** 3;
  const tides = PHYSICS_VERSIONS.indexOf(physicsVersion) >= 2,
    tidalLock = tides ? tidalLockEstimate(p, star, au) : null;
  const solarFrequency = Math.abs(1 / p.rotationHours - 1 / (yearDays * 24));
  const solarDayHours =
    tidalLock?.locked || solarFrequency < 1e-9 ? null : 1 / solarFrequency;
  const gas = p.atmosphere.includes("hydrogen"),
    airless = p.atmosphere.includes("none"),
    locked = tidalLock?.locked === true;
  // Tides damp a locked world's obliquity to about zero; the tilt setting is
  // then art direction, not physics.
  const tiltDeg = locked ? 0 : p.tilt;
  const nightside =
    locked && !airless && !gas
      ? {
          thresholdBar: NIGHTSIDE_COLLAPSE_BAR,
          collapses: p.pressureBar < NIGHTSIDE_COLLAPSE_BAR,
        }
      : null;
  const teffK = (star.teffK = effectiveTemperature(star));
  const current = PHYSICS_VERSIONS.indexOf(physicsVersion) >= 3,
    hz = tides ? habitableZone(teffK, star.luminosity, au) : null,
    sunlight = star.luminosity / au ** 2;
  // Sunward of the recent-Venus limit the oceans boil off and their hydrogen
  // escapes. Between it and the runaway limit, the existing note still applies.
  const runaway =
    current && hz && !gas && !airless && p.water > 0
      ? { limitAu: hz.optimistic[0], lost: au < hz.optimistic[0] }
      : null;
  if (runaway?.lost) phase = "Vapor favored";
  const retention =
    current && !gas && !airless
      ? {
          minEscapeKms: SHORELINE_KMS * sunlight ** 0.25,
          retained: escapeKms >= SHORELINE_KMS * sunlight ** 0.25,
        }
      : null;
  const weights = [
    {
      name: "Mean temperature",
      max: 40,
      value: Math.max(0, 1 - Math.abs(temperatureC - 15) / 65),
    },
    {
      name: "Exposed liquid water",
      max: 25,
      value: phase === "Liquid water plausible" ? Math.min(1, p.water / 50) : 0,
    },
    {
      name: "Pressure assumption",
      max: 20,
      value:
        p.pressureBar > 0
          ? Math.max(0, 1 - Math.abs(Math.log10(p.pressureBar)) / 2)
          : 0,
    },
    { name: "Atmosphere assumption", max: 15, value: atmosphere.suitability },
  ].map((f) => {
    // A collapsed atmosphere freezes its air and water onto the nightside.
    const collapsed =
      nightside?.collapses &&
      ["Exposed liquid water", "Pressure assumption"].includes(f.name);
    // A runaway greenhouse runs far hotter than the simple energy balance.
    const boiled = runaway?.lost && f.name === "Mean temperature";
    // Air that escapes takes its water with it.
    const escaped =
      retention && !retention.retained && f.name !== "Mean temperature";
    const value = airless || collapsed || boiled || escaped ? 0 : f.value;
    return { ...f, value, points: Math.round(f.max * value) };
  });
  const score = gas
    ? null
    : airless
      ? 0
      : weights.reduce((sum, f) => sum + f.points, 0);
  const warnings = [];
  if (airless)
    warnings.push(
      "Without an atmosphere to carry heat, the equilibrium temperature is an upper bound on the mean surface temperature; day and night differ greatly.",
    );
  const volatile = density < 3 || p.radiusEarth > 1.6;
  if (volatile)
    warnings.push(
      "A volatile-rich interior or envelope is plausible. A rocky surface is an assumption.",
    );
  const densityNote =
    tides &&
    !volatile &&
    p.radiusEarth > LOW_DENSITY.minRadiusEarth &&
    density < LOW_DENSITY.maxDensity
      ? "implies a small iron core or a volatile-rich interior"
      : null;
  if (densityNote)
    warnings.push(
      `A bulk density of ${formatQuantity("density", density)} g/cm³ at this size ${densityNote}.`,
    );
  if (density > 12 || density < 0.1)
    warnings.push(
      "This mass–radius combination implies an unusual bulk density; check the composition assumptions.",
    );
  if (tidalLock?.locked)
    warnings.push(
      `Tidal locking estimate: about ${formatYears(tidalLock.lockYears)} against an assumed ${formatYears(tidalLock.ageYears)} system age (Q ${TIDES.Q}, k₂ ${TIDES.k2}), so one face stays toward the star. Eccentricity and spin-orbit resonances are not modeled.`,
    );
  if (nightside?.collapses)
    warnings.push(
      `Below about ${NIGHTSIDE_COLLAPSE_BAR} bar a locked world's atmosphere cannot carry enough heat to its nightside, so air and water would freeze out there (Joshi et al. 1997). The liquid-water and pressure factors score zero.`,
    );
  if (runaway?.lost)
    warnings.push(
      `Sunward of the recent-Venus limit (${formatQuantity("au", runaway.limitAu)} AU, Kopparapu et al. 2014), a runaway greenhouse boils the oceans away and their hydrogen escapes to space, so no liquid water remains. The mean temperature shown is the simple energy balance; a runaway greenhouse would run far hotter. The temperature and liquid-water factors score zero.`,
    );
  if (retention && !retention.retained)
    warnings.push(
      `With an escape velocity of ${formatQuantity("escapeKms", escapeKms)} km/s under ${formatQuantity("sunlight", sunlight)}× Earth's sunlight, this world lies beyond the cosmic shoreline (Zahnle & Catling 2017): it would need about ${formatQuantity("escapeKms", retention.minEscapeKms)} km/s to keep an atmosphere. The assumed air and water would escape over time, so the water, pressure and atmosphere factors score zero.`,
    );
  if (!tides && p.starType.includes("M-type"))
    warnings.push(
      "Tidal evolution may affect rotation. Age, eccentricity and tidal dissipation are unknown; synchronous rotation is not assumed.",
    );
  if (p.starType.includes("binary"))
    warnings.push(
      "The binary uses combined stellar properties as a distant point source; orbital stability and separate stellar positions are not modeled.",
    );
  if (tiltDeg > 45)
    warnings.push(
      "High obliquity may produce strong seasonal contrasts. Seasonal temperatures are not calculated.",
    );
  if (phase === "Water phase outside model range")
    warnings.push(
      "Water phase exceeds the supported saturation approximation; liquid water is not established.",
    );
  if (catalog)
    warnings.push(
      "Atmosphere, water, pressure, rotation and tilt are scenario assumptions, not detections on this exoplanet.",
    );
  if (catalog && !/^[FGKM]/i.test(catalog.st_spectype || ""))
    warnings.push(
      "The catalogue has no supported spectral class. The selected star class is an illustrative assumption; available stellar mass, radius and luminosity still take precedence.",
    );
  const physics = {
    physicsVersion,
    star,
    au,
    yearDays,
    albedo: catalog?.pl_eqt != null ? null : albedo,
    albedoSource:
      catalog?.pl_eqt != null ? "catalogue equilibrium estimate" : albedoSource,
    equilibriumK,
    greenhouseK,
    temperatureC,
    // Airless bodies report T_eq, an upper bound on their mean surface temperature.
    temperatureKind: airless ? "equilibrium" : "mean",
    airlessMeanRangeC: airless
      ? AIRLESS_MEAN_FACTORS.map((factor) => factor * equilibriumK - 273.15)
      : null,
    gravityG,
    escapeKms,
    density,
    densityNote,
    tidalLock,
    tiltDeg,
    nightside,
    habitableZone: hz,
    runaway,
    retention,
    moons: tides ? moonStability(p, star, au, locked) : null,
    solarDayHours,
    solarDaysPerYear:
      solarDayHours == null ? null : (yearDays * 24) / solarDayHours,
    angularDiameter:
      (2 * Math.atan((star.radius * 695700) / (au * 149597870.7)) * 180) /
      Math.PI,
    waterState: phase,
    score,
    factors: weights,
    warnings,
    esi: gas
      ? null
      : calcESI(p.massEarth, p.radiusEarth, escapeKms, temperatureC),
    orbitSource:
      catalog?.pl_orbper != null
        ? "Catalogued orbital period"
        : "Kepler estimate",
    temperatureSource:
      catalog?.pl_eqt != null
        ? "Catalogue equilibrium estimate + assumed greenhouse"
        : "Simplified energy-balance estimate",
  };
  physics.classification = classify(p, physics);
  physics.activityCaveat = isRedDwarf(physics) ? STAR_ACTIVITY_CAVEAT : null;
  return physics;
}

// One provenance tag per reported quantity, shared by the stat tiles, the fact
// sheet and the model field note:
//   calculated: derived from inputs by a formula
//   estimated:  a model with real uncertainty (energy balance, locking)
//   assumed:    an input the operator chose
//   imagined:   art direction
// NASA catalogue values enter the formulas as inputs; a quantity read straight
// from the catalogue stays "calculated" and its tile names the source.
/**
 * @param {string} key
 * @param {any} physics
 * @returns {SectionKind}
 */
export function quantityKind(key, physics) {
  const locked = physics.tidalLock?.locked === true;
  if (key === "solarDayHours") return locked ? "estimated" : "assumed";
  // The operator's tilt; on a locked world tides override it.
  if (key === "tilt") return locked ? "imagined" : "assumed";
  if (
    [
      "temperatureC",
      "waterState",
      "tidalLock",
      "tiltDeg",
      "nightside",
      "habitableZone",
      "moons",
    ].includes(key)
  )
    return "estimated";
  if (key === "biosphere") return "imagined";
  return "calculated";
}
const TILES = Object.freeze({
  temperatureC: "Mean temperature",
  gravityG: "Surface gravity",
  escapeKms: "Escape velocity",
  yearDays: "Orbital period",
  solarDayHours: "Solar day",
  waterState: "Water phase",
  density: "Bulk density",
  biosphere: "Biosphere",
});
/**
 * A stat tile's label and value, both from the shared registries.
 * @param {keyof typeof TILES} key
 * @param {Params} p
 * @param {any} physics
 * @param {CatalogRecord | null} [catalog]
 */
export function statTile(key, p, physics, catalog = null) {
  const kind = quantityKind(key, physics);
  /** @type {string[]} */
  const label = [TILES[key], kind];
  /** @type {string} */
  let value;
  switch (key) {
    case "temperatureC":
      if (physics.temperatureKind === "equilibrium") {
        label[0] = "Equilibrium temperature";
        label.push("upper bound");
      }
      value = `${formatQuantity(key, physics.temperatureC)}°C`;
      break;
    case "gravityG":
      value = `${formatQuantity(key, physics.gravityG)} g`;
      break;
    case "escapeKms":
      value = `${formatQuantity(key, physics.escapeKms)} km/s`;
      break;
    case "yearDays":
      if (catalog?.pl_orbper != null) label.push("NASA catalogue");
      value = `${formatQuantity(key, physics.yearDays)} Earth days`;
      break;
    case "solarDayHours":
      value = physics.tidalLock?.locked
        ? "Tidally locked · permanent dayside"
        : physics.solarDayHours == null
          ? "No solar day cycle"
          : `${formatQuantity(key, physics.solarDayHours)} Earth hours`;
      break;
    case "waterState":
      value = physics.waterState;
      break;
    case "density":
      value = `${formatQuantity(key, physics.density)} g/cm³`;
      break;
    default:
      value = biosphereSpec(p, physics).present
        ? "Not established"
        : "None depicted";
  }
  return { label: label.join(" · "), value, kind };
}
/**
 * Share of the surface under water or ice: the figure the globe is built to
 * and the one every caption and prompt quotes.
 * @param {Params} p
 * @param {any} physics
 */
export function surfaceWater(p, physics) {
  const standing =
      ["Liquid water plausible", "Ice favored"].includes(physics.waterState) &&
      !/hydrogen|none/.test(p.atmosphere),
    percent = standing ? p.water : 0,
    form = physics.waterState === "Ice favored" ? "ice" : "liquid water";
  return {
    percent,
    form,
    text: percent
      ? `${form} covers ${percent}% of the surface`
      : "no standing water at the surface",
  };
}
export function biosphereSpec(p, physics) {
  const mode = p.biosphere ?? "familiar",
    alien = mode === "alien";
  const present =
    mode !== "none" &&
    physics.waterState === "Liquid water plausible" &&
    physics.temperatureC >= 0 &&
    physics.temperatureC <= (alien ? 60 : 45) &&
    p.pressureBar >= (alien ? 0.1 : 0.2) &&
    p.pressureBar <= (alien ? 10 : 5) &&
    p.water > 0 &&
    (alien || p.water < 100) &&
    !/hydrogen|none/.test(p.atmosphere) &&
    (alien ||
      ["nitrogen-oxygen (Earth-like)", "thin nitrogen"].includes(p.atmosphere));
  if (!present)
    return {
      mode,
      present: false,
      reason:
        mode === "none"
          ? "Vegetation intentionally omitted."
          : "No vegetation depicted under these modeled surface conditions; this is an artistic constraint, not a verdict on life.",
    };
  const star = p.starType.charAt(0);
  const alienPalettes = {
    G: "burnished copper, muted vermilion and deep plum",
    K: "dusky violet, indigo and copper",
    M: "oxblood burgundy, near-black violet and glossy midnight blue",
    F: "silvery ivory, lavender and deep violet",
    b: "amber, smoky indigo and bronze",
  };
  const palette = alien
    ? alienPalettes[star]
    : star === "M"
      ? "deep burgundy and charcoal-violet"
      : star === "K"
        ? "dark teal-green and moss green with occasional copper tips"
        : "deep forest green and blue-green with muted golden groundcover";
  const collectors = {
    G: "spiraling pleated rosettes and branching ribbon fans",
    K: "stacked frilled crowns and folded ribbon vanes",
    M: "broad overlapping membrane fans and folded sail-shaped lobes",
    F: "waxy folded cups and reflective ribbed vanes",
    b: "layered twisted vanes and branching rosettes",
  };
  let forms = alien
    ? collectors[star]
    : "layered fernlike canopies, branching frond groves and mosslike groundcover";
  if (alien) {
    forms =
      p.water === 100
        ? "floating interlocking rosette colonies and buoyant ribbed bladders; no rooted trees or exposed land"
        : physics.gravityG > 1.4
          ? `low interlocking cushions and squat radial domes carrying ${collectors[star]}`
          : p.pressureBar < 0.5 || physics.temperatureC < 8
            ? `compact ground-hugging mats with small ${collectors[star]}`
            : physics.gravityG < 0.8
              ? `tall slender branching stalks supporting ${collectors[star]}`
              : `waist-high branching structures with ${collectors[star]}`;
  } else if (physics.gravityG > 1.5)
    forms = "low, dense fernlike mats and squat branching shrubs";
  const habitat =
    p.water === 100
      ? "Patchy floating colonies on the ocean surface, separated by broad open water."
      : p.water <= 20
        ? "Sparse drought-adapted clusters near isolated water margins; most terrain remains bare."
        : physics.temperatureC > 35
          ? "Sparse folded growth concentrated in shaded channels and wet depressions; broad exposed slopes remain bare."
          : p.water > 80
            ? "Buoyant colonies in sheltered shallows and dense growth on small island margins, with broad open seas."
            : "Patchy growth in coastal lowlands and valleys, thinning across exposed ridges.";
  return {
    mode,
    present,
    palette,
    forms,
    habitat,
    pigmentNote: isRedDwarf(physics) ? DARK_PIGMENT_NOTE : null,
    seasonal:
      (physics.tiltDeg ?? p.tilt) > 45
        ? "Invent a mosaic of dormant patches and active growth as a seasonal artistic motif; no seasonal climate has been calculated."
        : "Use irregular transitions between growth and bare ground.",
    atmosphere: p.atmosphere.includes("methane")
      ? "View the invented forms through amber haze; their metabolism and pigments are unspecified."
      : "Keep the specified atmospheric light and haze.",
  };
}
// Parameter-order independent, independent of biosphere art mode. Not a terrain simulation.
export function geographySpec(p, physics) {
  const { biosphere: _artMode, ...physicalParams } = validateParams(p);
  let hash = 2166136261;
  for (const char of JSON.stringify(physicalParams))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const pick = (choices) => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return choices[hash % choices.length];
  };
  if (p.atmosphere.includes("hydrogen"))
    return "Alternating bright zones and darker belts running straight and parallel to the equator, with clear contrast between them, plus a few oval vortices and turbulent eddies along the belt edges; no continents.";
  const frozen = physics.waterState === "Ice favored",
    liquid = physics.waterState === "Liquid water plausible";
  if (p.water === 100 && (liquid || frozen))
    return `An uninterrupted global ${frozen ? "ice sheet" : "ocean"} with no exposed land or islands.`;
  const tectonics = pick([
    "a forked rift crossing a broad plateau",
    "three discontinuous parallel mountain belts",
    "an off-center circular uplift cut by radial valleys",
    "short disconnected mountain clusters around shallow fault depressions",
    "intersecting stepped scarps around a broad irregular basin",
  ]);
  if (!p.water || (!liquid && !frozen))
    return `Original asymmetric highlands with ${tectonics}; no open liquid seas or terrestrial coastal outlines.`;
  const topology =
    p.water > 80
      ? "small disconnected landmasses and scattered island chains; no large continents"
      : pick([
          "five unequal compact landmasses loosely clustered in one hemisphere, with a broad open basin opposite",
          "one broad irregular landmass with three smaller detached landmasses at different latitudes",
          "seven unequal rounded landmasses grouped asymmetrically around broad connected basins",
          "two broad squat landmasses side by side at different latitudes with four smaller outliers",
          "four compact lobate landmasses of different sizes distributed unevenly across both hemispheres",
          "six broad irregular landmasses grouped into two unequal clusters separated by open water",
        ]);
  const coast = pick([
    "scalloped bays and short blunt peninsulas",
    "irregular stepped shores with localized inlets",
    "broad convex shores interrupted by small embayments",
    "rounded headlands alternating with broad shallow gulfs",
    "short drowned valleys and blunt capes",
  ]);
  const islands = pick([
    "two small loose clusters of compact islands",
    "a sparse asymmetric island swarm near the equator",
    "widely separated groups of squat offshore islands",
    "a few irregular compact islands in one hemisphere",
    "three small island clusters around a broad basin",
  ]);
  const inland = pick([
    "a broad irregular inland basin",
    "three disconnected round inland basins",
    "a compact lobed inland basin with short inlets",
    "a pair of offset broad inland basins",
    "small enclosed basins near a rift",
  ]);
  const polar = pick([
    "land concentrated near one pole and open basins near the other",
    "open polar basins with land concentrated at middle latitudes",
    "two small unequal polar land caps separated from the main land",
    "a compact off-center polar landmass in one hemisphere and scattered islands in the other",
  ]);
  return `Fictional arrangement: ${topology}; ${coast}; ${islands}; ${inland}; ${polar}; ${tectonics}. Main landmasses are broad and irregular, with comparable length and width, substantial interiors and short coastal protrusions; separation comes from wide connected basins. Avoid ribbon continents, globe-spanning strips and paired tapering north–south landmasses resembling the Americas. Scale all basins together to ${p.water}% ${frozen ? "ice-covered basin" : "liquid-water"} coverage and ${100 - p.water}% exposed land. ${frozen ? "Continuous ice fills the assigned basins; no open blue liquid seas." : "Inland waters are included in the total water coverage."}`;
}
// A repeatable artistic setting, not a measured position or a coordinate terrain map.
export function surfaceSiteSpec(p, physics) {
  const geography = geographySpec(p, physics);
  let hash = 2166136261;
  for (const char of geography)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const label = `Region ${String(hash % 1000).padStart(3, "0")}`;
  const direction = [
    "northwestern",
    "northeastern",
    "southwestern",
    "southeastern",
  ][(hash >>> 8) & 3];
  // Landforms only: vegetation, life and lighting are layered on separately,
  // so the art mode never moves the scene. The first scene of each list is
  // the original, which some worlds keep.
  const airless = p.atmosphere.includes("none"),
    peaks =
      physics.gravityG < 0.7
        ? "tall, steep, jagged"
        : physics.gravityG > 1.5
          ? "low, broad, rounded"
          : "rugged";
  /** @type {[string, boolean][]} */
  let scenes;
  if (p.atmosphere.includes("hydrogen"))
    scenes = [
      "a local upper-cloud region with layered cloud banks at the horizon",
      "the edge of a giant storm vortex, its cloud wall curving away toward the horizon",
      "a deep chasm between towering cloud banks, opening onto lower decks far below",
      "the boundary between a bright zone and a darker belt, with eddies rolling along the shear",
    ].map((scene) => [`${scene}; no solid ground`, true]);
  else if (physics.waterState === "Ice favored")
    scenes =
      p.water === 100
        ? [
            "a local expanse within the global ice sheet, with textured ice extending to the horizon",
            "a field of crevasses and pressure ridges across the global ice sheet",
            "wind-carved ice ridges running to the horizon across the global ice sheet",
          ].map((scene) => [`${scene}; no exposed land`, true])
        : [
            [
              "a local ice-basin margin adjoining low exposed mineral ridges",
              true,
            ],
            [
              "the snout of a broad glacier flowing between exposed mineral ridges",
              true,
            ],
            [
              "a canyon cut deep into the ice, with layered blue-white walls",
              true,
            ],
            [
              "a frozen sea broken into pressure ridges against a rocky shore",
              p.water >= 30,
            ],
            [
              `a high mountain ridge of ${peaks} peaks rising above the ice fields`,
              p.water <= 80,
            ],
          ];
  else if (physics.waterState === "Liquid water plausible" && p.water > 0)
    scenes =
      p.water === 100
        ? [
            "a local patch of open ocean within the global ocean; water extends to every horizon with no islands",
            "open ocean under a long, rolling swell; water extends to every horizon with no islands",
            "open ocean where a line of storm cells meets calm water; water extends to every horizon with no islands",
          ].map((scene) => [scene, true])
        : [
            [
              `the ${direction} shore of ${p.water > 80 ? "one small compact island" : "the largest compact landmass"}, looking from weathered coastal ground across a broad basin; a short blunt headland frames one side`,
              true,
            ],
            [
              `a high sea-cliff summit on the ${direction} coast, looking down over a scatter of islands and the shallows between them, so the island surfaces are seen from above`,
              p.water >= 40,
            ],
            [
              "the rim of a steep escarpment dropping into a broad river valley that winds toward distant water",
              p.water <= 80,
            ],
            [
              "the floor of a deep river canyon with layered rock walls, the river running toward the coast",
              p.water <= 70,
            ],
            [
              `a high mountain ridge of ${peaks} peaks, with water glinting in the far distance`,
              p.water <= 70,
            ],
            [
              "a broad river delta of braided channels and low islands where a river meets the sea",
              true,
            ],
          ];
  else
    scenes = [
      [
        "a local shallow dry basin bordered by weathered mineral outcrops",
        true,
      ],
      ["a canyon between flat-topped mesas with layered rock walls", true],
      ["a field of wind-shaped dunes against weathered outcrops", !airless],
      // Water that boiled or never pooled leaves salt behind.
      ["a cracked salt flat across an old basin floor", p.water > 0],
      [
        "the rim of a large impact crater, looking across its floor",
        airless || p.pressureBar < 0.5,
      ],
      [`a high mountain ridge of ${peaks} bare peaks above dry plains`, true],
    ].map(([scene, ok]) => [`${scene}; no open liquid seas`, ok]);
  const fitting = scenes.filter(([, ok]) => ok).map(([scene]) => scene);
  const setting = fitting[(hash >>> 12) % fitting.length];
  return `${label} (imagined setting): ${setting}. This is an artistic regional anchor, not a mapped or observed location.`;
}
// A giant planet's cloud chemistry follows its temperature (Sudarsky, Burrows
// & Hubeny 2000, ApJ 538, 885); the class edges are approximate.
/** @param {number} equilibriumK */
export function giantClouds(equilibriumK) {
  if (equilibriumK < 150)
    return {
      palette: "cream, tan and rust-brown",
      clouds: "ammonia-ice cloud tops",
    };
  if (equilibriumK < 350)
    return {
      palette: "bright white and slate blue",
      clouds: "bright water-ice and water cloud decks",
    };
  if (equilibriumK < 900)
    return {
      palette: "deep azure with sparse thin haze",
      clouds: "almost no clouds over a deep, clear blue atmosphere",
    };
  if (equilibriumK < 1400)
    return {
      palette: "dark blue-grey and charcoal",
      clouds:
        "almost no clouds; sodium and potassium absorption darken the atmosphere",
    };
  return {
    palette: "grey-white with a dull red glow",
    clouds: "high silicate cloud decks over a faintly glowing hot interior",
  };
}
export function visualSpec(p, physics) {
  const gas = p.atmosphere.includes("hydrogen"),
    airless = p.atmosphere.includes("none");
  const frozen = physics.waterState === "Ice favored";
  const liquid = physics.waterState === "Liquid water plausible";
  // Artistic choices are deterministic across both viewpoints; they are not life predictions.
  const biology = biosphereSpec(p, physics),
    vegetation = biology.present;
  const foliage = biology.palette,
    forms = biology.forms;
  const geography = geographySpec(p, physics),
    surfaceSite = surfaceSiteSpec(p, physics),
    star = starAppearance(p, physics),
    fixedStar = physics.solarDayHours == null;
  // A locked or synchronous world's star never moves. Its height above the
  // imagined regional anchor is art direction, repeatable from the anchor.
  let hash = 2166136261;
  for (const char of surfaceSite)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const starElevationDeg = fixedStar ? 10 + (hash % 61) : null;
  const giant = gas ? giantClouds(physics.equilibriumK) : null;
  // A rotating world's surface view is lit at a repeatable time of day.
  const timeOfDay =
    fixedStar || p.pressureBar > 10
      ? null
      : [
          "Early morning: the star sits low in the sky and shadows are long.",
          "Mid-morning light from a star partway up the sky.",
          "Late afternoon: low, warm-angled light and lengthening shadows.",
          "Dusk: the star touches the horizon and the sky darkens away from it.",
        ][(hash >>> 8) & 3];
  // Floating life is imagined only in cloud decks cool enough to hold water
  // or ammonia clouds (Sagan & Salpeter 1976 imagined such floaters for Jupiter).
  const floaters = gas && p.biosphere !== "none" && physics.equilibriumK < 900;
  const palette = giant
    ? giant.palette
    : frozen
      ? "chalk white, glacial blue and dark basalt"
      : vegetation
        ? `deep blue water, pale mineral ridges, ${foliage} vegetation`
        : p.pressureBar > 10
          ? "dim amber haze light, ochre stone and charcoal"
          : // Blue only where there is open water to show it.
            !liquid || p.water <= 20
            ? "ochre, umber and charcoal"
            : "deep blue, weathered stone and muted copper";
  const terrain = giant
    ? `${giant.clouds}; no visible solid surface`
    : airless
      ? "cratered stone and regolith, without haze or exposed liquid"
      : frozen
        ? `${surfaceWater(p, physics).text}, with exposed rocky ridges`
        : liquid
          ? `${surfaceWater(p, physics).text}, ${100 - p.water}% exposed land; irregular coastlines and weathered rock`
          : "dry exposed mineral terrain; no open liquid-water seas, rain, puddles or wet sheen";
  return {
    palette,
    terrain,
    geography,
    surfaceSite,
    star,
    starElevationDeg,
    timeOfDay,
    floaters,
    vegetation,
    biology,
    view: gas ? "Cloud deck" : "Surface",
    sky: airless
      ? "black sky without atmospheric scattering; no clouds or atmospheric haze"
      : p.pressureBar > 10
        ? "optically thick atmospheric haze with limited surface visibility; orbital clouds obscure terrain, not a transparent atmosphere. From the ground the overcast is unbroken: dim, diffuse, nearly shadowless light with no blue sky, cloud gaps or light shafts, and distant terrain fading into haze"
        : p.atmosphere.includes("CO2")
          ? "dense pale mineral haze, without an assumed sulfur chemistry"
          : p.atmosphere.includes("methane")
            ? "a muted amber haze as an illustrative atmospheric interpretation"
            : star.sky
              ? `${star.sky}, from Rayleigh scattering of ${star.colour} starlight; sky color is illustrative`
              : "subtle atmospheric scattering under the specified stellar illumination; sky color is illustrative",
    illumination: `${star.colour} illumination from a ${formatQuantity("teffK", physics.star.teffK)} K star; representative stellar angular diameter ${formatQuantity("angularDiameter", physics.angularDiameter)} degrees, ${formatQuantity("widthVsSun", star.widthVsSun)}× the Sun's from Earth`,
    starInSky: !star.disc
      ? null
      : p.pressureBar > 10
        ? `The ${star.colour} star is only a diffuse glow through the haze.`
        : fixedStar
          ? `The star hangs fixed ${starElevationDeg}° above the horizon as ${star.disc}; it never rises or sets, so shadows never move.`
          : `If the star is in frame, draw it as ${star.disc}.`,
    rotation: physics.tidalLock?.locked
      ? "Tidally locked: one hemisphere always faces the star, which stands still in the sky; the far hemisphere is in permanent night."
      : fixedStar
        ? "Synchronous rotation (assumed): fixed illumination geometry; the star stands still in the sky."
        : "",
    biosphere: vegetation
      ? `No biosphere is established. Include visible speculative vegetation as an artistic scenario: ${forms}, colored ${foliage}. ${biology.habitat} ${biology.seasonal} ${biology.atmosphere} On the orbital view, show irregular patches of the specified pigment at planetary scale; individual structures are too small to resolve. On the surface view, feature these exact forms and pigments prominently in the foreground and repeat them in the distance. ${biology.mode === "alien" ? "ALIEN morphology is essential: no familiar Earth trees, ferns, palms, grass or flowers; do not merely recolor a terrestrial forest. Use physically textured organic surfaces, no neon glow or magical effects." : "Use recognizable vegetation-like silhouettes without copying a particular terrestrial landscape."} No animals, settlements or spacecraft. These colors and forms are invented, not inferred biology.${biology.pigmentNote ? ` ${biology.pigmentNote}` : ""}`
      : floaters
        ? `No biosphere is established. As an imagined scenario, life floats: enormous translucent gas-bag organisms, some hundreds of meters across, drift between the cloud layers, ${p.biosphere === "alien" ? "ribbed, lobed bladders with sail-like membranes in smoky violet and pale ivory; ALIEN morphology is essential, with no resemblance to Earth jellyfish, whales or balloons" : "jellyfish-like gas bags trailing long thin tendrils, in pale translucent amber and rose"}. On the orbital view they are far too small to see. On the cloud-deck view, show a few at different distances to convey their enormous scale. No ground, settlements or spacecraft. These forms are invented, not inferred biology.`
        : "No biosphere is established. Depict mineral, ice or cloud scenery only: no forests, plants, animals, settlements, spacecraft or invented biological structures.",
  };
}
/**
 * The deterministic field note shown when no AI interpretation is available.
 * Each section carries its provenance, so the prose stays plain.
 * @param {Params} p
 * @param {any} physics
 */
export function localNarrative(p, physics) {
  const interpretation = visualSpec(p, physics);
  const t = formatQuantity("temperatureC", physics.temperatureC),
    locked = physics.tidalLock?.locked === true;
  const nightside = physics.nightside
    ? physics.nightside.collapses
      ? ` At ${formatQuantity("pressureBar", p.pressureBar)}\u00a0bar the air is too thin to carry heat around the planet, so it would freeze out on the nightside.`
      : ` At ${formatQuantity("pressureBar", p.pressureBar)}\u00a0bar the air is thick enough not to freeze out as frost on the nightside, though the nightside stays colder than the mean.`
    : "";
  const climate = physics.airlessMeanRangeC
    ? `The equilibrium temperature is ${t}\u00a0°C; with no air to carry heat, the mean surface temperature lies between about ${formatQuantity("temperatureC", physics.airlessMeanRangeC[0])}\u00a0°C and ${formatQuantity("temperatureC", physics.airlessMeanRangeC[1])}\u00a0°C.`
    : locked
      ? `The energy balance gives a global mean near ${t}\u00a0°C, with a warmer dayside and a colder nightside, and the water-phase estimate reads: ${physics.waterState.toLowerCase()}.${nightside}`
      : `The energy balance gives a mean temperature near ${t}\u00a0°C, and the water-phase estimate reads: ${physics.waterState.toLowerCase()}.`;
  // Rotation is an input unless tidal locking overrides it.
  /** @type {NarrativeSection} */
  const day = locked
    ? {
        kind: quantityKind("solarDayHours", physics),
        text: "It keeps one face turned toward its star, so the star hangs fixed in the sky.",
      }
    : physics.solarDayHours == null
      ? {
          kind: "assumed",
          text: "Its assumed rotation matches its orbit, so one face stays turned toward its star.",
        }
      : {
          kind: "assumed",
          text: `An assumed ${formatQuantity("rotationHours", p.rotationHours)}-hour rotation gives a solar day of ${formatQuantity("solarDayHours", physics.solarDayHours)} hours.`,
        };
  /** @type {NarrativeSection[]} */
  const sections = [
    { kind: "estimated", text: climate },
    day,
    {
      kind: "imagined",
      text: `This ${physics.classification.split(" — ")[1].toLowerCase()} world is rendered in ${interpretation.palette}: ${interpretation.terrain}.`,
    },
  ];
  if (interpretation.vegetation)
    sections.push({
      kind: "imagined",
      text: `${interpretation.biology.forms.charAt(0).toUpperCase() + interpretation.biology.forms.slice(1)} grow in ${interpretation.biology.palette}.${interpretation.biology.pigmentNote ? ` ${interpretation.biology.pigmentNote}` : ""}`,
    });
  return narrativeFromSections(sections, interpretation.terrain);
}
export const SECTION_KINDS = Object.freeze([
  "calculated",
  "estimated",
  "assumed",
  "imagined",
]);
/**
 * Field notes may carry provenance-tagged sections. The interface shows each
 * tag, so the prose does not need to repeat qualifiers.
 * @param {any} input
 * @returns {Narrative}
 */
export function validateNarrative(input) {
  object(input, "Narrative");
  /** @type {Narrative} */
  const narrative = {
    description: shortText(input.description, 1600, "Description"),
    surfaceFeatures: shortText(input.surfaceFeatures, 500, "Surface features"),
  };
  if (input.sections !== undefined) {
    if (
      !Array.isArray(input.sections) ||
      input.sections.length < 1 ||
      input.sections.length > 6
    )
      throw new InputError("A field note has one to six sections.");
    const sections = input.sections.map((/** @type {any} */ section) => {
      object(section, "Field note section");
      if (!SECTION_KINDS.includes(section.kind))
        throw new InputError("Unknown field note section kind.");
      return {
        kind: section.kind,
        text: shortText(section.text, 500, "Section text"),
      };
    });
    narrative.sections = sections;
    if (
      narrative.description !==
      sections.map((/** @type {NarrativeSection} */ s) => s.text).join(" ")
    )
      throw new InputError("Field note sections must match the description.");
  }
  if (
    typeof input.signature === "string" &&
    /^[a-f0-9]{64}$/.test(input.signature)
  )
    narrative.signature = input.signature;
  return narrative;
}
/**
 * The signed content of a field note, without its signature.
 * @param {Narrative} narrative
 * @returns {Narrative}
 */
export function narrativeContent({ description, surfaceFeatures, sections }) {
  return { description, surfaceFeatures, ...(sections ? { sections } : {}) };
}
/**
 * @param {NarrativeSection[]} sections
 * @param {string} surfaceFeatures
 */
export function narrativeFromSections(sections, surfaceFeatures) {
  return validateNarrative({
    description: sections.map((section) => section.text.trim()).join(" "),
    surfaceFeatures,
    sections,
  });
}
export const IMAGE_VIEWS = Object.freeze([
  "orbital",
  "surface",
  "deep",
  "night",
  "postcard",
  "aftermath",
]);
/**
 * The viewpoints a world supports. The deep sea needs water that is liquid at
 * the surface or sealed under ice; the night sky needs air clear enough to see
 * stars through; an aftermath needs living seas to lose.
 * @param {Params} p @param {any} physics
 */
export function imageViews(p, physics) {
  const gas = p.atmosphere.includes("hydrogen");
  return IMAGE_VIEWS.filter((view) =>
    view === "deep"
      ? !gas &&
        p.water > 0 &&
        ["Liquid water plausible", "Ice favored"].includes(physics.waterState)
      : view === "night"
        ? gas || p.pressureBar <= 10
        : view === "aftermath"
          ? !gas &&
            p.water > 0 &&
            physics.waterState === "Liquid water plausible"
          : true,
  );
}
/** @param {Params} p @param {any} physics @param {string} view */
export function viewLabel(p, physics, view) {
  return view === "orbital"
    ? "Orbital"
    : view === "deep"
      ? "Deep sea"
      : view === "night"
        ? "Night sky"
        : view === "postcard"
          ? "Postcard"
          : view === "aftermath"
            ? "Aftermath"
            : visualSpec(p, physics).view;
}
/**
 * The one line of text a travel poster carries, from the world's most
 * advertisable fact.
 * @param {Params} p @param {any} physics
 */
export function postcardTagline(p, physics) {
  const spec = visualSpec(p, physics);
  if (p.atmosphere.includes("hydrogen")) return "RIDE THE STORMS";
  if (p.atmosphere.includes("none")) return "NO AIR. NO CROWDS.";
  if (physics.temperatureC >= 100) return "THE WARMEST WELCOME IN THE GALAXY";
  if (physics.solarDayHours == null) return "WHERE THE SUN NEVER SETS";
  if (physics.waterState === "Ice favored") return "THE GREAT WHITE GETAWAY";
  if (p.water === 100) return "NOTHING BUT OCEAN";
  if (physics.gravityG < 0.75) return "COME FEEL LIGHTER";
  if (physics.gravityG > 1.4) return "BUILT FOR THE STRONG";
  if (spec.vegetation && p.biosphere === "alien")
    return "SEE THE STRANGE GARDENS";
  return "YOUR WORLD AWAITS";
}
/**
 * How a living world dies. Small worlds and red-dwarf worlds lose their air to
 * flares and stellar wind, as Mars did; the rest boil when their star
 * brightens past the runaway-greenhouse limit, as Venus did.
 * @param {Params} p @param {any} physics
 */
export function aftermathFate(p, physics) {
  return p.starType.startsWith("M") || physics.escapeKms < 7
    ? "stripped"
    : "boiled";
}
/**
 * The postcard and aftermath prompts. Both show the surface view's own
 * regional anchor: one as an advertisement, one as a ruin.
 * @param {Params} p @param {any} physics @param {"postcard" | "aftermath"} view
 */
function storyPrompt(p, physics, view) {
  const spec = visualSpec(p, physics),
    gas = p.atmosphere.includes("hydrogen"),
    stripped = aftermathFate(p, physics) === "stripped";
  if (view === "postcard") {
    const safe = survival(p, physics).survivable;
    return (
      `Create an ORIGINAL vintage travel poster for a fictional exoplanet, in the style of a 1950s–60s screen-printed tourism poster.\n` +
      `1. Composition\nA poster advertising this planet as a holiday destination, showing its regional anchor scene${gas ? " among the clouds" : ""} with bold simplified shapes and strong silhouettes. One small figure ${safe ? "in ordinary holiday clothes" : "in a spacesuit"} admires the view, for scale. The planet itself cannot appear in its own sky.\n` +
      `2. Physical environmental constraints\nMean temperature estimate ${formatQuantity("temperatureC", physics.temperatureC)} C. Gravity ${formatQuantity("gravityG", physics.gravityG)} Earth gravities. Water phase: ${physics.waterState}. ${spec.terrain}. ${spec.rotation}\n` +
      `3. Scene\nRegional anchor: ${spec.surfaceSite}\n` +
      `4. Sky and light\n${spec.sky}. ${spec.illumination}.${spec.timeOfDay ? ` ${spec.timeOfDay}` : ""}${spec.starInSky ? ` ${spec.starInSky}` : ""}\n` +
      `5. Biosphere\n${spec.vegetation ? `Show the imagined vegetation as bold stylized shapes: ${spec.biology.forms}, colored ${spec.biology.palette}.` : spec.floaters ? "Show a few of the imagined floating gas-bag organisms as bold stylized shapes drifting between the clouds." : "No plants or animals."}\n` +
      `6. Art direction\nFlat screen-printed color in a limited palette drawn from ${spec.palette}; crisp shapes, gentle gradients and subtle paper grain. Clearly an illustration, not a photograph.\n` +
      `7. Text and prohibitions\nThe only text is "${postcardTagline(p, physics)}" in bold retro lettering across the top or bottom; spell it exactly. No other words, numbers, logos or signatures. No moons, neighboring planets, rings, settlements, spacecraft or extra celestial bodies. No recognizable Earth landmarks.`
    );
  }
  return (
    `Create an ORIGINAL EXOPLANET: a fictional, physically informed artist interpretation of this world's far future, after its living seas are gone.\n` +
    `1. Camera perspective and framing\nA ground-level camera at the same local setting as the surface view, looking toward the horizon, ages later. The planet itself cannot appear in its own sky.\n` +
    `2. What happened\n${stripped ? "Over hundreds of millions of years the star's flares and wind stripped most of the air away. The sky is thin and dark blue-black even by day; the seas have frozen and slowly vanished into the thin air, leaving dry, frost-rimmed basins with old shorelines etched into their walls." : "About a billion years on, the star has brightened past the runaway-greenhouse limit. The oceans boiled away into a scorching, dense, pale haze; the old seabeds are cracked salt flats with old shorelines etched into their walls, and nothing is wet."}\n` +
    `3. Shared planetary geography\nRegional anchor: ${spec.surfaceSite} Keep the same landforms as the surface view, now dry.\n` +
    `4. Illumination\n${stripped ? `Hard, sharp light from the ${spec.star.colour} star in a dark sky, with deep black shadows.` : `Glaring, diffuse light from a brighter ${spec.star.colour} star through the haze, with almost no shadows.`}\n` +
    `5. Remains\n${spec.vegetation ? `Only bleached, petrified remains of the imagined vegetation stand in the foreground: ${spec.biology.forms}, now lifeless and colorless.` : "Bare mineral scenery: no plants or animals."}\n` +
    `6. Photorealistic art direction\nNatural mineral textures, salt crusts and erosion, physically consistent shadows and scale. Scenery is imagined, not scientific detection.\n` +
    `7. Prohibited unsupported features\nNo liquid water, moons, neighboring planets, rings, settlements, ruins of buildings, spacecraft, animals or extra celestial bodies. No text, labels, borders or symbols.`
  );
}
// Life at a vent feeds on chemical energy, not starlight, so it can be
// imagined under ice where the surface biosphere is absent.
/** @param {Params} p */
function ventLife(p) {
  if (p.biosphere === "none")
    return "No biosphere is established. The vents are bare: mineral chimneys, crusts and shimmering water only; no creatures, microbial mats or invented biological structures.";
  return `No biosphere is established. As an imagined scenario, life crowds around the vents, feeding on chemical energy rather than starlight: ${
    p.biosphere === "alien"
      ? "translucent ribbed colonies, glassy branching fans and small drifting lantern-shaped grazers in pale ivory, deep violet and smoky blue-green, with faint, sparse bioluminescence. ALIEN morphology is essential: no copies of Earth tube worms, crabs, shrimp or fish; no neon glow"
      : "dense pale tube-like colonies with red plumes, white microbial mats and small pale crab-like grazers, recognizable as vent life without copying a particular Earth species"
  }. These forms are invented, not inferred biology.`;
}
/** @param {Params} p @param {any} physics */
function nightSky(p, physics) {
  const stars =
    "an imagined star field and a band of the galaxy, with no recognizable Earth constellations";
  if (p.atmosphere.includes("none"))
    return `A black sky crowded with sharp, unflickering stars: ${stars}. No airglow, clouds or haze`;
  if (p.atmosphere.includes("hydrogen"))
    return `A clear night above the cloud tops: ${stars}. The cloud deck below is faintly lit by starlight, with occasional lightning flashing deep inside it`;
  const haze = /CO2|methane/.test(p.atmosphere)
      ? " seen through a faint haze that dims the fainter stars"
      : "",
    clouds =
      physics.waterState === "Liquid water plausible" && p.water > 0
        ? ", with a few scattered clouds dark against the stars"
        : "";
  return p.pressureBar < 0.5
    ? `A very dark, clear sky: ${stars}, barely dimmed by the thin air${haze}`
    : `A clear night sky: ${stars}, softened near the horizon by the atmosphere${haze}${clouds}`;
}
/**
 * The deep-sea and night-sky prompts. They reuse the shared geography and
 * constraints but replace the daylight sky and camera.
 * @param {Params} p @param {any} physics @param {"deep" | "night"} view
 */
function closerPrompt(p, physics, view) {
  const spec = visualSpec(p, physics),
    gas = p.atmosphere.includes("hydrogen"),
    frozen = physics.waterState === "Ice favored",
    life = p.biosphere !== "none";
  // A locked world's regional anchor faces the star; its night is the far
  // hemisphere, where no plants grow.
  const neverRises = physics.solarDayHours == null,
    farSide = view === "night" && neverRises && !gas;
  const perspective =
    view === "deep"
      ? `${frozen ? "An underwater camera on the seafloor of a dark ocean sealed beneath a thick ice shell, warmed from below" : "An underwater camera on the deep seafloor, far below the reach of starlight"}, beside a hydrothermal vent field: tall mineral chimneys venting dark, shimmering hot water. The only light is one unseen lamp beside the camera${life ? " and faint bioluminescence" : ""}; the water beyond fades to black. No sky, no water surface and no star are visible.`
      : `${gas ? "A view from the top of the cloud deck at night, looking up into the sky; the cloud tops fill the bottom of the frame" : p.water === 100 && physics.waterState === "Liquid water plausible" ? "A camera at the ocean waterline at night, looking up at the sky; dark water fills the bottom of the frame" : "A ground-level camera at night, looking up at the sky, with the dark silhouette of the local landscape along the bottom of the frame"}. ${neverRises ? "This is the permanent nightside: the star never rises here." : "The star is below the horizon."} The planet itself cannot appear in its own sky.`;
  return (
    `Create an ORIGINAL EXOPLANET: a fictional, physically informed artist interpretation.\n` +
    `1. Camera perspective and framing\n${perspective}\n` +
    `2. Physical environmental constraints\nMean temperature estimate ${formatQuantity("temperatureC", physics.temperatureC)} C. Pressure assumption ${formatQuantity("pressureBar", p.pressureBar)} bar. Gravity ${formatQuantity("gravityG", physics.gravityG)} Earth gravities. Water phase: ${physics.waterState}. ${spec.terrain}. ${spec.rotation}\n` +
    `3. Shared planetary geography\n${spec.geography} Shared regional anchor: ${spec.surfaceSite} ${view === "deep" ? "The vent field lies on the seafloor of this world's ocean, offshore of this region; nothing above the water is visible." : farSide ? "The camera is not at this anchor, which lies on the lit hemisphere: it stands on the permanently dark far hemisphere, on frozen ground and ice shown only as dark shapes." : "Show this local setting only as dark shapes at human camera scale."}\n` +
    `4. ${view === "deep" ? "Water and illumination" : "Night sky and illumination"}\n${view === "deep" ? `No starlight reaches the seafloor. The water is dark and faintly turbid, with drifting mineral particles caught in the lamp light. Chimneys and crusts in ${frozen ? "dark basalt, rust and sulfur yellow" : "charcoal, rust, ochre and sulfur yellow"}.` : `${nightSky(p, physics)}. Starlight alone lights the scene; no moonlight.`}\n` +
    `5. Biosphere morphology\n${view === "deep" ? ventLife(p) : farSide ? "No plants grow on the permanent nightside, which never receives starlight. No animals or lights on the land." : spec.vegetation ? `Silhouettes of the imagined vegetation in the foreground: ${spec.biology.forms}, with a few faint, sparse points of bioluminescence among them as an imagined detail, not neon. These forms are invented, not inferred biology.` : spec.floaters ? "Dark silhouettes of the imagined floating gas-bag organisms drift against the stars, far off and enormous. These forms are invented, not inferred biology." : "No biosphere is established. No plants, animals or lights on the land."}\n` +
    `6. Photorealistic art direction\n${view === "deep" ? "Deep-sea photography: natural mineral textures, suspended particles and lamp light falling off into darkness." : "Night photography: natural star colors, no exaggerated nebulae or saturated colors."} Scenery is imagined, not scientific detection.\n` +
    `7. Prohibited unsupported features\n${view === "deep" ? `No settlements, spacecraft, divers, submarines or visible camera equipment.${life ? "" : " No animals."}` : `No moons, neighboring planets, rings, settlements, spacecraft, ${spec.floaters ? "" : "animals, "}city lights or extra celestial bodies. No stellar disk.`} No text, labels, borders or symbols. ${gas ? "No invented solid surface." : ""}`
  );
}
// Claude prompts live in lib/prompts.js. Image prompts stay beside visualSpec(),
// which every image viewpoint and the field notes share.
export function imagePrompt(p, physics, view) {
  if (!IMAGE_VIEWS.includes(view))
    throw new InputError("Choose one of this world's views.");
  if (!imageViews(p, physics).includes(view))
    throw new InputError(
      view === "deep"
        ? "This world has no ocean to explore."
        : view === "aftermath"
          ? "This world has no living seas to lose."
          : "This world's air is too hazy to see the stars.",
    );
  if (view === "deep" || view === "night")
    return closerPrompt(p, physics, view);
  if (view === "postcard" || view === "aftermath")
    return storyPrompt(p, physics, view);
  const spec = visualSpec(p, physics),
    gas = p.atmosphere.includes("hydrogen");
  const fixedStar = physics.solarDayHours == null;
  const perspective =
    view === "orbital"
      ? `A complete planetary globe viewed from orbit, with generous black margins. Keep the full limb in frame. The star is outside the frame. No ground-level foreground.${fixedStar ? " Light the globe from one side so a sharp day–night terminator crosses the disc: the dayside faces the star and the nightside is dark." : ""}`
      : gas
        ? `An atmospheric probe view inside the upper atmosphere of a hydrogen-helium planet ${formatQuantity("radiusEarth", p.radiusEarth)}× Earth's width${p.radiusEarth >= 3 ? ", at a scale far beyond Earth weather" : ""}. Cloud decks are stacked at several altitudes, the lower decks fading into deep haze with no floor; a few towering storm columns rise through them; the horizon is perfectly flat. This must not read as Earth clouds seen from an airliner: no ground, rocks, mountains, oceans or solid surface.`
        : p.water === 100 && physics.waterState === "Liquid water plausible"
          ? "A camera at the ocean waterline, looking across open water toward its horizon. No exposed land. The planet itself cannot appear in its own sky."
          : "A ground-level camera physically standing on this planet, looking across a landscape toward its horizon. The planet itself cannot appear in its own sky.";
  return (
    `Create an ORIGINAL EXOPLANET: a fictional, physically informed artist interpretation.\n` +
    `1. Camera perspective and framing\n${perspective}\n` +
    `2. Physical environmental constraints\nMean temperature estimate ${formatQuantity("temperatureC", physics.temperatureC)} C. Pressure assumption ${formatQuantity("pressureBar", p.pressureBar)} bar. Gravity ${formatQuantity("gravityG", physics.gravityG)} Earth gravities. Water phase: ${physics.waterState}. ${spec.terrain}. ${spec.rotation}\n` +
    `3. Shared planetary geography\n${spec.geography} Preserve the same terrain and water inventory between orbital and surface views. Shared regional anchor: ${spec.surfaceSite} ${view === "surface" ? "Render only this local setting at human camera scale, not a miniature version of the global map. Global water coverage is not a required fraction of this local frame." : "Place the regional anchor on the camera-facing hemisphere where applicable, subject to cloud cover; do not add a marker, inset, label or visible camera."}\n` +
    `4. Atmosphere, illumination, and surface materials\n${spec.sky}. ${spec.illumination}.${view === "surface" && spec.timeOfDay ? ` ${spec.timeOfDay}` : ""}${view === "surface" && spec.starInSky ? ` ${spec.starInSky}` : ""} Palette: ${spec.palette}. Do not turn gravity alone into a different atmospheric thickness.\n` +
    `5. Biosphere morphology\n${spec.biosphere}\n` +
    `6. Photorealistic art direction\nNatural material textures, restrained colors, physically consistent shadows and scale. Landscape and clouds are imagined, not scientific detections.\n` +
    `7. Prohibited unsupported features\nNo moons, neighboring planets, rings, settlements, spacecraft, ${view === "surface" && spec.floaters ? "" : "animals "}or extra celestial bodies. ${view === "surface" && spec.starInSky ? "No second star" : "No stellar disk"}, text, labels, borders or symbols. No recognizable Earth continents; do not merely rotate or recolor an Earth globe. ${gas ? "No invented solid surface." : ""}`
  );
}

/** @param {any} options */
export function createReport({
  params,
  catalog = null,
  name,
  id,
  narrative,
  images = {},
  sample = false,
  cartography,
  sites,
  selectedLocation,
  expeditions,
  geographyVersion,
  physicsVersion = PHYSICS_VERSION,
  seed = null,
}) {
  const p = validateParams(params),
    c = validateCatalog(catalog),
    physics = calculate(p, c, physicsVersion);
  let cartographyRecord, savedSites, selected, savedExpeditions;
  try {
    cartographyRecord = validateCartography(
      cartography ??
        (geographyVersion
          ? createCartographyRecord(p, physics, geographyVersion)
          : undefined),
      p,
      physics,
    );
    savedSites = validateSites(sites, cartographyRecord);
    savedExpeditions = validateExpeditions(expeditions, cartographyRecord, p);
    if (images.orbital) orbitalAssetMetadata(images.orbital, cartographyRecord);
    if (images.surface?.globeView || images.surface?.referenceSignature)
      throw new RangeError(
        "An orbital reference cannot be attached to a surface image.",
      );
    selected =
      selectedLocation == null ? null : validateLocation(selectedLocation);
  } catch (error) {
    throw new InputError(/** @type {Error} */ (error).message);
  }
  return {
    version: MODEL_VERSION,
    id: id || globalThis.crypto.randomUUID(),
    name:
      c?.pl_name || shortText(name || "Uncharted world", 100, "Report name"),
    params: p,
    catalog: c,
    physicsVersion: physics.physicsVersion,
    physics,
    narrative: narrative
      ? validateNarrative(narrative)
      : localNarrative(p, physics),
    narrativeKind: "model",
    cartography: cartographyRecord,
    sites: savedSites,
    expeditions: savedExpeditions,
    selectedLocation: selected,
    images,
    sample,
    seed: seed == null ? null : validateSeed(seed),
    createdAt: new Date().toISOString(),
  };
}
// Curated scenarios use the same physics and report pipeline as generated worlds.
// Their notes are hand-written (labelled "curated" in the interface) and double
// as the few-shot examples in lib/prompts.js; tests/showcase.test.js checks that
// every number they quote matches calculate().
/** @type {(sections: NarrativeSection[]) => string} */
const joinSections = (sections) => sections.map((s) => s.text).join(" ");
const BOREAL_SECTIONS = /** @type {NarrativeSection[]} */ ([
  {
    kind: "assumed",
    text: "Boreal is an Earth-sized world under a 1-bar nitrogen–oxygen sky, with water enough to cover 85% of its surface.",
  },
  {
    kind: "calculated",
    text: "At 1.4 AU from a Sun-like star it receives about half the sunlight that reaches Earth.",
  },
  {
    kind: "estimated",
    text: "Ice sheets throw much of that light back into space, and the energy balance settles near −43\u00a0°C, so every basin lies frozen.",
  },
  {
    kind: "imagined",
    text: "Blue glacier walls rise over wind-scoured snow, and outcrops of charcoal rock turn ochre in the low sun.",
  },
]);
const CINDER_SECTIONS = /** @type {NarrativeSection[]} */ ([
  {
    kind: "assumed",
    text: "Cinder is an Earth-mass rock with no atmosphere and no water, 1.4 AU from a Sun-like star.",
  },
  {
    kind: "calculated",
    text: "Gravity at the surface matches Earth's, and escape velocity is 11.2 km/s.",
  },
  {
    kind: "estimated",
    text: "Its equilibrium temperature is −44\u00a0°C, yet with no air to carry heat the true average is colder: between about −143\u00a0°C and −46\u00a0°C, depending on how fast it spins and how long the rock holds the day's warmth.",
  },
  {
    kind: "imagined",
    text: "Under a black daylight sky, shadows fall razor-sharp across broken basalt and the rim of an old impact basin, with no haze to soften the horizon.",
  },
]);
const VIRIDIA_SECTIONS = /** @type {NarrativeSection[]} */ ([
  {
    kind: "assumed",
    text: "Viridia pairs a Sun-like star with a 1-bar nitrogen–oxygen atmosphere and water across 60% of its surface.",
  },
  {
    kind: "estimated",
    text: "The energy balance lands near 15\u00a0°C, warm enough for open bays of liquid water.",
  },
  {
    kind: "imagined",
    text: "Its life is invented outright: copper and deep-plum ribbon fans crowd the coastal lowlands and thin out across bare mineral ridges.",
  },
  {
    kind: "imagined",
    text: "Pleated rosettes turn toward a pale sky above compact continents and blue, sheltered bays.",
  },
]);
const TETHER_SECTIONS = /** @type {NarrativeSection[]} */ ([
  {
    kind: "assumed",
    text: "Tether is a little lighter than Earth, with a 1-bar nitrogen–oxygen sky and water enough to cover 49% of its surface, circling close to a red dwarf.",
  },
  {
    kind: "calculated",
    text: "At just 0.104 AU it rounds its star every 22.4 days, and the star spans 1.54°, 2.9 times as wide as the Sun looks from Earth.",
  },
  {
    kind: "estimated",
    text: "Tides locked its spin within about 0.74 Myr, so one face always looks at the star and the other never sees it; the global mean sits near 21 °C, warmer on the dayside and colder on the nightside.",
  },
  {
    kind: "imagined",
    text: "Burgundy fern canopies and charcoal-violet moss crowd the coastal valleys, dark enough to drink every colour from an orange star that hangs fixed in a peach-to-mauve sky.",
  },
]);
const KILN_SECTIONS = /** @type {NarrativeSection[]} */ ([
  {
    kind: "assumed",
    text: "Kiln has Earth's size and orbit around a Sun-like star, but lies buried under 90 bar of carbon dioxide, with water enough to cover 43% of its surface.",
  },
  {
    kind: "calculated",
    text: "At 1 AU it takes in exactly Earth's sunlight, and its gravity is a familiar 1 g.",
  },
  {
    kind: "estimated",
    text: "That air traps 420 K of greenhouse warming and drives the mean to 361 °C, so every ocean hangs overhead as vapor, even though the orbit sits inside the conservative habitable zone.",
  },
  {
    kind: "imagined",
    text: "Dim amber light seeps through an overcast that never breaks, laying no shadows on bone-dry ochre stone that fades into haze a short walk away.",
  },
]);
const GYRE_SECTIONS = /** @type {NarrativeSection[]} */ ([
  {
    kind: "assumed",
    text: "Gyre is a gas giant of 95 Earth masses and 9 Earth radii, wrapped in a hydrogen-helium envelope and circling a Sun-like star in the outer habitable zone.",
  },
  {
    kind: "calculated",
    text: "At 1.4 AU its year runs 605 days under about half Earth's sunlight; its bulk density of 0.72 g/cm³ is lighter than water, yet gravity at the cloud tops is 1.17 g.",
  },
  {
    kind: "estimated",
    text: "The energy balance settles near −15 °C, cool enough for bright water-ice clouds, and there is no surface on which water could stand.",
  },
  {
    kind: "imagined",
    text: "White zones and slate-blue belts run straight around the globe, curling into eddies at their edges, while below the probe cloud decks fall away in tiers to a haze with no floor.",
  },
]);
export const SHOWCASE_WORLDS = Object.freeze({
  boreal: {
    name: "Boreal · Reference 07",
    prefix: "sample",
    params: { orbital: "outer habitable zone", water: 85, biosphere: "none" },
    sections: BOREAL_SECTIONS,
    description: joinSections(BOREAL_SECTIONS),
    surfaceFeatures:
      "White ice sheets and blue frozen basins broken by compact charcoal and ochre highlands and wind-scoured glacier walls.",
    orbitalAlt:
      "Boreal: an imagined glacial globe with white ice sheets, blue frozen basins and charcoal mineral highlands against space.",
    surfaceAlt:
      "Boreal: an imagined surface of blue glacier walls, wind-scoured snow and exposed dark rock beneath a pale sky.",
  },
  cinder: {
    name: "Cinder · Reference 08",
    prefix: "cinder",
    params: {
      orbital: "outer habitable zone",
      atmosphere: "none (airless body)",
      pressureBar: 0,
      water: 0,
      biosphere: "none",
    },
    sections: CINDER_SECTIONS,
    description: joinSections(CINDER_SECTIONS),
    surfaceFeatures:
      "Charcoal basalt plains, copper-gray mineral highlands, impact basins and fractured regolith beneath a black daylight sky.",
    orbitalAlt:
      "Cinder: an imagined airless gray rocky globe with dark basalt basins, scattered craters and copper mineral highlands; no atmospheric limb.",
    surfaceAlt:
      "Cinder: an imagined basalt escarpment above a dry impact basin, with crisp shadows and a black airless sky.",
  },
  viridia: {
    name: "Viridia · Reference 09",
    prefix: "viridia",
    params: { water: 60, biosphere: "alien" },
    sections: VIRIDIA_SECTIONS,
    description: joinSections(VIRIDIA_SECTIONS),
    surfaceFeatures:
      "Blue liquid-water bays, compact mineral highlands and patchy waist-high copper/plum ribbon fans and pleated rosettes.",
    orbitalAlt:
      "Viridia: an imagined temperate globe with blue oceans, compact purple-brown continents, a broken circular inland sea and white clouds.",
    surfaceAlt:
      "Viridia: an imagined liquid-water bay beside gray rock and copper/plum ribbon-fan organisms beneath a blue cloudy sky.",
    deepAlt:
      "Viridia: an imagined hydrothermal vent field in the dark, with smoking mineral chimneys, glassy branching fans, translucent ribbed colonies and drifting lantern-shaped creatures.",
    nightAlt:
      "Viridia: an imagined night sky dense with stars and a galactic band above a dark bay, with scattered clouds and alien plant silhouettes in the foreground.",
  },
  tether: {
    name: "Tether · Reference 10",
    prefix: "tether",
    params: {
      starType: "M-type (red dwarf)",
      orbital: "inner habitable zone",
      massEarth: 0.61,
      radiusEarth: 0.99,
      water: 49,
    },
    sections: TETHER_SECTIONS,
    description: joinSections(TETHER_SECTIONS),
    surfaceFeatures:
      "Blue coastal bays, pale weathered ridges and patchy burgundy and charcoal-violet fern canopies under a fixed orange star.",
    orbitalAlt:
      "Tether: an imagined tidally locked globe whose dayside of blue seas, tan continents and burgundy vegetation fades into a dark nightside.",
    surfaceAlt:
      "Tether: an imagined rocky shore with burgundy ferns beside a calm sea, under a large orange star fixed in a peach sky.",
  },
  kiln: {
    name: "Kiln · Reference 11",
    prefix: "kiln",
    params: {
      atmosphere: "thick CO2 (Venus-like)",
      pressureBar: 90,
      water: 43,
    },
    sections: KILN_SECTIONS,
    description: joinSections(KILN_SECTIONS),
    surfaceFeatures:
      "Bone-dry ochre plateaus and charcoal rock under an unbroken amber overcast, with distant cliffs lost in haze.",
    orbitalAlt:
      "Kiln: an imagined cream and amber globe wrapped in unbroken cloud, with no surface visible.",
    surfaceAlt:
      "Kiln: an imagined dry rocky canyon under an unbroken amber overcast, with the star a diffuse glow and the distance lost in haze.",
  },
  gyre: {
    name: "Gyre · Reference 12",
    prefix: "gyre",
    params: {
      orbital: "outer habitable zone",
      atmosphere: "hydrogen-helium envelope",
      pressureBar: 10,
      water: 0,
      massEarth: 95,
      radiusEarth: 9,
      biosphere: "none",
    },
    sections: GYRE_SECTIONS,
    description: joinSections(GYRE_SECTIONS),
    surfaceFeatures:
      "Tiered white water-ice cloud decks and towering storm columns above a slate-blue haze with no floor.",
    orbitalAlt:
      "Gyre: an imagined gas giant banded in white zones and slate-blue belts, with curling eddies along the band edges.",
    surfaceAlt:
      "Gyre: an imagined view inside the upper cloud decks, with storm columns, a distant vortex and a flat horizon under a blue sky.",
  },
});
// A reference world bundles each view it has alt text for; the rest render on
// request like any other world.
/** @param {any} world */
const referenceViews = (world) =>
  IMAGE_VIEWS.filter((view) => world[`${view}Alt`]);
export const REFERENCE_ASSETS = Object.freeze(
  Object.fromEntries(
    Object.values(SHOWCASE_WORLDS).flatMap((world) =>
      referenceViews(world).map((view) => [
        `/assets/${world.prefix}-${view}.webp`,
        { alt: world[`${view}Alt`] },
      ]),
    ),
  ),
);
export function showcaseKey(report) {
  return (
    Object.keys(SHOWCASE_WORLDS).find(
      (key) => report?.id === `${key}-reference`,
    ) || null
  );
}
export function sampleReport(key = "boreal") {
  if (!Object.hasOwn(SHOWCASE_WORLDS, key))
    throw new InputError("This reference world is not available.");
  const world = SHOWCASE_WORLDS[key];
  const report = createReport({
    id: `${key}-reference`,
    name: world.name,
    sample: true,
    params: { ...DEFAULTS, ...world.params },
    narrative: {
      description: world.description,
      surfaceFeatures: world.surfaceFeatures,
      sections: world.sections,
    },
    images: Object.fromEntries(
      referenceViews(world).map((view) => [
        view,
        { url: `/assets/${world.prefix}-${view}.webp`, kind: "reference" },
      ]),
    ),
  });
  report.narrativeKind = "reference";
  return report;
}
/** @param {unknown} kind */
export function narrativeKind(kind) {
  return kind === "ai" || kind === "reference" ? kind : "model";
}
