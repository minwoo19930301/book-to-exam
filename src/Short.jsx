import { useQuestionBank } from "./useQuestionBank.js";
import Chrome from "./Chrome.jsx";
import ExamBar, { ExamFrame } from "./ExamBar.jsx";
import { After, Mark } from "./noteMark.jsx";
import { clean, usable, scoreLocal } from "./text.js";
import { useExamPlay } from "./guide-mode.jsx";

const shortQuestions = list => list.filter(x => x.type === "blank" && usable(x)).map(x => ({ ...x, type: "short" }));

export default function Short() {
  const bank = useQuestionBank("/data/questions.json", shortQuestions);
  const { q, value: val, setValue: setVal, result, setResult } = bank;
  useExamPlay({ q, setVal, setResult, kind: "short" });
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

  return (
    <Chrome title="단답형">
      <ExamFrame>
        {bank.error && <p role="alert">{bank.error}</p>}
        {q && (
          <div className="card q" data-guide="result">
            <h3>{clean(q.prompt)}</h3>
            {result ? (
              <div className="typed"><Mark good={result.good}>{val || " "}</Mark></div>
            ) : (
              <input
                data-guide="type"
                aria-label="단답형 답안"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={onKey}
                placeholder="답을 쓰세요"
              />
            )}
            <ExamBar graded={result} onNext={bank.next} onPrevious={bank.previous} canPrevious={bank.canPrevious} onGrade={grade} gradeDisabled={!q || !val.trim()} />
            {result && <After q={q} />}
          </div>
        )}
      </ExamFrame>
    </Chrome>
  );
}
