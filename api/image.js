const rateLimits = new Map();
const IMAGE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= IMAGE_LIMIT) return false;
  entry.count++;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Image limit reached. Please wait before rendering another view.' });
  }

  try {
    const { prompt } = req.body;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1536x1024',
        quality: 'medium',
      }),
    });

    const imgResponse = await response.json();

    // Convert base64 to data URL
    if (imgResponse.data?.[0]?.b64_json) {
      imgResponse.data[0].url = `data:image/png;base64,${imgResponse.data[0].b64_json}`;
      delete imgResponse.data[0].b64_json;
    }

    res.status(200).json(imgResponse);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
