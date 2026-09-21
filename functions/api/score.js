import { gradeBody, json } from "../_lib/grade.js";
import { prepareScore, finalizeScore } from "../_lib/score.js";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    if (body.mode === "browser-prepare") {
      return json({ status: "assessment_required", ...prepareScore(body.essayId, body.answer) });
    }
    if (body.mode === "browser-finalize") {
      const prepared = prepareScore(body.essayId, body.answer);
      if (body.rubricVersion !== prepared.rubricVersion) throw new Error("채점 기준이 변경되었습니다. 다시 채점해 주세요.");
      return json({ ...finalizeScore(prepared, body.assessment), engine: "Chrome 내장 AI · 실험", practice: true });
    }
    let provider = body.provider || "gemini", apiKey = body.apiKey;
    const temporary = body.mode === "temp";
    if (temporary) {
      const env = context.env || {};
      if (env.GEMINI_API_KEY) { provider = "gemini"; apiKey = env.GEMINI_API_KEY; }
      else if (env.OPENAI_API_KEY) { provider = "openai"; apiKey = env.OPENAI_API_KEY; }
      else if (env.ANTHROPIC_API_KEY) { provider = "anthropic"; apiKey = env.ANTHROPIC_API_KEY; }
      else if (env.GROQ_API_KEY) { provider = "groq"; apiKey = env.GROQ_API_KEY; }
      else if (env.AI) { provider = "workers"; apiKey = ""; }
      else return json({ error: "임시 채점이 준비되지 않았습니다. API 키 또는 MCP를 사용해 주세요." }, 503);
    }
    return json(await gradeBody({ ...body, provider, apiKey }, context.env, { requireKey: !temporary }));
  } catch (error) {
    return json({ error: error.message || "채점에 실패했습니다." }, 400);
  }
}
