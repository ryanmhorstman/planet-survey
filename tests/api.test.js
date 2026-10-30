import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import analyze from "../api/analyze.js";
import { createImageHandler } from "../api/image.js";
import exoplanets, { catalogQuery } from "../api/exoplanets.js";
import capabilityHandler from "../api/capabilities.js";
import { DEFAULTS } from "../lib/planet.js";
import { CLAUDE_MODEL } from "../lib/prompts.js";
import { capabilities, reserve, quotaConfig } from "../lib/server.js";

const saved = { ...process.env },
  originalFetch = globalThis.fetch;
beforeEach(() => {
  delete process.env.VERCEL;
  delete process.env.RATE_LIMIT_REDIS_REST_URL;
  delete process.env.RATE_LIMIT_REDIS_REST_TOKEN;
  for (const prefix of ["UPSTASH_REDIS_REST", "KV_REST_API"]) {
    delete process.env[`${prefix}_URL`];
    delete process.env[`${prefix}_TOKEN`];
  }
  process.env.NODE_ENV = "test";
  process.env.PSU7_ALLOW_LOCAL_QUOTAS = "true";
  process.env.ANTHROPIC_API_KEY = "test-placeholder";
  process.env.OPENAI_API_KEY = "test-placeholder";
  process.env.BLOB_READ_WRITE_TOKEN = "test-placeholder";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});
