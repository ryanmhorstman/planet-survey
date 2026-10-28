import { validateSurvey, calculate } from "../lib/planet.js";
import {
  fieldNoteRequest,
  parseFieldNote,
  anthropicHeaders,
} from "../lib/prompts.js";
import { verifiedCatalog, signNarrative } from "../lib/provenance.js";
import {
  body,
  method,
  fail,
  reserve,
  providerJSON,
  ServiceError,
} from "../lib/server.js";
export function createAnalyzeHandler({
  request = providerJSON,
  quota = reserve,
} = {}) {
  return async function handler(req, res) {
    if (!method(req, res, "POST")) return;
    let release;
    try {
      const survey = validateSurvey(body(req)),
        catalog = verifiedCatalog(survey.catalog),
        { params, physicsVersion } = survey;
      if (!process.env.ANTHROPIC_API_KEY)
        throw new ServiceError(
          503,
          "Written interpretation is unavailable. The model report is ready to explore.",
        );
      release = await quota(req, "analyze");
      const response = await request(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: anthropicHeaders(process.env.ANTHROPIC_API_KEY),
          body: JSON.stringify(
            fieldNoteRequest(
              params,
              calculate(params, catalog, physicsVersion),
              catalog,
            ),
          ),
        },
        30000,
      );
      // Signed so a public report can show this note as AI-written.
      const narrative = signNarrative(
        params,
        catalog,
        physicsVersion,
        parseFieldNote(response),
      );
      return res.status(200).json({ narrative });
    } catch (error) {
      return fail(res, error);
    } finally {
      if (release) await release();
    }
  };
}
export default createAnalyzeHandler();
