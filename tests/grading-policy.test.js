import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareScore, finalizeScore } from "../functions/_lib/score.js";
import { gradeBody } from "../functions/_lib/grade.js";

test("practice scoring only accepts the declared point scale and carries a versioned policy", () => {
  const context = prepareScore("e1", "구체적인 역사적 사실과 역사학의 연구 방법을 함께 가르친다.");
  assert.match(context.rubricVersion, /\+2026-10-03\.grading\.2$/);
  assert.equal(context.gradingGuide.officialExamRubric, false);
  const assessment = { items: context.rubric.map(r => ({ id: r.id, score: r.max, comment: "요구 의미를 설명했다.", studentQuote: context.answer, evidence: r.evidence })), feedback: "연습 채점" };
  assert.equal(finalizeScore(context, assessment).total, 10);
  assessment.items[0].score = 0.5;
  assert.throws(() => finalizeScore(context, assessment), /부분점수 단위/);
  assessment.items[0].score = 1;
  assert.equal(finalizeScore(context, assessment).items[0].score, 1);
});

test("academy-informed rules cite inspected documents rather than unviewed video listings", () => {
  const policy = prepareScore("e1", "답안").gradingGuide;
  const registry = ["parkmgak", "academies"].flatMap(name => JSON.parse(readFileSync(new URL(`../knowledge/grading-research/${name}-sources.json`, import.meta.url))).sources);
  for (const rule of policy.rules) for (const id of rule.sourceIds) {
    const source = registry.find(item => item.id === id);
    assert.ok(source, id);
    assert.ok(source.evidence?.length || source.directlyRead?.length, id);
    assert.notEqual(source.officialExamRubric, true);
  }
});

test("API graders receive the same source-scoped guidance and canonical rubric as MCP preparation", async () => {
  const original = globalThis.fetch;
  const context = prepareScore("e1", "구체적인 사실과 역사학 연구 방법을 함께 배운다.");
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ items: context.rubric.map(r => ({ id: r.id, score: 0, comment: "이 항목의 요구를 충족하지 못했다.", studentQuote: "", evidence: r.evidence })), feedback: "기준별 보완이 필요하다." }) } }] });
  };
  try {
    await gradeBody({ essayId: "e1", answer: context.answer, provider: "openai", apiKey: "test-only", model: "test-model" }, {});
    const input = JSON.parse(payload.messages[1].content);
    assert.deepEqual(input.gradingGuide, context.gradingGuide);
    assert.deepEqual(input.rubric, context.rubric);
    assert.ok(input.sources.every(source => source.text && source.page));
    assert.ok(context.gradingGuide.rules.every(rule => payload.messages[0].content.includes(rule.text)));
  } finally { globalThis.fetch = original; }
});
