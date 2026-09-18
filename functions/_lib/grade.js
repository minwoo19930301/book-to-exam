export function extractJSON(text) {
  const start = String(text || "").indexOf("{");
  const end = String(text || "").lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("모델이 JSON을 반환하지 않았습니다.");
  return JSON.parse(text.slice(start, end + 1));
}

export function clean(s) {
  return String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function essayPrompt(essay) {
  const lines = essay.rubric.map((r) => `- ${r.id} ${r.label} (만점 ${r.max}): ${r.ok}`).join("\n");
  return `너는 역사교육론 서술형 채점기다. 아래 기준만 보고 채점한다. 기준에 없는 이유로 점수를 빼거나 더하지 않는다.
문항: ${essay.prompt}
기준:
${lines}
JSON만 반환한다.
{"total":0,"max":0,"items":[{"id":"r1","score":0,"max":0,"comment":""}],"feedback":""}
max는 기준 만점의 합, total은 항목 점수의 합이다. feedback에는 짧은 해설을 쓴다.`;
}

function itemsPrompt(items) {
  const body = items.map((it, i) => {
    if (it.type === "mc") {
      return `${i + 1}. [객관식 id=${it.id}]
문제: ${clean(it.prompt)}
보기: ${(it.choices || []).map((c, n) => `${n}. ${clean(c)}`).join(" / ")}
정답 인덱스: ${it.answer}
학생 답: ${it.userAnswer}
기존 해설: ${clean(it.explain)}`;
    }
    if (it.type === "blank") {
      return `${i + 1}. [빈칸 id=${it.id}]
문제: ${clean(it.prompt)}
정답: ${(it.accept || [it.answer]).join(", ")}
학생 답: ${it.userAnswer}
기존 해설: ${clean(it.explain)}`;
    }
    const lines = (it.rubric || []).map((r) => `- ${r.id} ${r.label} (만점 ${r.max}): ${r.ok}`).join("\n");
    return `${i + 1}. [서술형 id=${it.id}]
문제: ${it.prompt}
기준:
${lines}
학생 답: ${it.userAnswer}`;
  }).join("\n\n");

  return `아래 문항을 채점하고 각 문항에 짧은 해설을 쓴다. JSON만 반환한다.
${body}

형식:
{"total":0,"max":0,"items":[{"id":"","good":true,"score":0,"max":0,"explain":"","comment":""}],"feedback":""}
객관식·빈칸은 정답과 일치하면 good=true, score=1, max=1.
서술형은 rubric 만점 합을 max로 하고 기준별로 점수를 합한다.
explain에는 왜 맞거나 틀린지, comment에는 보완점을 쓴다.`;
}

export async function openai(apiKey, system, user, model = "gpt-4o-mini") {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "OpenAI 오류");
  return data.choices[0].message.content;
}

export async function gemini(apiKey, system, user) {
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

export async function anthropic(apiKey, system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1200,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Anthropic 오류");
  return data.content?.map((c) => c.text).join("") || "";
}

export async function groq(apiKey, system, user) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Groq 오류");
  return data.choices[0].message.content;
}

export async function openrouter(apiKey, system, user) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "OpenRouter 오류");
  return data.choices[0].message.content;
}

export async function deepseek(apiKey, system, user) {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "DeepSeek 오류");
  return data.choices[0].message.content;
}

export async function workersAI(AI, system, user) {
  const models = [
    "@cf/meta/llama-3.2-3b-instruct",
    "@cf/meta/llama-3.1-8b-instruct-fp8",
    "@cf/meta/llama-4-scout-17b-16e-instruct",
  ];
  let last;
  for (const model of models) {
    try {
      const r = await AI.run(model, {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0,
      });
      return r.response || r.result?.response || (typeof r === "string" ? r : JSON.stringify(r));
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error("임시 채점 모델이 없습니다.");
}

export async function callModel(provider, apiKey, system, user, env) {
  if (provider === "gemini") return gemini(apiKey, system, user);
  if (provider === "anthropic") return anthropic(apiKey, system, user);
  if (provider === "groq") return groq(apiKey, system, user);
  if (provider === "openrouter") return openrouter(apiKey, system, user);
  if (provider === "deepseek") return deepseek(apiKey, system, user);
  if (provider === "workers") {
    if (!env?.AI) throw new Error("임시 채점 모델이 없습니다.");
    return workersAI(env.AI, system, user);
  }
  return openai(apiKey, system, user);
}

export function localItem(it) {
  if (it.type === "mc") {
    const good = Number(it.userAnswer) === Number(it.answer);
    return { id: it.id, good, score: good ? 1 : 0, max: 1, explain: clean(it.explain), comment: "" };
  }
  if (it.type === "blank") {
    const acc = (it.accept || [it.answer]).map((s) => clean(s).replace(/\s+/g, "").toLowerCase());
    const v = clean(it.userAnswer).replace(/\s+/g, "").toLowerCase();
    const good = acc.some((a) => a && v && (v === a || v.includes(a) || a.includes(v)));
    return { id: it.id, good, score: good ? 1 : 0, max: 1, explain: clean(it.explain), comment: "" };
  }
  const max = (it.rubric || []).reduce((s, r) => s + Number(r.max || 0), 0);
  return { id: it.id, good: null, score: 0, max, explain: "", comment: "" };
}

export async function gradeBody(body, env, { requireKey = true } = {}) {
  const provider = body.provider || "gemini";
  const apiKey = (body.apiKey || "").trim();
  if (requireKey && !apiKey) throw new Error("apiKey가 필요합니다.");

  if (Array.isArray(body.items) && body.items.length) {
    const locals = body.items.map(localItem);
    const system = "채점 결과를 JSON으로만 반환한다.";
    const raw = await callModel(provider, apiKey, system, itemsPrompt(body.items), env);
    const graded = extractJSON(raw);
    const byId = Object.fromEntries(locals.map((x) => [x.id, x]));
    for (const it of graded.items || []) {
      if (byId[it.id]) byId[it.id] = { ...byId[it.id], ...it };
    }
    const items = body.items.map((it) => byId[it.id]);
    const max = items.reduce((s, it) => s + Number(it.max || 0), 0);
    const total = items.reduce((s, it) => s + Number(it.score || 0), 0);
    return { total, max, items, feedback: graded.feedback || "" };
  }

  const { essay, answer } = body;
  if (!essay || !answer) throw new Error("essay, answer 또는 items가 필요합니다.");
  const raw = await callModel(provider, apiKey, essayPrompt(essay), `학생 답안:\n${answer}`, env);
  const graded = extractJSON(raw);
  graded.max = essay.rubric.reduce((s, r) => s + r.max, 0);
  if (Array.isArray(graded.items)) {
    graded.total = graded.items.reduce((s, it) => s + Number(it.score || 0), 0);
  }
  return graded;
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { "access-control-allow-origin": "*" } });
}
