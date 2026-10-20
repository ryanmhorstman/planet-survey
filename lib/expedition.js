// Server-owned environmental context. Never accept a client-written prompt or sample.
import { validateSurvey, calculate, InputError, STARS } from "./planet.js";
import {
  validateCartography,
  ILLUSTRATIVE_SUN_DIRECTION,
} from "./cartography-record.js";
import {
  createGeography,
  samplePlanetLocation,
  locationVector,
} from "./geography.js";
import { expeditionMetadata } from "./expedition-record.js";
export function prepareExpedition(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).some(
      (key) =>
        ![
          "params",
          "catalog",
          "cartography",
          "latitude",
          "longitude",
          "heading",
          "operation",
        ].includes(key),
    )
  )
    throw new InputError(
      "Send a world, coordinates and heading, not custom scenery or a prompt.",
    );
  if (!["image", "notes"].includes(input.operation))
    throw new InputError("Choose expedition image or notes.");
  const { params, catalog } = validateSurvey({
    params: input.params,
    catalog: input.catalog,
  });
  const physics = calculate(params, catalog);
  try {
    if (!input.cartography)
      throw new RangeError("The saved planetary identity is required.");
    const cartography = validateCartography(input.cartography, params, physics);
    return {
      params,
      catalog,
      physics,
      cartography,
      operation: input.operation,
      metadata: expeditionMetadata(
        cartography,
        params,
        input,
        input.heading ?? 0,
      ),
    };
  } catch (error) {
    throw new InputError(error.message);
  }
}
export function expeditionContext(prepared) {
  const { params: p, metadata: m, cartography } = prepared;
  const model = createGeography(p, prepared.physics, 512, cartography);
  const local = samplePlanetLocation(model, m.latitude, m.longitude);
  const lat = (m.latitude * Math.PI) / 180,
    lon = (m.longitude * Math.PI) / 180;
  const sun = ILLUSTRATIVE_SUN_DIRECTION.map(
      (n) =>
        n /
        Math.sqrt(
          ILLUSTRATIVE_SUN_DIRECTION.reduce(
            (sum, value) => sum + value * value,
            0,
          ),
        ),
    ),
    v = locationVector(m.latitude, m.longitude);
  const dot = (vector) => vector.reduce((sum, n, i) => sum + n * sun[i], 0);
  const north = [
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      Math.sin(lat) * Math.sin(lon),
    ],
    east = [-Math.sin(lon), 0, -Math.cos(lon)];
  const altitude =
    (Math.asin(Math.max(-1, Math.min(1, dot(v)))) * 180) / Math.PI;
  const azimuth =
    ((Math.atan2(dot(east), dot(north)) * 180) / Math.PI + 360) % 360;
  const regional = [];
  // A coarse regional neighborhood is context, not a claim about a visible horizon.
  for (const bearing of [0, 90, 180, 270]) {
    const d = Math.PI / 180,
      b = (bearing * Math.PI) / 180;
    const nextLat = Math.asin(
      Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b),
    );
    const nextLon =
      lon +
      Math.atan2(
        Math.sin(b) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(nextLat),
      );
    const point = samplePlanetLocation(
      model,
      (nextLat * 180) / Math.PI,
      (nextLon * 180) / Math.PI,
    );
    regional.push({
      bearing,
      angularDistanceDegrees: 1,
      terrain: point.surface,
      elevationMeters: point.elevationMeters,
    });
  }
  return {
    local,
    regional,
    illumination: {
      solarAltitudeDegrees: altitude,
      solarAzimuthDegrees: azimuth,
      phase:
        altitude < -6
          ? "night"
          : altitude < 6
            ? "low-angle twilight"
            : "daylight",
      stellarLight: STARS[p.starType].light,
      reference:
        "Fixed illustrative epoch shared with the globe, not an observed local time.",
    },
    biology: local.biology
      ? {
          palette: model.biology.palette,
          forms:
            local.surface === "Ocean"
              ? "floating compact colonies; no rooted vegetation"
              : model.biology.forms,
          mode: model.biology.mode,
        }
      : null,
  };
}
export function expeditionImagePrompt(prepared, context) {
  const { params: p, metadata: m, cartography } = prepared,
    { local: s, biology, illumination } = context;
  const gas = p.atmosphere.includes("hydrogen"),
    airless = p.atmosphere.includes("none");
  return (
    `Create a photorealistic imagined expedition view, not an observation.\n` +
    `1. Camera perspective and framing\n${gas ? "A view within upper atmospheric clouds; no ground, rocks, mountains or ocean." : s.surface === "Ocean" ? "A camera at the ocean waterline, open water in the foreground." : "A human-height camera on the specified local substrate, looking toward the horizon."} Heading ${m.heading} degrees east of north; horizontal field of view 60 degrees. The planet cannot appear in its own sky.\n` +
    `2. Physical environmental constraints\nLocal terrain ${s.surface}; local temperature proxy ${s.temperatureC === null ? "unresolved" : s.temperatureC.toFixed(1) + " C"}; pressure ${s.pressureBar === null ? "unresolved" : s.pressureBar + " bar"}; water phase ${s.waterPhase}. Gravity ${cartography.environment.gravityG.toFixed(2)} Earth gravities. ${s.ice ? "Coherent ice-covered terrain; no open liquid seas." : s.surface !== "Ocean" ? "Use the sampled mineral/ice substrate, not an invented ocean foreground." : "No exposed land in the foreground."}\n` +
    `3. Shared planetary geography\nWorld ${m.modelId}; coordinates ${m.latitude}, ${m.longitude}. This is a local region of the deterministic globe. Coarse regional context: ${JSON.stringify(context.regional)}. These samples are one angular degree away and may be beyond the horizon. Do not fabricate a visible coastline or mountain from a distant sample. Global water coverage is not the required water fraction in this frame. Exact coastlines and landmarks are not guaranteed by this text-conditioned illustration.\n` +
    `4. Atmosphere, illumination, and surface materials\n${airless ? "Black sky, no clouds or atmospheric haze." : p.pressureBar > 10 ? "Optically thick haze, strongly limited visibility; do not show a clear transparent sky." : "Subtle atmospheric scattering consistent with the assumed atmosphere."} ${JSON.stringify(illumination)}. Respect this day/night state; do not replace night with bright daylight. Use ${illumination.stellarLight} indirect illumination; no visible stellar disk. Natural weathered mineral, ice or water textures according to the local sample.\n` +
    `5. Biosphere morphology\n${biology ? `Only explicitly imagined growth: ${JSON.stringify(biology)}. ${biology.mode === "alien" ? "No familiar Earth trees, grass or flowers; allow varied organic structures within these constraints." : "Vegetation-like silhouettes remain an artistic choice."}` : "No biosphere depicted here: no plants, forests, animals or invented organisms."}\n` +
    `6. Photorealistic art direction\nNatural scale, restrained colors, physically coherent shadows. Render one local landscape, not a miniature globe or map.\n` +
    `7. Prohibited unsupported features\nNo moons, rings, extra planets, recognizable Earth maps, settlements, spacecraft, artificial structures, text or labels. No observed-life, acquired-telemetry or detection claims.`
  );
}
export function expeditionAnalysisPrompt(prepared, context) {
  return `Write three concise evocative sentences of explicitly imagined expedition field notes and one surface-features sentence for the selected coordinate. Distinguish calculated, estimated, assumed and imagined information. No observation, detection, measurement or telemetry acquisition occurred. Never present local water, atmosphere, terrain or biology as observed facts. Do not invent numerical facts, life, animals, geological activity, moons, settlements, breathable air or human safety. Do not revise global scores. Use only the provided local sample; neighboring regions may be beyond the horizon. ${prepared.catalog ? "Catalogue quantities are catalogue evidence only; none establish surface conditions. Attribute actual supplied catalogue quantities, and identify equilibrium temperatures as estimates." : "This world is fictional."}\nCoordinates and camera: ${JSON.stringify(prepared.metadata)}\nServer-derived local context: ${JSON.stringify(context)}\nReturn ONLY JSON with description (at most 1000 characters) and surfaceFeatures (at most 400 characters). Prefer “The model estimates…” or “An imagined expedition depicts…” with natural variation.`;
}
