import { useEffect, useState } from "react";
import Chrome from "./Chrome.jsx";
import { clean, pick, usable, scoreLocal } from "./text.js";

export default function Quiz() {
  const [set, setSet] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  function start(bank) {
    setSet(pick(bank.filter((q) => q.type === "mc" && usable(q)), 10));
    setAnswers({});
    setResult(null);
  }

  useEffect(() => {
    fetch("/data/questions.json").then((r) => r.json()).then(start);
  }, []);

  function grade() {
    const mark = set.map((q, i) => scoreLocal(q, answers[i]));
    setResult({ ok: mark.filter((m) => m.good).length, mark });
  }

  return (
    <Chrome title="객관식">
      <p className="muted">객관식 10문항을 무작위로 뽑습니다.</p>
      <div className="row">
        <button type="button" onClick={() => fetch("/data/questions.json").then((r) => r.json()).then(start)}>다시 뽑기</button>
        <button type="button" onClick={grade} disabled={!set.length}>채점</button>
        {result && <span className="score">{result.ok} / {set.length}</span>}
      </div>
      {set.map((q, i) => (
        <div className="card q" key={q.id + i}>
          <h3>{i + 1}. {clean(q.prompt)}</h3>
          {(q.choices || []).map((c, ci) => {
            const cls = result
              ? (ci === q.answer ? "choice ok" : Number(answers[i]) === ci ? "choice bad" : "choice")
              : Number(answers[i]) === ci ? "choice on" : "choice";
            return (
              <label className={cls} key={ci}>
                <input type="radio" name={`q${i}`} checked={Number(answers[i]) === ci} onChange={() => setAnswers({ ...answers, [i]: ci })} />
                <span>{clean(c)}</span>
              </label>
            );
          })}
          {result && <div className="explain">{result.mark[i].good ? "맞음. " : "틀림. "}{result.mark[i].explain}</div>}
        </div>
      ))}
    </Chrome>
  );
}
