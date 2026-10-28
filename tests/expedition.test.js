import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_MODEL } from "../lib/server.js";
import { DEFAULTS, createReport, calculate } from "../lib/planet.js";
import {
  prepareExpedition,
  expeditionContext,
  expeditionImagePrompt,
} from "../lib/expedition.js";
import { expeditionNoteRequest } from "../lib/prompts.js";
import { verifyExpeditionNotes } from "../lib/provenance.js";
import {
  expeditionMetadata,
  validateExpeditions,
  MAX_EXPEDITIONS,
} from "../lib/expedition-record.js";
import { serializeReport, restoreReport } from "../lib/client-report.js";
import { createExpeditionHandler } from "../api/expedition.js";
const payload = (changes) => {
  const r = createReport({ params: { ...DEFAULTS, ...changes } });
  return {
    params: r.params,
    cartography: r.cartography,
    latitude: 23,
    longitude: 45,
    heading: 90,
    operation: "image",
  };
};
const narrative = {
  description: "An imagined expedition depicts a modeled landscape.",
  surfaceFeatures: "Illustrative mineral terrain.",
};
const asset = {
  kind: "generated",
  url: "https://teststore.public.blob.vercel-storage.com/psu7/images/abc1.webp",
  signature: "a".repeat(64),
  expeditionSignature: "b".repeat(64),
};
const response = () => ({
  statusCode: 200,
  setHeader() {},
  status(n) {
    this.statusCode = n;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});
test("expedition prompts reconstruct both views of local conditions for eight world families", () => {
  const cases = [
    {},
    { massEarth: 2, biosphere: "alien" },
    { atmosphere: "none (airless body)", pressureBar: 0, water: 0 },
    { atmosphere: "thick CO2 (Venus-like)", pressureBar: 90 },
    { orbital: "outer edge (very cold)" },
    { water: 100, biosphere: "alien" },
    { atmosphere: "hydrogen-helium envelope", pressureBar: 10, water: 0 },
    { rotationHours: calculate(DEFAULTS).yearDays * 24 },
  ];
  for (const changes of cases) {
    const p = prepareExpedition(payload(changes)),
      context = expeditionContext(p),
      prompt = expeditionImagePrompt(p, context),
      notes = expeditionNoteRequest(p, context);
    assert.match(prompt, /Heading 90/);
    assert.ok(prompt.includes(context.local.surface));
    assert.match(prompt, /No moons, rings/);
    assert.match(prompt, /Exact coastlines and landmarks are not guaranteed/);
    assert.match(notes.system[0].text, /Never write "detected", "observed"/);
    assert.ok(notes.messages[0].content.includes(JSON.stringify(context)));
    for (let n = 1; n <= 7; n++) assert.ok(prompt.includes(`${n}. `));
    if (changes.atmosphere?.includes("none"))
      assert.match(prompt, /Black sky, no clouds or atmospheric haze/);
    if (changes.pressureBar === 90)
      assert.match(prompt, /Optically thick haze/);
    if (changes.water === 100) assert.match(prompt, /ocean waterline/);
    if (changes.atmosphere?.includes("hydrogen"))
      assert.match(prompt, /no ground, rocks, mountains or ocean/);
    if (context.local.ice) assert.match(prompt, /Coherent ice-covered terrain/);
    if (!context.biology) assert.match(prompt, /No biosphere depicted here/);
  }
});
test("coordinates, camera, environment and art mode define reproducible independent expedition keys", () => {
  const p = payload(),
    a = prepareExpedition(p),
    b = prepareExpedition({ ...p });
  assert.deepEqual(a.metadata, b.metadata);
  assert.deepEqual(expeditionContext(a), expeditionContext(b));
  for (const change of [{ latitude: 24 }, { heading: 91 }])
    assert.notEqual(
      prepareExpedition({ ...p, ...change }).metadata.key,
      a.metadata.key,
    );
  const r = createReport({ params: { ...DEFAULTS, biosphere: "alien" } });
  assert.notEqual(
    expeditionMetadata(r.cartography, r.params, p, 90).key,
    a.metadata.key,
  );
  const night = prepareExpedition({ ...p, latitude: 0, longitude: 0 });
  assert.equal(expeditionContext(night).illumination.phase, "night");
});
test("custom prompts, fabricated samples and invalid identities fail before provider work", async () => {
  const handler = createExpeditionHandler({
    request: () => {
      throw new Error("No provider call allowed");
    },
  });
  for (const change of [
    { prompt: "override" },
    { sample: { surface: "forest" } },
    { cartography: undefined },
    { latitude: 91 },
    { longitude: Infinity },
    { heading: 360 },
    { heading: 1.5 },
    { operation: "other" },
  ]) {
    const res = response();
    await handler({ method: "POST", body: { ...payload(), ...change } }, res);
    assert.equal(res.statusCode, 400);
  }
});
test("provider operations share existing quota scopes, release failures and bind metadata", async () => {
  const old = { ...process.env };
  process.env.OPENAI_API_KEY = "test";
  process.env.BLOB_READ_WRITE_TOKEN = "test";
  process.env.ANTHROPIC_API_KEY = "test";
  try {
    const scopes = [];
    let releases = 0,
      calls = 0,
      signedKey;
    const handler = createExpeditionHandler({
      quota: async (_req, scope) => {
        scopes.push(scope);
        return async () => {
          releases++;
        };
      },
      request: async (url, options) => {
        calls++;
        if (url.includes("openai")) {
          assert.equal(url, "https://api.openai.com/v1/images/edits");
          assert.equal(options.headers["Content-Type"], undefined);
          assert.ok(options.body instanceof FormData);
          assert.equal(options.body.get("n"), "1");
          assert.equal(options.body.get("model"), IMAGE_MODEL);
          assert.match(options.body.get("prompt"), /Heading 90/);
          assert.match(
            options.body.get("prompt"),
            /attached image is a north-up/,
          );
          const image = options.body.get("image");
          assert.equal(image.type, "image/png");
          assert.equal(image.name, "region.png");
          assert.ok(image.size > 100);
          return { data: [{ b64_json: "encoded" }] };
        }
        const sent = JSON.parse(options.body);
        assert.match(sent.system[0].text, /picked one coordinate/);
        assert.match(sent.messages[0].content, /<local_sample>/);
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(narrative) }],
        };
      },
      save: async (_bytes, key) => {
        signedKey = key;
        return asset;
      },
    });
    const image = response();
    await handler({ method: "POST", body: payload() }, image);
    assert.equal(image.statusCode, 200);
    assert.equal(image.body.metadata.key, signedKey);
    const notes = response();
    await handler(
      { method: "POST", body: { ...payload(), operation: "notes" } },
      notes,
    );
    const { signature, ...written } = notes.body.narrative;
    assert.deepEqual(written, narrative);
    assert.ok(
      verifyExpeditionNotes(notes.body.metadata.key, notes.body.narrative),
    );
    assert.ok(
      !verifyExpeditionNotes("another expedition", notes.body.narrative),
    );
    assert.match(signature, /^[a-f0-9]{64}$/);
    assert.deepEqual(scopes, ["image", "analyze"]);
    assert.equal(calls, 2);
    assert.equal(releases, 2);
    for (const operation of ["image", "notes"]) {
      const broken = createExpeditionHandler({
        quota: async () => async () => {
          releases++;
        },
        request: async () => ({ stop_reason: "max_tokens", data: [] }),
      });
      const res = response();
      await broken({ method: "POST", body: { ...payload(), operation } }, res);
      assert.equal(res.statusCode, 502);
    }
    assert.equal(releases, 4);
    const timeout = createExpeditionHandler({
      quota: async () => async () => {
        releases++;
      },
      request: async () => {
        const e = new Error("timeout");
        e.status = 504;
        throw e;
      },
    });
    const res = response();
    await timeout({ method: "POST", body: payload() }, res);
    assert.equal(res.statusCode, 504);
    assert.equal(releases, 5);
  } finally {
    for (const k of Object.keys(process.env))
      if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old);
  }
});
test("saved expeditions survive reports and reject mismatched location or camera associations", () => {
  const r = createReport({ params: DEFAULTS }),
    metadata = expeditionMetadata(
      r.cartography,
      r.params,
      { latitude: 23, longitude: 45 },
      90,
    );
  r.expeditions = [{ ...metadata, asset, narrative }];
  const restored = restoreReport(
    JSON.parse(JSON.stringify(serializeReport(r))),
  );
  assert.deepEqual(restored.expeditions, r.expeditions);
  for (const changed of [
    { ...r.expeditions[0], latitude: 24 },
    { ...r.expeditions[0], heading: 0 },
    {
      ...r.expeditions[0],
      asset: { ...asset, expeditionSignature: "invalid" },
    },
  ])
    assert.throws(() =>
      validateExpeditions([changed], r.cartography, r.params),
    );
  assert.throws(() =>
    validateExpeditions(
      Array(MAX_EXPEDITIONS + 1).fill(r.expeditions[0]),
      r.cartography,
      r.params,
    ),
  );
  for (const version of [2, 3]) {
    const older = serializeReport(r);
    older.version = version;
    delete older.expeditions;
    assert.deepEqual(restoreReport(older).expeditions, []);
  }
  const missing = serializeReport(r);
  delete missing.expeditions;
  assert.throws(() => restoreReport(missing), /expedition/);
});
