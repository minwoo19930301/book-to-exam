import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet, onRequest } from "../functions/api/practice-bank.js";
import { getPrediction, listPredictions } from "../functions/_lib/research.js";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const subjects = ["hand-memo", "seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"];
const types = ["mc", "short", "blank", "essay", "research"];
const sourceBanks = subjects.map(subject => {
  const directory = subject === "hand-memo" ? "public/data" : `public/data/subjects/${subject}`;
  const privateDirectory = subject === "hand-memo" ? "functions/_data" : `functions/_data/subjects/${subject}`;
  return { subject, questions: read(`${directory}/questions.json`), blanks: read(`${directory}/blanks.json`), essays: read(`${privateDirectory}/essays.json`) };
});
async function request(query = "") {
  const response = onRequestGet({ request: new Request(`https://example.test/api/practice-bank${query ? `?${query}` : ""}`) });
  return { response, body: await response.json() };
}
async function allItems(query = "") {
  const first = await request(`${query}${query ? "&" : ""}pageSize=100`);
  assert.equal(first.response.status, 200);
  const items = [...first.body.items];
  for (let page = 2; page <= first.body.pageCount; page++) {
    const next = await request(`${query}${query ? "&" : ""}pageSize=100&page=${page}`);
    items.push(...next.body.items);
  }
  return { ...first.body, items };
}

test("practice bank covers every source item once, with stable pagination and subtype counts", async () => {
  const { response, body } = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 20);
  assert.equal(body.items.length, 20);
  const expected = sourceBanks.reduce((total, bank) => total + bank.questions.length + bank.blanks.length + bank.essays.length, listPredictions().length);
  assert.equal(body.total, expected);
  assert.equal(body.pageCount, Math.ceil(expected / 20));
  assert.equal(body.counts.all, expected);
  assert.equal(types.reduce((total, type) => total + body.counts[type], 0), expected);
  const all = await allItems();
  assert.equal(all.items.length, expected);
  assert.equal(new Set(all.items.map(item => `${item.subject}:${item.id}`)).size, expected);
  const repeat = await request("pageSize=100&page=2");
  assert.deepEqual(repeat.body.items, all.items.slice(100, 200));
  assert.ok(all.items.every(item => typeof item.prompt === "string" && item.prompt.length > 0 && typeof item.title === "string" && Array.isArray(item.evidence) && Array.isArray(item.sourcePages)));
});

test("each subject and type stays in scope; type counts retain the subject/query scope", async () => {
  for (const bank of sourceBanks) {
    const all = await allItems(`subject=${bank.subject}`);
    const expectedResearch = listPredictions({ subject: bank.subject }).length;
    assert.equal(all.total, bank.questions.length + bank.blanks.length + bank.essays.length + expectedResearch);
    assert.ok(all.items.every(item => item.subject === bank.subject));
    assert.equal(all.counts.short, bank.questions.filter(item => item.type !== "mc").length);
    assert.equal(all.counts.blank, bank.blanks.length);
    for (const type of types) {
      const selected = await allItems(`subject=${bank.subject}&type=${type}`);
      assert.equal(selected.total, all.counts[type]);
      assert.deepEqual(selected.counts, all.counts);
      assert.ok(selected.items.every(item => item.subject === bank.subject && item.type === type));
    }
  }
});

test("multiple choice answers, per-choice explanations and short-answer aliases are preserved", async () => {
  for (const bank of sourceBanks) {
    const items = new Map((await allItems(`subject=${bank.subject}`)).items.map(item => [item.id, item]));
    for (const original of bank.questions) {
      const item = items.get(original.id);
      assert.equal(item.answer, original.answer);
      assert.equal(item.prompt, original.prompt);
      assert.equal(item.explanation, original.explain);
      assert.deepEqual(item.choices, original.choices);
      assert.deepEqual(item.choiceExplanations, original.choiceExplanations);
      assert.deepEqual(item.acceptedAnswers, original.acceptedAnswers);
      assert.equal(item.type, original.type === "mc" ? "mc" : "short");
      assert.ok(item.sourcePages.includes(original.page));
    }
  }
});

test("passage blanks reconstruct the stored before/after text and preserve matching rules", async () => {
  for (const bank of sourceBanks) {
    const items = new Map((await allItems(`subject=${bank.subject}&type=blank`)).items.map(item => [item.id, item]));
    for (const original of bank.blanks) {
      const item = items.get(original.id);
      assert.equal(item.prompt, `${original.before}_____${original.after}`);
      assert.equal(item.answer, original.answer);
      assert.equal(item.match, original.match);
      assert.deepEqual(item.keywordGroups, original.keywordGroups);
      assert.deepEqual(item.rejectPatterns, original.rejectPatterns);
    }
  }
});

