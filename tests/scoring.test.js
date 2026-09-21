import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreLocal } from "../shared/scoring.js";
import { prepareScore, finalizeScore, publicEssays } from "../functions/_lib/score.js";
import { callTool, handleMcp } from "../functions/_lib/mcp.js";
import { extractJSON, gradeBody } from "../functions/_lib/grade.js";
const blanks = JSON.parse(readFileSync(new URL("../public/data/blanks.json", import.meta.url)));
const notes = JSON.parse(readFileSync(new URL("../public/data/notes.json", import.meta.url)));
const q = { type: "short", answer: "다원적 관점", accept: ["여러 관점"] };

test("단답형은 정확한 용어만 인정하고 부분 문자열·유사어는 거부", () => {
  assert.equal(scoreLocal(q, "다원적 관점").good, true);
  assert.equal(scoreLocal(q, " 다원적관점 ").good, true);
  for (const answer of ["", "관점", "다원적", "여러 관점", "다원적 관점이 아니다", "다원적 관점들"]) assert.equal(scoreLocal(q, answer).good, false, answer);
});
test("객관식 미선택은 0번 선택으로 처리되지 않음", () => {
  assert.equal(scoreLocal({ type: "mc", answer: 0 }, "").good, false);
  assert.equal(scoreLocal({ type: "mc", answer: 0 }, 0).good, true);
});
test("원문 빈칸: 개념어 정확 일치, 문장 핵심어와 모순 판정", () => {
  const term = blanks.find(x => x.id === "c-p9-term");
  const sentence = blanks.find(x => x.id === "c-p9-sentence");
  assert.equal(scoreLocal(term, "다원적 관점").good, true);
  assert.equal(scoreLocal(term, "여러 관점").good, false);
  assert.equal(scoreLocal(sentence, "학습자 사이의 역사적 인식이나 견해가 서로 충돌하는 것이다").good, true);
  assert.equal(scoreLocal(sentence, "학생들의 역사관 대립").good, true);
  assert.equal(scoreLocal(sentence, "학생 간 토론").good, false);
  assert.equal(scoreLocal(sentence, "학습자 역사 인식 견해 충돌이 아니다").good, false);
  for (const b of blanks) {
    const source = notes.find(n => n.id === b.page).text.replace(/\*\*/g, "");
    assert.ok(source.includes(b.before + b.answer + b.after), b.id);
    assert.equal(scoreLocal(b, b.answer).good, true, b.id);
  }
});
function assessment(context) {
  return { items: context.rubric.map(r => ({ id: r.id, score: r.max, comment: "제시된 핵심 의미를 답안에서 확인했습니다.", studentQuote: context.answer, evidence: r.evidence })), feedback: "핵심 개념을 설명했습니다." };
}
test("모든 사전 기준의 인용이 해당 뷰어에 존재하고 공개 목록에는 기준 없음", () => {
  for (const essay of publicEssays()) {
    assert.equal(essay.rubric, undefined);
    const prepared = prepareScore(essay.id, "테스트 답안");
    assert.ok(prepared.sources.length);
    assert.equal(prepared.rubric.length, 3);
  }
  const published = JSON.parse(readFileSync(new URL("../public/data/essays.json", import.meta.url)));
  assert.deepEqual(published, publicEssays());
});
test("최종 점수는 서버 기준으로 합산; 가짜 인용·답안·중복·범위 초과 거부", () => {
  const context = prepareScore("e5", "다양한 관점을 체험하고 자료를 분석·해석하며 학습자 간 견해의 충돌을 다룬다.");
  const valid = assessment(context);
  const result = finalizeScore(context, { ...valid, total: 999, max: 999 });
  assert.equal(result.total, 10); assert.equal(result.max, 10);
  assert.equal(result.items[0].evidence[0].url, "/viewer?page=p9");
  for (const mutate of [
    a => a.items[0].score = 99,
    a => a.items[0].score = -1,
    a => a.items[0].evidence[0].quote = "뷰어에 없는 내용",
    a => a.items[0].studentQuote = "학생이 쓰지 않은 문장",
    a => a.items[0].studentQuote = "",
    a => a.items[1].id = a.items[0].id,
    a => a.items.pop(),
  ]) { const a = structuredClone(valid); mutate(a); assert.throws(() => finalizeScore(context, a)); }
});
test("MCP score 준비와 완료가 동일 기준·근거를 사용", () => {
  const args = { essayId: "e1", answer: "구체적 사실과 역사학 연구 방법을 함께 배운다." };
  const prepared = callTool("score", args);
  assert.equal(prepared.status, "assessment_required");
  const result = callTool("score", { ...args, assessment: assessment(prepared) });
  assert.equal(result.status, "scored");
  assert.equal(result.total, 10);
  assert.equal(callTool("get_essay", { id: "e1" }).rubric, undefined);
});
test("MCP 초기화·도구 목록·오류·알림은 JSON-RPC로 응답", async () => {
  async function rpc(body, origin) {
    return handleMcp({ request: new Request("https://example.test/api/mcp/demo", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }) });
  }
  const init = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).json();
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.tools[0].name, "score");
  const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
  assert.equal(list.result.tools[0].name, "score");
  assert.ok(list.result.tools[0].inputSchema.required.includes("answer"));
  const sse = await handleMcp({ request: new Request("https://example.test/api/mcp/demo", { method: "GET", headers: { accept: "text/event-stream", origin: "https://untrusted.test" } }) });
  assert.equal(sse.status, 200);
  const bad = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "score", arguments: { essayId: "bad", answer: "x" } } })).json();
  assert.equal(bad.result.isError, true);
  assert.equal((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "https://untrusted.test")).status, 200);
});
test("API도 공통 score를 사용하고 클라이언트의 조작된 기준을 무시", async () => {
  const original = globalThis.fetch;
  const context = prepareScore("e1", "구체적 역사 사실과 연구 방법");
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify(assessment(context)) } }] });
  };
  try {
    const result = await gradeBody({ provider: "openai", apiKey: "test-only", model: "gpt-4o-mini", essay: { id: "e1", rubric: [{ max: 999, ok: "fake" }] }, answer: context.answer }, {});
    assert.equal(result.max, 10);
    const input = JSON.parse(sent.messages[1].content);
    assert.equal(input.rubric[0].max, 3); assert.ok(input.sources[0].text.includes("1차개념"));
    assert.equal(sent.model, "gpt-4o-mini");
  } finally { globalThis.fetch = original; }
});
test("모델 JSON은 뒤 콤마와 빠진 콤마를 고쳐 읽는다", () => {
  const parsed = extractJSON("```json\n{\"items\":[{\"id\":\"a\"}\n{\"id\":\"b\",}],\"feedback\":\"ok\",}\n```");
  assert.deepEqual(parsed, { items: [{ id: "a" }, { id: "b" }], feedback: "ok" });
});
