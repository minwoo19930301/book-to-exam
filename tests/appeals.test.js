import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequestPost, onRequest } from '../functions/api/appeals.js';
import { appealContext, appealOrigin, currentAppealLink, resolveAppealContext } from '../src/appeal-context.js';
import { findPracticeQuestion } from '../functions/api/practice-bank.js';
import blanks from '../public/data/subjects/hanguksa/blanks.json' with { type: 'json' };

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_appeals.sql', import.meta.url), 'utf8'));
  const binding = {
    prepare(query) {
      return { query, args: [], bind(...args) { this.args = args; return this; }, async first() { return sql.prepare(query).get(...this.args) || null; } };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = statements.map(item => ({ meta: { changes: Number(sql.prepare(item.query).run(...item.args).changes) } })); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, env: { APPEALS_DB: binding } };
}
const origin = 'https://bookvideotoexam.pages.dev';
const entry = () => ({ id: crypto.randomUUID(), subject: 'hanguksa', category: 'grading', message: '동일한 정답인데 오답으로 처리되었습니다.', expectedAnswer: '정답 제안' });
function submit(env, body, headers = {}) {
  return onRequestPost({ env, request: new Request(`${origin}/api/appeals`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.11', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}

test('appeals store canonical question plus this attempt only, and retries do not duplicate', async () => {
  const { sql, env } = database();
  const question = findPracticeQuestion('hanguksa', 'blank', blanks[0].id);
  const body = { ...entry(), context: { type: 'blank', questionId: question.id, question: { answer: 'forged' }, submittedAnswer: question.answer, result: { status: 'incorrect', score: 0, max: 1 }, unrelatedHistory: ['private'] } };
  const response = await submit(env, body);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).id, body.id);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const saved = sql.prepare('SELECT * FROM appeals').get();
  const context = JSON.parse(saved.context_json);
  assert.equal(context.question.answer, question.answer);
  assert.equal(context.submittedAnswer, question.answer);
  assert.equal(context.unrelatedHistory, undefined);
  assert.equal((await submit(env, body)).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM appeals').get().n, 1);
  assert.equal((await submit(env, { ...body, message: '다른 내용으로 덮어쓰기 시도' })).status, 409);
  assert.equal(sql.prepare('SELECT message FROM appeals').get().message, body.message);
  sql.close();
});

test('public API never lists customer submissions and rejects cross-site or malformed submissions', async () => {
  const { sql, env } = database();
  assert.equal(onRequest().status, 405);
  assert.equal((await submit(env, entry(), { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await submit(env, entry(), { origin: '' })).status, 403);
  assert.equal((await submit(env, entry(), { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await submit(env, entry(), { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await submit(env, '{')).status, 400);
  for (const patch of [{ subject: 'no' }, { category: 'no' }, { message: 'x' }, { message: 'a'.repeat(3001) }, { id: 'not-an-id' }, { context: { type: 'blank', questionId: 'not-found' } }]) assert.equal((await submit(env, { ...entry(), ...patch })).status, 400);
  assert.equal((await submit(env, 'a'.repeat(64001))).status, 413);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM appeals').get().n, 0);
  sql.close();
});

test('database query parameters preserve text literally and missing storage fails visibly', async () => {
  const { sql, env } = database();
  const body = { ...entry(), message: "정답'); DROP TABLE appeals; -- <script>알림</script>" };
  assert.equal((await submit(env, body)).status, 201);
  assert.equal(sql.prepare('SELECT message FROM appeals').get().message, body.message);
  assert.equal((await submit({}, entry())).status, 503);
  sql.close();
});

test('hourly rate limit is enforced in the same SQL transaction as each insertion', async () => {
  const { sql, env } = database();
  for (let index = 0; index < 20; index++) assert.equal((await submit(env, entry())).status, 201);
  assert.equal((await submit(env, entry())).status, 429);
  assert.equal((await submit(env, entry())).status, 429);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM appeals').get().n, 20);
  assert.equal((await submit(env, entry(), { 'cf-connecting-ip': '192.0.2.12' })).status, 201);
  const bucket = sql.prepare('SELECT bucket FROM appeal_limits LIMIT 1').get().bucket;
  assert.match(bucket, /^[a-f0-9]{64}$/);
  assert.ok(!bucket.includes('192.0.2'));
  sql.close();
});

test('appeal links do not navigate to an external origin and snapshot reports MC choice text', () => {
  assert.equal(appealOrigin('?from=//attacker.invalid', 'hanguksa').back, '/questions?subject=hanguksa');
  assert.equal(appealOrigin('?from=%2F%5Cattacker.invalid', 'hanguksa').back, '/questions?subject=hanguksa');
  const source = appealOrigin(`?from=${encodeURIComponent('/blank?subject=hanguksa&q=sample')}`, 'hanguksa');
  assert.equal(source.type, 'blank'); assert.equal(source.questionId, 'sample');
  const context = appealContext({ id: 'a', choices: ['첫째', '둘째'], prompt: '문제', answer: 1 }, 'mc', { value: 0, result: { good: false } });
  assert.equal(context.submittedAnswer, '1. 첫째'); assert.equal(context.result.status, 'incorrect');
  assert.equal(context.result.score, 0); assert.equal(context.result.max, 1);
});


test('idempotent client retry survives canonical question corrections and retirement', async () => {
  const { sql, env } = database();
  const question = findPracticeQuestion('hanguksa', 'blank', blanks[0].id);
  const original = { id: question.id, answer: question.answer, prompt: question.prompt };
  const body = { ...entry(), context: { type: 'blank', questionId: question.id, submittedAnswer: '내가 쓴 답', observed: { answer: '화면의 답' } } };
  try {
    assert.equal((await submit(env, body)).status, 201);
    question.answer = '정정된 답'; question.prompt = '정정된 발문';
    assert.equal((await submit(env, body)).status, 200);
    question.id = 'temporarily-retired-question';
    assert.equal((await submit(env, body)).status, 200);
    assert.equal((await submit(env, { ...body, id: crypto.randomUUID() })).status, 400, 'new submissions still require a current canonical question');
    const saved = JSON.parse(sql.prepare('SELECT context_json FROM appeals').get().context_json);
    assert.equal(saved.question.answer, original.answer, 'first receipt retains its original canonical snapshot');
    assert.equal(saved.question.prompt, original.prompt);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM appeals').get().n, 1);
    assert.equal((await submit(env, { ...body, message: '실제로 바뀐 제출 내용입니다.' })).status, 409);
  } finally { Object.assign(question, original); sql.close(); }
});

test('current appeal pins the rendered question and attempt despite another tab updating the session', () => {
  const question = { id: 'a', prompt: '현재 문제', answer: '정답' };
  const a = { id: 'attempt-a', subject: 'hanguksa', type: 'short', questionId: 'a', value: 'A의 답', result: { good: false }, startedAt: 1 };
  const b = { ...a, id: 'attempt-b', questionId: 'b', value: 'B의 다른 문제 답', startedAt: 2 };
  const c = { ...a, id: 'attempt-c', value: 'B의 재도전 답', startedAt: 3 };
  const link = currentAppealLink({ from: '/short?subject=hanguksa', subject: 'hanguksa', type: 'short', question, record: a });
  const origin = appealOrigin(link.search, 'hanguksa');
  assert.equal(origin.questionId, 'a'); assert.equal(origin.attemptId, a.id);
  assert.equal(origin.back, '/short?subject=hanguksa&q=a');
  for (const other of [b, c]) {
    const saved = { attempts: [a, other], session: { questionId: other.questionId, attemptId: other.id } };
    assert.equal(resolveAppealContext(question, origin, saved, null, 'hanguksa').context.submittedAnswer, 'A의 답');
    assert.equal(resolveAppealContext(question, origin, { attempts: [] }, link.state.appealSnapshot, 'hanguksa').context.submittedAnswer, 'A의 답', 'router snapshot survives unavailable storage');
    const missing = resolveAppealContext(question, origin, { attempts: [other] }, null, 'hanguksa');
    assert.equal(missing.context.submittedAnswer, ''); assert.equal(missing.missingAttempt, true);
  }
  const mismatch = { ...link.state.appealSnapshot, attemptId: 'other' };
  assert.equal(resolveAppealContext(question, origin, { attempts: [] }, mismatch, 'hanguksa').context.submittedAnswer, '');
  const bankOrigin = appealOrigin('?type=short&question=a', 'hanguksa');
  const recent = resolveAppealContext(question, bankOrigin, { attempts: [a, c] }, null, 'hanguksa');
  assert.equal(recent.context.submittedAnswer, 'B의 재도전 답');
  assert.equal(recent.source, 'latest-for-bank-question');
});
