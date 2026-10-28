import {
  prepareExpedition,
  expeditionContext,
  expeditionModel,
  expeditionImagePrompt,
} from "../lib/expedition.js";
import {
  expeditionNoteRequest,
  parseExpeditionNote,
  anthropicHeaders,
} from "../lib/prompts.js";
import { verifiedCatalog, signExpeditionNotes } from "../lib/provenance.js";
import { regionalReference } from "../lib/regional-reference.js";
import { expeditionNarrative } from "../lib/expedition-record.js";
import {
  body,
  method,
  fail,
  reserve,
  providerJSON,
  IMAGE_MODEL,
  ServiceError,
} from "../lib/server.js";
import { storeExpeditionImage } from "../lib/storage.js";
export function createExpeditionHandler({
  request = providerJSON,
  save = storeExpeditionImage,
  quota = reserve,
} = {}) {
  return async function handler(req, res) {
    if (!method(req, res, "POST")) return;
    let release;
    try {
      const prepared = prepareExpedition(body(req)),
        image = prepared.operation === "image";
      verifiedCatalog(prepared.catalog);
      const key = image
        ? process.env.OPENAI_API_KEY || process.env.PLANET_OPENAI_KEY
        : process.env.ANTHROPIC_API_KEY;
      if (!key || (image && !process.env.BLOB_READ_WRITE_TOKEN))
        throw new ServiceError(
          503,
          image
            ? "Expedition imagery is unavailable. The local model remains available."
            : "AI field notes are unavailable. The local model note remains available.",
        );
      release = await quota(req, image ? "image" : "analyze");
      const model = expeditionModel(prepared);
      const context = expeditionContext(prepared, model);
      if (image) {
        const form = new FormData();
        for (const [name, value] of Object.entries({
          model: IMAGE_MODEL,
          prompt: expeditionImagePrompt(prepared, context),
          n: "1",
          size: "1536x1024",
          quality: "medium",
          output_format: "webp",
          output_compression: "80",
        }))
          form.set(name, value);
        form.set(
          "image",
          new Blob([regionalReference(model, prepared.metadata)], {
            type: "image/png",
          }),
          "region.png",
        );
        const response = await request(
          "https://api.openai.com/v1/images/edits",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
            },
            body: form,
          },
          45000,
        );
        if (!response.data?.[0]?.b64_json)
          throw new ServiceError(
            502,
            "The image service did not return an image.",
            "INVALID_RESPONSE",
          );
        const asset = await save(
          response.data[0].b64_json,
          prepared.metadata.key,
        );
        return res.status(200).json({ metadata: prepared.metadata, asset });
      }
      const response = await request(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: anthropicHeaders(key),
          body: JSON.stringify(expeditionNoteRequest(prepared, context)),
        },
        30000,
      );
      let notes;
      try {
        notes = expeditionNarrative(parseExpeditionNote(response));
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError(
          502,
          "The expedition notes were incomplete or invalid. Please retry.",
          "INVALID_RESPONSE",
        );
      }
      // Signed so a public report can keep these notes with their expedition.
      const narrative = signExpeditionNotes(prepared.metadata.key, notes);
      return res.status(200).json({ metadata: prepared.metadata, narrative });
    } catch (error) {
      return fail(res, error);
    } finally {
      if (release) await release();
    }
  };
}
export default createExpeditionHandler();
