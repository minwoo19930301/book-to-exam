import { useCallback, useEffect, useState } from "react";

export function useQuestionBank(path, select) {
  const [state, setState] = useState({ path: null, select: null, bank: [], index: 0, records: {}, error: "", loading: false, scope: null });
  useEffect(() => {
    const abort = new AbortController();
    const scope = {};
    setState({ path, select, bank: [], index: 0, records: {}, error: "", loading: Boolean(path), scope });
    if (path) fetch(path, { signal: abort.signal }).then(r => {
      if (!r.ok) throw new Error("문제를 불러오지 못했습니다. 새로고침해 주세요.");
      return r.json();
    }).then(list => {
      if (!Array.isArray(list)) throw new Error("문제 데이터의 형식을 확인할 수 없습니다.");
      const selected = select ? select(list) : list;
      if (!selected.length) throw new Error("이 과목에는 아직 준비된 문제가 없습니다.");
      if (!abort.signal.aborted) setState(current => current.scope === scope ? { ...current, bank: selected, loading: false } : current);
    }).catch(err => {
      if (!abort.signal.aborted) setState(current => current.scope === scope ? { ...current, error: err.message, loading: false } : current);
    });
    return () => abort.abort();
  }, [path, select]);
  const active = state.path === path && state.select === select;
  const bank = active ? state.bank : [];
  const q = bank.length ? bank[state.index % bank.length] : null;
  const id = q?.id;
  const scope = active ? state.scope : null;
  const record = q ? state.records[id] || {} : {};
  const update = useCallback(patch => {
    if (!id || !scope) return;
    // Async grading must never update a different subject or a newly loaded bank.
    setState(current => current.scope === scope ? { ...current, records: { ...current.records, [id]: { ...current.records[id], ...patch } } } : current);
  }, [id, scope]);
  const move = useCallback(delta => setState(current => current.scope === scope ? { ...current, index: Math.max(0, current.index + delta) } : current), [scope]);
  const setValue = useCallback(value => update({ value }), [update]);
  const setResult = useCallback(result => update({ result }), [update]);
  return { q, record, update, value: record.value ?? "", setValue, result: record.result ?? null, setResult,
    next: () => move(1), previous: () => move(-1),
    canPrevious: active && state.index > 0, position: bank.length ? state.index % bank.length + 1 : 0,
    count: bank.length, error: active ? state.error : "", loading: active ? state.loading : Boolean(path) };
}
