import { Link } from "react-router-dom";
import { clean } from "./text.js";

export function reasonOf(q) {
  const source = clean(q.explain).split("—").slice(1).join("—").trim();
  return source === answerOf(q) ? "" : source;

}

export function answerOf(q) {
  if (q.type === "mc") return clean((q.choices || [])[q.answer]);
  return clean(q.answer);
}

export function Mark({ good, children }) {
  if (good) {
    return (
      <span className="mark-ok">
        <svg viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true">
          <ellipse className="ring" cx="60" cy="24" rx="54" ry="18" />
        </svg>
        {children}
      </span>
    );
  }
  return <span className="mark-bad"><svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path className="strike" d="M 1 15 L 99 9" /></svg>{children}</span>;
}

export function After({ q }) {
  const why = reasonOf(q);
  return (
    <div className="after">
      <p className="ans">정답 {answerOf(q)}</p>
      {why && <p className="why">{why}</p>}
      {q.page && <Link className="source-link" to={`/viewer?page=${q.page}`}>뷰어 근거 보기 ↗</Link>}
    </div>
  );
}
