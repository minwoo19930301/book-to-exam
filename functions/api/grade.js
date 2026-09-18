function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("모델이 JSON을 반환하지 않았습니다.");
  return JSON.parse(text.slice(start, end + 1));
}

function systemPrompt(essay) {
  const lines = essay.rubric.map((r) => `- ${r.id} ${r.label} (만점 ${r.max}): ${r.ok}`).join("\n");
  return `너는 역사교육론 서술형 채점기다. 아래 기준만 보고 채점한다. 기준에 없는 이유로 점수를 빼거나 더하지 않는다.
문항: ${essay.prompt}
기준:
${lines}
JSON만 반환한다.
{"total":0,"max":0,"items":[{"id":"r1","score":0,"max":0,"comment":""}],"feedback":""}
max는 기준 만점의 합, total은 항목 점수의 합이다.`;
}

async function openai(apiKey, system, user) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "OpenAI 오류");
  return data.choices[0].message.content;
}

async function gemini(apiKey, system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0 },
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Gemini 오류");
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { provider, apiKey, essay, answer } = body || {};
    if (!apiKey || !essay || !answer) {
      return Response.json({ error: "apiKey, essay, answer가 필요합니다." }, { status: 400 });
    }
    const system = systemPrompt(essay);
    const user = `학생 답안:\n${answer}`;
    const raw = provider === "gemini"
      ? await gemini(apiKey, system, user)
      : await openai(apiKey, system, user);
    const graded = extractJSON(raw);
    graded.max = essay.rubric.reduce((s, r) => s + r.max, 0);
    if (Array.isArray(graded.items)) {
      graded.total = graded.items.reduce((s, it) => s + Number(it.score || 0), 0);
    }
    return Response.json(graded);
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
