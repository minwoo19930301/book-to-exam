import { resultStatus } from './history-store.js';

const routes = { '/quiz': 'mc', '/short': 'short', '/blank': 'blank', '/essay': 'essay' };
export function appealOrigin(search, subject) {
  const params = new URLSearchParams(search);
  const from = params.get('from') || '';
  const path = from.startsWith('/') && !from.startsWith('//') ? new URL(from, 'https://local.invalid') : null;
  const type = params.get('type') || routes[path?.pathname];
  const validType = ['mc', 'short', 'blank', 'essay', 'research'].includes(type) ? type : null;
  return {
    type: validType,
    current: params.get('current') === '1' || params.has('attempt'),
    attemptId: params.get('attempt') || null,
    questionId: params.get('question') || (validType && path?.searchParams.get('q')) || null,
    back: path?.origin === 'https://local.invalid' ? `${path.pathname}${path.search}` : `/questions?subject=${encodeURIComponent(subject)}`,
  };
}
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
export function appealContext(question, type, attempt) {
  if (!question) return null;
  const raw = attempt?.result || {};
  const value = attempt?.value;
  const submittedAnswer = typeof value === 'number' && question.choices
    ? `${value + 1}. ${question.choices[value] || ''}` : String(value ?? '');
  const rawAnswer = attempt?.question?.answer ?? question.answer ?? question.modelAnswer;
  const answer = typeof rawAnswer === 'number' && question.choices ? `${rawAnswer + 1}. ${question.choices[rawAnswer] || ''}` : rawAnswer;
  return {
    type, questionId: question.id, submittedAnswer: text(submittedAnswer, 3000),
    observed: { prompt: text(attempt?.question?.prompt || question.prompt, 6000), answer: text(answer, 2000) },
    result: { status: resultStatus(raw.score === undefined && raw.good === undefined && raw.total === undefined ? null : raw),
      score: raw.total ?? raw.score ?? (typeof raw.good === 'boolean' ? Number(raw.good) : null),
      max: raw.max ?? (typeof raw.good === 'boolean' ? 1 : null),
      feedback: text(raw.feedback || raw.summary || raw.message, 3000) },
  };
}

// Capture the rendered attempt before another tab can update the shared session.
// Only the observations sent by the appeal form are kept in router state.
export function currentAppealLink({ from, subject, type, question, record }) {
  const params = new URLSearchParams({ from, current: '1' });
  if (type) params.set('type', type);
  if (!question?.id || !record?.id) return { search: `?${params}`, state: null };
  const returnTo = new URL(from, 'https://local.invalid');
  returnTo.searchParams.set('q', question.id);
  returnTo.searchParams.delete('retry');
  params.set('from', `${returnTo.pathname}${returnTo.search}`);
  params.set('question', question.id);
  params.set('attempt', record.id);
  return { search: `?${params}`, state: { appealSnapshot: {
    subject, type, questionId: question.id, attemptId: record.id,
    context: appealContext(question, type, { value: record.value, result: record.result, question }),
  } } };
}

export function resolveAppealContext(question, origin, saved, snapshot, subject) {
  const sameSnapshot = origin.current && snapshot?.subject === subject && snapshot.type === origin.type &&
    snapshot.questionId === question.id && snapshot.attemptId === origin.attemptId &&
    snapshot.context?.questionId === question.id && snapshot.context.type === origin.type;
  if (sameSnapshot) return { context: snapshot.context, source: 'current-snapshot', missingAttempt: false };
  const matching = (saved.attempts || []).filter(item => item.questionId === question.id && item.subject === subject && item.type === origin.type);
  const attempt = origin.current
    ? matching.find(item => item.id === origin.attemptId)
    : matching.sort((a, b) => b.startedAt - a.startedAt || (b.attemptNumber || 1) - (a.attemptNumber || 1))[0];
  return { context: appealContext(question, origin.type, attempt),
    source: origin.current ? 'saved-current' : 'latest-for-bank-question', missingAttempt: Boolean(origin.current && !attempt) };
}
