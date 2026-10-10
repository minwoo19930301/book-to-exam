import { useEffect, useState } from "react";
import { useGuide } from "./guide-mode.jsx";

export default function BankStatus({ bank }) {
  const guide = useGuide();
  const [position, setPosition] = useState(String(bank.position));
  useEffect(() => setPosition(String(bank.position)), [bank.position]);
  return <>
    {bank.error && <p role="alert">{bank.error}</p>}
    {bank.loading && <p role="status">문제를 불러오는 중…</p>}
    {!guide && bank.storageError && <p className="history-storage-error" role="alert">{bank.storageError}</p>}
    {!guide && bank.notice && <p role="status" className="muted">{bank.notice}</p>}
    {!guide && bank.q && <div className="exam-progress-tools"><form className="question-jump" onSubmit={event => { event.preventDefault(); bank.jump(Number(position)); }}><label>문항 번호<input type="number" min="1" max={bank.count} value={position} onChange={event => setPosition(event.target.value)} required /></label><span>/ {bank.count}</span><button type="submit" className="ghost">이동</button></form><p className="muted exam-progress">이번 {bank.attemptNumber}번째 시도 · 누적 정답률 {bank.historyStats?.percent == null ? "기록 없음" : `${bank.historyStats.percent}% (${bank.historyStats.correct}/${bank.historyStats.graded})`}</p></div>}
    {!guide && ["authored-practice", "authored-short-practice", "authored-source-cloze", "authored-page-practice"].includes(bank.q?.provenance?.origin) && <p className="muted source-hint">교재 기반 자체 제작 연습문항 · 원문 대조 전</p>}
    {!guide && bank.q?.provenance?.origin === "authored-capture-practice" && <p className="muted source-hint">원본 캡처 발췌 대조 · AI 검토 연습문항</p>}
  </>;
}
