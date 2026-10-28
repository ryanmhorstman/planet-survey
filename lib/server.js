import { createHmac, randomUUID } from "node:crypto";
import { InputError } from "./planet.js";

export class ServiceError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string} [code]
   * @param {number | null} [retryAfter] Seconds, for a Retry-After header.
   */
  constructor(
    status,
    message,
    code = "SERVICE_UNAVAILABLE",
    retryAfter = null,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
export function method(req, res, allowed) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === allowed) return true;
  res.setHeader("Allow", allowed);
  res
    .status(405)
    .json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
  return false;
}
export function fail(res, error) {
  const status = error instanceof InputError ? 400 : error.status || 500;
  if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
  return res.status(status).json({
    error:
      status === 500
        ? "The survey service could not complete this request. Please retry."
        : error.message,
    code:
      error instanceof InputError
        ? "INVALID_INPUT"
        : error.code || "INTERNAL_ERROR",
  });
}
export function body(req, max = 24000) {
  let value = req.body;
  if (typeof value === "string") {
    if (Buffer.byteLength(value) > max)
      throw new ServiceError(413, "Request is too large.", "INVALID_INPUT");
    try {
      value = JSON.parse(value);
    } catch {
      throw new InputError("Send valid JSON.");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("Send a JSON object.");
  if (Buffer.byteLength(JSON.stringify(value)) > max)
    throw new ServiceError(413, "Request is too large.", "INVALID_INPUT");
  return value;
}
// Vercel integrations provision the standard Upstash or KV names automatically.
// Select a complete pair so a URL from one store never uses another store's token.
export function quotaConfig() {
  for (const prefix of [
    "RATE_LIMIT_REDIS_REST",
    "UPSTASH_REDIS_REST",
    "KV_REST_API",
  ]) {
    const url = process.env[`${prefix}_URL`]?.trim(),
      token = process.env[`${prefix}_TOKEN`]?.trim();
    if (url && token) {
      try {
        if (new URL(url).protocol !== "https:") return null;
      } catch {
        return null;
      }
      return { url, token };
    }
  }
  return null;
}
export const hasQuotaStore = () => Boolean(quotaConfig());
const localAllowed = () =>
  process.env.PSU7_ALLOW_LOCAL_QUOTAS === "true" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.VERCEL;
export function configurationStatus() {
  return {
    analysisProvider: Boolean(process.env.ANTHROPIC_API_KEY),
    imageProvider: Boolean(
      process.env.OPENAI_API_KEY || process.env.PLANET_OPENAI_KEY,
    ),
    imageStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    sharedQuotas: hasQuotaStore(),
  };
}
export function capabilities() {
  const config = configurationStatus(),
    quota = config.sharedQuotas || localAllowed();
  return {
    analysis: config.analysisProvider && quota,
    images: config.imageProvider && config.imageStorage && quota,
    sharing: config.imageStorage && quota,
  };
}
const UNAVAILABLE =
  "Live generation is unavailable right now. The model report is ready to explore.";

// Error bodies: OpenAI {error: {code, type, message}}, Anthropic
// {type: "error", error: {type, message}}. The log carries the provider's
// verdict and never the request, which holds the prompt.
/**
 * @param {string} url
 * @param {Response} response
 */
async function upstreamError(url, response) {
  /** @type {{code?: unknown, type?: unknown, message?: unknown}} */
  let detail = {};
  try {
    detail = (await response.json())?.error ?? {};
  } catch {}
  const { status } = response,
    code = String(detail.code ?? detail.type ?? "");
  console.error(
    JSON.stringify({
      event: "upstream_error",
      endpoint: new URL(url).host + new URL(url).pathname,
      status,
      code,
      type: detail.type ?? null,
      message: String(detail.message ?? "").slice(0, 300),
    }),
  );
  if (code === "moderation_blocked")
    return new ServiceError(
      422,
      "The image service declined to paint this world. Try different settings.",
      "UPSTREAM_REFUSED",
    );
  // Account problems: retrying cannot help, so do not ask the visitor to.
  if (
    ["insufficient_quota", "billing_hard_limit_reached"].includes(code) ||
    [401, 403].includes(status)
  )
    return new ServiceError(503, UNAVAILABLE, "UPSTREAM_UNAVAILABLE");
  if (status === 429)
    return new ServiceError(
      503,
      "The generation service is busy. Please try again shortly.",
      "UPSTREAM_BUSY",
      30,
    );
  return new ServiceError(
    502,
    "The remote service could not complete this request. Please retry.",
    "UPSTREAM_ERROR",
  );
}
/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} [timeout] Milliseconds.
 */
export async function providerJSON(url, options, timeout = 25000) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (
      ["TimeoutError", "AbortError"].includes(/** @type {Error} */ (error).name)
    )
      throw new ServiceError(
        504,
        "The service took too long. Your report is safe; please retry.",
        "UPSTREAM_TIMEOUT",
      );
    throw new ServiceError(
      502,
      "The remote service could not be reached. Please retry.",
      "UPSTREAM_ERROR",
    );
  }
  if (!response.ok) throw await upstreamError(url, response);
  try {
    return await response.json();
  } catch {
    throw new ServiceError(
      502,
      "The remote service returned an unreadable response. Please retry.",
      "UPSTREAM_ERROR",
    );
  }
}

