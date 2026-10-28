import { cartographyId, validateLocation } from "./cartography-record.js";
export const EXPEDITION_VERSION = "expedition-1";
export const MAX_EXPEDITIONS = 8;
export function expeditionMetadata(cartography, params, location, heading = 0) {
  const coordinates = validateLocation(location);
  if (!Number.isInteger(heading) || heading < 0 || heading > 359)
    throw new RangeError("Heading must be a whole degree from 0 to 359.");
  const key = JSON.stringify([
    EXPEDITION_VERSION,
    cartography,
    params.biosphere,
    coordinates.latitude,
    coordinates.longitude,
    heading,
  ]);
  return {
    key,
    modelId: cartographyId(cartography),
    promptVersion: EXPEDITION_VERSION,
    ...coordinates,
    heading,
    fieldOfView: 60,
  };
}
function boundedText(value, max) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new RangeError("Invalid expedition field notes.");
  return value.trim();
}
export function expeditionNarrative(value) {
  if (!value || typeof value !== "object")
    throw new RangeError("Invalid expedition field notes.");
  return {
    description: boundedText(value.description, 1000),
    surfaceFeatures: boundedText(value.surfaceFeatures, 400),
    // Server attestation that these notes were AI-written for this expedition key.
    ...(typeof value.signature === "string" &&
    /^[a-f0-9]{64}$/.test(value.signature)
      ? { signature: value.signature }
      : {}),
  };
}
export function expeditionAsset(value) {
  if (
    !value ||
    typeof value.url !== "string" ||
    !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/psu7\/images\/[a-f0-9-]+\.webp$/.test(
      value.url,
    ) ||
    !/^[a-f0-9]{64}$/.test(value.signature || "") ||
    !/^[a-f0-9]{64}$/.test(value.expeditionSignature || "")
  )
    throw new RangeError("Invalid expedition image reference.");
  return {
    url: value.url,
    signature: value.signature,
    expeditionSignature: value.expeditionSignature,
    kind: "generated",
  };
}
export function validateExpeditions(values, cartography, params) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > MAX_EXPEDITIONS)
    throw new RangeError(
      `Keep at most ${MAX_EXPEDITIONS} expeditions per report.`,
    );
  const keys = new Set();
  return values.map((value) => {
    if (!value || typeof value !== "object")
      throw new RangeError("Invalid expedition record.");
    const metadata = expeditionMetadata(
      cartography,
      params,
      value,
      value.heading,
    );
    if (
      value.key !== metadata.key ||
      value.modelId !== metadata.modelId ||
      value.promptVersion !== EXPEDITION_VERSION ||
      value.fieldOfView !== 60 ||
      keys.has(metadata.key)
    )
      throw new RangeError(
        "Expedition does not match its location, camera or world.",
      );
    keys.add(metadata.key);
    if (!value.asset && !value.narrative)
      throw new RangeError("Expedition has no saved image or notes.");
    return {
      ...metadata,
      ...(value.asset ? { asset: expeditionAsset(value.asset) } : {}),
      ...(value.narrative
        ? { narrative: expeditionNarrative(value.narrative) }
        : {}),
    };
  });
}
