import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { getPrediction, getResearchStats, prepareResearch } from "../functions/_lib/research.js";
import { prepareExam, historyNotes } from "../functions/_lib/history.js";
import { prepareScore } from "../functions/_lib/score.js";
import { callTool, describe, handleMcp } from "../functions/_lib/mcp.js";

const subjects = ["seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"];
const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const reports = subjects.filter(subject => existsSync(new URL(`../knowledge/prediction-research/${subject}.json`, import.meta.url)))
  .map(subject => load(`../knowledge/prediction-research/${subject}.json`));
const notes = new Map(historyNotes.map(note => [note.id, note]));
const bankIds = new Set(subjects.flatMap(subject => [
  ...load(`../public/data/subjects/${subject}/questions.json`),
  ...load(`../public/data/subjects/${subject}/blanks.json`),
  ...load(`../functions/_data/subjects/${subject}/essays.json`),
].map(item => item.id)));

test("research lookup preserves authored criteria and distinguishes papers from textbook evidence", () => {
  assert.equal(reports.length, subjects.length, "every history subject needs a research report");
  for (const report of reports) {
    const paperIds = new Set(report.papers.map(paper => paper.id));
    for (const draft of report.predictions) {
      const actual = getPrediction(draft.id);
      assert.equal(actual.subject, report.subject);
      for (const key of ["prompt", "modelAnswer", "criteria", "paperIds", "evidence", "sourcePages", "caution"]) assert.deepEqual(actual[key], draft[key], `${draft.id}: ${key}`);
      assert.equal(actual.criteria.length, 3);
      assert.equal(actual.criteria.reduce((sum, item) => sum + item.max, 0), 10);
      for (const criterion of actual.criteria) {
        const weights = criterion.checkpoints.map(checkpoint => typeof checkpoint === "string" ? 1 : checkpoint.points);
        assert.ok(weights.every(weight => Number.isInteger(weight) && weight > 0), `${draft.id}: positive checkpoint weights`);
        assert.equal(weights.reduce((sum, weight) => sum + weight, 0), criterion.max, `${draft.id}: checkpoint total`);
        const possibleScores = weights.reduce((scores, weight) => new Set([...scores, ...[...scores].map(score => score + weight)]), new Set([0]));
        assert.deepEqual([...possibleScores].sort((a, b) => a - b), criterion.allowedScores, `${draft.id}: reachable partial scores`);
      }
      assert.equal(actual.automaticExamEligible, false);
      assert.match(actual.textbookEvidenceRole, /not evidence for the paper/);
      for (const id of actual.paperIds) assert.ok(paperIds.has(id), id);
      assert.deepEqual(actual.papers.map(paper => paper.id), actual.paperIds);
      for (const paper of actual.papers) {
        assert.equal(paper.subject, report.subject);
        assert.equal(paper.readScope, report.papers.find(item => item.id === paper.id).readScope);
        assert.ok(paper.url.startsWith("https://"));
      }
      for (const evidence of actual.evidence) {
        const note = notes.get(evidence.page);
        assert.equal(note.subject, report.subject);
        assert.ok(note.text.includes(evidence.quote), draft.id);
      }
      for (const id of actual.linkedQuestionIds) assert.ok(bankIds.has(id), `${draft.id}: ${id}`);
      for (const source of actual.sources) {
        const url = new URL(source.url, "https://study.test");
        assert.equal(url.pathname, "/viewer");
        assert.equal(url.searchParams.get("subject"), report.subject);
        assert.equal(url.searchParams.get("page"), source.id);
      }
      assert.equal(bankIds.has(draft.id), false);
      assert.throws(() => prepareScore(draft.id, "답안"), "research drafts must not silently enter registered essay scoring");
    }
  }
});

test("prepare_exam adds bounded research without losing subject scope or source provenance", () => {
  for (const report of reports) {
    const draft = report.predictions[0];
    const prepared = prepareExam({ query: draft.title, subject: report.subject });
    assert.ok(["review_required", "research_only_review_required"].includes(prepared.status));
    const research = prepared.research;
    assert.ok(research.predictions.some(item => item.id === draft.id));
    assert.ok(research.predictions.length <= 3);
    assert.ok(research.papers.length <= 6);
    for (const item of research.predictions) {
      assert.equal(item.subject, report.subject);
      assert.equal("modelAnswer" in item, false, "full scoring context is a separate lookup");
      assert.equal("criteria" in item, false);
      assert.equal(item.automaticExamEligible, false);
      assert.ok(item.prompt.length <= research.limits.promptCharacters);
      assert.deepEqual(item.fullTextTool, { name: "get_prediction", arguments: { id: item.id } });
    }
    for (const paper of research.papers) {
      assert.equal(paper.subject, report.subject);
      assert.ok(paper.summary.length <= research.limits.summaryCharacters);
    }
    assert.match(research.instructions.join("\n"), /출제위원/);
    assert.match(research.instructions.join("\n"), /서지 수집과 내용 검토/);
  }
});

