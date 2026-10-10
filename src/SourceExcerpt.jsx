import { Link } from "react-router-dom";
import { subjectUrl } from "./subjects.jsx";
import { maskExcerpt } from "./source-excerpts.js";

export default function SourceExcerpt({ question, excerpts, revealed, subject }) {
  if (!excerpts.length) return null;
  return <section className="source-reading" aria-label="문제 원문 발췌">
    <div className="source-reading-heading"><h3>원문 읽기</h3><span>{revealed ? "원문 표현 확인" : "정답 표현 가림"}</span></div>
    <p className="muted source-reading-note">{question.provenance?.sourceStatus === "capture-compared-excerpt" ? "원본 캡처와 대조한 발췌문입니다. AI가 문항에 사용한 부분을 확인했으며, 페이지 전체를 검수한 것은 아닙니다." : "교재에 수록된 발췌문입니다."}{!revealed && " 정답에 해당하는 표현은 ‘해당 용어’로 가렸습니다."}</p>
    {excerpts.map((entry, index) => <blockquote key={`${entry.page}-${index}`}>
      <p>{revealed ? entry.text : maskExcerpt(entry.text, question)}</p>
      {revealed && <Link className="source-link" to={subjectUrl(`/viewer?page=${encodeURIComponent(entry.page)}`, subject)}>교재 원문·그림 보기 ↗</Link>}
    </blockquote>)}
  </section>;
}
