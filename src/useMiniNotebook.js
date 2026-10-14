import { useCallback, useEffect, useRef, useState } from "react";

const EMPTY_KEYS = [];
const READ_ERROR = "오답노트를 불러오지 못했어요. 현재 화면에서는 사용할 수 있지만 새로고침하면 변경 내용이 사라질 수 있어요.";
const WRITE_ERROR = "오답노트를 이 기기에 저장하지 못했어요. 현재 화면에서는 사용할 수 있지만 새로고침하면 변경 내용이 사라질 수 있어요.";
const validKey = key => typeof key === "string" && /^(short|blank):[^\s]+$/u.test(key);
const normalize = keys => [...new Set(Array.isArray(keys) ? keys.filter(validKey) : [])];

function readKeys(scope) {
  const raw = localStorage.getItem(scope);
  if (raw == null) return [];
  const saved = JSON.parse(raw);
  if (saved?.version !== 1 || !Array.isArray(saved.keys)) throw new Error("Invalid mini notebook");
  return normalize(saved.keys);
}

function applyChanges(keys, changes) {
  const next = new Set(keys);
  for (const change of changes) {
    if (change.remove) next.delete(change.key);
    else next.add(change.key);
  }
  return [...next];
}

const sameKeys = (left, right) => left.length === right.length && left.every((key, index) => key === right[index]);

// This notebook has no expiry and never writes to the graded study history.
export function useMiniNotebook(subject) {
  const scope = typeof subject === "string" && subject.trim() ? `bte-mini-notebook:v1:${subject}` : null;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const memory = useRef(new Map());
  const [state, setState] = useState({ scope: null, keys: EMPTY_KEYS, storageError: "" });

  const publish = useCallback((target, entry) => {
    const previous = memory.current.get(target);
    if (previous && sameKeys(previous.keys, entry.keys)) entry = { ...entry, keys: previous.keys };
    memory.current.set(target, entry);
    if (activeScope.current !== target) return;
    setState(current => current.scope === target && current.keys === entry.keys && current.storageError === entry.storageError
      ? current : { scope: target, keys: entry.keys, storageError: entry.storageError });
  }, []);

  useEffect(() => {
    if (!scope) return;
    function load() {
      const previous = memory.current.get(scope) || { keys: EMPTY_KEYS, pending: [], storageError: "" };
      try {
        // Keep unsaved local operations while accepting additions/removals from
        // other tabs. Merely reading or changing subjects never writes storage.
        publish(scope, { ...previous, keys: applyChanges(readKeys(scope), previous.pending),
          storageError: previous.pending.length ? previous.storageError : "" });
      } catch { publish(scope, { ...previous, storageError: READ_ERROR }); }
    }
    load();
    const changed = event => { if (event.key === scope || event.key === null) load(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [scope, publish]);

  const change = useCallback((key, remove) => {
    if (!scope || activeScope.current !== scope || !validKey(key)) return;
    const previous = memory.current.get(scope) || { keys: EMPTY_KEYS, pending: [], storageError: "" };
    const pending = [...previous.pending, { key, remove }];
    let keys;
    try { keys = applyChanges(readKeys(scope), pending); }
    catch {
      // Do not overwrite unknown stored data when reading it failed. Retain
      // these operations in memory and merge them on the next successful edit.
      publish(scope, { keys: applyChanges(previous.keys, [{ key, remove }]), pending, storageError: READ_ERROR });
      return;
    }
    try {
      // Read-modify-write is synchronous and happens only after a user action.
      localStorage.setItem(scope, JSON.stringify({ version: 1, keys }));
      publish(scope, { keys, pending: [], storageError: "" });
    } catch { publish(scope, { keys, pending, storageError: WRITE_ERROR }); }
  }, [scope, publish]);

  const add = useCallback(key => change(key, false), [change]);
  const remove = useCallback(key => change(key, true), [change]);
  const ready = Boolean(scope) && state.scope === scope;
  return { keys: ready ? state.keys : EMPTY_KEYS, ready, storageError: ready ? state.storageError : "", add, remove };
}
