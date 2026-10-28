// Field-note eval: generate worlds, collect notes, check each note against the
// data panel and report contradiction rates with 95% Wilson intervals.
//
//   node scripts/eval-narratives.js --curated            # free: the 3 curated notes
//   node scripts/eval-narratives.js --replay run.jsonl   # free: re-score a saved run
//   node scripts/eval-narratives.js --live 40 [--seed 7] # paid: calls the Claude API
//
// --live uses exactly the production request (lib/prompts.js) and writes every
// response to evals/runs/ so later prompt changes can be compared offline.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULTS,
  STARS,
  ZONES,
  ATMOSPHERES,
  calculate,
  createReport,
  sampleReport,
  SHOWCASE_WORLDS,
  PHYSICS_VERSION,
} from "../lib/planet.js";
import {
  fieldNoteRequest,
  parseFieldNote,
  anthropicHeaders,
  CLAUDE_MODEL,
  FIELD_NOTE_PROMPT_VERSION,
} from "../lib/prompts.js";
import { providerJSON } from "../lib/server.js";
import { summarize, hedgesPerSentence } from "../lib/narrative-checks.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

/** Seeded, stratified worlds: every atmosphere, zone, star and biosphere mode. */
export function sampleWorlds(n, seed = 1) {
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const pick = (list, i) =>
    list[(i + Math.floor(random() * list.length)) % list.length];
  const worlds = [];
  for (let i = 0; i < n; i++) {
    const atmosphere = Object.keys(ATMOSPHERES)[i % 6];
    const params = {
      ...DEFAULTS,
      atmosphere,
      starType: pick(Object.keys(STARS), i),
      orbital: pick(Object.keys(ZONES), i),
      water: pick([20, 40, 70, 85, 100], i),
      tilt: Math.round(random() * 60),
      biosphere: pick(["none", "familiar", "alien"], i),
      pressureBar: ATMOSPHERES[atmosphere].pressure,
    };
    if (/none|hydrogen/.test(atmosphere)) params.water = 0;
    // About one world in six is tidally locked.
    if (random() < 0.17) params.rotationHours = calculate(params).yearDays * 24;
    worlds.push(params);
  }
  return worlds;
}

async function live(n, seed) {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new Error("Set ANTHROPIC_API_KEY (for example in .env.local).");
  const records = [];
  const worlds = sampleWorlds(n, seed);
  const usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  // Small fixed concurrency keeps the run polite and its cost predictable.
  const queue = worlds.map((params, index) => ({ params, index }));
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const physics = calculate(job.params);
        const record = {
          index: job.index,
          params: job.params,
          physicsVersion: PHYSICS_VERSION,
          model: CLAUDE_MODEL,
          promptVersion: FIELD_NOTE_PROMPT_VERSION,
        };
        try {
          const response = await providerJSON(
            "https://api.anthropic.com/v1/messages",
            {
              method: "POST",
              headers: anthropicHeaders(process.env.ANTHROPIC_API_KEY),
              body: JSON.stringify(fieldNoteRequest(job.params, physics, null)),
            },
            60000,
          );
          usage.input += response.usage?.input_tokens || 0;
          usage.cacheRead += response.usage?.cache_read_input_tokens || 0;
          usage.cacheWrite += response.usage?.cache_creation_input_tokens || 0;
          usage.output += response.usage?.output_tokens || 0;
          record.servedBy = response.model;
          record.narrative = parseFieldNote(response);
        } catch (error) {
          record.error = error.message;
        }
        records.push(record);
        process.stderr.write(".");
      }
    }),
  );
  process.stderr.write("\n");
  records.sort((a, b) => a.index - b.index);
  await mkdir("evals/runs", { recursive: true });
  const file = `evals/runs/${new Date().toISOString().replace(/[:.]/g, "-")}-${FIELD_NOTE_PROMPT_VERSION}.jsonl`;
  await writeFile(
    file,
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  console.error(`Saved ${records.length} records to ${file}`);
  console.error(
    `Tokens: ${usage.input} input, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write, ${usage.output} output`,
  );
  return records;
}

function curated() {
  return Object.keys(SHOWCASE_WORLDS).map((key, index) => {
    const report = sampleReport(key);
    return {
      index,
      world: key,
      params: report.params,
      physicsVersion: report.physicsVersion,
      promptVersion: "curated",
      narrative: report.narrative,
    };
  });
}

async function replay(file) {
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function report(records) {
  const ok = records.filter((r) => r.narrative);
  const samples = ok.map((r) => {
    const built = createReport({
      params: r.params,
      physicsVersion: r.physicsVersion,
      narrative: r.narrative,
    });
    return {
      params: built.params,
      physics: built.physics,
      narrative: built.narrative,
    };
  });
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const lines = [
    `# Field-note eval`,
    "",
    `${records.length} notes · ${records.length - ok.length} unusable responses · prompt ${[...new Set(records.map((r) => r.promptVersion))].join(", ")}`,
    `Mean hedges per sentence: ${(samples.reduce((sum, s) => sum + hedgesPerSentence(s.narrative.description), 0) / Math.max(1, samples.length)).toFixed(2)}`,
    "",
    "| Check | Applicable | Failures | Rate | 95% CI | Examples |",
    "| --- | ---: | ---: | ---: | --- | --- |",
    ...summarize(samples).map(
      (row) =>
        `| ${row.id} | ${row.applicable} | ${row.failures} | ${pct(row.rate)} | ${pct(row.ci[0])}–${pct(row.ci[1])} | ${row.examples.map((e) => e.replaceAll("|", "/").slice(0, 80)).join("; ")} |`,
    ),
  ];
  return lines.join("\n");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const records = args.includes("--live")
    ? await live(Number(option("--live", 20)), Number(option("--seed", 1)))
    : args.includes("--replay")
      ? await replay(option("--replay"))
      : curated();
  console.log(report(records));
}
