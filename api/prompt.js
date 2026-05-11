export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { studentNum, score, conv } = req.body;

  const wordLimit = score <= 1 ? 50 : score <= 2 ? 80 : score <= 3 ? 120 : score <= 4 ? 160 : 220;

  const sys = `당신은 학생의 미술 감상 대화를 분석해 이미지 생성 프롬프트를 만드는 AI입니다.

규칙:
1. 학생이 실제로 언급한 것만 사용. 원본 작품 정보 절대 추가 금지.
2. 학생이 언급한 색, 형태, 위치, 감정, 이야기를 빠짐없이 포함하세요. 요약하지 말고 대화 내용에 충실하게.
3. 점수 ${score}점이 프롬프트 품질에 반영:
   - 점수 낮음: 학생이 언급한 일부만 단순하게 반영
   - 점수 높음: 언급한 모든 요소를 풍부하고 구체적으로 반영
4. 학생의 감정·내러티브 해석도 시각적으로 표현하세요.
5. 원작 스타일이나 화풍을 추가하지 마세요. 학생이 언급한 것만.
6. 인물이 등장할 경우 색면, 단순 도형, 종이 콜라주 형태 등 추상적·평면적으로만 묘사하세요. 사실적 인체, 실루엣, 나체/반나체 표현 모두 금지.

출력 형식 (JSON만, 다른 텍스트 없이):
{"en": "영어 이미지 프롬프트 (${wordLimit}단어 이내)", "ko": "위 영어 프롬프트의 자연스러운 한국어 번역"}`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: `학생 ${studentNum}번, 점수 ${score}점\n\n대화:\n${conv}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000, responseMimeType: 'application/json' }
      })
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.json().catch(() => ({}));
    return res.status(geminiRes.status).json({ error: err?.error?.message || `Gemini error ${geminiRes.status}` });
  }

  const data = await geminiRes.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';

  let prompt = '', promptKo = '';
  try {
    const parsed = JSON.parse(raw);
    prompt = parsed.en || '';
    promptKo = parsed.ko || parsed.en || '';
  } catch {
    prompt = raw;
    promptKo = raw;
  }

  return res.status(200).json({ prompt, promptKo });
}
