import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { subjects, historyNotes, historyKnowledge, historyQuestions, historyEssays, searchKnowledge, getKnowledge, prepareExam } from "../functions/_lib/history.js";
import { prepareScore, finalizeScore, publicEssays } from "../functions/_lib/score.js";
import { callTool, describe, handleMcp } from "../functions/_lib/mcp.js";
import { scoreLocal } from "../shared/scoring.js";

const ids = ["seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"];
const allSubjects = ["hand-memo", ...ids];
const dataUrl = (subject, name) => new URL(`../public/data/${subject === "hand-memo" ? "" : `subjects/${subject}/`}${name}.json`, import.meta.url);
const load = (subject, name) => JSON.parse(readFileSync(dataUrl(subject, name)));
const memoNotes = load("hand-memo", "notes").map(note => ({ ...note, subject: "hand-memo" }));
const notesById = new Map([...memoNotes, ...historyNotes].map(note => [note.id, note]));
const examIds = new Set(load("kice", "pages").map(page => page.id));
const metadataPattern = /^<!-- kb: (\{.*\}) -->$/gm;

function assertViewerUrl(value, subject, page) {
  const url = new URL(value, "https://study.test");
  assert.equal(url.pathname, "/viewer");
  assert.equal(url.searchParams.get("subject"), subject);
  assert.equal(url.searchParams.get("page"), page);
}

