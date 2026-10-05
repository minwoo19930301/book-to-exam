export const HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const HISTORY_TYPES = { mc: "객관식", short: "단답형", blank: "빈칸", essay: "서술형" };
export const HISTORY_ROUTES = { mc: "/quiz", short: "/short", blank: "/blank", essay: "/essay" };
export const HISTORY_STATUS = { correct: "정답", incorrect: "오답", ungraded: "미채점", review: "검토 필요" };
const ERROR = "풀이 기록을 저장하지 못했습니다. 브라우저의 저장 공간과 설정을 확인해 주세요.";
const listeners = new Set();
let channel;
function notify(event) {
  for (const listener of listeners) listener(event);
  channel?.postMessage(event);
}
export function subscribeHistory(listener) {
  if (!channel && typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("bte-study-history");
    channel.onmessage = event => { for (const callback of listeners) callback(event.data); };
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function historyId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function resultStatus(result) {
  if (!result) return "ungraded";
  if (result.status === "review" || result.good === null || result.score === null) return "review";
  if (typeof result.good === "boolean") return result.good ? "correct" : "incorrect";
  if (Number.isFinite(result.total) && Number.isFinite(result.max) && result.max > 0) return result.total >= result.max ? "correct" : "incorrect";
  return "review";
}
export function questionStatistics(attempts, questionId, currentId) {
  const previous = attempts.filter(item => item.questionId === questionId && item.id !== currentId);
  const graded = attempts.filter(item => item.questionId === questionId && ["correct", "incorrect"].includes(resultStatus(item.result)));
  const correct = graded.filter(item => resultStatus(item.result) === "correct").length;
  return { attempts: previous.length, graded: graded.length, correct, percent: graded.length ? Math.round(correct * 100 / graded.length) : null };
}
export function latestQuestionAttempts(attempts) {
  const records = {};
  for (const attempt of attempts) {
    const previous = records[attempt.questionId];
    // A delayed score changes updatedAt, but does not make an older try the
    // student's most recently started attempt.
    if (!previous || attempt.startedAt > previous.startedAt ||
      (attempt.startedAt === previous.startedAt && (attempt.attemptNumber || 1) > (previous.attemptNumber || 1))) {
      records[attempt.questionId] = { ...attempt, touched: true };
    }
  }
  return records;
}
export function retryUrl(attempt) {
  const params = new URLSearchParams({ subject: attempt.subject, q: attempt.questionId, retry: historyId() });
  return `${HISTORY_ROUTES[attempt.type] || "/quiz"}?${params}`;
}
export function resumeUrl(attempt) {
  return `${HISTORY_ROUTES[attempt.type] || "/quiz"}?${new URLSearchParams({ subject: attempt.subject, q: attempt.questionId })}`;
}

export function createHistoryStore({ indexedDB = globalThis.indexedDB, now = () => Date.now(), database = "bte-study-history" } = {}) {
  let databasePromise;
  const journalPrefix = `${database}:pending:`;
  function journalStorage() { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
  function stage(key, value) {
    const encoded = JSON.stringify(value);
    try { journalStorage()?.setItem(journalPrefix + key, encoded); } catch { /* IndexedDB still reports its own failure. */ }
    return encoded;
  }
  function unstage(key, encoded) {
    try { const storage = journalStorage(); if (encoded === undefined || storage?.getItem(journalPrefix + key) === encoded) storage?.removeItem(journalPrefix + key); } catch { /* Storage may be disabled. */ }
  }
  function open() {
    if (!indexedDB) return Promise.reject(new Error(ERROR));
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, keyPath] of [["attempts", "id"], ["sessions", "key"], ["meta", "key"]]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      };
      request.onerror = () => { databasePromise = null; reject(new Error(ERROR)); };
      request.onblocked = () => { databasePromise = null; reject(new Error(ERROR)); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = null; };
        resolve(db);
      };
    });
    return databasePromise;
  }
  async function transaction(callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let value;
      const tx = db.transaction(["attempts", "sessions", "meta"], "readwrite");
      const stores = Object.fromEntries(["attempts", "sessions", "meta"].map(name => [name, tx.objectStore(name)]));
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(new Error(ERROR));
      try { callback(stores, next => { value = next; }); } catch { tx.abort(); reject(new Error(ERROR)); }
    });
  }
  function readMany(requests, callback) {
    const values = []; let count = 0;
    requests.forEach((request, index) => { request.onsuccess = () => { values[index] = request.result; if (++count === requests.length) callback(values); }; });
  }
  function writeAttempt(attempt, { session, revision = 0 } = {}) {
    return transaction((stores, done) => readMany([stores.meta.get("revision"), stores.meta.get(`deleted:${attempt.id}`), stores.attempts.get(attempt.id)], ([epoch, deleted, existing]) => {
      if ((epoch?.value || 0) !== revision || deleted || (existing && existing.updatedAt > attempt.updatedAt)) return done(false);
      const { id, subject, type, questionId, question, value, result, startedAt, updatedAt, attemptNumber } = attempt;
      stores.attempts.put({ id, subject, type, questionId, question, value, result: result ?? null, startedAt, updatedAt, attemptNumber });
      if (session) stores.sessions.put({ ...session, key: `${session.subject}:${session.type}` });
      done(true);
    }));
  }
  function writeSession(session, { revision = 0 } = {}) {
    return transaction((stores, done) => readMany([stores.meta.get("revision"), stores.meta.get(`deleted:${session.attemptId}`), stores.sessions.get(`${session.subject}:${session.type}`)], ([epoch, deleted, existing]) => {
      if ((epoch?.value || 0) !== revision || deleted || (existing && existing.updatedAt > session.updatedAt)) return done(false);
      stores.sessions.put({ ...session, key: `${session.subject}:${session.type}` }); done(true);
    }));
  }
  async function recoverPending() {
    // A small synchronous journal covers closing/reloading before an IndexedDB transaction commits.
    // Successful commits remove it; deletion tombstones and revisions also apply during recovery.
    const entries = [];
    try {
      const storage = journalStorage();
      for (let index = 0; storage && index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(journalPrefix)) entries.push([key.slice(journalPrefix.length), storage.getItem(key)]);
      }
    } catch { return; }
    entries.sort((a, b) => { try { return JSON.parse(a[1]).updatedAt - JSON.parse(b[1]).updatedAt; } catch { return 0; } });
    for (const [key, encoded] of entries) {
      let entry;
      try { entry = JSON.parse(encoded); } catch { unstage(key, encoded); continue; }
      if (!(entry.updatedAt > now() - HISTORY_TTL_MS)) { unstage(key, encoded); continue; }
      if (entry.kind === "attempt") await writeAttempt(entry.attempt, entry.options);
      else if (entry.kind === "session") await writeSession(entry.session, entry.options);
      unstage(key, encoded);
    }
  }
  async function snapshot() {
    await recoverPending();
    return transaction((stores, done) => readMany([stores.attempts.getAll(), stores.sessions.getAll(), stores.meta.getAll()], ([attempts, sessions, metadata]) => {
      const cutoff = now() - HISTORY_TTL_MS;
      const kept = attempts.filter(item => Number.isFinite(item.updatedAt) && item.updatedAt > cutoff);
      const keptIds = new Set(kept.map(item => item.id));
      for (const item of attempts) if (!keptIds.has(item.id)) stores.attempts.delete(item.id);
      const activeSessions = sessions.filter(item => item.updatedAt > cutoff && (!item.attemptId || keptIds.has(item.attemptId)));
      const keys = new Set(activeSessions.map(item => item.key));
      for (const item of sessions) if (!keys.has(item.key)) stores.sessions.delete(item.key);
      for (const item of metadata) if (item.expiresAt && item.expiresAt <= now()) stores.meta.delete(item.key);
      done({ attempts: kept.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), sessions: activeSessions,
        revision: metadata.find(item => item.key === "revision")?.value || 0 });
    }));
  }
  return {
    async listAttempts() { return (await snapshot()).attempts; },
    async loadBank({ subject, type }) {
      const data = await snapshot();
      return { attempts: data.attempts.filter(item => item.subject === subject && item.type === type),
        session: data.sessions.find(item => item.key === `${subject}:${type}`) || null, revision: data.revision };
    },
    async saveAttempt(attempt, { session, revision = 0 } = {}) {
      if (!attempt.id || !attempt.questionId || !HISTORY_TYPES[attempt.type] || !attempt.subject) throw new Error(ERROR);
      const { id, subject, type, questionId, question, value, result, startedAt, updatedAt, attemptNumber } = attempt;
      attempt = { id, subject, type, questionId, question, value, result, startedAt, updatedAt, attemptNumber };
      const options = { session, revision };
      const encoded = stage(attempt.id, { kind: "attempt", attempt, options, updatedAt: attempt.updatedAt });
      const saved = await writeAttempt(attempt, options);
      unstage(attempt.id, encoded);
      if (saved) notify({ type: "save", subject: attempt.subject, kind: attempt.type });
      return saved;
    },
    async saveSession(session, { revision = 0 } = {}) {
      const key = `session:${session.subject}:${session.type}`;
      const encoded = stage(key, { kind: "session", session, options: { revision }, updatedAt: session.updatedAt });
      const saved = await writeSession(session, { revision });
      unstage(key, encoded);
      return saved;
    },
    async deleteAttempt(id) {
      unstage(id);
      await transaction((stores, done) => {
        stores.attempts.delete(id);
        stores.meta.put({ key: `deleted:${id}`, expiresAt: now() + HISTORY_TTL_MS });
        const request = stores.sessions.getAll();
        request.onsuccess = () => { for (const session of request.result) if (session.attemptId === id) stores.sessions.delete(session.key); done(true); };
      });
      notify({ type: "delete", id });
    },
    async clearHistory() {
      const revision = await transaction((stores, done) => {
        const request = stores.meta.get("revision");
        request.onsuccess = () => {
          const next = (request.result?.value || 0) + 1;
          stores.attempts.clear(); stores.sessions.clear(); stores.meta.clear();
          stores.meta.put({ key: "revision", value: next }); done(next);
        };
      });
      notify({ type: "clear", revision });
      try {
        const storage = journalStorage();
        for (const key of Object.keys(storage || {})) if (key.startsWith(journalPrefix) || (database === "bte-study-history" && key.startsWith("bve-essay-"))) storage.removeItem(key);
      } catch { /* Pending writes still carry the old revision and cannot be restored. */ }
    },
    async close() { if (databasePromise) (await databasePromise).close(); databasePromise = null; },
  };
}

export const historyStore = createHistoryStore();
