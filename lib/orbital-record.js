// Lightweight persisted camera contract. No renderer or server dependencies.
import { cartographyId } from "./cartography-record.js";
export const ORBITAL_REFERENCE_VERSION = "orbital-reference-1";
export const ORBITAL_CAMERA = Object.freeze({
  latitude: 15,
  longitude: -80,
  distance: 4.2,
  fieldOfView: 36,
  aspectRatio: 1.5,
});
export function orbitalView(cartography) {
  return {
    version: ORBITAL_REFERENCE_VERSION,
    modelId: cartographyId(cartography),
    ...ORBITAL_CAMERA,
  };
}
export function validateOrbitalView(value, cartography) {
  if (
    !value ||
    typeof value !== "object" ||
    value.version !== ORBITAL_REFERENCE_VERSION ||
    typeof value.modelId !== "string" ||
    !/^cartography-[12]-[a-f0-9]{1,8}-512$/.test(value.modelId) ||
    Object.entries(ORBITAL_CAMERA).some(([key, n]) => value[key] !== n) ||
    Object.keys(value).some(
      (key) =>
        !["version", "modelId", ...Object.keys(ORBITAL_CAMERA)].includes(key),
    ) ||
    (cartography && value.modelId !== cartographyId(cartography))
  )
    throw new RangeError(
      "The orbital reference does not match its world or camera.",
    );
  return { version: value.version, modelId: value.modelId, ...ORBITAL_CAMERA };
}
export function orbitalAssetMetadata(asset, cartography) {
  if (asset.globeView === undefined && asset.referenceSignature === undefined)
    return {};
  if (!/^[a-f0-9]{64}$/.test(asset.referenceSignature || ""))
    throw new RangeError("Invalid orbital reference signature.");
  return {
    globeView: validateOrbitalView(asset.globeView, cartography),
    referenceSignature: asset.referenceSignature,
  };
}