test("subject banks keep source-backed questions while internal knowledge is compiled from compact Markdown", () => {
  assert.equal(new Set(historyNotes.map(n => n.id)).size, historyNotes.length);
  assert.equal(new Set(historyKnowledge.map(n => n.id)).size, historyKnowledge.length);
  assert.equal(new Set(historyQuestions.map(n => n.id)).size, historyQuestions.length);
  for (const subject of allSubjects) {
    assert.equal(existsSync(dataUrl(subject, "wiki")), false, "the internal KB must not have a public wiki JSON export");
    const manifest = subjects.find(item => item.id === subject);
    assert.ok(manifest, subject);
    assert.equal("wiki" in manifest.counts, false);
    assert.equal(manifest.counts.knowledge, historyKnowledge.filter(entry => entry.subject === subject).length);
    assert.ok(manifest.counts.knowledge > 0, subject);
  }
  for (const entry of historyKnowledge) {
    assert.equal(entry.kind, "curated-topic", entry.id);
    assert.ok(entry.id.startsWith(`kb-${entry.subject}-`), entry.id);
    assert.match(entry.path, /^knowledge\/compact\/(hand-memo|seoyangsa|hanguksa|dongyangsa|gyoyukron)\/[^/]+\.md$/);
    const markdown = readFileSync(new URL(`../${entry.path}`, import.meta.url), "utf8");
    const matches = [...markdown.matchAll(metadataPattern)];
    assert.equal(matches.length, 1, entry.path);
    const meta = JSON.parse(matches[0][1]);
    for (const key of ["id", "title", "subject", "sourceIds", "examIds", "priority"]) assert.deepEqual(entry[key], meta[key], `${entry.id}: ${key}`);
    assert.equal(entry.text, markdown.replace(metadataPattern, "").trim(), entry.id);
    assert.equal(entry.automaticExamEligible, false);
    assert.ok(["core", "support"].includes(entry.priority));
    assert.ok(entry.sourceIds.length > 0);
    assert.equal(new Set(entry.sourceIds).size, entry.sourceIds.length);
    assert.equal(entry.page, entry.sourceIds[0]);
    assert.deepEqual(entry.sources.map(source => source.id), entry.sourceIds);
    assert.deepEqual(entry.source, notesById.get(entry.page)?.source ?? null);
    for (const source of entry.sources) {
      const note = notesById.get(source.id);
      assert.ok(note, `${entry.id}: ${source.id}`);
      assert.equal(note.subject, entry.subject);
      assert.equal(source.title, note.title);
      assert.deepEqual(source.source, note.source ?? null);
      assert.deepEqual(source.figureIds, (note.figures || []).map(figure => figure.id));
      assertViewerUrl(source.url, entry.subject, note.id);
    }
    for (const examId of entry.examIds) assert.ok(examIds.has(examId), `${entry.id}: ${examId}`);
  }
  for (const subject of ids) {
    assert.ok(subjects.some(s => s.id === subject));
    const notes = new Map(load(subject, "notes").map(n => [n.id, n]));
    assert.ok(notes.size > 20);
    const questions = load(subject, "questions");
    assert.ok(questions.some(q => q.type === "mc"));
    assert.ok(questions.some(q => q.type === "blank"));
    for (const q of [...questions, ...load(subject, "blanks")]) {
      assert.ok(notes.has(q.page), q.id);
      assert.equal(scoreLocal(q, q.answer).good, true, q.id);
      assert.equal(scoreLocal(q, "").good, false, q.id);
      if (q.type === "mc") {
        assert.equal(new Set(q.choices).size, q.choices.length, q.id);
        assert.ok(q.answer >= 0 && q.answer < q.choices.length, q.id);
      }
      if (q.before !== undefined) {
        const passage = q.before + q.answer + q.after;
        if (q.provenance?.sourceStatus === "capture-compared-excerpt") {
          assert.ok(q.captureEvidence?.some(source => source.quote.includes(passage)), q.id);
          assert.ok(q.evidence.every(source => source.page === q.page && q.captureEvidence.some(capture => capture.quote === source.quote)), q.id);
        } else assert.ok(notes.get(q.page).text.replace(/\*\*/g, "").includes(passage), q.id);
      }
    }
    assert.deepEqual(load(subject, "essays"), publicEssays(subject));
  }
});
test("new essays score with their own subject's exact evidence and reject another subject's evidence", () => {
  for (const essay of historyEssays) {
    const context = prepareScore(essay.id, "학습 답안");
    assert.equal(context.rubric.length, 3, essay.id);
    for (const source of context.sources) {
      const note = historyNotes.find(n => n.id === source.page);
      assert.ok(source.url.includes(`subject=${note.subject}`));
    }
    const assessment = { items: context.rubric.map(r => ({ id: r.id, score: 0, comment: "해당 설명이 답안에 없습니다.", studentQuote: "", evidence: r.evidence })), feedback: "교재 근거로 보완하세요." };
    assert.equal(finalizeScore(context, assessment).total, 0);
    const wrong = structuredClone(assessment);
    wrong.items[0].evidence[0].page = "p1";
    assert.throws(() => finalizeScore(context, wrong));
  }
});
test("compact KB retrieval stays subject-scoped and returns Markdown with working viewer evidence", () => {
  for (const subject of allSubjects) {
    const entry = historyKnowledge.find(n => n.subject === subject && n.title.length > 3);
    assert.ok(entry, subject);
    const matches = searchKnowledge({ query: entry.title, subject, limit: 2 });
    assert.ok(matches.length, entry.title);
    assert.ok(matches.length <= 2);
    for (const match of matches) {
      assert.equal(match.subject, subject);
      const full = getKnowledge(match.id);
      assert.equal(full.id, match.id);
      assert.ok(notesById.has(match.page));
      assert.ok(full.text.includes(match.excerpt), "retrieval excerpts must be verbatim Markdown text");
      assertViewerUrl(match.url, subject, match.page);
      assertViewerUrl(full.url, subject, full.page);
    }
  }
  assert.throws(() => searchKnowledge({ query: "" }));
  assert.throws(() => searchKnowledge({ query: "역사", subject: "../../x" }));
  assert.throws(() => searchKnowledge({ query: "역사", limit: 10000 }));
  assert.throws(() => getKnowledge("missing"));
  const bodyEntry = historyKnowledge.find(entry => entry.subject === "seoyangsa" && entry.text.length > 300);
  assert.ok(bodyEntry);
  const bodyTerm = bodyEntry.text.match(/[가-힣]{4,}/g)?.find(term => !bodyEntry.title.includes(term) && bodyEntry.text.indexOf(term) > 100);
  assert.ok(bodyTerm, "a body-only term is needed to check excerpt offsets");
  const bodyMatch = searchKnowledge({ query: bodyTerm, subject: "seoyangsa", limit: 20 }).find(item => item.id === bodyEntry.id);
  assert.ok(bodyMatch?.excerpt.includes(bodyTerm), "excerpt offsets must be relative to the text being sliced");
});
test("MCP keeps legacy hand-memo defaults and exposes all four new subjects", () => {
  assert.equal(callTool("list_notes").length, 75);
  assert.equal(callTool("list_essays").length, 6);
  for (const subject of ids) {
    const notes = callTool("list_notes", { subject });
    const essays = callTool("list_essays", { subject });
    const questions = callTool("list_questions", { subject });
    assert.ok(notes.length && essays.length && questions.length, subject);
    assert.ok(callTool("get_note", { id: notes[0].id }).url.includes(`subject=${subject}`));
    assert.equal(callTool("get_essay", { id: essays[0].id }).id, essays[0].id);
    assert.equal(callTool("score", { essayId: essays[0].id, answer: "내 답안" }).status, "assessment_required");
    const topic = historyKnowledge.find(entry => entry.subject === subject);
    assert.ok(topic, subject);
    const found = callTool("search_knowledge", { query: topic.title, subject, limit: 1 });
    assert.equal(found.length, 1);
    const knowledge = callTool("get_knowledge", { id: found[0].id });
    assert.equal(knowledge.kind, "curated-topic");
    assertViewerUrl(knowledge.url, subject, knowledge.page);
  }
});

