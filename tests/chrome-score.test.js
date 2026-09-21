import test from "node:test";
import assert from "node:assert/strict";
import { gradeWithChrome } from "../src/chrome-score.js";
import { onRequestPost } from "../functions/api/score.js";

const answer = "구체적인 역사적 사실과 역사학의 성격 및 연구 방법을 함께 배운다.";
async function api(body) {
  return onRequestPost({ request: new Request("https://example.test/api/score", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), env: {} });
}
function assessment(context) {
  return { items: context.rubric.map(r => ({ id: r.id, score: r.max, comment: "기준 확인", studentQuote: answer, evidence: r.evidence })), feedback: "연습용 평가" };
}
test("Canary 추론 전후 동일 API 호출, 키 없이 서버 기준 검증 및 모델 해제", async () => {
  const events = [];
  let prepared;
  const result = await gradeWithChrome({ essayId: "e1", answer,
    request: async (url, options) => {
      assert.equal(url, "/api/score");
      const body = JSON.parse(options.body);
      assert.equal(body.apiKey, undefined);
      events.push(body.mode);
      const response = await api(body);
      if (body.mode === "browser-prepare") prepared = await response.clone().json();
      return response;
    },
    languageModel: { create: async () => {
      events.push("create");
      return { prompt: async () => { events.push("infer"); const index = events.filter(e => e === "infer").length - 1; return JSON.stringify({ score: prepared.rubric[index].max, comment: "기준 확인", quoteIndex: 1 }); }, destroy: () => events.push("destroy") };
    } },
  });
  assert.equal(result.total, 10);
  assert.deepEqual(events, ["create", "browser-prepare", "infer", "infer", "infer", "browser-finalize", "destroy"]);
});
test("브라우저가 조작한 기준·점수·인용과 구버전 평가를 서버에서 거부", async () => {
  const context = await (await api({ mode: "browser-prepare", essayId: "e1", answer })).json();
  for (const mutate of [x => x.items[0].score = 999, x => x.items[0].studentQuote = "없는 답안", x => x.items[0].evidence[0].quote = "가짜 교재 인용"]) {
    const value = assessment(context); mutate(value);
    const response = await api({ mode: "browser-finalize", essayId: "e1", answer, rubricVersion: context.rubricVersion, assessment: value, rubric: [] });
    assert.equal(response.status, 400);
  }
  assert.equal((await api({ mode: "browser-finalize", essayId: "e1", answer, rubricVersion: "old", assessment: assessment(context) })).status, 400);
});
test("미지원·중단 시 유료 모델 호출 없이 종료", async () => {
  let requests = 0;
  await assert.rejects(gradeWithChrome({ essayId: "e1", answer, languageModel: {}, request: async () => { requests++; } }), /Canary/);
  assert.equal(requests, 0);
  const controller = new AbortController(); let destroyed = 0;
  await assert.rejects(gradeWithChrome({ essayId: "e1", answer, signal: controller.signal,
    languageModel: { create: async () => { controller.abort(); return { destroy() { destroyed++; } }; } },
    request: async () => { requests++; },
  }), { name: "AbortError" });
  assert.equal(destroyed, 1); assert.equal(requests, 0);
});
