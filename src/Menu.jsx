import { Link, useNavigate } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import { studyDescription, subjectUrl, useSubject, useSubjects } from "./subjects.jsx";

const ITEMS = [
  { label: "문제은행 · 정답과 해설", to: "/questions" },
  { label: "뷰어", to: "/viewer" },
  { label: "객관식", to: "/quiz" },
  { label: "빈칸 채우기", to: "/blank" },
  { label: "단답형", to: "/short" },
  { label: "서술형", to: "/essay" },
];

export default function Menu() {
  const nav = useNavigate();
  const { to, subject } = useSubject();
  const { subjects } = useSubjects();
  return (
    <Chrome title="">
      <div className="menu-real static">
        <p className="kicker">{subject?.title || "역사 학습"}</p>
        <h1>어떻게 공부할까요?</h1>
        <p className="muted">교재와 그림을 읽고, 문제를 풀며 복습해 보세요.</p>
        {ITEMS.map((item) => (
          <button key={item.to} className="menu-item" type="button" onClick={() => nav(to(item.to))} disabled={!subject}>
            <span>{item.label}</span><span className="menu-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
        <section className="subject-library" aria-label="과목별 학습">
          <h2>과목별 학습</h2>
          <div className="subject-cards">
            {subjects.map(item => <Link className="subject-card" key={item.id} to={subjectUrl("/viewer", item.id)}>
              <strong>{item.title}<span aria-hidden="true"> ↗</span></strong>
              <span className="muted">{studyDescription(item)}</span>
              {item.counts && <span className="subject-counts">교재 자료 {item.counts.notes ?? 0}개 · 연습문항 {item.counts.questions ?? 0}개</span>}
            </Link>)}
          </div>
        </section>
      </div>
    </Chrome>
  );
}
