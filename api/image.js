export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
