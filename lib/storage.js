import { orbitalAssetMetadata, validateOrbitalView } from "./orbital-record.js";
import { put, get } from "@vercel/blob";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createReport,
  InputError,
  MODEL_VERSION,
  SUPPORTED_REPORT_VERSIONS,
  object,
  shortText,
} from "./planet.js";
import { ServiceError } from "./server.js";

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
function sign(url) {
  return createHmac("sha256", process.env.BLOB_READ_WRITE_TOKEN)
    .update(url)
    .digest("hex");
}
export function verifiedAsset(input) {
  object(input, "Image reference");
  if (
    ["/assets/sample-orbital.webp", "/assets/sample-surface.webp"].includes(
      input.url,
    )
  )
    return { url: input.url, kind: "reference" };
  if (
    !blobConfigured() ||
    typeof input.url !== "string" ||
    input.url.length > 1000 ||
    !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/psu7\/images\/[a-f0-9-]+\.webp$/.test(
      input.url,
    ) ||
    typeof input.signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.signature)
  )
    throw new InputError("This image cannot be included in a public report.");
  const expected = Buffer.from(sign(input.url), "hex"),
    received = Buffer.from(input.signature, "hex");
  if (!timingSafeEqual(expected, received))
    throw new InputError("The image reference could not be verified.");
  let metadata;
  try {
    metadata = orbitalAssetMetadata(input);
  } catch (error) {
    throw new InputError(error.message);
  }
  if (metadata.globeView) {
    const expected = Buffer.from(
        referenceSignature(input.url, metadata.globeView),
        "hex",
      ),
      received = Buffer.from(metadata.referenceSignature, "hex");
    if (!timingSafeEqual(expected, received))
      throw new InputError(
        "The orbital image does not belong to this reference world/view.",
      );
  }
  return {
    url: input.url,
    signature: input.signature,
    kind: "generated",
    ...metadata,
  };
}
function referenceSignature(url, view) {
  return createHmac("sha256", process.env.BLOB_READ_WRITE_TOKEN)
    .update(JSON.stringify([url, validateOrbitalView(view)]))
    .digest("hex");
}
export async function storeOrbitalImage(base64, view) {
  const globeView = validateOrbitalView(view),
    asset = await storeImage(base64);
  return {
    ...asset,
    globeView,
    referenceSignature: referenceSignature(asset.url, globeView),
  };
}
export async function storeImage(base64) {
  if (!blobConfigured())
    throw new ServiceError(
      503,
      "Live imagery is unavailable. The model report is ready to explore.",
    );
  if (
    typeof base64 !== "string" ||
    base64.length > 12e6 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  )
    throw new ServiceError(
      502,
      "The image service returned an invalid image.",
      "INVALID_RESPONSE",
    );
  const image = Buffer.from(base64, "base64");
  if (
    image.subarray(0, 4).toString() !== "RIFF" ||
    image.subarray(8, 12).toString() !== "WEBP"
  )
    throw new ServiceError(
      502,
      "The image service returned an unsupported image.",
      "INVALID_RESPONSE",
    );
  try {
    const blob = await put(`psu7/images/${randomUUID()}.webp`, image, {
      access: "public",
      addRandomSuffix: false,
      contentType: "image/webp",
      abortSignal: AbortSignal.timeout(10000),
    });
    return { url: blob.url, signature: sign(blob.url), kind: "generated" };
  } catch {
    throw new ServiceError(503, "The image could not be saved. Please retry.");
  }
}
export function validateStoredReport(input, verifyImages = true) {
  object(input, "Report");
  if (!SUPPORTED_REPORT_VERSIONS.includes(input.version))
    throw new InputError("This report version is not supported.");
  if (input.version >= 3 && !input.cartography)
    throw new InputError(
      "This report is missing its saved planetary identity.",
    );
  if (input.version >= 4 && !Array.isArray(input.expeditions))
    throw new InputError("This report is missing its expedition records.");
  const images = {};
  for (const view of ["orbital", "surface"])
    if (input.images?.[view]) {
      if (verifyImages) images[view] = verifiedAsset(input.images[view]);
      else {
        const asset = input.images[view];
        if (
          ![
            "/assets/sample-orbital.webp",
            "/assets/sample-surface.webp",
          ].includes(asset.url) &&
          !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/psu7\/images\/[a-f0-9-]+\.webp$/.test(
            asset.url,
          )
        )
          throw new InputError("Invalid saved image.");
        images[view] = asset;
      }
    }
  const report = createReport({
    params: input.params,
    catalog: input.catalog,
    name: shortText(input.name, 100, "Report name"),
    narrative: input.narrative,
    images,
    cartography: input.cartography,
    geographyVersion:
      !input.cartography && input.version === 2 ? "cartography-1" : undefined,
    sites: input.sites,
    selectedLocation: input.selectedLocation,
    expeditions: input.expeditions,
  });
  if (verifyImages)
    for (const expedition of report.expeditions)
      if (expedition.asset)
        verifiedExpeditionAsset(expedition.asset, expedition.key);
  report.narrativeKind = input.narrativeKind === "ai" ? "ai" : "model";
  return report;
}
export async function storeReport(input) {
  if (!blobConfigured())
    throw new ServiceError(
      503,
      "Public report links are temporarily unavailable. You can download your report instead.",
    );
  const report = validateStoredReport(input),
    id = randomUUID();
  report.id = id;
  try {
    await put(`psu7/reports/${id}.json`, JSON.stringify(report), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      abortSignal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ServiceError(
      503,
      "This report could not be saved. Please retry.",
    );
  }
  return id;
}
export async function readReport(id) {
  if (
    typeof id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      id,
    )
  )
    throw new InputError("This report link is invalid.");
  if (!blobConfigured())
    throw new ServiceError(
      503,
      "Shared reports are temporarily unavailable. Please try again later.",
    );
  let result;
  try {
    result = await get(`psu7/reports/${id}.json`, {
      access: "public",
      abortSignal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ServiceError(
      503,
      "This report could not be retrieved. Please try again later.",
    );
  }
  if (!result || result.statusCode === 304)
    throw new ServiceError(404, "This report was not found.", "NOT_FOUND");
  const json = await new Response(result.stream).json();
  const report = validateStoredReport(json, false);
  report.id = id;
  report.createdAt = json.createdAt;
  return report;
}

function expeditionSignature(url, key) {
  return createHmac("sha256", process.env.BLOB_READ_WRITE_TOKEN)
    .update(JSON.stringify([url, key]))
    .digest("hex");
}
export async function storeExpeditionImage(base64, key) {
  const asset = await storeImage(base64);
  return { ...asset, expeditionSignature: expeditionSignature(asset.url, key) };
}
export function verifiedExpeditionAsset(asset, key) {
  verifiedAsset(asset);
  if (
    !/^[a-f0-9]{64}$/.test(asset.expeditionSignature || "") ||
    !timingSafeEqual(
      Buffer.from(asset.expeditionSignature, "hex"),
      Buffer.from(expeditionSignature(asset.url, key), "hex"),
    )
  )
    throw new InputError("The image does not belong to this expedition.");
  return asset;
}
