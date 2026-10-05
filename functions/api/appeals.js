import { findPracticeQuestion } from './practice-bank.js';

const SUBJECTS = new Set(['all', 'hand-memo', 'seoyangsa', 'hanguksa', 'dongyangsa', 'gyoyukron']);
const TYPES = new Set(['mc', 'short', 'blank', 'essay', 'research']);
const CATEGORIES = new Set(['grading', 'answer', 'source', 'question', 'other']);
const MAX_BODY = 64000;
const HOURLY_LIMIT = 20;
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function string(value, name, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new InputError(`${name}을(를) 확인해 주세요. (최대 ${max}자)`);
  return value.trim();
}
function sourcePath(value) {
  const source = string(value, '화면 정보', 14000);
  if (!source) return '';
  // Only app-relative paths and explicitly permitted diagnostic query keys.
  // Unknown keys are rejected rather than retaining tokens or arbitrary URLs.
  if (!/^\/[a-zA-Z0-9/_-]*(?:\?[^#]*)?$/.test(source) || source.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(source))
    throw new InputError('화면 정보는 사이트 내부 경로여야 합니다.');
  const url = new URL(source, 'https://local.invalid');
  for (const key of url.searchParams.keys()) {
    if (!['subject', 'page', 'q', 'view', 'facultyId', 'topic', 'mode'].includes(key) || url.searchParams.getAll(key).length !== 1)
      throw new InputError('화면 정보의 검색 조건을 확인해 주세요.');
    const text = url.searchParams.get(key);
    if (text.length > 200 || /[\u0000-\u001f\u007f]/.test(text)) throw new InputError('화면 정보의 검색 조건을 확인해 주세요.');
  }
  url.searchParams.sort();
  return url.pathname + url.search;
}
async function bodyJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new InputError('제출 내용이 너무 큽니다.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('제출 내용이 없습니다.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new InputError('제출 내용이 너무 큽니다.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError('제출 형식을 확인해 주세요.'); }
}
function validation(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('제출 형식을 확인해 주세요.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id || '')) throw new InputError('새로고침 후 다시 제출해 주세요.');
  const category = body.category ?? 'other';
  if (!SUBJECTS.has(body.subject) || !CATEGORIES.has(category)) throw new InputError('과목과 이의제기 유형을 확인해 주세요.');
  const message = string(body.message, '이의제기 내용', 3000, true);
  const expectedAnswer = string(body.expectedAnswer, '제안하는 정답', 1000);
  const source = sourcePath(body.source);
  let context = null;
  if (body.context != null) {
    if (body.subject === 'all') throw new InputError('문항이 첨부된 경우 실제 과목을 지정해 주세요.');
    const value = body.context;
    if (!TYPES.has(value.type) || typeof value.questionId !== 'string') throw new InputError('문항 정보를 확인해 주세요.');
    const observed = value.observed || {};
    const result = value.result || {};
    context = {
      type: value.type, questionId: string(value.questionId, '문항 ID', 200, true),
      submittedAnswer: string(value.submittedAnswer, '입력한 답', 3000),
      observed: { prompt: string(observed.prompt, '화면에 표시된 문항', 6000), answer: string(observed.answer, '화면에 표시된 정답', 2000) },
      result: {
        status: ['correct', 'incorrect', 'review', 'ungraded'].includes(result.status) ? result.status : 'ungraded',
        score: Number.isFinite(result.score) && result.score >= 0 && result.score <= 1000 ? result.score : null,
        max: Number.isFinite(result.max) && result.max >= 0 && result.max <= 1000 ? result.max : null,
        feedback: string(result.feedback, '채점 설명', 3000),
      },
    };
  }
  return { id: body.id.toLowerCase(), subject: body.subject, category, message, expectedAnswer, context, ...(source ? { source } : {}) };
}
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  try {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '사이트 안의 이의제기 화면에서 제출해 주세요.' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'JSON 형식만 지원합니다.' }, 415);
    if (!env.APPEALS_DB) return json({ error: '접수 저장소에 연결하지 못했습니다. 작성 내용을 유지한 채 잠시 후 다시 제출해 주세요.' }, 503);
    const entry = validation(await bodyJson(request));
    // Identity is the normalized client submission, never a mutable bank snapshot.
    const digest = await hash(JSON.stringify(entry));
    const existing = await env.APPEALS_DB.prepare('SELECT payload_hash FROM appeals WHERE id = ?1').bind(entry.id).first();
    if (existing) return existing.payload_hash === digest ? json({ id: entry.id, received: true }) : json({ error: '접수 번호가 이미 사용되었습니다. 새 이의제기로 작성해 주세요.' }, 409);
    if (entry.context) {
      const question = findPracticeQuestion(entry.subject, entry.context.type, entry.context.questionId);
      if (!question) throw new InputError('현재 문제은행에서 문항을 찾지 못했습니다. 문항을 다시 연 뒤 전송해 주세요.');
      entry.context.question = { title: question.title, prompt: question.prompt, choices: question.choices, answer: question.answer,
        modelAnswer: question.modelAnswer, sourcePages: question.sourcePages };
    }
    const now = Date.now(), hour = Math.floor(now / 3600000);
    // No raw IP is stored. The hourly digest is discarded after expiry.
    const bucket = await hash(`${hour}:${request.headers.get('cf-connecting-ip') || 'local'}`);
    const timestamp = new Date(now).toISOString();
    const result = await env.APPEALS_DB.batch([
      env.APPEALS_DB.prepare('DELETE FROM appeal_limits WHERE expires_at < ?1').bind(now),
      env.APPEALS_DB.prepare('INSERT INTO appeal_limits(bucket, requests, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(bucket) DO UPDATE SET requests = MIN(requests + 1, ?3)').bind(bucket, (hour + 2) * 3600000, HOURLY_LIMIT + 1),
      env.APPEALS_DB.prepare(`INSERT INTO appeals(id, received_at, subject, question_type, question_id, category, message, expected_answer, context_json, payload_hash, updated_at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?2 FROM appeal_limits WHERE bucket = ?11 AND requests <= ?12 ON CONFLICT(id) DO NOTHING`)
        .bind(entry.id, timestamp, entry.subject, entry.context?.type || null, entry.context?.questionId || null, entry.category, entry.message, entry.expectedAnswer, JSON.stringify(entry.source ? { ...entry.context, source: entry.source } : entry.context), digest, bucket, HOURLY_LIMIT),
    ]);
    if (!result[2].meta.changes) {
      const retry = await env.APPEALS_DB.prepare('SELECT payload_hash FROM appeals WHERE id = ?1').bind(entry.id).first();
      if (retry?.payload_hash === digest) return json({ id: entry.id, received: true });
      if (retry) return json({ error: '접수 번호가 이미 사용되었습니다.' }, 409);
      return json({ error: '접수가 잠시 많아졌습니다. 한 시간 뒤 다시 제출해 주세요.' }, 429);
    }
    return json({ id: entry.id, received: true }, 201);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, error.status);
    // Do not log answers, feedback, or database details in public responses.
    console.error('appeal_submission_failed');
    return json({ error: '접수를 저장하지 못했습니다. 작성 내용을 유지한 채 다시 제출해 주세요.' }, 503);
  }
}
export function onRequest() {
  return new Response(JSON.stringify({ error: '제출만 지원합니다. 접수 내용은 운영자만 확인할 수 있습니다.' }), { status: 405, headers: { ...headers, allow: 'POST' } });
}
