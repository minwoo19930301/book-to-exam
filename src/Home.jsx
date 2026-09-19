import { Link } from "react-router-dom";

const MAIL = "rlaalsdn456456@naver.com";

export default function Home() {
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
      <Link className="cta" to="/guide">예시 사이트로 이동</Link>
    </div>
  );
}
