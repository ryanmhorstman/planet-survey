// Versioned geography constrained by shared physics: frozen v1 atlas, continuous v2.
// Both are deterministic artistic approximations, not tectonics or climate simulations.
import { validateParams, biosphereSpec } from "./planet.js";
import { waterStateV1 as waterState } from "./water-phase.js";
import {
  GEOGRAPHY_VERSION,
  hashText,
  normalizeCoordinates,
  validateCartography,
  createCartographyRecord,
  ILLUSTRATIVE_SUN_DIRECTION,
} from "./cartography-record.js";
export {
  GEOGRAPHY_VERSION,
  hashText,
  normalizeCoordinates,
} from "./cartography-record.js";
export function locationVector(latitude, longitude) {
  const c = normalizeCoordinates(latitude, longitude),
    lat = (c.latitude * Math.PI) / 180,
    lon = (c.longitude * Math.PI) / 180;
  return [
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon),
  ];
}
function noise(x, y, z, seed) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const smooth = (t) => t * t * (3 - 2 * t),
    fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  let sum = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++) {
        let n =
          Math.imul(ix + a, 374761393) ^
          Math.imul(iy + b, 668265263) ^
          Math.imul(iz + c, 2147483647) ^
          seed;
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        n = (n ^ (n >>> 16)) >>> 0;
        sum +=
          ((n / 4294967295) * 2 - 1) *
          (a ? fx : 1 - fx) *
          (b ? fy : 1 - fy) *
          (c ? fz : 1 - fz);
      }
  return sum;
}
// v1 remains frozen. v2 evaluates the same spherical field at arbitrary coordinates,
// with bounded finer octaves; atlas cells are a calibration/cache, not terrain tiles.
function reliefAtVector(x, y, z, seed, cores, version) {
  let h = -1;
  for (const [cx, cy, cz, spread, amplitude] of cores)
    h = Math.max(
      h,
      amplitude * Math.exp((x * cx + y * cy + z * cz - 1) * spread),
    );
  h +=
    0.14 * noise(x * 4, y * 4, z * 4, seed) +
    0.055 * noise(x * 12, y * 12, z * 12, seed ^ 7281) +
    0.022 * noise(x * 30, y * 30, z * 30, seed ^ 4919);
  if (version === "cartography-2")
    h +=
      0.009 * noise(x * 60, y * 60, z * 60, seed ^ 3187) +
      0.003 * noise(x * 150, y * 150, z * 150, seed ^ 9127);
  return h;
}
export function sampleRelief(model, latitude, longitude) {
  const c = normalizeCoordinates(latitude, longitude);
  if (model.version === "cartography-2")
    return reliefAtVector(
      ...locationVector(c.latitude, c.longitude),
      model.seed,
      model.cores,
      model.version,
    );
  const row = Math.min(
      model.height - 1,
      Math.floor(((90 - c.latitude) / 180) * model.height),
    ),
    col = Math.min(
      model.width - 1,
      Math.floor(((c.longitude + 180) / 360) * model.width),
    );
  return model.heights[row * model.width + col];
}
export function createGeography(
  params,
  physics,
  width = 512,
  savedIdentity,
  version = GEOGRAPHY_VERSION,
) {
  if (!Number.isInteger(width) || width < 32 || width > 512 || width % 2)
    throw new RangeError("Unsupported atlas resolution.");
  const p = validateParams(params);
  const identity = validateCartography(
    savedIdentity ?? createCartographyRecord(p, physics, version),
    p,
    physics,
  );
  if (savedIdentity && width !== identity.width)
    throw new RangeError(
      "Saved worlds require their canonical atlas resolution.",
    );
  physics = identity.environment;
  const seed = identity.seed;
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const cores = Array.from({ length: 5 + (seed % 4) }, () => {
    const y = random() * 2 - 1,
      lon = random() * Math.PI * 2,
      r = Math.sqrt(1 - y * y);
    return [
      r * Math.cos(lon),
      y,
      r * Math.sin(lon),
      4 + random() * 6,
      0.75 + random() * 0.5,
    ];
  });
  const height = width / 2,
    heights = new Float32Array(width * height);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const [x, y, z] = locationVector(
        90 - ((row + 0.5) / height) * 180,
        ((col + 0.5) / width) * 360 - 180,
      );
      heights[row * width + col] = reliefAtVector(
        x,
        y,
        z,
        seed,
        cores,
        identity.version,
      );
    }
  const basinEligible =
    ["Liquid water plausible", "Ice favored"].includes(physics.waterState) &&
    !/hydrogen|none/.test(p.atmosphere);
  const coverage = basinEligible ? p.water : 0;
  let seaLevel = -Infinity;
  if (coverage === 100) seaLevel = Infinity;
  else if (coverage > 0) {
    const order = Array.from(heights.keys()).sort(
      (a, b) => heights[a] - heights[b] || a - b,
    );
    const total =
      width *
      Array.from({ length: height }, (_, row) =>
        Math.cos(((90 - ((row + 0.5) / height) * 180) * Math.PI) / 180),
      ).reduce((a, b) => a + b, 0);
    let area = 0;
    for (const i of order) {
      area += Math.cos(
        ((90 - ((Math.floor(i / width) + 0.5) / height) * 180) * Math.PI) / 180,
      );
      if (area >= (total * coverage) / 100) {
        seaLevel = heights[i];
        break;
      }
    }
  }
  // Infinity is intentionally kept in the in-memory model, never JSON-persisted.
  return {
    version: identity.version,
    id: `${identity.version}-${seed.toString(16)}-${width}`,
    seed,
    cores,
    params: p,
    physics,
    width,
    height,
    heights,
    seaLevel,
    coverage,
    gas: p.atmosphere.includes("hydrogen"),
    biology: biosphereSpec(p, physics),
  };
}
export function samplePlanetLocation(model, latitude, longitude) {
  const c = normalizeCoordinates(latitude, longitude),
    { params: p, physics: f, width, height } = model;
  const row = Math.min(
    height - 1,
    Math.floor(((90 - c.latitude) / 180) * height),
  );
  const col = Math.min(
    width - 1,
    Math.floor(((c.longitude + 180) / 360) * width),
  );
  const h = sampleRelief(model, c.latitude, c.longitude);
  const basin =
    model.coverage === 100 || (model.coverage > 0 && h <= model.seaLevel);
  const datum = Number.isFinite(model.seaLevel)
    ? model.seaLevel
    : model.coverage === 100
      ? 1.5
      : 0;
  const elevation = Math.round(
    (h - datum) * Math.min(9000, 6500 / Math.sqrt(Math.max(0.2, f.gravityG))),
  );
  const airless = p.atmosphere.includes("none");
  const latitudeAnomaly =
    -(p.pressureBar > 10 ? 5 : 35) *
    (Math.sin((c.latitude * Math.PI) / 180) ** 2 - 1 / 3);
  const vector = locationVector(c.latitude, c.longitude);
  const lockedAnomaly =
    (25 *
      vector.reduce(
        (sum, value, i) => sum + value * ILLUSTRATIVE_SUN_DIRECTION[i],
        0,
      )) /
    Math.sqrt(
      ILLUSTRATIVE_SUN_DIRECTION.reduce((sum, value) => sum + value * value, 0),
    );
  const anomaly = f.solarDayHours === null ? lockedAnomaly : latitudeAnomaly;
  const temperature =
    model.gas || airless
      ? null
      : Math.max(
          -273.15,
          f.temperatureC +
            anomaly -
            Math.max(0, elevation) * (p.pressureBar <= 10 ? 0.004 : 0),
        );
  const gasConstant =
    8.314462618 /
    (p.atmosphere.includes("methane")
      ? 0.016
      : p.atmosphere.includes("CO2")
        ? 0.044
        : 0.029);
  const pressure = model.gas
    ? null
    : airless
      ? 0
      : p.pressureBar <= 10
        ? p.pressureBar *
          Math.exp(
            (-Math.max(0, elevation) * f.gravityG * 9.80665) /
              (gasConstant *
                Math.max(150, (temperature ?? f.temperatureC) + 273.15)),
          )
        : p.pressureBar;
  const ice = basin && (f.waterState === "Ice favored" || temperature < 0);
  const localPhase =
    model.gas || airless ? null : waterState(temperature, pressure, p.water);
  const surface = model.gas
    ? "Cloud deck"
    : basin
      ? ice
        ? "Ice-covered basin"
        : localPhase === "Liquid water plausible"
          ? "Ocean"
          : "Dry basin · phase uncertain or vapor"
      : airless
        ? "Bare regolith"
        : temperature < 0
          ? "Cold mineral highlands"
          : "Mineral land";
  const moisture = basin
    ? 1
    : Math.max(
        0,
        Math.min(
          1,
          p.water / 100 +
            0.2 *
              noise(
                ...locationVector(c.latitude, c.longitude).map((v) => v * 5),
                model.seed ^ 134,
              ),
        ),
      );
  const biology =
    model.biology.present &&
    localPhase === "Liquid water plausible" &&
    temperature >= 0 &&
    temperature <= 60 &&
    pressure >= 0.1 &&
    pressure <= 10 &&
    (surface === "Ocean" || !basin) &&
    (surface !== "Ocean" || model.biology.mode === "alien");
  const biome = !biology
    ? "No biosphere depicted"
    : surface === "Ocean"
      ? "Imagined floating colonies"
      : moisture > 0.5
        ? "Imagined moisture-favored growth"
        : "Sparse imagined growth";
  const phase = model.gas
    ? "No accessible solid surface"
    : airless
      ? "No exposed water assigned"
      : basin
        ? ice
          ? "Ice favored"
          : waterState(temperature, pressure, p.water)
        : "No exposed water at this location";
  return {
    ...c,
    modelId: model.id,
    cellId: `${row}:${col}`,
    surface,
    elevationMeters: model.gas ? null : basin ? 0 : Math.max(0, elevation),
    waterDepthMeters: basin && !model.gas ? Math.max(0, -elevation) : null,
    temperatureC: temperature,
    pressureBar: pressure,
    waterPhase: phase,
    moistureIndex: model.gas || airless ? null : moisture,
    biome,
    biology,
    ice,
    basin,
    relief: h,
    note: model.gas
      ? "An atmospheric reference sphere, not a solid surface. Local temperature and pressure are unresolved."
      : airless
        ? "An imagined regolith setting. Local day/night temperatures are unresolved; the sky has no atmospheric scattering."
        : "The model suggests this regional setting using illustrative illumination/latitude and assumed elevation effects. Terrain, moisture and any biology are imagined; local weather is unresolved. Dense haze hides modeled substrate on high-pressure globes.",
  };
}
export function surfaceColor(
  model,
  s,
  row = ((90 - s.latitude) / 180) * model.height - 0.5,
) {
  let color;
  if (!model.gas && model.params.pressureBar > 10) {
    const shade = 0.5 + 0.5 * Math.sin(row * 0.08 + s.relief * 7);
    color = [175 + shade * 30, 156 + shade * 24, 127 + shade * 25];
  } else if (model.gas) {
    const band = 0.5 + 0.5 * Math.sin((row / model.height) * 65 + s.relief * 5);
    color = [120 + band * 65, 135 + band * 50, 145 + band * 45];
  } else if (s.ice) color = [201, 222, 226];
  else if (s.surface === "Ocean")
    color = [15, 53 + Math.min(20, (s.waterDepthMeters ?? 0) / 100), 78];
  else if (s.biology)
    color = model.biology.mode === "alien" ? [100, 65, 81] : [65, 96, 77];
  else if (s.temperatureC !== null && s.temperatureC < 0)
    color = [160, 168, 163];
  else color = [151, 126, 94];
  let shade = 0.85 + Math.min(0.25, s.relief * 0.3);
  if (
    model.version === "cartography-2" &&
    !model.gas &&
    model.params.pressureBar <= 10
  ) {
    // Bounded material variation, never new terrain or invented geological features.
    const v = locationVector(s.latitude, s.longitude);
    shade += 0.045 * noise(...v.map((n) => n * 180), model.seed ^ 2219);
  }
  if (model.version === "cartography-1")
    return Array.from(new Uint8ClampedArray(color.map((n) => n * shade)));
  return color.map((n) => Math.max(0, Math.min(255, Math.round(n * shade))));
}
export function atlasPixels(model, width = model.width) {
  const height = width / 2;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const s = samplePlanetLocation(
        model,
        90 - ((row + 0.5) / height) * 180,
        ((col + 0.5) / width) * 360 - 180,
      );
      const color = surfaceColor(
          model,
          s,
          model.version === "cartography-1" ? row : undefined,
        ),
        i = (row * width + col) * 4;
      pixels.set([...color, 255], i);
    }
  return pixels;
}
