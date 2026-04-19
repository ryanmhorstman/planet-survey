export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    const url = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${query}&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
