export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { studentNum, score, conv } = req.body;

  const sys = `당신은 학생의 미술 감상 대화를 분석해 영어 이미지 생성 프롬프트를 만드는 AI입니다.

규칙:
1. 학생이 실제로 언급한 것만 사용. 원본 작품 정보 절대 추가 금지.
2. 점수 ${score}/5가 프롬프트 품질에 반영:
   - 점수 낮음: 모호하고 단순한 장면, 학생이 언급한 극히 일부만 반영
   - 점수 높음: 풍부한 묘사, 상상력 확장 포함
3. 학생의 스토리 해석(감정, 내러티브)도 시각화하세요.
4. 원작(이중섭 흰소)처럼 그리지 마세요. 학생 언어 그대로만.
5. 출력: 영어 프롬프트만, 100단어 이내.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: `학생 ${studentNum}번, 점수 ${score}/5\n\n대화:\n${conv}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
      })
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.json().catch(() => ({}));
    return res.status(geminiRes.status).json({ error: err?.error?.message || `Gemini error ${geminiRes.status}` });
  }

  const data = await geminiRes.json();
  const prompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  return res.status(200).json({ prompt });
}
