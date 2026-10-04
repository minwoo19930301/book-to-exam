import { Link } from "react-router-dom";
import { studyDescription, subjectUrl, useSubject, useSubjects } from "./subjects.jsx";

const MAIL = "rlaalsdn456456@naver.com";

export default function Home() {
  const { subjects } = useSubjects();
  const { to } = useSubject();
  return (
    <div className="page landing">
      <p className="kicker">Book To Exam</p>
      <h1>교재 자료를 이메일로 보내주세요.</h1>
      <p className="muted">책 넘기는 영상, 캡처본, PDF, DOCX, HWP를 보내주시면 뷰어와 시험지로 만들어 드립니다. 아래는 넘기는 영상의 예시입니다.</p>
      <div className="guide-wrap">
        <video
          className="guide-video"
          src="/assets/howto.mp4"
          autoPlay
          muted
          loop
          playsInline
          controls
        />
      </div>
      <p className="mail-wrap">
        <a className="mail" href={`mailto:${MAIL}?subject=${encodeURIComponent("교재 자료")}&body=${encodeURIComponent("영상, 캡처본 또는 PDF/DOCX/HWP를 첨부합니다.")}`}>{MAIL}</a>
      </p>
      <p className="lead">읽고, 풀고, 복습하는 학습 사이트로 만들어드려요.</p>
      <div className="home-actions">
        <Link className="cta" to={to("/menu")}>학습 시작하기</Link>
        <Link className="cta" to="/questions?subject=all">문제은행 한눈에 보기</Link>
        <Link className="text-link" to={to("/guide")}>사용 방법 보기</Link>
      </div>
      <section className="subject-library" aria-label="과목별 학습">
        <h2>과목별 학습</h2>
        <div className="subject-cards">
          {subjects.map(subject => <Link className="subject-card" key={subject.id} to={subjectUrl("/viewer", subject.id)}>
            <strong>{subject.title} ↗</strong>
            <span className="muted">{studyDescription(subject)}</span>
          </Link>)}
        </div>
      </section>
    </div>
  );
}
