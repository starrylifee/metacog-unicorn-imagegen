export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { prompt } = req.body;
  const fullPrompt = prompt + ', expressive brushwork painting, artistic, emotional, no nudity, no adult content';

  // Imagen 3 시도
  const r1 = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: fullPrompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' }
      })
    }
  );

  if (r1.ok) {
    const d = await r1.json();
    const b64 = d.predictions?.[0]?.bytesBase64Encoded;
    if (b64) return res.status(200).json({ mime: 'image/png', data: b64 });
  }

  // Gemini 2.0 Flash 이미지 생성 fallback
  const r2 = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      })
    }
  );

  if (!r2.ok) {
    const err = await r2.json().catch(() => ({}));
    return res.status(r2.status).json({ error: err?.error?.message || `Image API error ${r2.status}` });
  }

  const d2 = await r2.json();
  for (const p of (d2.candidates?.[0]?.content?.parts || [])) {
    if (p.inlineData) return res.status(200).json({ mime: p.inlineData.mimeType, data: p.inlineData.data });
  }

  return res.status(500).json({ error: '이미지 데이터를 받지 못했어요' });
}
