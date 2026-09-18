export function clean(s) {
  return String(s || "")
    .replace(/\*\*/g, "")
    .replace(/\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export function norm(s) {
  return clean(s).replace(/[()（）·.,，]/g, "").replace(/\s+/g, "").toLowerCase();
}

export function pick(arr, n = 1) {
  const a = (arr || []).slice();
  if (!a.length) return n === 1 ? null : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return n === 1 ? a[0] : a.slice(0, n);
}

export function usable(q) {
  const p = clean(q.prompt);
  if (p.length < 8) return false;
  if (/^[).,\]]/.test(p)) return false;
  if (q.type === "mc" && (!Array.isArray(q.choices) || q.choices.length < 2)) return false;
  return true;
}

export function scoreLocal(q, val) {
  if (q.type === "mc") {
    const good = Number(val) === Number(q.answer);
    return { good, score: good ? 1 : 0, max: 1, explain: clean(q.explain) };
  }
  if (q.type === "blank") {
    const acc = (q.accept || [q.answer]).map(norm).filter(Boolean);
    const v = norm(val);
    const good = acc.some((a) => v && (v === a || v.includes(a) || a.includes(v)));
    return { good, score: good ? 1 : 0, max: 1, explain: clean(q.explain) };
  }
  return { good: null, score: 0, max: 0, explain: "" };
}

export const PROVIDERS = [
  { id: "gemini", label: "Google AI Studio (Gemini)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "groq", label: "Groq" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: "DeepSeek" },
];