let serial = 0;
const req = (body, method = "POST") => ({
  body,
  method,
  headers: {},
  socket: { remoteAddress: `test-${serial++}` },
});
const res = () => ({
  headers: {},
  statusCode: 200,
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});
const structured = {
  sections: [
    { kind: "estimated", text: "The energy balance settles near 15 °C." },
    { kind: "imagined", text: "Dark seas break against exposed stone." },
  ],
  surfaceFeatures: "Dark seas and exposed stone.",
};
test("validation rejects custom and missing prompts before any upstream work", async () => {
  globalThis.fetch = () => {
    throw new Error("Should not call upstream");
  };
  for (const handler of [analyze, createImageHandler()]) {
    const response = res();
    await handler(req({ prompt: "do anything" }), response);
    assert.equal(response.statusCode, 400);
  }
});
test("upstream authorization failures do not become HTTP 200 or expose provider details", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "private provider detail" } }),
      { status: 401 },
    );
  const response = res(),
    logError = console.error;
  console.error = () => {};
  try {
    await analyze(req({ params: DEFAULTS }), response);
  } finally {
    console.error = logError;
  }
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "UPSTREAM_UNAVAILABLE");
  assert.ok(!JSON.stringify(response.body).includes("private provider detail"));
});
test("analysis rejects malformed and truncated responses; valid interpretation carries no model score", async () => {
  for (const upstream of [
    { stop_reason: "max_tokens", content: [] },
    { stop_reason: "refusal", content: [] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] },
    {
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            sections: [
              { kind: "rumoured", text: "x" },
              { kind: "imagined", text: "y" },
            ],
            surfaceFeatures: "z",
          }),
        },
      ],
    },
  ]) {
    globalThis.fetch = async () => Response.json(upstream);
    const response = res();
    await analyze(req({ params: DEFAULTS }), response);
    assert.equal(response.statusCode, 502);
  }
  let sent;
  globalThis.fetch = async (_, options) => {
    sent = JSON.parse(options.body);
    return Response.json({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "", signature: "opaque" },
        { type: "text", text: JSON.stringify(structured) },
      ],
    });
  };
  const response = res();
  await analyze(req({ params: DEFAULTS }), response);
  assert.equal(response.statusCode, 200);
  const { signature, ...note } = response.body.narrative;
  assert.deepEqual(note, {
    description: structured.sections.map((s) => s.text).join(" "),
    surfaceFeatures: structured.surfaceFeatures,
    sections: structured.sections,
  });
  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.equal(sent.model, CLAUDE_MODEL);
  assert.equal(sent.fallbacks, "default");
  assert.equal(sent.output_config.format.type, "json_schema");
  assert.match(sent.messages[0].content, /^<fact_sheet>/);
});
test("provider timeouts are actionable and quota releases execute on failure", async () => {
  let released = 0;
  const handler = createImageHandler({
    lookup: async () => null,
    quota: async () => async () => {
      released++;
    },
    request: async () => {
      const e = new Error("Service timed out");
      e.status = 504;
      throw e;
    },
  });
  const response = res();
  await handler(req({ params: DEFAULTS, view: "orbital" }), response);
  assert.equal(response.statusCode, 504);
  assert.equal(released, 1);
});
test("image endpoint constructs prompts itself and stores only validated provider output", async () => {
  let sent, stored;
  const handler = createImageHandler({
    lookup: async () => null,
    quota: async () => async () => {},
    request: async (_, options) => {
      sent = JSON.parse(options.body);
      return { data: [{ b64_json: "encoded-image" }] };
    },
    save: async (value) => {
      stored = value;
      return { url: "/assets/sample-orbital.webp" };
    },
  });
  const response = res();
  await handler(req({ params: DEFAULTS, view: "surface" }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(stored, "encoded-image");
  assert.equal(sent.output_format, "webp");
  assert.match(sent.prompt, /ground-level camera/);
  assert.equal(sent.n, 1);
  assert.equal(response.body.asset.url, "/assets/sample-orbital.webp");
  for (const view of ["deep", "night"]) {
    await handler(req({ params: DEFAULTS, view }), res());
    assert.match(
      sent.prompt,
      view === "deep" ? /hydrothermal vent field/ : /looking up at the sky/,
    );
  }
  const hazy = res();
  await handler(
    req({
      params: {
        ...DEFAULTS,
        atmosphere: "thick CO2 (Venus-like)",
        pressureBar: 90,
      },
      view: "night",
    }),
    hazy,
  );
  assert.equal(hazy.statusCode, 400);
});
test("a cached image for the same seed and prompt skips the provider and the quota", async () => {
  const keys = [];
  let saveKey;
  const handler = createImageHandler({
    lookup: async (key) => {
      keys.push(key);
      return null;
    },
    quota: async () => async () => {},
    request: async () => ({ data: [{ b64_json: "encoded-image" }] }),
    save: async (_, key) => {
      saveKey = key;
      return { url: "/assets/sample-orbital.webp" };
    },
  });
  const body = { params: DEFAULTS, view: "surface", seed: 42 };
  await handler(req(body), res());
  const second = res();
  await createImageHandler({
    lookup: async (key) => {
      keys.push(key);
      return { url: "/assets/sample-orbital.webp" };
    },
    quota: async () => assert.fail("a cache hit must not use the quota"),
    request: async () => assert.fail("a cache hit must not call the provider"),
  })(req(body), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.cached, true);
  assert.match(keys[0], /^42-[0-9a-f]{32}$/);
  assert.equal(keys[1], keys[0]);
  assert.equal(saveKey, keys[0]);
  const invalid = res();
  await handler(req({ ...body, seed: -1 }), invalid);
  assert.equal(invalid.statusCode, 400);
});
test("production refuses local quota fallback and capabilities reflect missing services", async () => {
  process.env.NODE_ENV = "production";
  await assert.rejects(reserve(req({}), "image"), (e) => e.status === 503);
  assert.deepEqual(capabilities(), {
    analysis: false,
    images: false,
    sharing: false,
  });
});
test("standard Vercel/Upstash variable pairs enable and enforce production quotas", async () => {
  process.env.NODE_ENV = "production";
  for (const prefix of ["UPSTASH_REDIS_REST", "KV_REST_API"]) {
    process.env[`${prefix}_URL`] = "https://integration.upstash.io";
    process.env[`${prefix}_TOKEN`] = "integration-test-token";
    assert.deepEqual(capabilities(), {
      analysis: true,
      images: true,
      sharing: true,
    });
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        result: JSON.parse(options.body)[0] === "EVAL" ? [1, 0] : 1,
      });
    };
    const release = await reserve(req({}), "analyze");
    await release();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://integration.upstash.io");
    assert.equal(
      calls[0].options.headers.Authorization,
      "Bearer integration-test-token",
    );
    delete process.env[`${prefix}_URL`];
    delete process.env[`${prefix}_TOKEN`];
  }
});
test("quota settings never mix credentials across pairs and explicit settings take precedence", () => {
  process.env.RATE_LIMIT_REDIS_REST_URL = "https://custom.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "integration-test-token";
  assert.equal(quotaConfig(), null);
  process.env.UPSTASH_REDIS_REST_URL = "https://integration.upstash.io";
  assert.equal(quotaConfig().url, "https://integration.upstash.io");
  process.env.RATE_LIMIT_REDIS_REST_TOKEN = "custom-test-token";
  assert.equal(quotaConfig().url, "https://custom.upstash.io");
  process.env.RATE_LIMIT_REDIS_REST_URL = "not-a-url";
  assert.equal(quotaConfig(), null);
});
test("capabilities identify missing production prerequisites without exposing credentials", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const response = res();
  await capabilityHandler(req(null, "GET"), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    analysis: false,
    images: false,
    sharing: false,
    configuration: {
      analysisProvider: true,
      imageProvider: true,
      imageStorage: false,
      sharedQuotas: false,
    },
  });
  assert.ok(!JSON.stringify(response.body).includes("test-placeholder"));
  const imageResponse = res();
  await createImageHandler()(
    req({ params: DEFAULTS, view: "orbital" }),
    imageResponse,
  );
  assert.equal(imageResponse.body.code, "IMAGE_STORAGE_NOT_CONFIGURED");
});
test("Redis reservations use one atomic EVAL and fail closed when the shared store fails", async () => {
  process.env.RATE_LIMIT_REDIS_REST_URL = "https://test.upstash.io";
  process.env.RATE_LIMIT_REDIS_REST_TOKEN = "test-token";
  const commands = [];
  globalThis.fetch = async (_, options) => {
    const command = JSON.parse(options.body);
    commands.push(command);
    return Response.json({ result: command[0] === "EVAL" ? [1, 0] : 1 });
  };
  const release = await reserve(req({}), "image");
  await release();
  assert.equal(commands[0][0], "EVAL");
  assert.equal(commands[0][2], "3");
  assert.equal(commands[1][0], "ZREM");
  globalThis.fetch = async () => Response.json({ result: [0, 120] });
  await assert.rejects(
    reserve(req({}), "image"),
    (e) => e.status === 429 && e.retryAfter === 120,
  );
  globalThis.fetch = async () => new Response("", { status: 500 });
  await assert.rejects(reserve(req({}), "image"), (e) => e.status === 503);
});
test("NASA route accepts bounded filters, escapes search terms and preserves exact records", async () => {
  assert.throws(() => catalogQuery({ query: "select everything" }));
  assert.throws(() => catalogQuery({ search: "x".repeat(81) }));
  assert.match(catalogQuery({ search: "O'Brien" }), /o''brien/);
  const catalog = {
    pl_name: "Measured b",
    hostname: "Measured",
    pl_rade: 3.7123,
    pl_bmasse: 12.8432,
    pl_orbper: 12.3,
  };
  globalThis.fetch = async () => Response.json([catalog]);
  const response = res();
  await exoplanets(
    { method: "GET", query: { search: "Measured b" } },
    response,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.planets[0].pl_rade, 3.7123);
  assert.equal(response.body.planets[0].pl_bmasse, 12.8432);
});
