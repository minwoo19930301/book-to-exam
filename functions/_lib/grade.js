import { prepareScore, finalizeScore, scoreInstructions } from "./score.js";
import { scoreLocal } from "../../shared/scoring.js";
export function extractJSON(text) {
  const raw = String(text || "").replace(/```(?:json)?/gi, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("모델이 JSON을 반환하지 않았습니다.");
  const slice = raw.slice(start, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/}\s*{/g, "},{");
  try {
    return JSON.parse(slice);
  } catch {
    throw new Error("모델 응답을 읽지 못했습니다. 다른 모델을 골라 다시 채점해 주세요.");
  }
}

export function clean(s) {
  return String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export async function openai(apiKey, system, user, model) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "OpenAI 오류");
  return data.choices[0].message.content;
}

export async function gemini(apiKey, system, user, model) {
  const name = encodeURIComponent(model || "gemini-2.0-flash");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Gemini 오류");
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
}

export async function anthropic(apiKey, system, user, model) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || "claude-haiku-4-5",
      max_tokens: 4096,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Anthropic 오류");
  return data.content?.map((c) => c.text).join("") || "";
}

export async function groq(apiKey, system, user, model) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model || "llama-3.3-70b-versatile",
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Groq 오류");
  return data.choices[0].message.content;
}

export async function openrouter(apiKey, system, user, model) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model || "openai/gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "OpenRouter 오류");
  return data.choices[0].message.content;
}

export async function deepseek(apiKey, system, user, model) {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model || "deepseek-chat",
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

export async function callModel(provider, apiKey, system, user, env, model) {
  if (provider === "gemini") return gemini(apiKey, system, user, model);
  if (provider === "anthropic") return anthropic(apiKey, system, user, model);
  if (provider === "groq") return groq(apiKey, system, user, model);
  if (provider === "openrouter") return openrouter(apiKey, system, user, model);
  if (provider === "deepseek") return deepseek(apiKey, system, user, model);
  if (provider === "workers") {
    if (!env?.AI) throw new Error("임시 채점 모델이 없습니다.");
    return workersAI(env.AI, system, user);
  }
  return openai(apiKey, system, user, model);
}

export function localItem(it) {
  return { id: it.id, ...scoreLocal(it, it.userAnswer), comment: "" };
}

export async function gradeBody(body, env, { requireKey = true } = {}) {
  const provider = body.provider || "gemini";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (requireKey && !apiKey) throw new Error("API 키가 필요합니다.");
  if (requireKey && !model) throw new Error("모델을 먼저 고르세요.");
  // Only the ID is trusted from a client, never its supplied rubric or source text.
  const context = prepareScore(body.essayId || body.essay?.id, body.answer);
  const raw = await callModel(provider, apiKey, scoreInstructions, JSON.stringify({
    prompt: context.prompt, answer: context.answer, rubric: context.rubric, sources: context.sources,
  }), env, model);
  return finalizeScore(context, extractJSON(raw));
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
