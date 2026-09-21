import { useCallback, useEffect, useState } from "react";

export function useQuestionBank(path, select) {
  const [bank, setBank] = useState([]);
  const [index, setIndex] = useState(0);
  const [records, setRecords] = useState({});
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(path, { signal: abort.signal }).then(r => {
      if (!r.ok) throw new Error("문제를 불러오지 못했습니다.");
      return r.json();
    }).then(list => {
      const selected = select ? select(list) : list;
      if (!selected.length) throw new Error("준비된 문제가 없습니다.");
      setBank(selected);
    }).catch(err => { if (err.name !== "AbortError") setError(err.message); });
    return () => abort.abort();
  }, [path, select]);
  const q = bank[index % bank.length] || null;
  const id = q?.id;
  const record = records[id] || {};
  const update = useCallback(patch => {
    if (!id) return;
    setRecords(all => ({ ...all, [id]: { ...all[id], ...patch } }));
  }, [id]);
  const setValue = useCallback(value => update({ value }), [update]);
  const setResult = useCallback(result => update({ result }), [update]);
  return { q, record, update, value: record.value ?? "", setValue, result: record.result ?? null, setResult,
    next: () => setIndex(n => n + 1), previous: () => setIndex(n => Math.max(0, n - 1)),
    canPrevious: index > 0, position: bank.length ? index % bank.length + 1 : 0, count: bank.length, error };
}
