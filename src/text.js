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

export function pickOther(arr, prevId) {
  const pool = (arr || []).filter((x) => x.id !== prevId);
  return pick(pool.length ? pool : arr);
}

export function usable(q) {
  const p = clean(q.prompt);
  if (p.length < 8) return false;
  if (/^[).,\]]/.test(p)) return false;
  if (q.type === "mc" && (!Array.isArray(q.choices) || q.choices.length < 2)) return false;
  return true;
}

function takeTail(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(-n);
  const i = cut.search(/\n/);
  return i >= 0 ? cut.slice(i + 1) : cut;
}

function takeHead(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const i = cut.lastIndexOf("\n");
  return i >= 0 ? cut.slice(0, i) : cut;
}

export function clozeAround(q, notes) {
  const before0 = q.before || "";
  const after0 = q.after || "";
  const note = (notes || []).find((n) => n.id === q.page);
  if (!note) return { before: before0, after: after0 };
  const text = String(note.text || "").replace(/\*\*/g, "");
  const ans = String(q.answer || "");
  let pos = -1;
  if (before0) {
    const p = text.indexOf(before0);
    if (p >= 0) pos = p + before0.length;
  }
  if (pos < 0 && ans) pos = text.indexOf(ans);
  if (pos < 0) return { before: before0, after: after0 };
  const left = text.slice(0, pos);
  const right = text.slice(pos + (text.startsWith(ans, pos) ? ans.length : 0));
  return {
    before: takeTail(left, 260) || before0,
    after: takeHead(right, 260) || after0,
  };
}

export function clozeOf(q) {
  const raw = clean(q.prompt);
  let def = raw.split("→")[0]
    .replace(/이 설명에 해당하는 용어는\??/g, "")
    .replace(/빈칸에 들어갈 용어는\??/g, "")
    .trim();
  if (!def || def.length < 4) {
    const exp = clean(q.explain);
    def = exp.split("—").pop() || clean(q.keyword) || exp;
  }
  return { before: "「", after: `」은 ${def}이다.` };
}

export { scoreLocal } from "../shared/scoring.js";

export function mcpPrompt({ origin, sid, essay, answer }) {
  return `아래 MCP를 연결하세요. tools/list를 보면 score가 있어야 합니다.

MCP 주소:
${origin}/api/mcp/${sid}

순서:
1. score({ "essayId": ${JSON.stringify(essay.id)}, "answer": ${JSON.stringify(answer || "")} }) 를 호출해 기준과 뷰어 근거를 받습니다.
2. 그 기준만으로 채점한 뒤, 같은 score에 assessment를 넣어 다시 호출해 검증합니다.
3. 검증된 점수와 이유를 근거 페이지와 함께 알려 주세요.

get_essay만으로 채점하지 마세요.`;
}

export const PROVIDERS = [
  { id: "gemini", label: "Google AI Studio (Gemini)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "groq", label: "Groq" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: "DeepSeek" },
];
