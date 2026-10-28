import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { providerJSON, ServiceError } from "../lib/server.js";

const realFetch = globalThis.fetch,
  realError = console.error;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

/** Answer every fetch with this status and body; return the captured logs. */
function upstream(status, body) {
  const logs = [];
  console.error = (line) => logs.push(JSON.parse(line));
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  return logs;
}
async function failure(url = "https://api.openai.com/v1/images/generations") {
  try {
    await providerJSON(url, {
      method: "POST",
      body: JSON.stringify({ prompt: "secret prompt" }),
    });
  } catch (error) {
    assert.ok(error instanceof ServiceError);
    return error;
  }
  assert.fail("expected a ServiceError");
}

test("logs the provider's error without the request", async () => {
  const logs = upstream(403, {
    error: {
      type: "invalid_request_error",
      code: null,
      message: "Your organization must be verified to use the model.",
    },
  });
  const error = await failure();
  assert.equal(error.status, 503);
  assert.equal(error.code, "UPSTREAM_UNAVAILABLE");
  assert.doesNotMatch(error.message, /retry/i);
  assert.deepEqual(logs, [
    {
      event: "upstream_error",
      endpoint: "api.openai.com/v1/images/generations",
      status: 403,
      code: "invalid_request_error",
      type: "invalid_request_error",
      message: "Your organization must be verified to use the model.",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /secret prompt/);
});

test("a safety rejection says so instead of asking for a retry", async () => {
  upstream(400, {
    error: {
      code: "moderation_blocked",
      message: "Rejected by the safety system.",
    },
  });
  const error = await failure();
  assert.equal(error.status, 422);
  assert.equal(error.code, "UPSTREAM_REFUSED");
});

test("an exhausted quota is unavailable, not busy", async () => {
  upstream(429, { error: { code: "insufficient_quota", message: "Quota." } });
  const error = await failure();
  assert.equal(error.code, "UPSTREAM_UNAVAILABLE");
  assert.equal(error.retryAfter, null);
});

test("a rate limit is still busy with Retry-After", async () => {
  upstream(429, {
    type: "error",
    error: { type: "rate_limit_error", message: "Slow down." },
  });
  const error = await failure("https://api.anthropic.com/v1/messages");
  assert.equal(error.code, "UPSTREAM_BUSY");
  assert.equal(error.retryAfter, 30);
});

test("an unreadable error body still logs the status", async () => {
  const logs = [];
  console.error = (line) => logs.push(JSON.parse(line));
  globalThis.fetch = async () =>
    new Response("<html>bad gateway</html>", { status: 500 });
  const error = await failure();
  assert.equal(error.code, "UPSTREAM_ERROR");
  assert.equal(logs[0].status, 500);
  assert.equal(logs[0].code, "");
});
