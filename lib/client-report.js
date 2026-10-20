import {
  createReport,
  MODEL_VERSION,
  sampleReport,
  ATMOSPHERES,
  DEFAULTS,
  shortText,
} from "./planet.js";
export function safeAsset(asset) {
  if (!asset || typeof asset.url !== "string") return null;
  if (asset.url === "/assets/sample-orbital.webp")
    return { url: asset.url, kind: "reference" };
  if (
    !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/psu7\/images\/[a-f0-9-]+\.webp$/.test(
      asset.url,
    )
  )
    return null;
  return {
    url: asset.url,
    kind: "generated",
    ...(typeof asset.signature === "string" &&
    /^[a-f0-9]{64}$/.test(asset.signature)
      ? { signature: asset.signature }
      : {}),
  };
}
export function restoreReport(data) {
  if (!data || data.version !== MODEL_VERSION)
    throw new Error("This report version is not supported.");
  if (data.sample && data.id === "boreal-reference") return sampleReport();
  const images = {};
  for (const view of ["orbital", "surface"]) {
    const asset = safeAsset(data.images?.[view]);
    if (asset) images[view] = asset;
  }
  const report = createReport({
    ...data,
    id: shortText(data.id, 100, "Report identifier"),
    images,
    sample: false,
  });
  report.narrativeKind = data.narrativeKind === "ai" ? "ai" : "model";
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
    narrative: r.narrative,
    narrativeKind: r.narrativeKind,
    images: r.images,
    sample: r.sample,
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
