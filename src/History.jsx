import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import { useSubject, useSubjects } from "./subjects.jsx";
import { HISTORY_STATUS, HISTORY_TYPES, historyStore, resultStatus, retryUrl, subscribeHistory } from "./history-store.js";

const text = value => String(value ?? "").replace(/\*\*/g, "");
function shownAnswer(attempt) {
  if (attempt.type === "mc" && attempt.value !== "" && Number.isInteger(Number(attempt.value))) return `${Number(attempt.value) + 1}번 · ${text(attempt.question?.choices?.[Number(attempt.value)])}`;
  return text(attempt.value) || "아직 작성하지 않았습니다.";
}
function resultLabel(attempt) {
  const result = attempt.result;
  if (attempt.type === "essay" && Number.isFinite(result?.total)) return `${result.total} / ${result.max}점`;
  return HISTORY_STATUS[resultStatus(result)];
}

export default function History() {
  const { subjects } = useSubjects();
  const { id: currentSubject } = useSubject();
  const [state, setState] = useState({ attempts: [], loading: true, error: "" });
  const [subject, setSubject] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    const read = () => historyStore.listAttempts().then(attempts => { if (live) setState({ attempts, loading: false, error: "" }); }).catch(error => { if (live) setState(current => ({ ...current, loading: false, error: error.message })); });
    read();
    const stop = subscribeHistory(read);
    window.addEventListener("focus", read);
    return () => { live = false; stop(); window.removeEventListener("focus", read); };
  }, [reload]);
  async function remove(id) {
    setDeleting(true);
    try { if (id) await historyStore.deleteAttempt(id); else { await historyStore.clearHistory(); setConfirmClear(false); } }
    catch (error) { setState(current => ({ ...current, error: error.message })); }
    finally { setDeleting(false); }
  }
  const filtered = state.attempts.filter(attempt => (subject === "all" || attempt.subject === subject) && (type === "all" || attempt.type === type) &&
    (status === "all" || resultStatus(attempt.result) === status || (status === "ungraded" && resultStatus(attempt.result) === "review")));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 30, currentPage * 30);
  function filter(set, value) { set(value); setPage(1); }
  return <Chrome title="히스토리" subjectControls={false} navigationSubject={subject === "all" ? (subjects.some(item => item.id === currentSubject) ? currentSubject : "hand-memo") : subject}>
    <header className="history-heading"><div><p className="kicker">히스토리</p><h1>나의 풀이 기록</h1><p className="muted">답안과 결과를 이 브라우저에 30일 동안 보관합니다.</p></div><button className="ghost" type="button" disabled={!state.attempts.length || deleting} onClick={() => setConfirmClear(true)}>전체 삭제</button></header>
    {confirmClear && <section className="card history-delete-confirm" role="alert"><p>저장된 모든 답안과 이어 풀기 기록을 삭제할까요?</p><div className="row"><button type="button" disabled={deleting} onClick={() => remove()}>모든 기록 삭제</button><button type="button" className="ghost" onClick={() => setConfirmClear(false)}>취소</button></div></section>}
    <section className="card history-filters" aria-label="풀이 기록 필터"><label>과목<select aria-label="기록 과목" value={subject} onChange={event => filter(setSubject, event.target.value)}><option value="all">전체 과목</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>유형<select aria-label="기록 유형" value={type} onChange={event => filter(setType, event.target.value)}><option value="all">전체 유형</option>{Object.entries(HISTORY_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>결과<select aria-label="결과" value={status} onChange={event => filter(setStatus, event.target.value)}><option value="all">전체 결과</option><option value="correct">정답·만점</option><option value="incorrect">오답·부분점수</option><option value="ungraded">미채점·검토 필요</option></select></label></section>
    {state.error && <div className="history-storage-error" role="alert"><p>{state.error}</p><button type="button" className="ghost" onClick={() => setReload(value => value + 1)}>다시 불러오기</button></div>}
    {state.loading ? <p role="status">풀이 기록을 불러오는 중…</p> : <>
      <p className="muted" role="status">{filtered.length.toLocaleString()}개의 풀이 기록</p>
      {!visible.length && <section className="card"><h2>{state.attempts.length ? "조건에 맞는 기록이 없습니다." : "아직 풀이 기록이 없습니다."}</h2><p className="muted">문제를 풀거나 답안을 작성하면 여기에 모입니다.</p><Link className="text-link" to="/menu">학습하러 가기 ↗</Link></section>}
      {visible.map(attempt => <article className="card history-entry" key={attempt.id}>
        <div className="history-entry-meta"><span>{subjects.find(item => item.id === attempt.subject)?.title || attempt.subject} · {HISTORY_TYPES[attempt.type]} · {attempt.attemptNumber || 1}번째 시도</span><time dateTime={new Date(attempt.updatedAt).toISOString()}>{new Date(attempt.updatedAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
        <h2>{text(attempt.question?.title || attempt.question?.prompt || attempt.questionId)}</h2>
        {attempt.question?.title && <p className="history-prompt">{text(attempt.question?.prompt)}</p>}
        <p className={`history-outcome ${resultStatus(attempt.result)}`}>{resultLabel(attempt)}</p>
        <details><summary>내 답안과 결과 보기</summary><p className="history-answer">{shownAnswer(attempt)}</p>
          {attempt.result?.feedback && <p>{text(attempt.result.feedback)}</p>}
          {attempt.result?.explain && <p className="muted">{text(attempt.result.explain)}</p>}
          {attempt.result?.items?.length > 0 && <ul className="score-items">{attempt.result.items.map((item, index) => <li key={item.id || index}><strong>{item.label} · {item.score} / {item.max}점</strong><p>{text(item.comment)}</p>{item.studentQuote && <blockquote>{text(item.studentQuote)}</blockquote>}</li>)}</ul>}
        </details>
        <div className="history-entry-actions"><Link className="cta" to={retryUrl(attempt)}>새 시도로 다시 풀기</Link><button type="button" className="text-btn" disabled={deleting} onClick={() => remove(attempt.id)}>기록 삭제</button></div>
      </article>)}
      {pages > 1 && <nav className="bank-pagination" aria-label="히스토리 페이지"><button className="ghost" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage} / {pages}</span><button className="ghost" type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
    </>}
  </Chrome>;
}
