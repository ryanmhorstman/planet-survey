// Pure worker-side regional refinement. Same field/material sampler as the globe.
import { locationVector, samplePlanetLocation } from "./geography.js";
import { terrainDetail } from "./terrain-detail.js";
import { terrainRadius, detailedTerrainRadius } from "./terrain.js";
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
export function createRegion(model, latitude, longitude, span = REGION_SPAN) {
  if (![0.0625, 0.25, 1, 4, 12].includes(span))
    throw new RangeError("Unsupported regional span.");
  const segments = 192,
    side = segments + 1,
    positions = new Float32Array(side * side * 3),
    uvs = new Float32Array(side * side * 2),
    indices = new Uint16Array(segments * segments * 6),
    pixels = new Uint8Array(REGION_SIZE * REGION_SIZE * 4),
    heights = new Float32Array(REGION_SIZE * REGION_SIZE),
    bump = new Uint8Array(REGION_SIZE * REGION_SIZE),
    specular = new Uint8Array(REGION_SIZE * REGION_SIZE);
  let minHeight = Infinity,
    maxHeight = -Infinity;
  for (let row = 0; row <= segments; row++)
    for (let col = 0; col <= segments; col++) {
      const u = col / segments,
        v = row / segments,
        c = regionCoordinate(
          latitude,
          longitude,
          (u - 0.5) * 2 * span,
          (0.5 - v) * 2 * span,
        ),
        edge = Math.min(u, v, 1 - u, 1 - v),
        blend = Math.min(1, edge / 0.12),
        coarse = terrainRadius(model, c.latitude, c.longitude),
        radius =
          coarse +
          (detailedTerrainRadius(model, c.latitude, c.longitude) - coarse) *
            blend +
          0.000025,
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
          ((x + 0.5) / REGION_SIZE - 0.5) * 2 * span,
          (0.5 - (y + 0.5) / REGION_SIZE) * 2 * span,
        ),
        sample = samplePlanetLocation(model, c.latitude, c.longitude),
        detail = terrainDetail(model, c.latitude, c.longitude, sample),
        color = detail.color,
        edge = Math.min(x, y, REGION_SIZE - 1 - x, REGION_SIZE - 1 - y),
        alpha = Math.min(1, edge / 20);
      const h = detail.heightOffsetMeters + detail.microHeightMeters;
      heights[y * REGION_SIZE + x] = h;
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
      specular[y * REGION_SIZE + x] =
        sample.surface === "Ocean" ? 150 : sample.ice ? 55 : 8;
      pixels.set(
        [...color, Math.round(alpha * 255)],
        (y * REGION_SIZE + x) * 4,
      );
    }
  const heightRange = Math.max(1, maxHeight - minHeight);
  for (let i = 0; i < heights.length; i++)
    bump[i] = Math.round(((heights[i] - minHeight) / heightRange) * 255);
  return {
    positions,
    uvs,
    indices,
    pixels,
    bump,
    specular,
    heightRange,
    span,
    size: REGION_SIZE,
  };
}
