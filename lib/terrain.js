// Display geometry only: never changes the versioned atlas or its location samples.
import { locationVector, samplePlanetLocation } from "./geography.js";
export const TERRAIN_EXAGGERATION = 4;
export const TERRAIN_RELIEF_CAP = 0.012;
export function terrainAvailable(model) {
  return !model.gas && model.params.pressureBar <= 10;
}
export function terrainRadius(model, latitude, longitude) {
  if (!terrainAvailable(model)) return 1;
  const sample = samplePlanetLocation(model, latitude, longitude);
  // Basins retain the shared water/ice datum; no underwater topography is exposed.
  return (
    1 +
    Math.min(
      TERRAIN_RELIEF_CAP,
      (Math.max(0, sample.elevationMeters ?? 0) * TERRAIN_EXAGGERATION) /
        (model.params.radiusEarth * 6371000),
    )
  );
}
export function terrainView(model, latitude, longitude) {
  const normal = locationVector(latitude, longitude),
    radius = terrainRadius(model, latitude, longitude),
    lat = (latitude * Math.PI) / 180,
    lon = (longitude * Math.PI) / 180,
    north = [
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      Math.sin(lat) * Math.sin(lon),
    ];
  return {
    target: normal.map((n) => n * radius),
    position: normal.map((n, i) => n * (radius + 0.18) - north[i] * 0.09),
    up: normal,
  };
}
