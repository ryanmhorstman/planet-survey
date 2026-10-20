import {
  validateSurvey,
  calculate,
  imagePrompt,
  InputError,
} from "../lib/planet.js";
import {
  body,
  method,
  fail,
  reserve,
  providerJSON,
  ServiceError,
} from "../lib/server.js";
import {
  orbitalReference,
  orbitalImagePrompt,
} from "../lib/orbital-reference.js";
import { validateCartography } from "../lib/cartography-record.js";
import { storeOrbitalImage } from "../lib/storage.js";
import { storeImage } from "../lib/storage.js";

export function createImageHandler({
  request = providerJSON,
  save = storeImage,
  saveOrbital = storeOrbitalImage,
  quota = reserve,
} = {}) {
  return async function handler(req, res) {
    if (!method(req, res, "POST")) return;
    let release;
    try {
      const input = body(req),
        survey = Object.fromEntries(
          Object.entries(input).filter(([key]) => key !== "cartography"),
        ),
        { params, catalog } = validateSurvey(survey),
        physics = calculate(params, catalog);
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
      release = await quota(req, "image");
      const orbital = input.view === "orbital",
        reference = orbital
          ? orbitalReference(params, physics, cartography)
          : null,
        settings = {
          model: "gpt-image-1",
          prompt: orbital
            ? orbitalImagePrompt(
                params,
                { ...physics, ...cartography.environment },
                reference.view,
              )
            : imagePrompt(params, physics, "surface"),
          ...(orbital ? { input_fidelity: "high" } : {}),
          n: 1,
          size: "1536x1024",
          quality: "medium",
          output_format: "webp",
          output_compression: 80,
        };
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
        ? await saveOrbital(data.data[0].b64_json, reference.view)
        : await save(data.data[0].b64_json);
      return res.status(200).json({ asset });
    } catch (error) {
      return fail(res, error);
    } finally {
      if (release) await release();
    }
  };
}
export default createImageHandler();