test("curated short-answer aliases are exact whitelists and do not loosen legacy scoring", () => {
  const q = { type: "short", match: "aliases", answer: "신경제정책", acceptedAnswers: ["NEP", "네프"] };
  for (const answer of ["신경제정책", "신경제 정책", "NEP", "네프"]) assert.equal(scoreLocal(q, answer).good, true);
  for (const answer of ["경제정책", "NEP가 아니다", "", "네프들"]) assert.equal(scoreLocal(q, answer).good, false);
  assert.equal(scoreLocal({ type: "short", answer: "신경제정책", accept: ["NEP"] }, "NEP").good, false);
});

function assertEvidenceExcerpt(evidence, original, limits) {
  assert.equal(evidence.id, original.id);
  assert.deepEqual(evidence.source, original.source);
  assert.deepEqual(evidence.quality, original.quality);
  const excerpt = evidence.excerpt;
  assert.equal(excerpt.text, original.text.slice(excerpt.start, excerpt.end));
  assert.equal(excerpt.totalCharacters, original.text.length);
  assert.ok(excerpt.text.length <= limits.sourceExcerptCharacters);
  assert.equal(excerpt.truncated, excerpt.start > 0 || excerpt.end < original.text.length);
  assert.equal("text" in evidence, false, "the bounded excerpt must not also leak a full text copy");
  assert.equal("html" in evidence, false);
  assert.ok(evidence.figures.length <= limits.figuresPerSource);
  for (const figure of evidence.figures) {
    assert.deepEqual(figure, original.figures.find(item => item.id === figure.id));
    assert.ok(existsSync(new URL(`../public${figure.src}`, import.meta.url)), figure.src);
  }
  assert.deepEqual(new Set([...evidence.figures.map(item => item.id), ...evidence.omittedFigureIds]), new Set((original.figures || []).map(item => item.id)));
  if (original.subject === "kice") assert.equal(evidence.url, original.sourceUrl, "KICE pages use their actual source URL because the viewer does not support kice");
  else assertViewerUrl(evidence.url, original.subject, original.id);
}

test("prepare_exam returns selected compact documents and bounded, subject-scoped evidence with explicit omissions", () => {
  for (const subject of allSubjects) {
    const entry = historyKnowledge.find(item => item.subject === subject && item.sourceIds.length > 3);
    assert.ok(entry, subject);
    const args = { query: entry.title, subject, limit: 1 };
    const prepared = callTool("prepare_exam", args);
    assert.equal(prepared.status, "review_required");
    assert.equal(prepared.automaticExamEligible, false);
    assert.equal(prepared.knowledge.length, 1);
    const topic = prepared.knowledge[0];
    assert.equal(topic.id, entry.id);
    for (const key of ["page", "text", "sourceIds", "examIds", "selectionStatus", "automaticExamEligible", "priority", "path"]) assert.deepEqual(topic[key], entry[key], key);
    assert.equal("sources" in topic, false, "avoid duplicating all source provenance inside the compact document");
    assert.equal("source" in topic, false);
    assert.equal(topic.selectedSourceIds[0], entry.page);
    assert.equal(topic.selectedSourceIds.length, prepared.limits.sourcesPerDocument);
    assert.deepEqual(topic.omittedSourceIds, entry.sourceIds.filter(id => !topic.selectedSourceIds.includes(id)));
    assert.ok(topic.omittedSourceIds.length);
    assert.equal(new Set(prepared.sources.map(item => item.id)).size, prepared.sources.length);
    assert.deepEqual(prepared.sources.map(item => item.id), topic.selectedSourceIds);
    for (const source of prepared.sources) {
      assert.equal(source.subject, subject);
      assertEvidenceExcerpt(source, notesById.get(source.id), prepared.limits);
      assert.deepEqual(source.fullTextTool, { name: "get_note", arguments: { id: source.id } });
    }
    assert.deepEqual(prepared, prepareExam(args), "read-only calls must be deterministic and leave source data unchanged");
  }
  const many = prepareExam({ query: "출제" });
  assert.equal(many.knowledge.length, 3);
  assert.ok(many.sources.length <= 3 * many.limits.sourcesPerDocument);
  const targeted = prepareExam({ query: "균역법", subject: "hanguksa", limit: 1 });
  assert.ok(targeted.sources.some(source => source.excerpt.text.includes("균역법")), "source selection should include evidence for the actual requested term");
});

