import { validateSurvey, calculate, analysisPrompt, validateNarrative } from '../lib/planet.js';
import { body, method, fail, reserve, providerJSON, ServiceError } from '../lib/server.js';
export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  let release;
  try {
    const { params, catalog } = validateSurvey(body(req));
    if (!process.env.ANTHROPIC_API_KEY) throw new ServiceError(503, 'Written interpretation is unavailable. The model report is ready to explore.');
    release = await reserve(req, 'analyze');
    const response = await providerJSON('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 800,
        messages: [{ role: 'user', content: analysisPrompt(params, calculate(params, catalog), catalog) }] }),
    }, 24000);
    if (response.stop_reason !== 'end_turn' || !Array.isArray(response.content)) throw new ServiceError(502, 'The interpretation was incomplete. Please retry.', 'INVALID_RESPONSE');
    let narrative;
    try {
      const text = response.content.filter(item => item.type === 'text').map(item => item.text).join('');
      narrative = validateNarrative(JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')));
    } catch { throw new ServiceError(502, 'The interpretation did not match the survey format. Please retry.', 'INVALID_RESPONSE'); }
    return res.status(200).json({ narrative });
  } catch (error) { return fail(res, error); }
  finally { if (release) await release(); }
}
