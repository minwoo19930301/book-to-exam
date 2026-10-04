import { prepareScore, finalizeScore, publicEssays } from "./score.js";
import memoNotes from "../../public/data/notes.json" with { type: "json" };
import memoQuestions from "../../public/data/questions.json" with { type: "json" };

import { subjects, historyNotes, historyQuestions, searchKnowledge, getKnowledge, searchExamSources, getExamSource, prepareExam, viewerUrl } from "./history.js";
import { getPrediction, getResearchStats } from "./research.js";
const notes = [...memoNotes, ...historyNotes];
const questions = [...memoQuestions, ...historyQuestions];
const forSubject = (rows, subject = "hand-memo") => rows.filter(row => (row.subject || "hand-memo") === subject);
const subjectSchema = { type: "string", description: "hand-memo, seoyangsa, hanguksa, dongyangsa, gyoyukron. 생략 시 손글씨 메모." };

const objectSchema = properties => ({ type: "object", properties, additionalProperties: false });
const tools = [
  { name: "score", description: "서술형 채점의 시작과 검증. 먼저 essayId와 answer만 보내면 문항·저장된 채점 기준·뷰어 근거를 준다. 그 자료만으로 평가한 뒤 같은 도구에 assessment({items,feedback})를 넣어 다시 호출하면 점수를 검증한다. get_essay만으로 채점하지 않는다.",
    inputSchema: { ...objectSchema({
      essayId: { type: "string", description: "서술형 문항 ID. 예: e1" },
      answer: { type: "string", description: "학생 답안" },
      assessment: { type: "object", description: "두 번째 호출에만 넣습니다. {items, feedback}" },
    }), required: ["essayId", "answer"] } },
  { name: "list_subjects", description: "학습 과목과 자료 수", inputSchema: objectSchema({}) },
  { name: "prepare_exam", description: "새 문항 출제를 준비하는 읽기 전용 근거 묶음. 압축 Markdown 최대 3개, 원문 발췌·실제 그림·검토된 기출과 연구 예상문항 최대 3개·논문 요약 최대 6개를 준다. 생략 범위와 논문 읽은 수준을 명시한다. 교수의 출제위원 여부나 출제 확률을 추정하지 않으며 문항 자동 등록은 하지 않는다.", inputSchema: { ...objectSchema({ query: { type: "string", minLength: 1, maxLength: 200 }, subject: { ...subjectSchema, description: "과목 ID. 생략하면 손글씨 메모를 포함한 모든 과목에서 준비합니다." }, limit: { type: "integer", minimum: 1, maximum: 3, default: 3 } }), required: ["query"] } },
  { name: "get_prediction", description: "연구 기반 예상 서술형의 지문·모범답안·3개 자체 채점 요소·논문 읽은 범위와 교재 근거를 함께 조회한다. 논문 요약은 원문 직접 인용이 아니며 기존 score 도구의 등록 문항과 구별한다.", inputSchema: { ...objectSchema({ id: { type: "string", minLength: 1, maxLength: 200 } }), required: ["id"] } },
  { name: "get_research_stats", description: "과목별 공개 연구 검토의 자료 수와 읽은 범위별 집계. 서지 수집 수와 논문 내용 검토 수를 구분하며 출제위원 후보 명단이나 출제 확률을 제공하지 않는다.", inputSchema: objectSchema({ subject: { ...subjectSchema, description: "과목 ID. 생략하면 모든 과목의 연구 집계를 반환합니다." } }) },
  { name: "search_knowledge", description: "내부 출제용 압축 Markdown KB에서 선별한 핵심·비교·함정·출제 보류 항목을 검색한다. priority는 편집상 중요도이며 출제 빈도/확률이 아니다. 필요한 문서만 get_knowledge로 읽고 정답·그림은 get_note의 원문으로 확인한다.", inputSchema: { ...objectSchema({ query: { type: "string", maxLength: 200 }, subject: { ...subjectSchema, description: "과목 ID. 생략하면 손글씨 메모를 포함한 모든 과목을 검색합니다." }, limit: { type: "integer", minimum: 1, maximum: 20 } }), required: ["query"] } },
  { name: "get_knowledge", description: "출제에 필요한 핵심만 선별한 짧은 Markdown 문서와 근거 원문 IDs를 조회한다. 출제 판단·구별/함정·보류 사유를 함께 읽는다. 원문 전체를 대신하지 않으며 사용자용 위키 화면은 없다.", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
  { name: "search_exam_sources", description: "평가원 기출의 수집된 면 단위 텍스트 검색. 공식 정답이나 문항별 해설을 제공하는 도구가 아니다.", inputSchema: { ...objectSchema({ query: { type: "string", maxLength: 200 }, limit: { type: "integer", minimum: 1, maximum: 20 } }), required: ["query"] } },
  { name: "get_exam_source", description: "평가원 기출 면 단위 원문과 문서 출처. 다단 순서, 전사, 문항 경계는 검수 전일 수 있다.", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
  { name: "list_notes", description: "과목별 뷰어 페이지 목록", inputSchema: objectSchema({ subject: subjectSchema }) },
  { name: "get_note", description: "뷰어 원문·실제 그림·전사 검수 상태와 페이지 링크. 그림은 src를 직접 열어 확인한다.", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
  { name: "list_essays", description: "과목별 서술형 문항 목록. 채점은 score를 사용한다.", inputSchema: objectSchema({ subject: subjectSchema }) },
  { name: "get_essay", description: "서술형 문항만 조회한다. 채점 기준과 근거는 score가 함께 준비한다.", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
  { name: "list_questions", description: "과목별 객관식·단답형 문항 목록", inputSchema: objectSchema({ subject: subjectSchema }) },
  { name: "get_question", description: "문항 조회", inputSchema: { ...objectSchema({ id: { type: "string" } }), required: ["id"] } },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

export function callTool(name, args = {}) {
  if (name === "score") {
    const context = prepareScore(args.essayId, args.answer);
    if (args.assessment) return finalizeScore(context, args.assessment);
    return { status: "assessment_required", ...context,
      next: "이 자료만으로 평가하고, 같은 score 도구를 essayId, answer, assessment와 함께 다시 호출하세요. 검증 전에는 점수를 확정하지 마세요." };
  }
  if (name === "list_subjects") return subjects;
  if (name === "prepare_exam") return prepareExam(args);
  if (name === "get_prediction") return getPrediction(args.id);
  if (name === "get_research_stats") return getResearchStats(args);
  if (name === "search_knowledge") return searchKnowledge(args);
  if (name === "get_knowledge") return getKnowledge(args.id);
  if (name === "search_exam_sources") return searchExamSources(args);
  if (name === "get_exam_source") return getExamSource(args.id);
  if (name === "list_notes") return forSubject(notes, args.subject).map(({ id, title }) => ({ id, title }));
  if (name === "get_note") {
    const note = notes.find(n => n.id === args.id);
    if (!note) throw new Error("없는 페이지입니다.");
    return { id: note.id, subject: note.subject || "hand-memo", title: note.title, text: note.text, url: viewerUrl(note), source: note.source, quality: note.quality, figures: note.figures || [] };
  }
  if (name === "list_essays") return publicEssays(args.subject);
  if (name === "get_essay") {
    const essay = publicEssays("all").find(e => e.id === args.id);
    if (!essay) throw new Error("없는 문항입니다.");
    return essay;
  }
  if (name === "list_questions") return forSubject(questions, args.subject).map(({ id, type, prompt }) => ({ id, type, prompt }));
  if (name === "get_question") {
    const q = questions.find(q => q.id === args.id);
    if (!q) throw new Error("없는 문항입니다.");
    return q;
  }
  throw new Error("지원하지 않는 도구입니다.");
}
export function describe(id, origin) {
  return { name: "book-to-exam", title: "Book To Exam", id, url: `${origin}/api/mcp/${id}`, primaryTool: "score", authoringTool: "prepare_exam", tools, score: "POST /api/score { essayId, answer, provider, apiKey, model }" };
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
    if (body.method === "initialize") return rpc({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "book-to-exam", version: "2.0.0" }, instructions: "새 문항 출제는 prepare_exam(query, subject, limit)으로 압축 KB와 원문 근거 묶음을 준비하세요. 반환된 출제 판단·보류 사유·생략 범위를 읽고 필요한 원문과 실제 그림을 추가 확인한 뒤 정답·선지·채점 기준의 근거를 남기세요. 문항은 자동 생성·등록되지 않습니다. research의 예상문항은 get_prediction(id)으로 모범답안·채점 요소·논문 읽은 범위를 함께 조회하고, 교수를 출제위원 후보로 단정하지 마세요. 기존 등록 서술형 채점은 score(essayId, answer)를 먼저 호출하고, 돌아온 기준으로 평가한 다음 assessment를 넣어 score를 다시 호출하세요. 검증 전에는 점수를 확정하지 마세요.", tools });
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
