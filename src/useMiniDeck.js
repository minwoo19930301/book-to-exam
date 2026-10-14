import { useCallback, useEffect, useState } from "react";
import { miniSessionKey, moveMiniProgress, reshuffleMiniProgress, restoreMiniProgress } from "./mini-progress.js";

export function useMiniDeck(cards, subject, type, ready) {
  const scope = miniSessionKey(subject, type);
  const [state, setState] = useState({ scope: null, session: null, storageError: "" });
  useEffect(() => {
    if (!ready || !cards.length) return;
    let saved = null, storageError = "";
    try { saved = JSON.parse(localStorage.getItem(scope) || "null"); }
    catch { storageError = "이 기기에서 이어보기를 저장할 수 없어요. 지금 복습은 계속할 수 있습니다."; }
    setState({ scope, session: restoreMiniProgress(cards, saved), storageError });
  }, [cards, scope, ready]);
  useEffect(() => {
    if (state.scope !== scope || !state.session || !ready) return;
    try { localStorage.setItem(scope, JSON.stringify(state.session)); }
    catch {
      if (!state.storageError) setState(current => ({ ...current, storageError: "이 기기에서 이어보기를 저장할 수 없어요. 지금 복습은 계속할 수 있습니다." }));
    }
  }, [state, scope, ready]);
  const change = useCallback(update => setState(current => current.scope === scope && current.session
    ? { ...current, session: update(current.session) } : current), [scope]);
  const session = ready && state.scope === scope ? state.session : null;
  return { session, card: cards.find(card => card.key === session?.currentKey),
    position: session ? session.order.indexOf(session.currentKey) + 1 : 0,
    storageError: state.scope === scope ? state.storageError : "",
    reveal: () => change(value => ({ ...value, side: "answer", updatedAt: Date.now() })),
    hide: () => change(value => ({ ...value, side: "question", updatedAt: Date.now() })),
    next: () => change(value => moveMiniProgress(value, 1)),
    previous: () => change(value => moveMiniProgress(value, -1)),
    reshuffle: () => change(value => reshuffleMiniProgress(value)) };
}
