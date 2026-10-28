// @ts-check
// Server-only HMAC attestations. They let public reports carry content the
// server produced (catalogue records, AI field notes, images) without trusting
// the browser that uploads the snapshot.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ServiceError } from "./server.js";

const LOCAL_DEVELOPMENT_KEY = "psu7-local-development-only";

/**
 * Signing keys, newest first. PSU7_SIGNING_SECRET signs new attestations.
 * The Blob token remains a verification key so links published before the
 * dedicated secret existed keep working.
 * @returns {string[]}
 */
export function signingKeys() {
  const keys = [
    process.env.PSU7_SIGNING_SECRET?.trim(),
    process.env.BLOB_READ_WRITE_TOKEN?.trim(),
  ].filter((key) => typeof key === "string" && key.length > 0);
  if (
    !keys.length &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL
  )
    keys.push(LOCAL_DEVELOPMENT_KEY);
  return /** @type {string[]} */ (keys);
}

/** @param {string} key @param {unknown} payload */
function digest(key, payload) {
  return createHmac("sha256", key)
    .update(typeof payload === "string" ? payload : JSON.stringify(payload))
    .digest("hex");
}

/**
 * @param {unknown} payload A string or a JSON value with deterministic key order.
 * @returns {string} 64 hex characters
 */
export function sign(payload) {
  const [key] = signingKeys();
  if (!key)
    throw new ServiceError(
      503,
      "Signing is not configured. The model report remains available.",
    );
  return digest(key, payload);
}

/**
 * @param {unknown} payload
 * @param {unknown} signature
 */
export function verify(payload, signature) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature))
    return false;
  const received = Buffer.from(signature, "hex");
  return signingKeys().some((key) =>
    timingSafeEqual(Buffer.from(digest(key, payload), "hex"), received),
  );
}
