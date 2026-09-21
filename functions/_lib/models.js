const SKIP = /whisper|tts|embed|transcribe|speech|guard|dall-e|moderation|realtime|image|audio|babbage|davinci|ada-|text-embedding/i;

function ids(list) {
  const all = (list || []).map((m) => ({ id: m.id || m.name, label: m.display_name || m.displayName || m.id || m.name }))
    .filter((m) => m.id)
    .map((m) => ({ id: String(m.id).replace(/^models\//, ""), label: String(m.label).replace(/^models\//, "") }));
  const chat = all.filter((m) => !SKIP.test(m.id));
  return chat.length ? chat : all;
}

export async function listModels(provider, apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("API 키가 필요합니다.");
  if (provider === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(20000) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || "모델 목록을 가져오지 못했습니다.");
    return ids((data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")));
  }
  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/models", {
      signal: AbortSignal.timeout(20000),
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || "모델 목록을 가져오지 못했습니다.");
    return ids(data.data);
  }
  const url = {
    groq: "https://api.groq.com/openai/v1/models",
    openrouter: "https://openrouter.ai/api/v1/models",
    deepseek: "https://api.deepseek.com/models",
    openai: "https://api.openai.com/v1/models",
  }[provider] || "https://api.openai.com/v1/models";
  const r = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "모델 목록을 가져오지 못했습니다.");
  return ids(data.data);
}
