// Server-side image cache key: the world seed plus a hash of everything sent
// to the image model. Generated images are stored under this key, so a seeded
// permalink opened anywhere reuses its images instead of paying for new ones.
import { createHash } from "node:crypto";

/**
 * @param {number | null} seed Null for worlds made without a seed.
 * @param {unknown} promptMaterial The model, size, prompt and any reference view.
 * @returns {string} Digits, hyphens and lowercase hex only, so the stored URL
 *   passes the same check as every other generated image.
 */
export function imageCacheKey(seed, promptMaterial) {
  const hash = createHash("sha256")
    .update(JSON.stringify(promptMaterial))
    .digest("hex")
    .slice(0, 32);
  return seed == null ? hash : `${seed}-${hash}`;
}
