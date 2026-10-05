import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppealForm } from "./Appeal.jsx";
import { HistoryContent } from "./History.jsx";
import Popup from "./Popup.jsx";
import { StudyPopupContext, popupSource } from "./popup-context.js";
import { appealOrigin, resolveAppealContext } from "./appeal-context.js";
import { historyStore } from "./history-store.js";

export default function StudyPopups({ children }) {
  const location = useLocation();
  const previousLocation = useRef(location.key);
  const sequence = useRef(0);
  const [popup, setPopup] = useState(null);
  const close = useCallback(() => setPopup(null), []);
  const present = useCallback(next => setPopup({ ...next, instance: ++sequence.current }), []);
  const openHistory = useCallback(() => present({ kind: "history" }), [present]);
  const openAppeal = useCallback(data => present({ kind: "appeal", data }), [present]);
  const actions = useMemo(() => ({ openHistory, openAppeal, close }), [openHistory, openAppeal, close]);
  useEffect(() => {
    if (location.state?.studyPopup) present(location.state.studyPopup);
    else if (location.key !== previousLocation.current) close();
    previousLocation.current = location.key;
  }, [location.key, location.state, close, present]);
  return <StudyPopupContext.Provider value={actions}>
    {children}
    {popup && <Popup key={popup.instance} title={popup.kind === "history" ? "히스토리" : "이의제기"} wide={popup.kind === "history"} onClose={close}>
      {popup.kind === "history" ? <HistoryContent onNavigate={close} /> : <AppealForm {...popup.data} onClose={close} />}
    </Popup>}
  </StudyPopupContext.Provider>;
}

// Old bookmarks still open the same popup over their originating study screen.
export function LegacyPopupRoute({ kind }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      const params = new URLSearchParams(location.search);
      const subject = params.get("subject") || "hand-memo";
      const origin = appealOrigin(location.search, subject);
      const fallback = `/menu?subject=${encodeURIComponent(subject === "all" ? "hand-memo" : subject)}`;
      const back = kind === "appeal" && /^\/(viewer|quiz|short|blank|essay|questions|prediction-analysis|menu)(?:\?|$)/.test(origin.back) ? origin.back : fallback;
      let context = null;
      if (kind === "appeal" && origin.type && origin.questionId) try {
        const response = await fetch(`/api/practice-bank?${new URLSearchParams({ subject, type: origin.type, q: origin.questionId, pageSize: "100" })}`, { signal: abort.signal });
        const question = response.ok && (await response.json()).items.find(item => item.id === origin.questionId);
        if (question) {
          const saved = await historyStore.loadBank({ subject, type: origin.type }).catch(() => ({ attempts: [] }));
          context = resolveAppealContext(question, origin, saved, location.state?.appealSnapshot, subject).context;
        }
      } catch { /* The simple feedback box remains usable without old context. */ }
      if (!abort.signal.aborted) {
        const url = new URL(back, "https://study.local");
        navigate(back, { replace: true, state: { studyPopup: { kind, data: { subject, context, source: popupSource(url) } } } });
      }
    })();
    return () => abort.abort();
  }, [kind, location.search, location.state, navigate]);
  return <p role="status">{kind === "history" ? "히스토리" : "이의제기"}를 여는 중…</p>;
}
