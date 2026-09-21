import { useQuestionBank } from "./useQuestionBank.js";
import Chrome from "./Chrome.jsx";
import ExamBar, { ExamFrame } from "./ExamBar.jsx";
import { After, Mark } from "./noteMark.jsx";
import { clean, usable, scoreLocal } from "./text.js";
import { useExamPlay } from "./guide-mode.jsx";

const mcQuestions = list => list.filter(x => x.type === "mc" && usable(x));

export default function Quiz() {
  const bank = useQuestionBank("/data/questions.json", mcQuestions);
  const { q, value: choice, setValue: setChoice, result, setResult } = bank;
  useExamPlay({ q, setVal: setChoice, setResult, kind: "mc" });
  function grade() {
    if (q && !result && choice !== "") setResult(scoreLocal(q, choice));
  }

  function onKey(e) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      grade();
    }
  }

  return (
    <Chrome title="객관식">
      <ExamFrame>
        {bank.error && <p role="alert">{bank.error}</p>}
        {q && (
          <div className="card q" data-guide="result" tabIndex={0} onKeyDown={onKey}>
            <h3>{clean(q.prompt)}</h3>
            <div data-guide="type">
              {(q.choices || []).map((c, ci) => {
                const cls = result
                  ? (ci === q.answer ? "choice ok" : (choice !== "" && Number(choice) === ci) ? "choice bad" : "choice")
                  : (choice !== "" && Number(choice) === ci) ? "choice on" : "choice";
                return (
                  <label className={cls} key={ci}>
                    <input type="radio" name="one" checked={(choice !== "" && Number(choice) === ci)} onChange={() => setChoice(ci)} disabled={Boolean(result)} />
                    <span>{result && (ci === q.answer || Number(choice) === ci) ? <Mark good={ci === q.answer}>{clean(c)}</Mark> : clean(c)}</span>
                  </label>
                );
              })}
            </div>
            <ExamBar graded={result} onNext={bank.next} onPrevious={bank.previous} canPrevious={bank.canPrevious} onGrade={grade} gradeDisabled={!q || choice === ""} />
            {result && <After q={q} />}
          </div>
        )}
      </ExamFrame>
    </Chrome>
  );
}
