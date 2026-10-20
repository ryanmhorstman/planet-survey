import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { DEFAULTS, createReport } from "../lib/planet.js";
import {
  createGeography,
  surfaceColor,
  samplePlanetLocation,
} from "../lib/geography.js";
import {
  regionalReference,
  regionalCoordinate,
  REFERENCE_SIZE,
} from "../lib/regional-reference.js";
function decode(bytes) {
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset),
      type = bytes.toString("ascii", offset + 4, offset + 8),
      data = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === "IHDR") {
      assert.equal(data.readUInt32BE(0), REFERENCE_SIZE);
      assert.equal(data.readUInt32BE(4), REFERENCE_SIZE);
      assert.equal(data[9], 2);
    }
    if (type === "IDAT") compressed.push(data);
    offset += size + 12;
  }
  return inflateSync(Buffer.concat(compressed));
}
test("regional projection preserves bearings and wraps poles and the dateline", () => {
  assert.deepEqual(regionalCoordinate(23, 45, 0, 0), {
    latitude: 23,
    longitude: 45,
  });
  const north = regionalCoordinate(0, 0, 0, 6),
    east = regionalCoordinate(0, 179, 6, 0);
  assert.ok(Math.abs(north.latitude - 6) < 1e-8);
  assert.ok(Math.abs(east.longitude + 175) < 1e-8);
  for (const lat of [-90, 90])
    for (const lon of [-180, 179]) {
      const c = regionalCoordinate(lat, lon, 6, 6);
      assert.ok(Number.isFinite(c.latitude) && Math.abs(c.latitude) <= 90);
      assert.ok(Number.isFinite(c.longitude) && Math.abs(c.longitude) <= 180);
    }
});
test("regional PNG repeats exactly, marks heading, and samples canonical globe pixels", () => {
  const report = createReport({ params: DEFAULTS }),
    model = createGeography(
      report.params,
      report.physics,
      512,
      report.cartography,
    ),
    site = { latitude: 23, longitude: 179, heading: 90 },
    png = regionalReference(model, site),
    pixels = decode(png),
    size = REFERENCE_SIZE,
    center = (size - 1) / 2;
  assert.deepEqual(regionalReference(model, site), png);
  assert.notDeepEqual(regionalReference(model, { ...site, heading: 0 }), png);
  assert.notDeepEqual(
    regionalReference(model, { ...site, latitude: -23 }),
    png,
  );
  assert.equal(pixels.length, (size * 3 + 1) * size);
  for (const [x, y] of [
    [0, 0],
    [511, 0],
    [0, 511],
    [511, 511],
    [128, 300],
  ]) {
    const c = regionalCoordinate(
        site.latitude,
        site.longitude,
        ((x - center) / center) * 6,
        ((center - y) / center) * 6,
      ),
      s = samplePlanetLocation(model, c.latitude, c.longitude),
      destination = y * (size * 3 + 1) + 1 + x * 3;
    assert.deepEqual(
      [...pixels.subarray(destination, destination + 3)],
      surfaceColor(model, s),
    );
  }
  const marker = 256 * (size * 3 + 1) + 1 + 280 * 3;
  assert.deepEqual([...pixels.subarray(marker, marker + 3)], [255, 255, 255]);
});
