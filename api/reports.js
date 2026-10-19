import { body, fail, reserve } from '../lib/server.js';
import { readReport, storeReport, validateStoredReport } from '../lib/storage.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let release;
  try {
    if (req.method === 'GET') {
      const report = await readReport(req.query?.id);
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ report });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
    }
    const input = body(req);
    validateStoredReport(input);
    release = await reserve(req, 'share');
    const id = await storeReport(input);
    return res.status(201).json({ id });
  } catch (error) { return fail(res, error); }
  finally { if (release) await release(); }
}