// Atomic hourly quotas, daily request ceilings, and expiring concurrency leases.
// Redis is required in production. Local fallback requires explicit opt-in.
const RESERVE = `
local now = tonumber(redis.call('TIME')[1])
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[3]) then return {0, 5} end
local hourly = tonumber(redis.call('GET', KEYS[1]) or '0')
if hourly >= tonumber(ARGV[1]) then return {0, math.max(1, redis.call('TTL', KEYS[1]))} end
local daily = tonumber(redis.call('GET', KEYS[2]) or '0')
if daily >= tonumber(ARGV[2]) then return {0, math.max(1, redis.call('TTL', KEYS[2]))} end
if redis.call('INCR', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
if redis.call('INCR', KEYS[2]) == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
redis.call('ZADD', KEYS[3], now + 90, ARGV[4])
redis.call('EXPIRE', KEYS[3], 120)
return {1, 0}`;
export const QUOTA_SCRIPT = RESERVE;
function integerSetting(name, fallback, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new ServiceError(
      503,
      "Service limits need configuration. The reference survey remains available.",
    );
  return value;
}
async function redis(command, config) {
  const { url, token } = config || {};
  if (!url || new URL(url).protocol !== "https:")
    throw new ServiceError(
      503,
      "Generation limits need configuration. The reference survey remains available.",
    );
  let data;
  try {
    data = await providerJSON(
      url.replace(/\/$/, ""),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      },
      4000,
    );
  } catch {
    throw new ServiceError(
      503,
      "Generation is temporarily unavailable. Your report remains available.",
    );
  }
  if (data.error || !Object.hasOwn(data, "result"))
    throw new ServiceError(503, "Generation is temporarily unavailable.");
  return data.result;
}
// Vercel sets x-real-ip from the connecting client and overwrites
// x-forwarded-for; prefer the header no client can prepend to.
export function clientAddress(req) {
  return (
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown"
  )
    .split(",")[0]
    .trim();
}
const local = new Map();
export async function reserve(req, scope) {
  const limits = {
    analyze: [20, integerSetting("DAILY_ANALYSIS_LIMIT", 500, 100000), 8],
    image: [12, integerSetting("DAILY_IMAGE_LIMIT", 100, 10000), 3],
    share: [20, integerSetting("DAILY_SHARE_LIMIT", 500, 100000), 8],
  }[scope];
  if (!limits) throw new Error("Unknown quota scope");
  const ip = clientAddress(req);
  const config = quotaConfig();
  if (!config) {
    if (!localAllowed())
      throw new ServiceError(
        503,
        "Live generation is not configured yet. Explore the reference world or use the model report.",
        "QUOTA_NOT_CONFIGURED",
      );
    const now = Date.now(),
      key = `${scope}:${ip}`;
    for (const [id, entry] of local) if (entry.until < now) local.delete(id);
    const entry = local.get(key) || { count: 0, until: now + 3600000 };
    if (entry.count >= limits[0])
      throw new ServiceError(
        429,
        "Survey allowance reached. Please try again later.",
        "RATE_LIMITED",
        Math.ceil((entry.until - now) / 1000),
      );
    entry.count++;
    local.set(key, entry);
    return async () => {};
  }
  const hash = createHmac(
    "sha256",
    process.env.PSU7_SIGNING_SECRET?.trim() || config.token,
  )
    .update(ip)
    .digest("hex")
    .slice(0, 32);
  const key = `psu7:${scope}`,
    lease = randomUUID();
  const reply = await redis(
    [
      "EVAL",
      RESERVE,
      "3",
      `${key}:hour:${hash}`,
      `${key}:daily`,
      `${key}:active`,
      ...limits.map(String),
      lease,
    ],
    config,
  );
  if (!Array.isArray(reply) || ![0, 1].includes(reply[0]))
    throw new ServiceError(
      503,
      "Generation limits are temporarily unavailable.",
    );
  if (!reply[0])
    throw new ServiceError(
      429,
      "Survey capacity reached. Your report is safe; please try again later.",
      "RATE_LIMITED",
      reply[1],
    );
  return async () => {
    try {
      await redis(["ZREM", `${key}:active`, lease], config);
    } catch {
      /* Lease expires automatically. */
    }
  };
}
