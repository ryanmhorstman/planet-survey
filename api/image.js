import { validateSurvey, calculate, imagePrompt, InputError } from '../lib/planet.js';
import { body, method, fail, reserve, providerJSON, ServiceError } from '../lib/server.js';
import { storeImage } from '../lib/storage.js';

export function createImageHandler({ request = providerJSON, save = storeImage, quota = reserve } = {}) {
  return async function handler(req, res) {
    if (!method(req, res, 'POST')) return;
    let release;
    try {
      const input = body(req), { params, catalog } = validateSurvey(input);
      if (!['orbital', 'surface'].includes(input.view)) throw new InputError('Choose orbital or surface view.');
      const key = process.env.OPENAI_API_KEY || process.env.PLANET_OPENAI_KEY;
      if (!key) throw new ServiceError(503, 'Live imagery is unavailable. The model report is ready to explore.', 'IMAGE_PROVIDER_NOT_CONFIGURED');
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new ServiceError(503, 'Image storage is not configured yet. The model report is ready to explore.', 'IMAGE_STORAGE_NOT_CONFIGURED');
      release = await quota(req, 'image');
      const data = await request('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: imagePrompt(params, calculate(params, catalog), input.view),
          n: 1, size: '1536x1024', quality: 'medium', output_format: 'webp', output_compression: 80 }),
      }, 45000);
      if (!data.data?.[0]?.b64_json) throw new ServiceError(502, 'The image service did not return an image. Please retry.', 'INVALID_RESPONSE');
      const asset = await save(data.data[0].b64_json);
      return res.status(200).json({ asset });
    } catch (error) { return fail(res, error); }
    finally { if (release) await release(); }
  };
}
export default createImageHandler();