test("essay criteria retain full private rubrics; model answers are never invented", async () => {
  for (const bank of sourceBanks) {
    const items = new Map((await allItems(`subject=${bank.subject}&type=essay`)).items.map(item => [item.id, item]));
    for (const original of bank.essays) {
      const item = items.get(original.id);
      assert.deepEqual(item.criteria, original.rubric);
      assert.equal(item.modelAnswer, original.modelAnswer ?? original.answer);
      assert.equal(item.rubricVersion, original.rubricVersion);
      for (const criterion of original.rubric) for (const evidence of criterion.evidence) {
        assert.ok(item.evidence.some(value => value.page === evidence.page && value.quote === evidence.quote));
        assert.ok(item.sourcePages.includes(evidence.page));
      }
    }
  }
  const legacy = (await allItems("subject=hand-memo&type=essay")).items;
  assert.ok(legacy.every(item => !("modelAnswer" in item)));
});

test("research browsing preserves getPrediction material without faculty inventories", async () => {
  const result = await allItems("type=research");
  assert.equal(result.total, 24);
  for (const item of result.items) {
    const original = JSON.parse(JSON.stringify(getPrediction(item.id)));
    assert.equal(item.type, "research");
    for (const key of ["prompt", "modelAnswer", "criteria", "caution", "paperIds", "sourcePages", "papers", "sources", "instructions", "linkedQuestionIds", "scoreNote", "automaticExamEligible", "reviewStatus"])
      assert.deepEqual(item[key], original[key], `${item.id}: ${key}`);
    assert.ok(!("faculty" in item));
    assert.ok(!("bibliography" in item));
  }
  const first = listPredictions({ subject: "hanguksa" });
  assert.equal(first.length, 6);
  first[0].criteria[0].label = "mutated";
  assert.notEqual(listPredictions({ subject: "hanguksa" })[0].criteria[0].label, "mutated");
  assert.equal(listPredictions({ subject: "hand-memo" }).length, 0);
  assert.throws(() => listPredictions({ subject: "unknown" }));
});

test("query matches all normalized terms across public question and answer fields", async () => {
  const normal = await request(`subject=hanguksa&q=${encodeURIComponent("골품제 승진")}`);
  const decomposed = await request(`subject=hanguksa&q=${encodeURIComponent("  골품제  승진  ".normalize("NFD"))}`);
  assert.ok(normal.body.total > 0);
  assert.deepEqual(decomposed.body, normal.body);
  const onlyType = await request(`subject=hanguksa&type=mc&q=${encodeURIComponent("골품제 승진")}`);
  assert.equal(onlyType.body.total, normal.body.counts.mc);
  assert.deepEqual(onlyType.body.counts, normal.body.counts);
  const answer = await request(`subject=hand-memo&q=${encodeURIComponent("다원적 관점")}`);
  assert.ok(answer.body.items.some(item => item.id === "c-p9-term"));
  const noMatch = await request("q=zz-no-such-token-48751&page=2");
  assert.equal(noMatch.body.total, 0);
  assert.equal(noMatch.body.pageCount, 0);
  assert.equal(noMatch.body.page, 2);
  assert.deepEqual(noMatch.body.items, []);
  assert.ok(Object.values(noMatch.body.counts).every(count => count === 0));
  const literal = await request("q=%5B.*%5D");
  assert.equal(literal.response.status, 200);
  assert.equal(literal.body.total, 0);
});

test("invalid, duplicate and unknown parameters fail rather than broadening scope", async () => {
  const invalid = ["subject=", "subject=kice", "subject=../../", "type=", "type=table", "page=", "page=0", "page=-1", "page=1.5", "page=1e2", "page=01", "page=9007199254740992", "pageSize=10", "pageSize=020", "pageSize=1000", "pageSize=", "page=1&page=2", "subject=hanguksa&subject=seoyangsa", "q=a&q=b", "limit=20", `q=${"x".repeat(201)}`];
  for (const query of invalid) {
    const { response, body } = await request(query);
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(body.error, query);
    assert.ok(!("items" in body));
  }
  for (const pageSize of [20, 50, 100]) {
    const result = await request(`pageSize=${pageSize}`);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.items.length, pageSize);
  }
  const far = await request("page=9007199254740991");
  assert.equal(far.response.status, 200);
  assert.deepEqual(far.body.items, []);
  assert.equal(far.body.page, Number.MAX_SAFE_INTEGER);
});

test("unsupported methods return 405 and browsing never requires a model or environment", async () => {
  const denied = onRequest({ request: new Request("https://example.test/api/practice-bank", { method: "POST" }) });
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get("allow"), "GET");
  const response = onRequestGet({ request: new Request("https://example.test/api/practice-bank?type=research"),
    get env() { throw new Error("Browsing must not access model credentials"); } });
  assert.equal(response.status, 200);
});
