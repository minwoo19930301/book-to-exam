import { Link } from "react-router-dom";

const MAIL = "rlaalsdn456456@naver.com";

export default function Home() {
  return (
    <div className="page landing">
      <p className="kicker">BookVideoToExam</p>
      <h1>이런 영상을 찍어서 이메일로 보내주세요.</h1>
      <p className="muted">책을 한 장씩 넘기는 영상을 찍습니다. 아래는 그 예시입니다.</p>
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
        <a className="mail" href={`mailto:${MAIL}?subject=${encodeURIComponent("책 넘기는 영상")}&body=${encodeURIComponent("넘기는 영상을 첨부합니다.")}`}>{MAIL}</a>
      </p>
      <p className="lead">주신 영상으로 다음과 같이 시험 칠 수 있는 사이트를 보내드립니다.</p>
      <Link className="cta" to="/exam">예시 사이트로 이동</Link>
    </div>
  );
}