test("prepare_exam supplies only editorially linked exam pages and preserves transcription caveats", () => {
  const originals = new Map(load("kice", "pages").map(page => [page.id, page]));
  const entry = historyKnowledge.find(topic => topic.examIds.length > 0);
  assert.ok(entry);
  const prepared = prepareExam({ query: entry.title, subject: entry.subject, limit: 1 });
  assert.deepEqual(prepared.examSources.map(page => page.id), entry.examIds.slice(0, prepared.limits.examPages));
  assert.deepEqual(prepared.omittedExamIds, entry.examIds.slice(prepared.limits.examPages));
  for (const page of prepared.examSources) {
    const original = originals.get(page.id);
    assertEvidenceExcerpt(page, original, prepared.limits);
    for (const key of ["recordType", "document", "questionNumbers", "questionNumbersStatus"]) assert.deepEqual(page[key], original[key]);
    assert.deepEqual(page.fullTextTool, { name: "get_exam_source", arguments: { id: page.id } });
  }
  const unlinked = historyKnowledge.find(topic => topic.examIds.length === 0);
  assert.deepEqual(prepareExam({ query: unlinked.title, subject: unlinked.subject, limit: 1 }).examSources, []);
  const missing = prepareExam({ query: "없는주제불일치12345" });
  assert.equal(missing.status, "no_matching_knowledge");
  for (const key of ["knowledge", "sources", "examSources", "omittedExamIds"]) assert.deepEqual(missing[key], []);
  for (const args of [{}, { query: " " }, { query: "x".repeat(201) }, { query: "역사", subject: "kice" }, { query: "역사", subject: "" }, { query: "역사", limit: 4 }, { query: "역사", limit: 0 }, { query: "역사", limit: 1.5 }]) assert.throws(() => prepareExam(args));
});

test("get_note exposes actual figures and review metadata; prepare_exam reports omitted figures", () => {
  const note = notesById.get("hanguksa-textbook-page-307");
  assert.ok(note.figures.length > 4);
  const result = callTool("get_note", { id: note.id });
  assert.deepEqual(result.figures, note.figures);
  assert.deepEqual(result.quality, note.quality);
  assert.deepEqual(result.source, note.source);
  assert.deepEqual(callTool("get_note", { id: "p1" }).figures, []);
  const prepared = prepareExam({ query: "선사 생활과 고조선", subject: "hanguksa", limit: 1 });
  const evidence = prepared.sources.find(source => source.omittedFigureIds.length > 0);
  assert.ok(evidence);
  assertEvidenceExcerpt(evidence, notesById.get(evidence.id), prepared.limits);
  assert.ok(evidence.omittedFigureIds.length > 0);
});

test("MCP discovery and initialization distinguish read-only authoring from registered essay scoring", async () => {
  const description = describe("public", "https://study.test");
  assert.equal(description.authoringTool, "prepare_exam");
  assert.equal(description.primaryTool, "score");
  const tool = description.tools.find(item => item.name === "prepare_exam");
  assert.equal(tool.inputSchema.properties.limit.maximum, 3);
  assert.deepEqual(tool.inputSchema.required, ["query"]);
  assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  const request = new Request("https://study.test/api/mcp/public", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) });
  const response = await handleMcp({ request });
  const { result } = await response.json();
  assert.match(result.instructions, /prepare_exam/);
  assert.match(result.instructions, /score\(essayId, answer\)/);
  assert.match(result.instructions, /자동 생성·등록되지/);
});
