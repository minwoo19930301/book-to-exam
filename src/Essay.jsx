import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import ExamBar, { ExamFrame } from "./ExamBar.jsx";
import AiGate from "./AiGate.jsx";
import { lastKey, rememberKey } from "./settings.jsx";
import { useGuide } from "./guide-mode.jsx";
import { useQuestionBank } from "./useQuestionBank.js";
import { sourceUrl, useSubject } from "./subjects.jsx";
import BankStatus from "./BankStatus.jsx";

import { gradeWithChrome } from "./chrome-score.js";

const DEMO = "1차개념은 구체적인 역사적 사실이고, 2차개념은 역사학의 성격과 연구 방법을 이해하는 개념입니다. 사실과 해석 방법을 함께 배워야 합니다.";
const DEMO_OUT = {
  total: 8,
  max: 10,
  feedback: "1차개념과 2차개념을 구분했습니다. 수업에서 둘을 같이 다루는 이유를 한 줄 더 쓰면 좋습니다.",
  items: [
    {
      id: "a",
      label: "1차·2차 개념",
      score: 5,
      max: 6,
      comment: "정의를 구분했습니다.",
      studentQuote: "1차개념은 구체적인 역사적 사실",
      evidence: [{ quote: "1차개념 : 구체적인 역사적 사실 (본질적 개념)", title: "1. 피터 리 역사이해", url: "/viewer?page=p1" }],
    },
    {
      id: "b",
      label: "함께 다루는 이유",
      score: 3,
      max: 4,
      comment: "함께 배워야 한다는 점은 있습니다.",
      studentQuote: "사실과 해석 방법을 함께",
      evidence: [],
    },
  ],
};

export default function Essay() {
  const guide = useGuide();
  const { dataFile, id: subjectId, to } = useSubject();
  const chromeAbort = useRef(null);
  useEffect(() => () => chromeAbort.current?.abort(), [subjectId]);
  const bank = useQuestionBank(dataFile("essays"), undefined, { subject: subjectId, type: "essay" });
  const { q: essay, value: answer, setValue: setAnswer, result: out, record, update } = bank;
  const [provider, setProvider] = useState(() => lastKey().provider || "gemini");
  const [keyVal, setKey] = useState(() => lastKey().key || "");
  const [model, setModel] = useState(() => lastKey().model || "");
  const waiting = Boolean(record.waiting), method = record.method || "";
  const ask = Boolean(record.ask), status = record.status || "";
  function writeDraft(value) {
    setAnswer(value);
  }
  useEffect(() => {
    if (!guide?.demo || !essay) return undefined;
    if (guide.phase === "type") {
      let i = 0;
      update({ value: "", result: null, ask: false, method: "" });
      const timer = setInterval(() => { i += 2; setAnswer(DEMO.slice(0, i)); if (i >= DEMO.length) clearInterval(timer); }, 24);
      return () => clearInterval(timer);
    }
    if (guide.phase === "grade") {
      setAnswer(DEMO);
      update({ ask: false, result: null });
    }
    if (guide.openAsk || guide.phase === "key-type" || guide.phase === "key-grade" || String(guide.phase || "").startsWith("mcp")) {
      setAnswer(DEMO);
      update({ ask: true, method: guide.essayMethod || "", result: null });
    }
    if (guide.phase === "key-type") setKey("AIza-demo-key-for-guide");
    if (guide.phase === "essay-result") {
      setAnswer(DEMO);
      update({ ask: false, result: DEMO_OUT, waiting: false, status: "" });
    }
    return undefined;
  }, [guide?.demo, guide?.phase, guide?.openAsk, guide?.essayMethod, essay, update, setAnswer]);
  async function run(mode) {
    if (!essay || !answer.trim() || waiting || guide?.demo) return;
    // This update function is bound to the submitted question, even if navigation occurs while waiting.
    update({ waiting: true, status: "근거를 확인하고 채점 중…", result: null });
    try {
      if (mode === "chrome") {
        if (chromeAbort.current) throw new Error("다른 문항의 Chrome 채점이 진행 중입니다.");
        const controller = new AbortController();
        chromeAbort.current = controller;
        try {
          const data = await gradeWithChrome({ essayId: essay.id, answer, signal: controller.signal, onStatus: status => update({ status }) });
          update({ result: data, status: "", ask: false });
        } finally { chromeAbort.current = null; }
        return;
      }
      const response = await fetch("/api/score", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ essayId: essay.id, answer, provider, apiKey: keyVal.trim(), model }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "채점에 실패했습니다.");
      if (mode === "key") rememberKey(provider, keyVal, model);
      update({ result: data, status: "", ask: false });
    } catch (error) { update({ status: error.name === "AbortError" ? "Chrome 채점을 중단했습니다." : error.message }); }
    finally { update({ waiting: false }); }
  }
  return <Chrome title="서술형"><ExamFrame>
    <BankStatus bank={bank} />
    {essay && <div className="card q">
      <p className="lead">{essay.prompt}</p>
      <textarea data-guide="type" aria-label="서술형 답안" value={answer} onChange={e => writeDraft(e.target.value)} placeholder="답을 작성하세요." disabled={Boolean(out) || waiting} />
      <ExamBar graded={out} onRetry={bank.retry} retryDisabled={waiting} onNext={bank.next} onPrevious={bank.previous} canPrevious={bank.canPrevious}
        onGrade={() => update({ ask: true })} gradeDisabled={waiting || !answer.trim()} />
    </div>}
    {ask && <AiGate method={method} onPick={method => update({ method })} provider={provider} setProvider={setProvider} keyVal={keyVal} setKey={setKey}
      model={model} setModel={setModel} onGrade={() => run("key")} onChrome={() => run("chrome")} onCancel={() => chromeAbort.current?.abort()} status={status} waiting={waiting} essay={essay} answer={answer} />}
    {out && <section className="card explain" data-guide="result" aria-label="채점 결과" aria-live="polite">
      <h2>{out.total} / {out.max}점</h2>{out.practice && <p className="muted">{out.engine} · 연습용 평가입니다. 채점 기준과 근거를 함께 확인해 주세요.</p>}<p>{out.feedback}</p>
      <ul className="score-items">{out.items.map(item => <li key={item.id}>
        <strong>{item.label} · {item.score} / {item.max}점</strong><p>{item.comment}</p>
        {item.studentQuote && <p className="muted">내 답안: “{item.studentQuote}”</p>}
        {item.evidence.map((e, i) => <blockquote key={i}>{e.quote.replace(/\*/g, "")}<br />{sourceUrl(e.url) && <Link className="source-link" to={to(e.url)}>{e.title} ↗</Link>}</blockquote>)}
      </li>)}</ul>
    </section>}
  </ExamFrame></Chrome>;
}
