import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GuideMode } from "./guide-mode.jsx";
import Viewer from "./Viewer.jsx";
import Quiz from "./Quiz.jsx";
import Blank from "./Blank.jsx";
import Short from "./Short.jsx";
import Essay from "./Essay.jsx";

const STEPS = [
  { page: "viewer", target: "page-img", title: "뷰어", text: "보내주신 자료를 바탕으로 쪽과 메모를 보여 줍니다. 사진을 누르면 크게 볼 수 있습니다." },
  { page: "viewer", target: "settings-panel", openSettings: true, title: "설정", text: "위쪽 설정에서 글씨 크기와 줄 간격을 조절할 수 있고, 다크 모드도 켤 수 있습니다." },
  { page: "viewer", target: "tabs", title: "탭", text: "화면 전환은 위에 탭으로 할 수 있습니다." },
  { page: "quiz", play: "wrong-then-right", title: "객관식", text: "보기를 고른 뒤 채점하거나 엔터를 칩니다. 틀리면 빨간 줄, 맞으면 동그라미가 나옵니다." },
  { page: "blank", play: "wrong-then-right", title: "빈칸 채우기", text: "뷰어에 있는 앞뒤 글을 보고 빈칸을 채웁니다. 틀린 답과 맞는 답을 이어서 보여 줍니다." },
  { page: "short", play: "wrong-then-right", title: "단답형", text: "답을 쓰고 채점하거나 엔터를 칩니다. 틀리면 빨간 줄, 맞으면 동그라미입니다." },
  { page: "essay", play: "type-then-grade", title: "서술형", text: "답을 쓴 뒤 채점을 누릅니다. 서술형 채점은 사용자 AI가 필요합니다." },
  { page: "essay", target: "essay-pick", openAsk: true, title: "채점 방법", text: "둘 중 어떤 걸 쓸지 먼저 고릅니다. API 키를 넣거나, 에이전트 창에 프롬프트를 붙여 넣는 방법입니다." },
  { page: "essay", play: "essay-key", openAsk: true, essayMethod: "key", title: "API 키", text: "키를 넣은 뒤 모델 목록을 불러오고, 쓸 모델을 고른 다음 채점합니다." },
  { page: "essay", play: "essay-mcp", openAsk: true, essayMethod: "mcp", title: "MCP", text: "복사를 누른 뒤, 에이전트 창을 열고 그대로 붙여 넣으면 채점합니다." },
];

function targetOf(cur, phase) {
  if (cur.play === "wrong-then-right") {
    if (phase === "type-wrong" || phase === "type") return "type";
    if (phase === "grade") return "grade";
    return "result";
  }
  if (cur.play === "type-then-grade") return phase === "type" ? "type" : "grade";
  if (cur.play === "essay-key") {
    if (phase === "key-type") return "key-input";
    if (phase === "key-grade") return "grade-key";
    if (phase === "essay-result") return "result";
    return "gate";
  }
  if (cur.play === "essay-mcp") {
    if (phase === "mcp-copy") return "copy";
    return "agent";
  }
  return cur.target;
}

export default function Guide() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [settingsDismissed, setSettingsDismissed] = useState(false);
  const dismissSettings = useCallback(() => setSettingsDismissed(true), []);
  const [phase, setPhase] = useState("idle");
  const cur = STEPS[step];
  const target = targetOf(cur, phase);
  const box = useSpot(target);

  useEffect(() => {
    setSettingsDismissed(false);
    setPhase(cur.phase || "idle");
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    if (cur.play === "wrong-then-right") {
      setPhase("type-wrong");
      later(() => setPhase("wrong"), 1600);
      later(() => setPhase("type"), 3200);
      later(() => setPhase("grade"), 5000);
      later(() => setPhase("result"), 6400);
    } else if (cur.play === "type-then-grade") {
      setPhase("type");
      later(() => setPhase("grade"), 2400);
    } else if (cur.play === "essay-key") {
      setPhase("key-type");
      later(() => setPhase("key-grade"), 1800);
      later(() => setPhase("essay-result"), 3000);
    } else if (cur.play === "essay-mcp") {
      setPhase("mcp-copy");
      later(() => setPhase("mcp-agent"), 1400);
      later(() => setPhase("mcp-paste"), 2400);
      later(() => setPhase("mcp-reply"), 3800);
    }
    return () => timers.forEach(clearTimeout);
  }, [step, cur.play, cur.phase]);

  function next() {
    if (step >= STEPS.length - 1) nav("/viewer");
    else setStep((n) => n + 1);
  }

  const page = {
    viewer: <Viewer />,
    quiz: <Quiz />,
    blank: <Blank />,
    short: <Short />,
    essay: <Essay />,
  }[cur.page];

  return (
    <GuideMode.Provider value={{
      lockNav: true,
      openSettings: Boolean(cur.openSettings) && !settingsDismissed,
      dismissSettings,
      demo: cur.page !== "viewer",
      phase,
      graded: phase === "result" || phase === "wrong" || phase === "essay-result",
      openAsk: Boolean(cur.openAsk) && phase !== "essay-result",
      essayMethod: cur.essayMethod || "",
      tab: cur.page === "viewer" ? "viewer" : cur.page,
    }}>
      <div className={cur.openSettings ? "guide-live guide-settings" : "guide-live"}>
        {page}
        {box && (
          <>
            <div className="guide-hole" style={box} />
            <img
              className="guide-finger"
              src="/assets/finger.png"
              alt=""
              style={{
                top: box.top + Math.min(box.height, 180) - 20,
                left: box.left + Math.min(box.width, 280) - 28,
              }}
            />
          </>
        )}
        {(phase === "mcp-agent" || phase === "mcp-paste" || phase === "mcp-reply") && (
          <div className="agent-win" data-guide="agent">
            <div className="agent-bar">AI agent</div>
            <div className="agent-thread">
              {(phase === "mcp-paste" || phase === "mcp-reply") && (
                <pre className="bubble me">아래 MCP를 연결한 뒤, 이 서술형 답안을 채점해 주세요.{"\n"}문항 ID: e1{"\n"}get_essay / score 도구로 기준에만 맞춰 점수를 알려 주세요.</pre>
              )}
              {phase === "mcp-reply" && (
                <p className="bubble ai">8 / 10점. 1차개념과 2차개념을 구분했습니다. 뷰어 1쪽 근거에 맞춰 채점했습니다.</p>
              )}
            </div>
            <div className="agent-compose">메시지를 입력하세요</div>
          </div>
        )}
        <section className="guide-dock" aria-label="사용 안내">
          <p className="kicker">{cur.title}</p>
          <p aria-live="polite">{cur.text}</p>
          <div className="menu-actions">
            <button className="ghost" type="button" onClick={() => nav("/viewer")}>건너뛰기</button>
            <button type="button" onClick={next}>{step === STEPS.length - 1 ? "시작하기" : "다음"}</button>
          </div>
        </section>
      </div>
    </GuideMode.Provider>
  );
}

function useSpot(name) {
  const [box, setBox] = useState(null);

  useEffect(() => {
    function measure() {
      const el = document.querySelector(`[data-guide="${name}"]`);
      if (!el) {
        setBox(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 8;
      setBox({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    }
    measure();
    const id = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [name]);

  return box;
}
