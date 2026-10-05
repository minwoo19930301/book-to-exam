import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGuide } from "./guide-mode.jsx";
import { historyId, historyStore, latestQuestionAttempts, questionStatistics, subscribeHistory } from "./history-store.js";

function empty(path, select) {
  return { path, select, bank: [], index: 0, records: {}, attempts: [], error: "", storageError: "", notice: "", loading: Boolean(path), scope: {}, revision: 0, urlToken: "" };
}
function newRecord(attempts, questionId) {
  const timestamp = Math.max(Date.now(), ...attempts.filter(item => item.questionId === questionId).map(item => item.updatedAt + 1));
  return { id: historyId(), value: "", result: null, startedAt: timestamp, updatedAt: timestamp,
    attemptNumber: Math.max(0, ...attempts.filter(item => item.questionId === questionId).map(item => item.attemptNumber || 1)) + 1, touched: false };
}
function snapshot(question) {
  const { id, title, prompt, choices, answer, explain, page, before, after } = question;
  return { id, title, prompt, choices, answer, explain, page, before, after };
}
function selectQuestion(state, index, fresh = false) {
  const question = state.bank[index];
  if (!question) return state;
  const record = fresh || !state.records[question.id] ? newRecord(state.attempts, question.id) : state.records[question.id];
  return { ...state, index, records: { ...state.records, [question.id]: fresh ? { ...record, touched: true } : record } };
}
const urlToken = search => {
  const params = new URLSearchParams(search);
  return `${params.get("q") || ""}:${params.get("retry") || ""}`;
};