test("research selection reports omissions and respects no-match and hand-memo cases", () => {
  const researchOnly = prepareExam({ query: "칠레", subject: "seoyangsa" });
  assert.deepEqual(researchOnly.knowledge, []);
  assert.equal(researchOnly.status, "research_only_review_required");
  assert.ok(researchOnly.research.papers.length > 0);
  const sourceIds = reports.flatMap(report => report.predictions.flatMap(item => item.sourcePages));
  const found = prepareResearch({ query: "not-a-lexical-match", sourceIds });
  assert.equal(found.predictions.length, 3);
  assert.equal(found.predictions.length + found.omittedPredictionIds.length, reports.reduce((sum, report) => sum + report.predictions.length, 0));
  assert.equal(new Set([...found.predictions.map(item => item.id), ...found.omittedPredictionIds]).size, reports.reduce((sum, report) => sum + report.predictions.length, 0));
  for (const subject of [undefined, "hand-memo"]) {
    const absent = prepareResearch({ query: "자료없는검색어123456", subject });
    assert.equal(absent.status, "no_matching_research");
    assert.deepEqual(absent.predictions, []);
    assert.deepEqual(absent.papers, []);
  }
  assert.deepEqual(getResearchStats({ subject: "hand-memo" }).totals, { faculty: 0, papers: 0, predictions: 0, coreReviewed: 0 });
});

test("research stats separate metadata, abstract and partial text reviews", () => {
  const stats = getResearchStats();
  assert.equal(stats.totals.predictions, reports.reduce((sum, report) => sum + report.predictions.length, 0));
  assert.equal(stats.totals.papers, reports.reduce((sum, report) => sum + report.papers.length, 0));
  for (const row of stats.reports) {
    assert.equal(Object.values(row.readScopes).reduce((sum, count) => sum + count, 0), row.papers);
    assert.deepEqual(getResearchStats({ subject: row.subject }).reports, [row]);
  }
  const western = stats.reports.find(row => row.subject === "seoyangsa");
  assert.ok(western.readScopes.metadata > 0, "bibliography-only rows must not count as read abstracts");
  assert.equal(western.readScopes["abstract-excerpt"], 3);
  assert.equal(western.readScopes.abstract, 21);
  assert.equal(western.coreReviewed, 19);
  const eastern = stats.reports.find(row => row.subject === "dongyangsa");
  assert.equal(eastern.readScopes.abstract, 15);
  assert.equal(eastern.readScopes.excerpt, 1);
  assert.equal(eastern.readScopes.fulltext, 0);
  const korean = stats.reports.find(row => row.subject === "hanguksa");
  assert.equal(korean.readScopes.abstract, 20);
  assert.equal(korean.coreReviewed, 20);
  const paper = getPrediction("hanguksa-pred-silla-inscription").papers[0];
  assert.equal(paper.authors, "하일식");
  assert.equal(paper.year, "2023");
  assert.match(paper.authorScope, /selected-faculty-only/);
  assert.match(stats.countNote, /서지 파일/);
});

test("research APIs are deterministic, reject invalid IDs and do not expose mutable shared records", () => {
  for (const args of [{}, { query: " " }, { query: "x".repeat(201) }, { query: "역사", subject: "../../secret" }]) assert.throws(() => prepareResearch(args));
  for (const id of [undefined, "", "missing", "x".repeat(201)]) assert.throws(() => getPrediction(id));
  assert.throws(() => getResearchStats({ subject: "kice" }));
  const id = reports[0].predictions[0].id;
  const before = getPrediction(id);
  const edited = getPrediction(id);
  edited.criteria[0].max = 999;
  edited.papers[0].title = "mutated";
  assert.deepEqual(getPrediction(id), before);
  assert.deepEqual(callTool("get_prediction", { id }), before);
  assert.deepEqual(callTool("get_research_stats"), getResearchStats());
});

test("MCP advertises and serves research lookups with structured errors", async () => {
  const tools = describe("public", "https://study.test").tools;
  for (const name of ["get_prediction", "get_research_stats"]) assert.equal(tools.find(tool => tool.name === name).annotations.readOnlyHint, true);
  for (const [id, expectedError] of [[reports[0].predictions[0].id, false], ["missing", true]]) {
    const request = new Request("https://study.test/api/mcp/public", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_prediction", arguments: { id } } }) });
    const response = await handleMcp({ request });
    const { result } = await response.json();
    assert.equal(Boolean(result.isError), expectedError);
    if (!expectedError) assert.equal(result.structuredContent.id, id);
  }
});
