import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuestionBank } from "./useQuestionBank.js";
import Chrome from "./Chrome.jsx";
import ExamBar, { ExamFrame } from "./ExamBar.jsx";
import { After, Mark } from "./noteMark.jsx";
import { clean, usable, scoreLocal } from "./text.js";
import { useExamPlay, useGuide } from "./guide-mode.jsx";
import { useSubject } from "./subjects.jsx";
import BankStatus from "./BankStatus.jsx";
import SourceExcerpt from "./SourceExcerpt.jsx";
import { shortExcerpts, shortStudyMode } from "./source-excerpts.js";
import { gradeOnEnter } from "./grade-key.js";

const shortQuestions = list => list.filter(x => x.type === "blank" && usable(x)).map(x => ({ ...x, type: "short", studyMode: shortStudyMode(x) }));

const MODES = { all: "전체", concept: "개념", source: "원문" };

export default function Short() {
  const { dataFile, id: subject } = useSubject();
  const guide = useGuide();
  const [params, setParams] = useSearchParams();
  const bank = useQuestionBank(dataFile("questions"), shortQuestions, { subject, type: "short" });
  const rows = bank.questions;
  const { q, value: val, setValue: setVal, result, setResult } = bank;
  const requestedMode = !guide && MODES[params.get("mode")] ? params.get("mode") : "all";
  const explicit = rows.find(item => item.id === params.get("q"));
  // Explicit question links (including history retries) take precedence over a
  // stale filter. The bank and its attempt IDs never change when filtering.
  const mode = requestedMode !== "all" && ((explicit && explicit.studyMode !== requestedMode) || !rows.some(item => item.studyMode === requestedMode)) ? "all" : requestedMode;
  const visible = q ? rows.filter(item => mode === "all" || item.studyMode === mode) : [];
  const position = visible.findIndex(item => item.id === q?.id);
  const jump = next => {
    const question = visible[next];
    if (question) bank.jump(rows.findIndex(item => item.id === question.id) + 1);
  };
  const filteredBank = { ...bank, count: visible.length, position: position + 1,
    canPrevious: position > 0, previous: () => jump(position - 1), next: () => jump((position + 1) % visible.length), jump: number => jump(Number(number) - 1) };
  const excerpts = !guide && q?.studyMode === "source" ? shortExcerpts(q) : [];
  useEffect(() => {
    if (!q || explicit || mode === "all" || q.studyMode === mode) return;
    const first = rows.findIndex(item => item.studyMode === mode);
    if (first >= 0) bank.jump(first + 1);
  }, [q, explicit, mode, bank.jump]);
  function changeMode(nextMode) {
    const candidates = rows.filter(item => nextMode === "all" || item.studyMode === nextMode);
    const first = candidates.find(item => item.id === q?.id) || candidates[0];
    const next = new URLSearchParams(params);
    next.set("mode", nextMode); next.delete("retry");
    if (first) next.set("q", first.id); else next.delete("q");
    setParams(next, { replace: true });
  }
  useExamPlay({ q, setVal, setResult, kind: "short" });
  function grade() {
    if (q && !result && val.trim()) setResult(scoreLocal(q, val));
  }

  return (
    <Chrome title="단답형" appeal={{ question: q, type: "short", record: bank.record }}>
      <ExamFrame>
        {!guide && <div className="study-mode-filter" role="group" aria-label="단답형 유형">
          {Object.entries(MODES).map(([id, label]) => <button key={id} type="button" className={mode === id ? "" : "ghost"} aria-pressed={mode === id} disabled={!q || (id !== "all" && !rows.some(item => item.studyMode === id))} onClick={() => changeMode(id)}>{label}{q && <span className="bank-count">{id === "all" ? rows.length : rows.filter(item => item.studyMode === id).length}</span>}</button>)}
        </div>}
        <BankStatus bank={filteredBank} />
        {q && (
          <div className="card q" data-guide="result">
            <SourceExcerpt question={q} excerpts={excerpts} revealed={Boolean(result)} subject={subject} />
            {!guide && <p className="kicker">{excerpts.length ? "원문 기반 단답" : "개념 단답"}</p>}
            <h3>{clean(q.prompt)}</h3>
            {result ? (
              <div className="typed"><Mark good={result.good}>{val || " "}</Mark></div>
            ) : (
              <input
                data-guide="type"
                aria-label="단답형 답안"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={event => gradeOnEnter(event, grade)}
                enterKeyHint="done"
                placeholder="답을 쓰세요"
              />
            )}
            {!result && <p className="grade-key-hint">Enter로 채점</p>}
            <ExamBar questionId={q.id} graded={result} onRetry={bank.retry} onNext={filteredBank.next} onPrevious={filteredBank.previous} canPrevious={filteredBank.canPrevious} onGrade={grade} gradeDisabled={!q || !val.trim()} />
            {result && <After q={q} result={result} />}
          </div>
        )}
      </ExamFrame>
    </Chrome>
  );
}
