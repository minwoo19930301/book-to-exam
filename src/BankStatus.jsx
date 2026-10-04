import { useGuide } from "./guide-mode.jsx";

export default function BankStatus({ bank }) {
  const guide = useGuide();
  return <>
    {bank.error && <p role="alert">{bank.error}</p>}
    {bank.loading && <p role="status">문제를 불러오는 중…</p>}
    {!guide && bank.q && <p className="muted exam-progress">{bank.position} / {bank.count}문항</p>}
    {!guide && bank.q?.provenance?.origin === "authored-practice" && <p className="muted source-hint">교재 기반 자체 제작 연습문항 · 원문 대조 전</p>}
  </>;
}
