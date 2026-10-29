import {
  validateSurvey,
  calculate,
  imagePrompt,
  InputError,
  validateSeed,
} from "../lib/planet.js";
import {
  body,
  method,
  fail,
  reserve,
  providerJSON,
  IMAGE_MODEL,
  ServiceError,
} from "../lib/server.js";
import {
  orbitalReference,
  orbitalImagePrompt,
} from "../lib/orbital-reference.js";
import { validateCartography } from "../lib/cartography-record.js";
import { storeImage, storeOrbitalImage, cachedImage } from "../lib/storage.js";
import { imageCacheKey } from "../lib/image-cache.js";
import { verifiedCatalog } from "../lib/provenance.js";

export function createImageHandler({
  request = providerJSON,
  save = storeImage,
  saveOrbital = storeOrbitalImage,
  lookup = cachedImage,
  quota = reserve,
} = {}) {
  return async function handler(req, res) {
    if (!method(req, res, "POST")) return;
    let release;
    try {
      const input = body(req),
        survey = Object.fromEntries(
          Object.entries(input).filter(
            ([key]) => !["cartography", "seed"].includes(key),
          ),
        ),
        { params, catalog, physicsVersion } = validateSurvey(survey),
        physics = calculate(params, catalog, physicsVersion),
        seed = input.seed == null ? null : validateSeed(input.seed);
      verifiedCatalog(catalog);
      let cartography;
      try {
        cartography = validateCartography(input.cartography, params, physics);
      } catch (error) {
        throw new InputError(error.message);
      }
      if (!["orbital", "surface"].includes(input.view))
        throw new InputError("Choose orbital or surface view.");
      const key = process.env.OPENAI_API_KEY || process.env.PLANET_OPENAI_KEY;
      if (!key)
        throw new ServiceError(
          503,
          "Live imagery is unavailable. The model report is ready to explore.",
          "IMAGE_PROVIDER_NOT_CONFIGURED",
        );
      if (!process.env.BLOB_READ_WRITE_TOKEN)
        throw new ServiceError(
          503,
          "Image storage is not configured yet. The model report is ready to explore.",
          "IMAGE_STORAGE_NOT_CONFIGURED",
        );
      const orbital = input.view === "orbital",
        reference = orbital
          ? orbitalReference(params, physics, cartography)
          : null,
        settings = {
          model: IMAGE_MODEL,
          prompt: orbital
            ? orbitalImagePrompt(
                params,
                { ...physics, ...cartography.environment },
                reference.view,
              )
            : imagePrompt(params, physics, "surface"),
          n: 1,
          size: "1536x1024",
          quality: "medium",
          output_format: "webp",
          output_compression: 80,
        };
      // The prompt carries every parameter; the orbital reference view pins
      // the globe's orientation. Same seed and prompt: reuse the image.
      const cacheKey = imageCacheKey(seed, [
        settings.model,
        settings.size,
        settings.prompt,
        reference?.view ?? null,
      ]);
      const cached = orbital
        ? await lookup(cacheKey, reference.view)
        : await lookup(cacheKey);
      if (cached) return res.status(200).json({ asset: cached, cached: true });
      release = await quota(req, "image");
      let requestBody = JSON.stringify(settings);
      if (orbital) {
        requestBody = new FormData();
        for (const [name, value] of Object.entries(settings))
          requestBody.set(name, String(value));
        requestBody.set(
          "image",
          new Blob([reference.png], { type: "image/png" }),
          "orbital-reference.png",
        );
      }
      const data = await request(
        `https://api.openai.com/v1/images/${orbital ? "edits" : "generations"}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            ...(!orbital ? { "Content-Type": "application/json" } : {}),
          },
          body: requestBody,
        },
        45000,
      );
      if (!data.data?.[0]?.b64_json)
        throw new ServiceError(
          502,
          "The image service did not return an image. Please retry.",
          "INVALID_RESPONSE",
        );
      const asset = orbital
        ? await saveOrbital(data.data[0].b64_json, reference.view, cacheKey)
        : await save(data.data[0].b64_json, cacheKey);
      return res.status(200).json({ asset });
    } catch (error) {
      return fail(res, error);
    } finally {
      if (release) await release();
    }
  };
}
export default createImageHandler();
