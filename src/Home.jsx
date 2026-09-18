import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Player } from "@remotion/player";
import MenuComp from "./MenuComp.jsx";

const MAIL = "rlaalsdn456456@naver.com";

export default function Home() {
  const [step, setStep] = useState("guide");
  const [ready, setReady] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (step !== "menu") return;
    const t = setTimeout(() => setReady(true), 2400);
    return () => clearTimeout(t);
  }, [step]);

  if (step === "guide") {
    return (
      <div className="page">
        <p className="kicker">How to send</p>
        <h1>이런 영상을 찍어서 이메일로 보내주세요.</h1>
        <p className="muted">책을 한 장씩 넘기는 영상을 찍습니다. 아래는 그 예시입니다.</p>
        <img className="guide-gif" src="/assets/howto.gif" alt="책을 넘기는 예시" />
        <p style={{ marginTop: 20 }}>
          <a className="mail" href={`mailto:${MAIL}?subject=${encodeURIComponent("책 넘기는 영상")}&body=${encodeURIComponent("넘기는 영상을 첨부합니다.")}`}>{MAIL}</a>
        </p>
        <p className="muted">시험지 사이트 링크가 완성되는 대로 다시 답장 이메일로 전달하겠습니다.</p>
        <button type="button" onClick={() => setStep("menu")}>다음</button>
      </div>
    );
  }

  return (
    <div className="dim">
      {!ready ? (
        <div className="menu-stage">
          <Player
            component={MenuComp}
            durationInFrames={70}
            compositionWidth={480}
            compositionHeight={280}
            fps={30}
            autoPlay
            acknowledgeRemotionLicense
            style={{ width: "100%", height: "100%" }}
            onEnded={() => setReady(true)}
          />
        </div>
      ) : (
        <div className="menu-real">
          <h2>시험지</h2>
          <button className="menu-item" type="button" onClick={() => nav("/viewer")}>뷰어</button>
          <button className="menu-item" type="button" onClick={() => nav("/quiz")}>객관식 문제</button>
          <button className="menu-item" type="button" onClick={() => nav("/essay")}>주관식 문제</button>
        </div>
      )}
    </div>
  );
}
