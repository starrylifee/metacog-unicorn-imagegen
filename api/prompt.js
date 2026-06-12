export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { studentNum, score, stage, conv } = req.body;

  const stageLevel = normalizeStage(stage, score);
  const wordLimit = stageLevel <= 1 ? 45 : stageLevel === 2 ? 75 : stageLevel === 3 ? 120 : 160;
  const stageGuide = {
    1: '1단계: 학생이 말한 대상과 색을 아주 성긴 초안처럼만 반영합니다. 빈 곳과 불확실한 곳을 억지로 채우지 않습니다.',
    2: '2단계: 원본을 학생이 관찰한 그대로 다시 그리는 데 집중합니다. 대상, 색, 위치처럼 보이는 정보만 사용하고 감정·상징·드라마를 추가하지 않습니다.',
    3: '3단계: 2단계의 관찰을 유지하면서, 학생이 말한 작가의 생각이나 분위기 해석이 있을 때만 조심스럽게 시각화합니다.',
    4: '4단계: 2단계의 관찰과 3단계의 해석을 유지하면서, 학생 자신의 가치관·판단·개인적 의미가 대화에 있을 때만 상징적으로 더합니다.'
  }[stageLevel];

  const sys = `당신은 학생의 미술 감상 대화를 분석해 이미지 생성 프롬프트를 만드는 AI입니다.

규칙:
1. 학생이 실제로 언급한 것만 사용. 원본 작품 정보 절대 추가 금지.
2. 학생의 말이 적으면 이미지도 단순하고 비어 있어야 합니다. 멋있게 보이도록 장식하거나 완성도를 올리지 마세요. 단, 이를 'minimal', 'minimalist' 같은 스타일 단어로 표현하지 말고, 언급되지 않은 요소를 프롬프트에서 빼는 방식으로만 표현하세요.
3. 점수는 참고만 하고, 이미지의 해석 깊이는 반드시 도달단계 ${stageLevel}단계를 따르세요.
4. 단계 규칙: ${stageGuide}
5. 학생이 말하지 않은 감정·내러티브·작가 의도·가치관을 추가하지 마세요.
6. 스타일·화풍 단어(미니멀, 일러스트, 추상적, 수채화, 콜라주 등)는 학생이 그 표현을 직접 말한 경우에만 사용하세요. 학생이 말하지 않았다면 프롬프트에 어떤 스타일 지시어도 넣지 말고, 학생이 묘사한 내용만 그대로 적으세요.
7. 인물이 등장하더라도 나체/반나체 표현은 금지. 그 외에는 학생이 말한 대로 묘사하세요.
8. 대화에서 가장 독특하거나 근거로 삼기 좋은 학생 발화 한 조각을 exact Korean quote로 고르세요. 반드시 학생이 실제로 한 말에서 4~40자 정도를 그대로 뽑습니다.

출력 형식 (JSON만, 다른 텍스트 없이):
{"en": "영어 이미지 프롬프트 (${wordLimit}단어 이내)", "ko": "위 영어 프롬프트의 자연스러운 한국어 번역", "evidenceQuote": "학생 발화에서 그대로 뽑은 짧은 근거", "highlightLabel": "그 근거를 8자 이내로 요약한 말", "stageNote": "이번 이미지를 ${stageLevel}단계 기준으로 어떻게 제한했는지 한 문장"}`;

  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text: `학생 ${studentNum}번, 점수 ${score}점, 도달단계 ${stageLevel}단계\n\n대화:\n${conv}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2000, responseMimeType: 'application/json' }
  });

  // 딜레이 없이 모델 폴백만 (Vercel 10초 타임아웃 준수)
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastStatus = 500, lastMsg = 'Unknown error';

  for (const model of models) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody }
    );
    if (r.ok) {
      const data = await r.json();
      let raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      // 마크다운 코드블록 제거 (```json ... ``` 또는 ``` ... ```)
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      let prompt = '', promptKo = '', evidenceQuote = '', highlightLabel = '', stageNote = '';
      try {
        const parsed = JSON.parse(raw);
        prompt = parsed.en || '';
        promptKo = parsed.ko || parsed.en || '';
        evidenceQuote = parsed.evidenceQuote || '';
        highlightLabel = parsed.highlightLabel || '';
        stageNote = parsed.stageNote || '';
      } catch {
        prompt = raw;
        promptKo = raw;
      }
      return res.status(200).json({
        prompt,
        promptKo,
        evidenceQuote,
        highlightLabel,
        stageNote,
        stageLevel
      });
    }
    const err = await r.json().catch(() => ({}));
    lastStatus = r.status;
    lastMsg = err?.error?.message || `Gemini error ${r.status}`;
    if (r.status !== 503 && r.status !== 429) break;
  }

  return res.status(lastStatus).json({ error: lastMsg });
}

function normalizeStage(stage, score) {
  const n = parseInt(stage, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return n;

  const s = parseInt(score, 10) || 0;
  if (s <= 2) return 1;
  if (s <= 5) return 2;
  if (s <= 8) return 3;
  return 4;
}
