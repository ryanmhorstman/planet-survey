// Offline development checklist. No network, vision provider, regeneration or production import.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateSurvey, calculate, visualSpec } from "../lib/planet.js";
export function imageQualityReview(survey, { enabled = false } = {}) {
  if (!enabled) return null;
  const { params, catalog } = validateSurvey(survey),
    physics = calculate(params, catalog);
  return {
    status: "manual-review-required",
    specification: visualSpec(params, physics),
    views: ["orbital", "surface"],
    checks: [
      "Compare land silhouettes and arrangement with Earth: reject recognizable Earth geography.",
      `Check water phase (${physics.waterState}) and assigned coverage (${params.water}%).`,
      `Check atmospheric appearance at ${params.pressureBar} bar, including haze and visibility.`,
      "Reject unsupported moons, rings, neighboring planets, settlements and spacecraft.",
      "Check biosphere presence, pigments and gravity-appropriate morphology against specification.",
      "Compare both views for agreement in water, ice, materials, atmosphere and biosphere.",
    ].map((criterion) => ({ criterion, verdict: "unreviewed", notes: "" })),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] !== "--enable" || !process.argv[3]) {
    console.error(
      "Disabled by default. Usage: node scripts/image-quality-review.js --enable survey.json",
    );
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify(
        imageQualityReview(
          JSON.parse(await readFile(process.argv[3], "utf8")),
          { enabled: true },
        ),
        null,
        2,
      ),
    );
}
