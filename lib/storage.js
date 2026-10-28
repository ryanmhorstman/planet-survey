import { orbitalAssetMetadata, validateOrbitalView } from "./orbital-record.js";
import { put, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { sign, verify } from "./attest.js";
import {
  createReport,
  REFERENCE_ASSETS,
  InputError,
  MODEL_VERSION,
  SUPPORTED_REPORT_VERSIONS,
  object,
  shortText,
  narrativeKind,
} from "./planet.js";
import { ServiceError } from "./server.js";
import {
  verifiedCatalog,
  verifyNarrative,
  verifyExpeditionNotes,
  canonicalNarrative,
} from "./provenance.js";

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export function verifiedAsset(input) {
  object(input, "Image reference");
  if (Object.hasOwn(REFERENCE_ASSETS, input.url))
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
  if (!verify(input.url, input.signature))
    throw new InputError("The image reference could not be verified.");
  let metadata;
  try {
    metadata = orbitalAssetMetadata(input);
  } catch (error) {
    throw new InputError(error.message);
  }
  if (metadata.globeView) {
    if (
      !verify(
        [input.url, validateOrbitalView(metadata.globeView)],
        metadata.referenceSignature,
      )
    )
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
  return sign([url, validateOrbitalView(view)]);
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
/**
 * Publishing (`verifyImages`) admits only server-attested content: signed
 * images, NASA records and AI notes. Unsigned notes are replaced with the
 * deterministic model note, so a public link never hosts uploaded free text
 * under an AI or NASA attribution. Reading trusts what publishing wrote.
 */
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
          !Object.hasOwn(REFERENCE_ASSETS, asset.url) &&
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
    catalog: verifyImages ? verifiedCatalog(input.catalog) : input.catalog,
    physicsVersion: input.version >= 5 ? input.physicsVersion : "physics-1",
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
  report.narrativeKind = narrativeKind(input.narrativeKind);
  if (!verifyImages) return report;
  for (const expedition of report.expeditions)
    if (expedition.asset)
      verifiedExpeditionAsset(expedition.asset, expedition.key);
  report.expeditions = report.expeditions.flatMap((expedition) => {
    if (
      !expedition.narrative ||
      verifyExpeditionNotes(expedition.key, expedition.narrative)
    )
      return [expedition];
    const { narrative: _unsigned, ...rest } = expedition;
    return rest.asset ? [rest] : [];
  });
  if (
    report.narrativeKind !== "ai" ||
    !verifyNarrative(
      report.params,
      report.catalog,
      report.physicsVersion,
      report.narrative,
    )
  ) {
    const { kind, ...narrative } = canonicalNarrative({
      ...report,
      id: input.id,
    });
    report.narrative = narrative;
    report.narrativeKind = kind;
  }
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
  return sign([url, key]);
}
export async function storeExpeditionImage(base64, key) {
  const asset = await storeImage(base64);
  return { ...asset, expeditionSignature: expeditionSignature(asset.url, key) };
}
export function verifiedExpeditionAsset(asset, key) {
  verifiedAsset(asset);
  if (!verify([asset.url, key], asset.expeditionSignature))
    throw new InputError("The image does not belong to this expedition.");
  return asset;
}
