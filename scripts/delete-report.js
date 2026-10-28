// Operator takedown for a public report link.
//
//   node --env-file=.env.local scripts/delete-report.js <report-id> [--with-images] [--yes]
//
// Without --yes it only prints what would be deleted. --with-images also
// deletes the report's generated images; other reports that reuse the same
// image URLs will lose them too.
import { del } from "@vercel/blob";
import { readReport } from "../lib/storage.js";

const [id] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const withImages = process.argv.includes("--with-images"),
  confirmed = process.argv.includes("--yes");
if (!id) {
  console.error(
    "Usage: scripts/delete-report.js <report-id> [--with-images] [--yes]",
  );
  process.exit(1);
}
const report = await readReport(id);
const reportPath = `psu7/reports/${id}.json`;
const images = [
  ...Object.values(report.images || {}),
  ...(report.expeditions || []).map((e) => e.asset).filter(Boolean),
]
  .filter((asset) => asset.kind === "generated")
  .map((asset) => asset.url);
const targets = [reportPath, ...(withImages ? images : [])];
console.log(`Report "${report.name}" (${id})`);
for (const url of targets)
  console.log(`  ${confirmed ? "deleting" : "would delete"} ${url}`);
if (!withImages && images.length)
  console.log(
    `  keeping ${images.length} generated image(s); pass --with-images to delete them`,
  );
if (confirmed) {
  await del(targets);
  console.log("Deleted. Cached copies expire within an hour (s-maxage=3600).");
}
