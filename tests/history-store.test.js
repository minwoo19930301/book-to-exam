import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryStore, latestQuestionAttempts, resultStatus, questionStatistics, retryUrl, HISTORY_TTL_MS } from '../src/history-store.js';

test('history separates confirmed scores from ungraded and deferred judgments', () => {
  assert.equal(resultStatus(null), 'ungraded');
  assert.equal(resultStatus({ good: true, score: 1, max: 1 }), 'correct');
  assert.equal(resultStatus({ good: false, score: 0, max: 1 }), 'incorrect');
  assert.equal(resultStatus({ good: null, score: null, max: 1, status: 'review' }), 'review');
  assert.equal(resultStatus({ total: 7, max: 10 }), 'incorrect');
  assert.equal(resultStatus({ total: 10, max: 10 }), 'correct');
  assert.equal(resultStatus({ status: 'pending' }), 'review');
  assert.equal(HISTORY_TTL_MS, 30 * 24 * 60 * 60 * 1000);
});

test('accuracy includes current confirmed scores and ignores drafts, reviews and other questions', () => {
  const attempts = [
    { id: 'a', questionId: 'q', result: { good: true } },
    { id: 'b', questionId: 'q', result: { good: false } },
    { id: 'c', questionId: 'q', result: null },
    { id: 'd', questionId: 'q', result: { good: null, score: null } },
    { id: 'current', questionId: 'q', result: { good: true } },
    { id: 'other', questionId: 'q2', result: { good: true } },
  ];
  assert.deepEqual(questionStatistics(attempts, 'q', 'current'), { attempts: 4, graded: 3, correct: 2, percent: 67 });
  assert.equal(questionStatistics(attempts, 'missing').percent, null);
});

test('retry links preserve question identity, select the right study mode and start unique attempts', () => {
  for (const [type, path] of [['mc', '/quiz'], ['short', '/short'], ['blank', '/blank'], ['essay', '/essay']]) {
    const attempt = { type, subject: 'hanguksa', questionId: 'q+한글' };
    const a = new URL(retryUrl(attempt), 'https://study.test');
    const b = new URL(retryUrl(attempt), 'https://study.test');
    assert.equal(a.pathname, path);
    assert.equal(a.searchParams.get('subject'), attempt.subject);
    assert.equal(a.searchParams.get('q'), attempt.questionId);
    assert.notEqual(a.searchParams.get('retry'), b.searchParams.get('retry'));
  }
});

test('unavailable browser storage fails visibly rather than silently storing only in memory', async () => {
  const store = createHistoryStore({ indexedDB: null });
  await assert.rejects(store.listAttempts(), /저장하지 못했습니다/);
  await assert.rejects(store.loadBank({ subject: 'hanguksa', type: 'short' }), /저장하지 못했습니다/);
  await assert.rejects(store.clearHistory(), /저장하지 못했습니다/);
});

test('late results do not replace a more recently started attempt when resuming', () => {
  const old = { id: 'old', questionId: 'q', startedAt: 100, updatedAt: 900, attemptNumber: 1, result: { total: 8 } };
  const recent = { id: 'recent', questionId: 'q', startedAt: 200, updatedAt: 210, attemptNumber: 2, value: 'new draft' };
  for (const attempts of [[old, recent], [recent, old]]) {
    assert.equal(latestQuestionAttempts(attempts).q.id, 'recent');
  }
});
