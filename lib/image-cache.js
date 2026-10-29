// Server-side image cache key: the world seed plus a hash of everything sent
// to the image model. Generated images are stored under this key, so a seeded
// permalink opened anywhere reuses its images instead of paying for new ones.
import { createHash } from "node:crypto";

/**
 * @param {number | null} seed Null for worlds made without a seed.
 * @param {unknown} promptMaterial The model, size, prompt and any reference view.
 */
export function imageCacheKey(seed, promptMaterial) {
  const hash = createHash("sha256")
    .update(JSON.stringify(promptMaterial))
    .digest("hex")
    .slice(0, 32);
  return `${seed ?? "world"}-${hash}`;
}
