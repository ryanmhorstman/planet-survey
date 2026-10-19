import { capabilities, configurationStatus, method } from '../lib/server.js';
export default function handler(req, res) {
  if (method(req, res, 'GET')) res.status(200).json({ ...capabilities(), configuration: configurationStatus() });
}
