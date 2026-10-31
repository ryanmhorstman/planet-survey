// A bounded CPU render, built on the server from the saved geography. One AI call follows.
import {
  createGeography,
  geographyNoise,
  locationVector,
  samplePlanetLocation,
  surfaceColor,
} from "./geography.js";
import { ILLUSTRATIVE_SUN_DIRECTION } from "./cartography-record.js";
import { orbitalView, validateOrbitalView } from "./orbital-record.js";
import { encodePNG } from "./png.js";
import { imagePrompt } from "./planet.js";
export const ORBITAL_REFERENCE_WIDTH = 768,
  ORBITAL_REFERENCE_HEIGHT = 512;
export function orbitalReference(params, physics, cartography) {
  const model = createGeography(params, physics, 512, cartography),
    view = orbitalView(cartography),
    pixels = renderOrbitalPixels(model, view);
  return {
    view,
    png: encodePNG(ORBITAL_REFERENCE_WIDTH, ORBITAL_REFERENCE_HEIGHT, pixels),
  };
}
export function renderOrbitalPixels(model, view) {
  validateOrbitalView(view);
  if (view.modelId !== model.id)
    throw new RangeError("Orbital world mismatch.");
  const width = ORBITAL_REFERENCE_WIDTH,
    height = ORBITAL_REFERENCE_HEIGHT,
    pixels = Buffer.alloc((width * 3 + 1) * height),
    normal = locationVector(view.latitude, view.longitude),
    lat = (view.latitude * Math.PI) / 180,
    lon = (view.longitude * Math.PI) / 180,
    north = [
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      Math.sin(lat) * Math.sin(lon),
    ],
    east = [-Math.sin(lon), 0, -Math.cos(lon)],
    eye = normal.map((n) => n * view.distance),
    sun = ILLUSTRATIVE_SUN_DIRECTION.map(
      (n) => n / Math.hypot(...ILLUSTRATIVE_SUN_DIRECTION),
    ),
    scale = Math.tan((view.fieldOfView * Math.PI) / 360),
    c = view.distance ** 2 - 1,
    // A world with a fixed star has an unlit nightside, so the guide shows a
    // real terminator, as does one whose city lights need a night side to
    // show on; other worlds keep some fill light to stay readable.
    ambient =
      model.physics.solarDayHours === null ||
      ["cities", "global"].includes(model.params.civilization)
        ? 0.03
        : 0.25;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = ((2 * (x + 0.5)) / width - 1) * view.aspectRatio * scale,
        sy = (1 - (2 * (y + 0.5)) / height) * scale,
        direction = normal.map((n, i) => -n + east[i] * sx + north[i] * sy),
        length = Math.hypot(...direction),
        ray = direction.map((n) => n / length),
        b = eye.reduce((sum, n, i) => sum + n * ray[i], 0),
        disc = b * b - c,
        index = y * (width * 3 + 1) + 1 + x * 3;
      if (disc < 0) {
        pixels.set([9, 13, 16], index);
        continue;
      }
      const t = -b - Math.sqrt(disc),
        p = eye.map((n, i) => n + t * ray[i]),
        latitude = (Math.asin(Math.max(-1, Math.min(1, p[1]))) * 180) / Math.PI,
        longitude = (Math.atan2(-p[2], p[0]) * 180) / Math.PI,
        sample = iceEdgeSample(
          model,
          samplePlanetLocation(model, latitude, longitude),
        ),
        color = surfaceColor(model, sample),
        light =
          ambient +
          (1.1 - ambient) *
            Math.max(
              0,
              p.reduce((sum, n, i) => sum + n * sun[i], 0),
            ),
        limb = paramsAtmosphere(model)
          ? 0.16 *
            (1 - Math.max(0, -p.reduce((sum, n, i) => sum + n * ray[i], 0))) **
              3
          : 0,
        haze = model.params.atmosphere.includes("CO2")
          ? [196, 169, 139]
          : [107, 158, 175];
      pixels.set(
        color.map((n, i) =>
          Math.max(
            0,
            Math.min(
              255,
              Math.round(
                n * light * (1 - limb) + haze[i] * limb * Math.min(1, light),
              ),
            ),
          ),
        ),
        index,
      );
    }
  return pixels;
}
/**
 * The saved geography freezes water at a temperature that varies only with
 * latitude (or distance from the substellar point), so its ice and frost edges
 * are perfect circles that the image model copies as straight lines. The guide
 * roughens them by a few degrees of noise; the saved geography is unchanged.
 * @param {any} model @param {any} s A samplePlanetLocation result.
 */
export function iceEdgeSample(model, s) {
  if (s.temperatureC == null || model.physics.waterState === "Ice favored")
    return s;
  const v = locationVector(s.latitude, s.longitude),
    temperatureC =
      s.temperatureC +
      6 * geographyNoise(...v.map((n) => n * 12), model.seed ^ 7919) +
      3 * geographyNoise(...v.map((n) => n * 40), model.seed ^ 104729);
  if (!["Ocean", "Ice-covered basin"].includes(s.surface))
    return { ...s, temperatureC };
  const ice = temperatureC < 0;
  return {
    ...s,
    temperatureC,
    ice,
    surface: ice ? "Ice-covered basin" : "Ocean",
  };
}
function paramsAtmosphere(model) {
  return (
    model.params.pressureBar > 0 && !model.params.atmosphere.includes("none")
  );
}
export function orbitalImagePrompt(params, physics, view) {
  const base = imagePrompt(params, physics, "orbital");
  return base.replace(
    /3\. Shared planetary geography[\s\S]*?(?=4\. Atmosphere)/,
    `3. Shared planetary geography\nThe attached image is the authoritative rendered globe for world ${view.modelId}, camera latitude ${view.latitude}, longitude ${view.longitude}, north-up, distance ${view.distance} planet radii, vertical field of view ${view.fieldOfView} degrees, aspect ratio ${view.aspectRatio}. Preserve this exact hemisphere, projection, planetary scale in frame, continental silhouettes, island positions, ocean orientation, ice distribution and day/night boundary. Do not rotate the globe or replace its geography with Earth. Add photographic material detail within these arrangements; do not invent new continents, lakes or mountain ranges. Surface conditions remain modeled or imagined, not observed. On gas or optically thick worlds, preserve atmospheric bands/haze instead of revealing hidden terrain. Atmospheric detail must not conceal the major visible geography. The saved reference is a geographic guide, not a promise of pixel-exact AI fidelity.\n`,
  );
}
