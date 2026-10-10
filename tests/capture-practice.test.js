import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scoreLocal } from '../shared/scoring.js';
import { exactCloze, excerptText, maskExcerpt, shortExcerpts, shortStudyMode, usesExactPassage } from '../src/source-excerpts.js';
import { findPracticeQuestion, onRequestGet } from '../functions/api/practice-bank.js';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const subjects = ['hand-memo', 'seoyangsa', 'hanguksa', 'dongyangsa', 'gyoyukron'];
const folder = subject => subject === 'hand-memo' ? 'public/data' : `public/data/subjects/${subject}`;
const targets = read('tools/history-questions/capture-targets.json').subjects;
const manifest = read('public/data/source-pages.json').pages;
const coverage = read('public/data/page-practice-coverage.json');
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const isCapture = question => question.provenance?.origin === 'authored-capture-practice';
const fileHashes = new Map();

function captureHash(src) {
  assert.match(src, /^\/(source-pages|pages)\/[a-zA-Z0-9_./-]+$/);
  assert.ok(!src.includes('..'));
  if (!fileHashes.has(src)) {
    fileHashes.set(src, createHash('sha256').update(readFileSync(new URL(`../public${src}`, import.meta.url))).digest('hex'));
  }
  return fileHashes.get(src);
}

function subjectData(subject) {
  const directory = folder(subject);
  const input = read(`tools/history-questions/capture-inputs/${subject}.json`);
  const notes = new Map(read(`${directory}/notes.json`).map(note => [note.id, note]));
  const reviews = new Map(input.reviews.map(review => [review.page, review]));
  const bank = [
    ...read(`${directory}/questions.json`).map(question => ({ question, type: question.type === 'mc' ? 'mc' : 'short' })),
    ...read(`${directory}/blanks.json`).map(question => ({ question, type: 'blank' })),
  ];
  return { input, notes, reviews, bank, report: coverage.subjects.find(report => report.subject === subject) };
}

test('every capture target has a published review tied to the actual page and immutable local bytes', () => {
  for (const subject of subjects) {
    const { input, notes, reviews, report } = subjectData(subject);
    assert.equal(input.schemaVersion, 1);
    assert.equal(input.subject, subject);
    assert.equal(reviews.size, input.reviews.length, `${subject}: duplicate reviews`);
    assert.deepEqual(new Set(reviews.keys()), new Set(targets[subject]), `${subject}: incomplete review cannot publish`);
    assert.equal(report.captureReviewedPages, reviews.size, subject);
    const published = new Map(report.pages.filter(page => page.captureReview).map(page => [page.page, page]));
    assert.deepEqual(new Set(published.keys()), new Set(reviews.keys()), subject);

    for (const [page, review] of reviews) {
      assert.ok(notes.has(page), page);
      assert.ok(review.summary.trim(), page);
      assert.ok(review.captures.length, page);
      const note = notes.get(page);
      const allowed = note.img
        ? [{ src: `/pages/${note.img}`, sha256: captureHash(`/pages/${note.img}`) }]
        : manifest[page]?.captures || [];
      const actual = published.get(page);
      assert.equal(actual.captureReview.status, review.status, page);
      assert.equal(actual.captureReview.summary, review.summary, page);
      assert.deepEqual(actual.captureReview.captures, review.captures, page);
      assert.equal(new Set(review.captures.map(capture => capture.src)).size, review.captures.length, page);
      for (const capture of review.captures) {
        assert.ok(allowed.some(asset => asset.src === capture.src && asset.sha256 === capture.sha256), `${page}: wrong capture`);
        assert.equal(captureHash(capture.src), capture.sha256, `${page}: changed bytes`);
      }
      if (review.status === 'content') assert.ok(actual.count >= 3 && actual.count <= 4, `${page}: ${actual.count}`);
      else {
        assert.ok(review.reason?.trim(), `${page}: missing limitation`);
        assert.equal(actual.captureReview.reason, review.reason, page);
      }
      if (actual.count < 3) assert.equal(actual.reason, review.reason, page);
      if (review.status === 'duplicate') {
        assert.ok(notes.has(review.duplicateOf) && review.duplicateOf !== page, page);
        assert.equal(actual.captureReview.duplicateOf, review.duplicateOf, page);
      }
    }
  }
});

