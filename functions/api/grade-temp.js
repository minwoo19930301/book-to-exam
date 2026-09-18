import { gradeBody, json, localItem } from "../_lib/grade.js";

const waits = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
  });
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  try {
    const sid = body.sessionId || "anon";
    const last = waits.get(sid) || 0;
    const waitMs = last && Date.now() - last < 8000 ? 3500 : 1800;
    waits.set(sid, Date.now());
    await sleep(waitMs);

    const env = context.env || {};
    let provider = "workers";
    let apiKey = "";
    if (env.GEMINI_API_KEY) { provider = "gemini"; apiKey = env.GEMINI_API_KEY; }
    else if (env.OPENAI_API_KEY) { provider = "openai"; apiKey = env.OPENAI_API_KEY; }
    else if (env.ANTHROPIC_API_KEY) { provider = "anthropic"; apiKey = env.ANTHROPIC_API_KEY; }
    else if (env.GROQ_API_KEY) { provider = "groq"; apiKey = env.GROQ_API_KEY; }
    else if (!env.AI) {
      return json({ error: "임시 채점이 아직 준비되지 않았습니다. 본인 API 키를 넣어 주세요." }, 503);
    }

    const graded = await gradeBody({ ...body, provider, apiKey }, env, { requireKey: false });
    return json({ ...graded, temp: true, waitedMs: waitMs });
  } catch (err) {
    if (Array.isArray(body.items) && body.items.length) {
      const items = body.items.map(localItem);
      return json({
        total: items.reduce((s, it) => s + Number(it.score || 0), 0),
        max: items.reduce((s, it) => s + Number(it.max || 0), 0),
        items,
        feedback: "임시 모델 해설을 붙이지 못했습니다. 객관식·빈칸은 정답으로 먼저 채점했습니다.",
        temp: true,
        error: String(err.message || err),
      });
    }
    return json({ error: String(err.message || err) }, 500);
  }
}
