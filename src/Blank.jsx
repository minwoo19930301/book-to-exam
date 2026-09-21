import { useEffect, useState } from "react";
import { useQuestionBank } from "./useQuestionBank.js";
import Chrome from "./Chrome.jsx";
import ExamBar, { ExamFrame } from "./ExamBar.jsx";
import { After, Mark } from "./noteMark.jsx";
import { clozeAround, scoreLocal } from "./text.js";
import { useExamPlay } from "./guide-mode.jsx";

export default function Blank() {
  const bank = useQuestionBank("/data/blanks.json");
  const { q, value: val, setValue: setVal, result, setResult } = bank;
  const [notes, setNotes] = useState([]);
  useExamPlay({ q, setVal, setResult, kind: "blank" });

  useEffect(() => {
    fetch("/data/notes.json").then((r) => r.json()).then(setNotes).catch(() => setNotes([]));
  }, []);

  function grade() {
    if (q && !result && val.trim()) setResult(scoreLocal(q, val));
  }

  function onKey(e) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      grade();
    }
  }

  const cloze = q ? clozeAround(q, notes) : null;

  return (
    <Chrome title="빈칸 채우기">
      <ExamFrame>
        {bank.error && <p role="alert">{bank.error}</p>}
        {q && cloze && (
          <div className="card q" data-guide="result">
            <p className="kicker">{q.match === "keywords" ? "핵심어로 문장 완성" : "정확한 용어"}</p>
            <div className="cloze">
              <span>{cloze.before}</span>
              {result ? (
                <Mark good={result.good}>{val || " "}</Mark>
              ) : (
                <textarea
                  className={q.match === "keywords" ? "cloze-sentence" : "cloze-in"}
                  aria-label="빈칸 답안"
                  rows={q.match === "keywords" ? 3 : 1}
                  data-guide="type"
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  onKeyDown={onKey}
                  placeholder={q.match === "keywords" ? "빠진 문장을 적으세요" : "용어"}
                />
              )}
              <span>{cloze.after}</span>
            </div>
            <ExamBar graded={result} onNext={bank.next} onPrevious={bank.previous} canPrevious={bank.canPrevious} onGrade={grade} gradeDisabled={!q || !val.trim()} />
            {result && <After q={q} />}
          </div>
        )}
      </ExamFrame>
    </Chrome>
  );
}