test('compiled additions retain authored answers and exact compared excerpts rather than substituting OCR', () => {
  let total = 0;
  for (const subject of subjects) {
    const { input, reviews, bank, report } = subjectData(subject);
    const additions = bank.filter(({ question }) => isCapture(question));
    const authored = new Map(input.questions.map(question => [question.id, question]));
    assert.equal(authored.size, input.questions.length, `${subject}: duplicate input IDs`);
    assert.deepEqual(new Set(additions.map(({ question }) => question.id)), new Set(authored.keys()), subject);
    assert.equal(additions.length, Object.values(report.captureAdded).reduce((sum, count) => sum + count, 0), subject);
    for (const { question: q, type } of additions) {
      total++;
      const row = authored.get(q.id);
      const review = reviews.get(q.page);
      assert.equal(type, row.kind === 'cloze' ? 'blank' : 'short', q.id);
      for (const field of ['page', 'prompt', 'answer', 'acceptedAnswers', 'evidence']) assert.deepEqual(q[field], row[field], `${q.id}: ${field}`);
      assert.equal(q.provenance.sourceStatus, 'capture-compared-excerpt', q.id);
      assert.equal(q.match, 'aliases', q.id);
      assert.ok(['content', 'unreadable', 'capture-mismatch'].includes(review.status), q.id);
      assert.ok(q.captureEvidence.length && q.evidence.length, q.id);
      assert.deepEqual(new Set(q.captureEvidence.map(source => source.quote)), new Set(q.evidence.map(source => source.quote)), q.id);
      for (const evidence of q.evidence) assert.equal(evidence.page, q.page, q.id);
      for (const source of q.captureEvidence) {
        assert.ok(review.captures.some(asset => asset.src === source.src && asset.sha256 === source.sha256), q.id);
        assert.equal(captureHash(source.src), source.sha256, q.id);
        assert.ok(source.location.trim(), q.id);
        assert.ok(source.quote.trim().length >= (source.quoteKind === 'label' ? 2 : 4), q.id);
        const original = row.captureEvidence.find(entry => entry.src === source.src && entry.quote === source.quote && entry.location === source.location);
        assert.ok(original, `${q.id}: altered compared excerpt`);
        const published = report.pages.find(page => page.page === q.page).captureReview.excerpts;
        assert.ok(published.some(entry => entry.src === source.src && entry.sha256 === source.sha256 && entry.quote === source.quote
          && entry.location === source.location && entry.questionIds.includes(q.id)), `${q.id}: viewer excerpt missing`);
      }
      const apiQuestion = findPracticeQuestion(subject, type, q.id);
      assert.ok(apiQuestion, `${q.id}: missing practice-bank route`);
      assert.deepEqual(apiQuestion.captureEvidence, q.captureEvidence, q.id);
      assert.deepEqual(apiQuestion.evidence, q.evidence, q.id);
    }
  }
  assert.ok(total > 0, 'capture tests must exercise published additions');
});

test('all capture answer aliases pass the actual study grader while negation and extra text fail', () => {
  for (const subject of subjects) {
    for (const { question: q, type } of subjectData(subject).bank.filter(({ question }) => isCapture(question))) {
      for (const answer of [q.answer, ...q.acceptedAnswers]) {
        for (const input of [answer, answer.normalize('NFD'), `  ${answer}  `])
          assert.equal(scoreLocal({ ...q, type }, input).good, true, `${q.id}: ${input}`);
        assert.ok(!normalize(q.prompt).includes(normalize(answer)), `${q.id}: answer exposed before grading`);
      }
      for (const input of ['', '관련 없는 가상의 오답', `${q.answer}이 아니다`, `${q.answer}xyz`])
        assert.equal(scoreLocal({ ...q, type }, input).good, false, `${q.id}: ${input}`);
    }
  }
});

