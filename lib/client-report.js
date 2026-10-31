import { orbitalAssetMetadata } from "./orbital-record.js";
import {
  createReport,
  MODEL_VERSION,
  SUPPORTED_REPORT_VERSIONS,
  sampleReport,
  showcaseKey,
  REFERENCE_ASSETS,
  ATMOSPHERES,
  DEFAULTS,
  shortText,
  narrativeKind,
  IMAGE_VIEWS,
} from "./planet.js";
export function safeAsset(asset) {
  if (!asset || typeof asset.url !== "string") return null;
  if (Object.hasOwn(REFERENCE_ASSETS, asset.url))
    return { url: asset.url, kind: "reference" };
  if (
    !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/psu7\/images\/[a-f0-9-]+\.webp$/.test(
      asset.url,
    )
  )
    return null;
  return {
    ...orbitalAssetMetadata(asset),
    url: asset.url,
    kind: "generated",
    ...(typeof asset.signature === "string" &&
    /^[a-f0-9]{64}$/.test(asset.signature)
      ? { signature: asset.signature }
      : {}),
  };
}
export function restoreReport(data) {
  if (!data || !SUPPORTED_REPORT_VERSIONS.includes(data.version))
    throw new Error("This report version is not supported.");
  if (data.version >= 3 && !data.cartography)
    throw new Error("This report is missing its saved planetary identity.");
  if (data.version >= 4 && !Array.isArray(data.expeditions))
    throw new Error("This report is missing its expedition records.");
  const key = showcaseKey(data);
  const base = key ? sampleReport(key) : null;
  if (
    data.sample &&
    base &&
    Object.entries(base.params).every(
      ([name, value]) =>
        (data.params?.[name] ??
          (name === "civilization" ? "none" : undefined)) === value,
    )
  ) {
    const report = createReport({
      ...base,
      cartography: data.cartography,
      geographyVersion: data.cartography ? undefined : "cartography-1",
      sites: data.sites,
      expeditions: data.expeditions,
      selectedLocation: data.selectedLocation,
    });
    report.narrativeKind = "reference";
    report.sample =
      !report.sites.length &&
      !report.expeditions.length &&
      !report.selectedLocation &&
      JSON.stringify(report.cartography) === JSON.stringify(base.cartography);
    return report;
  }
  const images = {};
  for (const view of IMAGE_VIEWS) {
    const asset = safeAsset(data.images?.[view]);
    if (asset) images[view] = asset;
  }
  const report = createReport({
    ...data,
    geographyVersion:
      !data.cartography && data.version === 2 ? "cartography-1" : undefined,
    id: shortText(data.id, 100, "Report identifier"),
    images,
    sample: false,
    // Reports saved before v5 keep the physics they were written with.
    physicsVersion: data.version >= 5 ? data.physicsVersion : "physics-1",
  });
  report.narrativeKind = narrativeKind(data.narrativeKind);
  report.createdAt = Number.isFinite(Date.parse(data.createdAt))
    ? data.createdAt
    : report.createdAt;
  if (/^[a-f0-9-]{36}$/.test(data.publicId || ""))
    report.publicId = data.publicId;
  return report;
}
export function serializeReport(r) {
  return {
    version: MODEL_VERSION,
    id: r.id,
    name: r.name,
    params: r.params,
    catalog: r.catalog,
    physicsVersion: r.physicsVersion,
    narrative: r.narrative,
    narrativeKind: r.narrativeKind,
    images: r.images,
    cartography: r.cartography,
    sites: r.sites,
    expeditions: r.expeditions,
    selectedLocation: r.selectedLocation,
    sample: r.sample,
    ...(r.seed != null ? { seed: r.seed } : {}),
    createdAt: r.createdAt,
    ...(r.publicId ? { publicId: r.publicId } : {}),
  };
}
export function restoreLegacy(hash) {
  if (hash.length > 14000) throw new Error("This legacy link is too long.");
  const data = JSON.parse(decodeURIComponent(atob(hash)));
  const params = {
    ...DEFAULTS,
    starType: data.s,
    orbital: data.o,
    atmosphere: data.a,
    water: Number(data.w),
    massEarth: Number(data.m),
    radiusEarth: Number(data.r),
    tilt: Number(data.t),
    pressureBar: ATMOSPHERES[data.a]?.pressure,
  };
  if (
    params.atmosphere?.includes("none") ||
    params.atmosphere?.includes("hydrogen")
  )
    params.water = 0;
  return createReport({
    params,
    geographyVersion: "cartography-1",
    physicsVersion: "physics-1",
    name: data.n || "Legacy survey",
    narrative: {
      description: shortText(
        data.d || "An interpretation from a previous survey.",
        1600,
        "Description",
      ),
      surfaceFeatures: "Legacy report: landscape details were not saved.",
    },
  });
}
