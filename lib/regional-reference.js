// Server-only, dependency-free PNG reference derived from the canonical atlas.
import { crc32, deflateSync } from "node:zlib";
import {
  atlasPixels,
  locationVector,
  samplePlanetLocation,
} from "./geography.js";
export const REFERENCE_SIZE = 512;
export const REFERENCE_RADIUS_DEGREES = 6;

// Azimuthal equidistant projection: north is up, including across the dateline.
export function regionalCoordinate(
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
    distance = (Math.hypot(eastDegrees, northDegrees) * Math.PI) / 180;
  if (distance === 0) return { latitude, longitude };
  const scale = Math.sin(distance) / Math.hypot(eastDegrees, northDegrees),
    v = origin.map(
      (n, i) =>
        n * Math.cos(distance) +
        scale * (eastDegrees * east[i] + northDegrees * north[i]),
    );
  return {
    latitude: (Math.asin(Math.max(-1, Math.min(1, v[1]))) * 180) / Math.PI,
    longitude: (Math.atan2(-v[2], v[0]) * 180) / Math.PI,
  };
}
function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE(crc32(data));
  return Buffer.concat([length, data, checksum]);
}
export function regionalReference(model, metadata) {
  const size = REFERENCE_SIZE,
    center = (size - 1) / 2,
    atlas = atlasPixels(model),
    pixels = Buffer.alloc((size * 3 + 1) * size),
    heading = (metadata.heading * Math.PI) / 180;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x - center,
        dy = center - y,
        c = regionalCoordinate(
          metadata.latitude,
          metadata.longitude,
          (dx / center) * REFERENCE_RADIUS_DEGREES,
          (dy / center) * REFERENCE_RADIUS_DEGREES,
        ),
        s = samplePlanetLocation(model, c.latitude, c.longitude),
        [row, col] = s.cellId.split(":").map(Number),
        index = (row * model.width + col) * 4,
        out = y * (size * 3 + 1) + 1 + x * 3,
        along = dx * Math.sin(heading) + dy * Math.cos(heading),
        across = dx * Math.cos(heading) - dy * Math.sin(heading),
        marker =
          (Math.abs(dx) <= 1.5 && Math.abs(dy) <= 7) ||
          (Math.abs(dy) <= 1.5 && Math.abs(dx) <= 7) ||
          (along >= 10 && along <= 42 && Math.abs(across) <= 1.5);
      for (let channel = 0; channel < 3; channel++)
        pixels[out + channel] = marker ? 255 : atlas[index + channel];
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2; // Eight-bit RGB, no alpha/interlacing; each row uses filter zero.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
