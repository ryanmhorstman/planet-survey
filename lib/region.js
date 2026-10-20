// Pure worker-side regional refinement. Same field/material sampler as the globe.
import {
  locationVector,
  samplePlanetLocation,
  surfaceColor,
} from "./geography.js";
import { terrainRadius } from "./terrain.js";
export const REGION_SIZE = 768;
export const REGION_SPAN = 12;
export function regionCoordinate(
  latitude,
  longitude,
  eastDegrees,
  northDegrees,
) {
  const origin = locationVector(latitude, longitude),
    lat = (latitude * Math.PI) / 180,
    lon = (longitude * Math.PI) / 180,
    north = [
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      Math.sin(lat) * Math.sin(lon),
    ],
    east = [-Math.sin(lon), 0, -Math.cos(lon)],
    length = Math.hypot(eastDegrees, northDegrees),
    d = (length * Math.PI) / 180;
  if (!length) return { latitude, longitude };
  const v = origin.map(
    (n, i) =>
      n * Math.cos(d) +
      (Math.sin(d) / length) *
        (eastDegrees * east[i] + northDegrees * north[i]),
  );
  return {
    latitude: (Math.asin(Math.max(-1, Math.min(1, v[1]))) * 180) / Math.PI,
    longitude: (Math.atan2(-v[2], v[0]) * 180) / Math.PI,
  };
}
export function createRegion(model, latitude, longitude) {
  const segments = 128,
    side = segments + 1,
    positions = new Float32Array(side * side * 3),
    uvs = new Float32Array(side * side * 2),
    indices = new Uint16Array(segments * segments * 6),
    pixels = new Uint8Array(REGION_SIZE * REGION_SIZE * 4);
  for (let row = 0; row <= segments; row++)
    for (let col = 0; col <= segments; col++) {
      const u = col / segments,
        v = row / segments,
        c = regionCoordinate(
          latitude,
          longitude,
          (u - 0.5) * 2 * REGION_SPAN,
          (0.5 - v) * 2 * REGION_SPAN,
        ),
        radius = terrainRadius(model, c.latitude, c.longitude) + 0.000025,
        index = row * side + col;
      positions.set(
        locationVector(c.latitude, c.longitude).map((n) => n * radius),
        index * 3,
      );
      uvs.set([u, 1 - v], index * 2);
      if (row < segments && col < segments) {
        const i = (row * segments + col) * 6,
          a = index,
          b = index + 1,
          c = index + side,
          d = c + 1;
        indices.set([a, c, b, b, c, d], i);
      }
    }
  for (let y = 0; y < REGION_SIZE; y++)
    for (let x = 0; x < REGION_SIZE; x++) {
      const c = regionCoordinate(
          latitude,
          longitude,
          ((x + 0.5) / REGION_SIZE - 0.5) * 2 * REGION_SPAN,
          (0.5 - (y + 0.5) / REGION_SIZE) * 2 * REGION_SPAN,
        ),
        sample = samplePlanetLocation(model, c.latitude, c.longitude),
        color = surfaceColor(model, sample),
        edge = Math.min(x, y, REGION_SIZE - 1 - x, REGION_SIZE - 1 - y),
        alpha = Math.min(1, edge / 20);
      pixels.set(
        [...color, Math.round(alpha * 255)],
        (y * REGION_SIZE + x) * 4,
      );
    }
  return { positions, uvs, indices, pixels, size: REGION_SIZE };
}