test('capture excerpts mask approved answer forms and full cloze spans do not expand into neighboring OCR', () => {
  let testedExcerpts = 0;
  for (const subject of subjects) {
    for (const { question: q, type } of subjectData(subject).bank.filter(({ question }) => isCapture(question))) {
      if (type === 'blank') {
        assert.equal(usesExactPassage(q), true, q.id);
        const span = exactCloze(q);
        assert.equal(span.before + q.answer + span.after, q.passage, q.id);
        assert.equal(span.before + '_____' + span.after, q.prompt, q.id);
        assert.ok(q.captureEvidence.some(source => source.quote.includes(q.passage)), q.id);
      } else {
        for (const excerpt of shortExcerpts(q)) {
          testedExcerpts++;
          assert.equal(excerpt.page, q.page, q.id);
          assert.ok(q.captureEvidence.some(source => excerptText(source.quote) === excerpt.text), q.id);
          const masked = normalize(maskExcerpt(excerpt.text, q));
          for (const answer of [q.answer, ...q.acceptedAnswers]) assert.ok(!masked.includes(normalize(answer)), `${q.id}: ${answer}`);
        }
      }
    }
  }
  assert.ok(testedExcerpts > 0, 'capture excerpts must exercise the source-reading display');
});

test('short capture quotes use the explicit excerpt only; tiny map labels remain concept questions', () => {
  const quote = '사진에서 읽은 가상 문장으로 구호소(救護所)는 백성의 구제를 맡으며 곡식 지급을 기록한다.';
  const q = { answer: '구호소', acceptedAnswers: ['救護所'], contextMode: 'source-excerpt',
    provenance: { sourceStatus: 'capture-compared-excerpt' }, evidence: [{ page: 'fixture', quote }],
    passage: '이 필드는 읽기 지문의 근거가 아니므로 노출하면 안 된다.' };
  assert.deepEqual(shortExcerpts(q), [{ page: 'fixture', text: quote }]);
  assert.equal(shortStudyMode(q), 'source');
  assert.equal(maskExcerpt(quote, q), '사진에서 읽은 가상 문장으로 ［해당 용어］는 백성의 구제를 맡으며 곡식 지급을 기록한다.');
  assert.equal(q.evidence[0].quote, quote, 'masking must never overwrite the saved evidence');
  assert.deepEqual(shortExcerpts({ ...q, evidence: [{ page: 'fixture', quote: '694년' }] }), []);
  assert.equal(shortStudyMode({ ...q, evidence: [{ page: 'fixture', quote: '694년' }] }), 'concept');
  const cloze = { ...q, passageMode: 'full', before: '사진의 정확한 첫 줄\n', after: '\n사진의 정확한 마지막 줄' };
  assert.equal(usesExactPassage(cloze), true);
  assert.deepEqual(exactCloze(cloze), { before: cloze.before, after: cloze.after });
});

test('viewer primary-page links return the new capture questions through the public question-bank API', async () => {
  for (const subject of subjects) {
    const { bank } = subjectData(subject);
    const additions = bank.filter(({ question }) => isCapture(question));
    const pages = new Set(additions.map(({ question }) => question.page));
    for (const page of pages) {
      const response = onRequestGet({ request: new Request(`https://study.test/api/practice-bank?${new URLSearchParams({ subject, sourcePage: page, pageSize: '100' })}`) });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.ok(payload.total <= 100, `${page}: test should inspect all returned items`);
      assert.ok(payload.items.every(item => item.page === page && item.subject === subject), page);
      const expected = additions.filter(({ question }) => question.page === page).map(({ question }) => question.id);
      assert.deepEqual(new Set(payload.items.filter(isCapture).map(item => item.id)), new Set(expected), page);
    }
  }
});
