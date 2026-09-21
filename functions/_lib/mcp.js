import { prepareScore, finalizeScore, publicEssays } from "./score.js";
import notes from "../../public/data/notes.json" with { type: "json" };
import questions from "../../public/data/questions.json" with { type: "json" };

const objectSchema = properties => ({ type: "object", properties, additionalProperties: false });
const tools = [
  { name: "score", description: "서술형 채점의 시작과 검증. 먼저 essayId와 answer만 보내면 문항·저장된 채점 기준·뷰어 근거를 준다. 그 자료만으로 평가한 뒤 같은 도구에 assessment({items,feedback})를 넣어 다시 호출하면 점수를 검증한다. get_essay만으로 채점하지 않는다.",
    inputSchema: { ...objectSchema({
      essayId: { type: "string", description: "서술형 문항 ID. 예: e1" },
      answer: { type: "string", description: "학생 답안" },
      assessment: { type: "object", description: "두 번째 호출에만 넣습니다. {items, feedback}" },
    }), required: ["essayId", "answer"] } },
  { name: "list_notes", description: "뷰어 페이지 목록", inputSchema: objectSchema({}) },
  { name: "get_note", description: "뷰어 원문과 페이지 링크", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
  { name: "list_essays", description: "서술형 문항 목록. 채점은 score를 사용한다.", inputSchema: objectSchema({}) },
  { name: "get_essay", description: "서술형 문항만 조회한다. 채점 기준과 근거는 score가 함께 준비한다.", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
  { name: "list_questions", description: "객관식·단답형 문항 목록", inputSchema: objectSchema({}) },
  { name: "get_question", description: "문항 조회", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

export function callTool(name, args = {}) {
  if (name === "score") {
    const context = prepareScore(args.essayId, args.answer);
    if (args.assessment) return finalizeScore(context, args.assessment);
    return { status: "assessment_required", ...context,
      next: "이 자료만으로 평가하고, 같은 score 도구를 essayId, answer, assessment와 함께 다시 호출하세요. 검증 전에는 점수를 확정하지 마세요." };
  }
  if (name === "list_notes") return notes.map(({ id, title }) => ({ id, title }));
  if (name === "get_note") {
    const note = notes.find(n => n.id === args.id);
    if (!note) throw new Error("없는 페이지입니다.");
    return { id: note.id, title: note.title, text: note.text, url: `/viewer?page=${note.id}` };
  }
  if (name === "list_essays") return publicEssays();
  if (name === "get_essay") {
    const essay = publicEssays().find(e => e.id === args.id);
    if (!essay) throw new Error("없는 문항입니다.");
    return essay;
  }
  if (name === "list_questions") return questions.map(({ id, type, prompt }) => ({ id, type, prompt }));
  if (name === "get_question") {
    const q = questions.find(q => q.id === args.id);
    if (!q) throw new Error("없는 문항입니다.");
    return q;
  }
  throw new Error("지원하지 않는 도구입니다.");
}
export function describe(id, origin) {
  return { name: "book-to-exam", title: "Book To Exam", id, url: `${origin}/api/mcp/${id}`, primaryTool: "score", tools, score: "POST /api/score { essayId, answer, provider, apiKey, model }" };
}
export async function handleMcp(context, id = "public") {
  const request = context.request;
  const requestOrigin = request.headers.get("origin");
  // Agents connect from other hosts. The path ID is a label, never an authorization token.
  const headers = { "cache-control": "no-store", "access-control-allow-origin": requestOrigin || "*",
    "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id",
    "access-control-allow-methods": "GET, POST, OPTIONS", vary: "Origin" };
  const reply = (body, status = 200) => Response.json(body, { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method === "GET") {
    if (request.headers.get("accept")?.includes("text/event-stream")) {
      return new Response("event: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n\n", {
        status: 200,
        headers: { ...headers, "content-type": "text/event-stream" },
      });
    }
    return reply(describe(id, new URL(request.url).origin));
  }
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  let body;
  try { body = await request.json(); } catch {
    return reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }, 400);
  }
  if (body?.jsonrpc === "2.0") {
    const rpc = result => reply({ jsonrpc: "2.0", id: body.id, result });
    if (body.id === undefined) return new Response(null, { status: 202, headers });
    if (body.method === "initialize") return rpc({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "book-to-exam", version: "2.0.0" }, instructions: "첫 도구는 score입니다. tools/list에서 score를 찾은 뒤, essayId와 answer로 한 번 호출하고, 돌아온 기준으로 평가한 다음 assessment를 넣어 score를 다시 호출하세요.", tools });
    if (body.method === "ping") return rpc({});
    if (body.method === "tools/list") return rpc({ tools });
    if (body.method === "tools/call") {
      try {
        const result = callTool(body.params?.name, body.params?.arguments);
        return rpc({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: Array.isArray(result) ? { items: result } : result });
      } catch (error) { return rpc({ isError: true, content: [{ type: "text", text: error.message }] }); }
    }
    return reply({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
  }
  try { return reply({ ok: true, id, result: callTool(body.name || body.tool, body.arguments || body.args) }); }
  catch (error) { return reply({ ok: false, id, error: error.message }, 400); }
}
