import test from "node:test";
import assert from "node:assert/strict";
import { getResearchAnalysis, getResearchStats, getPrediction } from "../functions/_lib/research.js";
import { onRequestGet, onRequest } from "../functions/api/research.js";

const request = query => onRequestGet({ request: new Request(`https://study.test/api/research${query}`) });

test("public research joins verified authors, bibliography and authored questions without examiner rankings", async () => {
  const response = request("");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.counts.faculty, getResearchStats().totals.faculty);
  assert.equal(data.counts.papers, getResearchStats().totals.papers);
  assert.equal(data.counts.predictions, getResearchStats().totals.predictions);
  assert.ok(data.counts.bibliography > data.counts.papers);
  const faculty = new Map(data.faculty.map(person => [person.id, person]));
  const papers = new Map(data.papers.map(paper => [`${paper.subject}:${paper.id}`, paper]));
  for (const person of faculty.values()) {
    assert.ok(person.id.startsWith(`${person.subject}:`));
    assert.equal(person.role, "공개 연구 참고 인물");
    assert.ok(person.profileUrls.length > 0);
    assert.ok(person.profileUrls.every(url => url.startsWith("https://")));
    assert.match(person.examinerStatus, /추정하지 않음/);
    assert.equal("probability" in person, false);
    assert.equal("level" in person, false);
    for (const id of person.paperIds) assert.ok(papers.get(`${person.subject}:${id}`).facultyIds.includes(person.id));
  }
  for (const paper of data.papers) for (const id of paper.facultyIds) assert.equal(faculty.get(id).subject, paper.subject);
  for (const item of data.predictions) {
    assert.deepEqual(item, JSON.parse(JSON.stringify(getPrediction(item.id))));
    for (const id of item.paperIds) assert.ok(papers.has(`${item.subject}:${id}`));
  }
  const unreviewed = data.bibliography.find(row => !row.reviewPaperId);
  assert.ok(unreviewed);
  assert.equal(unreviewed.contentReviewScope, null);
  assert.match(unreviewed.caution, /수집 서지/);
  assert.match(data.limitations.join(" "), /실제 출제 확률/);
});

test("research subject and public faculty filters preserve linked evidence and empty-search behavior", () => {
  const all = getResearchAnalysis();
  for (const person of all.faculty) {
    const result = getResearchAnalysis({ subject: person.subject, facultyId: person.id });
    assert.equal(result.faculty.length, 1);
    assert.equal(result.faculty[0].id, person.id);
    for (const paper of result.papers) assert.equal(paper.subject, person.subject);
    for (const item of result.predictions) assert.ok(item.facultyIds.includes(person.id));
    assert.ok(getResearchAnalysis({ subject: person.subject, query: person.name }).faculty.some(row => row.id === person.id));
  }
  const absent = getResearchAnalysis({ query: "존재하지않는검색어XYZ987" });
  assert.deepEqual(absent.counts, { faculty: 0, papers: 0, bibliography: 0, topics: 0, predictions: 0 });
  const item = all.predictions[0];
  const result = getResearchAnalysis({ subject: item.subject, query: item.title });
  assert.ok(result.predictions.some(row => row.id === item.id));
  for (const id of item.paperIds) assert.ok(result.papers.some(paper => paper.id === id));
  result.predictions[0].criteria[0].max = 999;
  assert.notEqual(getPrediction(result.predictions[0].id).criteria[0].max, 999);
});

test("research endpoint strictly rejects unsupported, repeated and cross-subject parameters", async () => {
  for (const query of ["?subject=hand-memo", "?subject=missing", "?q=a&q=b", "?page=1", "?facultyId=missing",
    "?subject=hanguksa&facultyId=seoyangsa:kim", `?q=${"a".repeat(201)}`]) {
    const response = request(query);
    assert.equal(response.status, 400, query);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.ok((await response.json()).error);
  }
  const denied = onRequest();
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get("allow"), "GET");
});

test("all 120 authored research exercises retain editorial levels and transparent evidence gaps", () => {
  const data = getResearchAnalysis();
  assert.equal(data.predictions.length, 120);
  const rank = { 중: 1, 중상: 2, 상: 3 };
  for (const subject of ["seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"]) {
    const rows = data.predictions.filter(item => item.subject === subject);
    assert.equal(rows.length, 30);
    assert.equal(rows.filter(item => item.id.includes("-expanded-")).length, 24);
    assert.deepEqual(new Set(rows.map(item => item.forecast.level)), new Set(["상", "중상", "중"]));
    for (const item of rows) {
      assert.match(item.forecast.label, /편집적 판단/);
      assert.ok(item.forecast.basis.length >= 2);
      assert.ok(item.forecast.limitations.length >= 2);
      assert.equal("probability" in item.forecast, false);
      assert.ok(item.papers.every(paper => paper.reviewClass !== "metadata"));
      if (item.id.includes("-expanded-")) {
        for (const [index, criterion] of item.criteria.entries()) assert.ok(item.prompt.includes(`${index + 1}. ${criterion.label}`));
        for (const entry of item.sourceReadScopes) assert.equal(entry.scope, item.papers.find(paper => paper.id === entry.paperId).readScope);
      }
    }
  }
  for (const topic of data.topics) {
    const rows = data.predictions.filter(item => topic.predictionIds.includes(item.id));
    assert.equal(rank[topic.level], Math.max(...rows.map(item => rank[item.forecast.level])));
    assert.ok(topic.rationale.length && topic.limitations.length);
    assert.ok(rows.every(item => item.subject === topic.subject));
  }
  const gaps = data.predictions.filter(item => item.evidence.length === 0);
  assert.equal(gaps.length, 4);
  for (const item of gaps) {
    assert.deepEqual(item.sourcePages, []);
    assert.deepEqual(item.sources, []);
    assert.match(item.forecast.basis.join(" "), /직접 대응하는 교재 근거는 확인하지 못해/);
    assert.ok(item.papers.length > 0, "paper support is retained even when no direct textbook evidence was found");
  }
});
