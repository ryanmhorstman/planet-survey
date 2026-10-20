// Lightweight persisted contracts shared by reports and the lazy geography engine.
// Keep v1 seed derivation and environment snapshots stable across future releases.
export const GEOGRAPHY_VERSION = "cartography-1";
export const MAX_SITES = 20;
export function hashText(text) {
  let value = 2166136261;
  for (const char of text)
    value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RangeError(`Invalid ${label}.`);
  return value;
}
function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`Invalid ${label}.`);
  return value;
}
export function normalizeCoordinates(latitude, longitude) {
  finite(latitude, "latitude");
  finite(longitude, "longitude");
  if (Math.abs(latitude) > 90)
    throw new RangeError("Use latitude −90 to 90 and a finite longitude.");
  return {
    latitude: Object.is(latitude, -0) ? 0 : latitude,
    longitude:
      Math.abs(latitude) === 90
        ? 0
        : ((((longitude + 180) % 360) + 360) % 360) - 180,
  };
}
export function validateLocation(value) {
  record(value, "location");
  if (Math.abs(finite(value.longitude, "longitude")) > 180)
    throw new RangeError("Longitude must be between −180 and 180.");
  const c = normalizeCoordinates(value.latitude, value.longitude);
  const latitude = Number(c.latitude.toFixed(6));
  let longitude = Number(c.longitude.toFixed(6));
  if (Math.abs(latitude) === 90) longitude = 0;
  else if (longitude === 180) longitude = -180;
  return {
    latitude: Object.is(latitude, -0) ? 0 : latitude,
    longitude: Object.is(longitude, -0) ? 0 : longitude,
  };
}
function physicalParams(params) {
  const { biosphere: _mode, ...physical } = params;
  return physical;
}
function environment(physics) {
  const out = {};
  for (const field of ["temperatureC", "gravityG", "yearDays"])
    out[field] = finite(physics[field], field);
  if (out.temperatureC < -273.15 || out.gravityG <= 0 || out.yearDays <= 0)
    throw new RangeError("Invalid cartographic environment.");
  out.solarDayHours =
    physics.solarDayHours === null
      ? null
      : finite(physics.solarDayHours, "solar day");
  if (out.solarDayHours !== null && out.solarDayHours <= 0)
    throw new RangeError("Invalid solar day.");
  const phases = [
    "No exposed water assigned",
    "Exposed liquid unstable",
    "Supercritical conditions possible",
    "Water phase outside model range",
    "Ice favored",
    "Vapor favored",
    "Liquid water plausible",
  ];
  if (!phases.includes(physics.waterState))
    throw new RangeError("Invalid water phase.");
  out.waterState = physics.waterState;
  return out;
}
function seedFor(params, e) {
  return hashText(
    JSON.stringify([
      GEOGRAPHY_VERSION,
      physicalParams(params),
      e.temperatureC,
      e.gravityG,
      e.yearDays,
    ]),
  );
}
export function cartographyId(c) {
  return `${c.version}-${c.seed.toString(16)}-${c.width}`;
}
export function createCartographyRecord(params, physics) {
  const e = environment(physics);
  return {
    schemaVersion: 1,
    version: GEOGRAPHY_VERSION,
    width: 512,
    seed: seedFor(params, e),
    parameterKey: JSON.stringify(physicalParams(params)),
    environment: e,
  };
}
export function validateCartography(value, params, physics) {
  if (value === undefined) return createCartographyRecord(params, physics);
  record(value, "cartography identity");
  if (
    value.schemaVersion !== 1 ||
    value.version !== GEOGRAPHY_VERSION ||
    value.width !== 512
  )
    throw new RangeError(
      "This cartography version is not supported. The world cannot be regenerated safely.",
    );
  if (value.parameterKey !== JSON.stringify(physicalParams(params)))
    throw new RangeError(
      "Cartography identity does not match the planetary parameters.",
    );
  const e = environment(record(value.environment, "cartographic environment"));
  if (!Number.isInteger(value.seed) || value.seed !== seedFor(params, e))
    throw new RangeError("Cartography seed does not match its saved inputs.");
  return {
    schemaVersion: 1,
    version: GEOGRAPHY_VERSION,
    width: 512,
    seed: value.seed,
    parameterKey: value.parameterKey,
    environment: e,
  };
}
export function validateSites(sites, cartography) {
  if (sites === undefined) return [];
  if (!Array.isArray(sites) || sites.length > MAX_SITES)
    throw new RangeError(`Save at most ${MAX_SITES} sites per report.`);
  const ids = new Set();
  return sites.map((site) => {
    record(site, "site");
    if (
      typeof site.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(site.id) ||
      ids.has(site.id)
    )
      throw new RangeError("Invalid or duplicate site identifier.");
    ids.add(site.id);
    if (
      typeof site.name !== "string" ||
      !site.name.trim() ||
      site.name.length > 80 ||
      /[\u0000-\u001f]/.test(site.name)
    )
      throw new RangeError(
        "Site names must contain 1–80 printable characters.",
      );
    if (site.modelId !== cartographyId(cartography))
      throw new RangeError("This site belongs to a different planetary model.");
    return {
      id: site.id,
      name: site.name.trim(),
      modelId: site.modelId,
      ...validateLocation(site),
    };
  });
}
