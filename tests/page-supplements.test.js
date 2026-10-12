import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreLocal } from '../shared/scoring.js';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const subjects = ['seoyangsa', 'hanguksa', 'dongyangsa'];
const norm = text => String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const inputFor = subject => read(`tools/history-questions/page-supplements/${subject}.json`);
const asQuestion = row => ({ ...row, type: 'short', match: 'aliases' });

test('the new source-based short batch has 60/20/20 distinct questions on readable content pages', () => {
  const counts = [];
  const targets = read('tools/history-questions/capture-targets.json').subjects;
  for (const subject of subjects) {
    const input = inputFor(subject);
    const notes = new Map(read(`public/data/subjects/${subject}/notes.json`).map(note => [note.id, note]));
    const prompts = new Set();
    const answers = new Set();
    assert.equal(input.batch, '20261013');
    for (const row of input.questions) {
      assert.equal(row.kind, 'short');
      assert.ok(row.id.startsWith(`${subject}-page-practice-review20261013-`));
      assert.ok(notes.has(row.page), row.id);
      assert.ok(!targets[subject].includes(row.page), `${row.id}: must not pad excluded capture pages`);
      assert.ok(!prompts.has(norm(row.prompt)), row.id);
      assert.ok(!answers.has(norm(row.answer)), row.id);
      prompts.add(norm(row.prompt)); answers.add(norm(row.answer));
      assert.ok(row.evidence.length, row.id);
      for (const source of row.evidence) {
        assert.equal(source.page, row.page, row.id);
        assert.ok(source.quote.trim().length >= 8, row.id);
        assert.ok(notes.get(row.page).text.includes(source.quote), `${row.id}: nonverbatim evidence`);
      }
    }
    counts.push(input.questions.length);
  }
  assert.deepEqual(counts, [60, 20, 20]);
});

test('all new canonical answers and approved spellings pass the actual short grader; negations and unrelated text fail', () => {
  for (const subject of subjects) {
    for (const row of inputFor(subject).questions) {
      const question = asQuestion(row);
      for (const answer of [row.answer, ...row.acceptedAnswers]) {
        assert.ok(!norm(row.prompt).includes(norm(answer)), `${row.id}: leaked ${answer}`);
        for (const value of [answer, answer.normalize('NFD'), `  ${answer}  `])
          assert.equal(scoreLocal(question, value).good, true, `${row.id}: ${value}`);
      }
      for (const value of ['', '알 수 없는 오답', `${row.answer}이 아니다`, `${row.answer}xyz`])
        assert.equal(scoreLocal(question, value).good, false, `${row.id}: ${value}`);
    }
  }
});

test('published short questions retain the exact authored prompts, answers, aliases and excerpts', () => {
  for (const subject of subjects) {
    const bank = new Map(read(`public/data/subjects/${subject}/questions.json`).map(q => [q.id, q]));
    for (const row of inputFor(subject).questions) {
      const q = bank.get(row.id);
      assert.ok(q, `${row.id}: regenerate the public bank before publishing`);
      assert.equal(q.type, 'blank');
      assert.equal(q.match, 'aliases');
      assert.equal(q.provenance.sourceStatus, 'transcription-unverified');
      for (const key of ['prompt', 'answer', 'acceptedAnswers', 'evidence', 'page', 'explain', 'corroboration'])
        assert.deepEqual(q[key], row[key], `${row.id}: ${key}`);
    }
  }
});