export function useQuestionBank(path, select, { subject = "hand-memo", type = "mc" } = {}) {
  const guide = useGuide();
  const persistent = !guide;
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;
  const [state, setState] = useState(() => empty(null, null));
  const current = useRef(state);
  const contexts = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const commit = useCallback(next => {
    contexts.current.set(next.scope, next);
    current.current = next;
    if (mounted.current) setState(next);
  }, []);
  const storageFailure = useCallback((scope, error) => {
    if (current.current.scope === scope) commit({ ...current.current, storageError: error.message || "풀이 기록을 저장하지 못했습니다." });
  }, [commit]);
  const sessionOf = useCallback(next => {
    const question = next.bank[next.index], record = next.records[question?.id];
    return { subject, type, questionId: question?.id, attemptId: record?.touched ? record.id : null, updatedAt: Date.now(), retryToken: next.retryToken || "" };
  }, [subject, type]);
  const persistSession = useCallback(next => {
    if (!persistent || !next.bank.length) return;
    historyStore.saveSession(sessionOf(next), { revision: next.revision }).catch(error => storageFailure(next.scope, error));
  }, [persistent, sessionOf, storageFailure]);
  const persistRecord = useCallback((next, question, record, saveSession = true) => {
    if (!persistent || !record.touched) return;
    const attempt = { id: record.id, subject, type, questionId: question.id, question: snapshot(question), value: record.value,
      result: record.result, startedAt: record.startedAt, updatedAt: record.updatedAt, attemptNumber: record.attemptNumber };
    historyStore.saveAttempt(attempt, { revision: next.revision,
      ...(saveSession && mounted.current && current.current.scope === next.scope &&
        current.current.records[question.id]?.id === record.id && next.bank[next.index]?.id === question.id
        ? { session: sessionOf(next) } : {}) }).catch(error => storageFailure(next.scope, error));
  }, [persistent, subject, type, sessionOf, storageFailure]);

  useEffect(() => {
    const abort = new AbortController();
    const initial = empty(path, select);
    commit(initial);
    if (!path) return () => abort.abort();
    (async () => {
      try {
        const response = await fetch(path, { signal: abort.signal });
        if (!response.ok) throw new Error("문제를 불러오지 못했습니다. 새로고침해 주세요.");
        const list = await response.json();
        if (!Array.isArray(list)) throw new Error("문제 데이터의 형식을 확인할 수 없습니다.");
        const bank = select ? select(list) : list;
        if (!bank.length) throw new Error("이 과목에는 아직 준비된 문제가 없습니다.");
        let saved = { attempts: [], session: null, revision: 0 }, storageError = "";
        if (persistent) try { saved = await historyStore.loadBank({ subject, type }); } catch (error) { storageError = error.message; }
        // Preserve pre-history essay drafts once, then let the same 30-day storage rules govern them.
        if (persistent && type === "essay" && !storageError) try {
          for (const question of bank) {
            const key = subject === "hand-memo" ? `bve-essay-${question.id}` : `bve-essay-${subject}-${question.id}`;
            const draft = localStorage.getItem(key);
            if (!draft) continue;
            if (!saved.attempts.some(item => item.questionId === question.id)) {
              const attempt = { ...newRecord(saved.attempts, question.id), subject, type, questionId: question.id, question: snapshot(question), value: draft };
              if (await historyStore.saveAttempt(attempt, { revision: saved.revision })) saved.attempts.push(attempt);
            }
            localStorage.removeItem(key);
          }
        } catch (error) { storageError = error.message || "이전 답안을 옮기지 못했습니다."; }
        if (abort.signal.aborted) return;
        const ids = new Set(bank.map(question => question.id));
        const records = latestQuestionAttempts(saved.attempts.filter(attempt => ids.has(attempt.questionId)));
        const params = new URLSearchParams(locationRef.current.search);
        const explicit = persistent ? params.get("q") : null;
        const chosen = explicit || saved.session?.questionId;
        const chosenIndex = bank.findIndex(question => question.id === chosen);
        let next = { ...initial, bank, records, attempts: saved.attempts, revision: saved.revision, storageError, loading: false,
          urlToken: urlToken(locationRef.current.search), retryToken: saved.session?.retryToken || "",
          notice: explicit && chosenIndex < 0 ? "요청한 문항을 찾지 못해 첫 문항을 열었습니다." : "" };
        next = selectQuestion(next, Math.max(0, chosenIndex));
        const retry = persistent ? params.get("retry") : null;
        if (retry && chosenIndex >= 0 && retry !== saved.session?.retryToken) {
          next = selectQuestion(next, chosenIndex, true);
          next.retryToken = retry;
          next.attempts = [...next.attempts, { ...next.records[chosen], subject, type, questionId: chosen }];
          persistRecord(next, bank[chosenIndex], next.records[chosen]);
        }
        commit(next);
        persistSession(next);
      } catch (error) { if (!abort.signal.aborted) commit({ ...initial, error: error.message, loading: false }); }
    })();
    return () => abort.abort();
  }, [path, select, subject, type, persistent, commit, persistRecord, persistSession]);

  const active = state.path === path && state.select === select;
  const bank = active ? state.bank : [];
  const q = bank[state.index] || null;
  const record = q ? state.records[q.id] || {} : {};
  const scope = active ? state.scope : null;
  const attemptId = record.id;
  const id = q?.id;

  const update = useCallback(patch => {
    const latest = contexts.current.get(scope) || current.current;
    const previous = latest.records[id];
    if (!id || !scope || latest.scope !== scope || previous?.id !== attemptId) return;
    const touched = previous.touched || ("value" in patch && patch.value !== "") || Boolean(patch.result);
    const saving = "value" in patch || "result" in patch;
    const nextRecord = { ...previous, ...patch, touched, ...(saving ? { updatedAt: Math.max(Date.now(), previous.updatedAt + 1) } : {}) };
    let next = { ...latest, records: { ...latest.records, [id]: nextRecord } };
    if (saving && touched) next.attempts = [...next.attempts.filter(item => item.id !== attemptId), { ...nextRecord, subject, type, questionId: id }];
    if (current.current.scope === scope) commit(next);
    else contexts.current.set(scope, next);
    if (saving && touched) persistRecord(next, latest.bank.find(question => question.id === id), nextRecord, "value" in patch);
  }, [id, scope, attemptId, subject, type, commit, persistRecord]);

  const choose = useCallback((index, fresh = false, changeUrl = true, retryToken = "") => {
    const latest = current.current;
    if (latest.scope !== scope || !Number.isInteger(index) || index < 0 || index >= latest.bank.length) return;
    let next = selectQuestion(latest, index, fresh);
    const question = next.bank[index];
    if (fresh) {
      next.retryToken = retryToken;
      next.attempts = [...next.attempts, { ...next.records[question.id], subject, type, questionId: question.id }];
      persistRecord(next, question, next.records[question.id]);
    }
    const params = new URLSearchParams(locationRef.current.search);
    if (changeUrl && persistent) { params.set("q", question.id); params.delete("retry"); }
    next.urlToken = urlToken(changeUrl && persistent ? `?${params}` : locationRef.current.search);
    next.notice = "";
    commit(next);
    persistSession(next);
    if (changeUrl && persistent) navigate({ pathname: locationRef.current.pathname, search: `?${params}` }, { replace: true });
  }, [scope, subject, type, persistent, commit, navigate, persistRecord, persistSession]);

  useEffect(() => {
    if (!persistent || !bank.length || state.urlToken === urlToken(location.search)) return;
    const params = new URLSearchParams(location.search), requested = params.get("q");
    const index = bank.findIndex(question => question.id === requested);
    const retry = params.get("retry");
    if (index >= 0) choose(index, Boolean(retry && retry !== current.current.retryToken), false, retry || "");
    else commit({ ...current.current, urlToken: urlToken(location.search), notice: requested ? "이 문항은 현재 과목에서 찾을 수 없습니다." : "" });
  }, [location.search, bank, state.urlToken, persistent, choose, commit]);

  useEffect(() => persistent ? subscribeHistory(event => {
    if (!["delete", "clear"].includes(event?.type)) return;
    const latest = current.current;
    if (latest.scope !== scope) return;
    const attempts = event.type === "clear" ? [] : latest.attempts.filter(item => item.id !== event.id);
    const records = Object.fromEntries(Object.entries(latest.records).filter(([, value]) => event.type !== "clear" && value.id !== event.id));
    const next = selectQuestion({ ...latest, attempts, records, revision: event.type === "clear" ? event.revision : latest.revision }, latest.index);
    commit(next);
  }) : undefined, [persistent, scope, commit]);

  const setValue = useCallback(value => update({ value }), [update]);
  const setResult = useCallback(result => update({ result }), [update]);
  const historyStats = questionStatistics(active ? state.attempts : [], id, attemptId);
  return { q, record, update, value: record.value ?? "", setValue, result: record.result ?? null, setResult,
    next: () => choose((state.index + 1) % bank.length), previous: () => choose(state.index - 1),
    jump: position => choose(Number(position) - 1), retry: () => choose(state.index, true),
    canPrevious: active && state.index > 0, position: q ? state.index + 1 : 0, count: bank.length,
    attemptNumber: record.attemptNumber || 1, historyStats, storageError: active ? state.storageError : "", notice: active ? state.notice : "",
    error: active ? state.error : "", loading: active ? state.loading : Boolean(path) };
}
