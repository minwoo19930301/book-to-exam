import { useEffect, useState } from "react";
import Chrome from "./Chrome.jsx";

function pick(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function norm(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[()（）·.,]/g, "").toLowerCase();
}

export default function Quiz() {
  const [set, setSet] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  function start(bank) {
    setSet(pick(bank, 10));
    setAnswers({});
    setResult(null);
  }

  useEffect(() => {
    fetch("/data/questions.json").then((r) => r.json()).then(start);
  }, []);

  function grade() {
    let ok = 0;
    const mark = set.map((q, i) => {
      let good = false;
      if (q.type === "mc") good = Number(answers[i]) === q.answer;
      else {
        const acc = (q.accept || [q.answer]).map(norm);
        const val = norm(answers[i]);
        good = acc.some((a) => a && (val === a || val.includes(a) || a.includes(val)));
      }
      if (good) ok += 1;
      return { good };
    });
    setResult({ ok, mark });
  }

  return (
    <Chrome title="객관식 문제">
      <p className="muted">키워드로 10문항을 무작위로 뽑습니다.</p>
      <div className="row">
        <button type="button" onClick={() => fetch("/data/questions.json").then((r) => r.json()).then(start)}>다시 뽑기</button>
        <button type="button" onClick={grade} disabled={!set.length}>채점</button>
        {result && <span className="score">{result.ok} / {set.length}</span>}
      </div>
      {set.map((q, i) => (
        <div className="q" key={q.id + i}>
          <h3>{i + 1}. {q.prompt}</h3>
          {q.type === "mc" ? q.choices.map((c, ci) => {
            const cls = result
              ? (ci === q.answer ? "choice ok" : Number(answers[i]) === ci ? "choice bad" : "choice")
              : "choice";
            return (
              <label className={cls} key={ci}>
                <input type="radio" name={`q${i}`} checked={Number(answers[i]) === ci} onChange={() => setAnswers({ ...answers, [i]: ci })} /> {c}
              </label>
            );
          }) : (
            <input value={answers[i] || ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} placeholder="용어" />
          )}
          {result && <div className="explain">{result.mark[i].good ? "맞음. " : "틀림. "}{q.explain}</div>}
        </div>
      ))}
    </Chrome>
  );
}
