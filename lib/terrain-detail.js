// Deterministic display-scale relief, not a replacement for the saved regional model.
// Keep this visual-detail version stable; coastlines and environmental sampling stay upstream.
import {
  locationVector,
  samplePlanetLocation,
  surfaceColor,
  geographyNoise as noise,
} from "./geography.js";
export const TERRAIN_DETAIL_VERSION = "surface-detail-1";
export function terrainDetail(
  model,
  latitude,
  longitude,
  sample = samplePlanetLocation(model, latitude, longitude),
) {
  const baseColor = surfaceColor(model, sample),
    v = locationVector(latitude, longitude),
    seed = model.seed ^ 0x74ac9,
    fineGrain = noise(...v.map((n) => n * 42000), seed ^ 417),
    grain = noise(...v.map((n) => n * 6200), seed ^ 981),
    unavailable = model.gas || model.params.pressureBar > 10;
  if (unavailable)
    return {
      heightOffsetMeters: 0,
      microHeightMeters: 0,
      amplitudeMeters: 0,
      rockiness: 0,
      color: baseColor,
    };
  if (sample.basin) {
    const variation = sample.ice ? grain * 0.09 : grain * 0.035;
    return {
      heightOffsetMeters: 0,
      microHeightMeters: sample.ice ? grain * 5 : grain * 0.15,
      amplitudeMeters: 0,
      rockiness: 0,
      color: baseColor.map((n) =>
        Math.max(0, Math.min(255, Math.round(n * (1 + variation)))),
      ),
    };
  }
  const warp = v.map(
      (n, i) =>
        n * 1350 +
        3 *
          noise(
            ...v.map((x, j) => x * 370 + (j === i ? 13 : 0)),
            seed + i * 571,
          ),
    ),
    ridgeNoise = noise(...warp, seed),
    ridge = (1 - Math.sqrt(ridgeNoise * ridgeNoise + 0.035)) ** 2,
    folds = noise(...warp.map((n) => n * 2.3), seed ^ 331),
    amplitude = Math.min(
      1000 / Math.sqrt(Math.max(0.2, model.physics.gravityG)),
      Math.max(0, sample.elevationMeters) * 0.7,
    ),
    heightOffsetMeters = amplitude * (ridge * 0.8 + folds * 0.4 - 0.25),
    microHeightMeters =
      grain * Math.min(55, amplitude * 0.15) +
      fineGrain * Math.min(4, amplitude * 0.01),
    rockiness = Math.min(
      1,
      Math.max(0, (heightOffsetMeters / Math.max(1, amplitude) - 0.08) * 2),
    ),
    rock =
      sample.temperatureC !== null && sample.temperatureC < 0
        ? [164, 166, 156]
        : [151, 135, 111],
    blend = sample.biology ? rockiness * 0.9 : rockiness * 0.35,
    color = baseColor.map((n, i) =>
      Math.max(
        0,
        Math.min(
          255,
          Math.round(
            (n * (1 - blend) + rock[i] * blend) *
              (1 + grain * 0.17 + folds * 0.09 + fineGrain * 0.05),
          ),
        ),
      ),
    );
  return {
    heightOffsetMeters,
    microHeightMeters,
    amplitudeMeters: amplitude,
    rockiness,
    color,
  };
}
export function terrainSpan(distance) {
  return distance < 0.0008
    ? 0.0625
    : distance < 0.004
      ? 0.25
      : distance < 0.016
        ? 1
        : distance < 0.064
          ? 4
          : 12;
}
