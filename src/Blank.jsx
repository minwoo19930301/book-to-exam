import { useQuestionBank } from "./useQuestionBank.js";
import Chrome from "./Chrome.jsx";
import ExamBar, { ExamFrame } from "./ExamBar.jsx";
import { After, Mark } from "./noteMark.jsx";
import { clozeAround, scoreLocal } from "./text.js";
import { useExamPlay, useGuide } from "./guide-mode.jsx";
import { useJsonArray, useSubject } from "./subjects.jsx";
import BankStatus from "./BankStatus.jsx";
import { exactCloze, usesExactPassage } from "./source-excerpts.js";

export default function Blank() {
  const { dataFile, id: subject } = useSubject();
  const guide = useGuide();
  const [params, setParams] = useSearchParams();
  const rows = useRef([]);
  const select = useCallback(list => { rows.current = list; return list; }, []);
  const bank = useQuestionBank(dataFile("blanks"), select, { subject, type: "blank" });
  const { q, value: val, setValue: setVal, result, setResult } = bank;
  const sources = rows.current.filter(usesExactPassage);
  const explicit = rows.current.find(item => item.id === params.get("q"));
  const sourceMode = !guide && params.get("mode") === "source" && sources.length > 0 && (!explicit || usesExactPassage(explicit));
  const visible = q ? sourceMode ? sources : rows.current : [];
  const position = visible.findIndex(item => item.id === q?.id);
  const jump = next => {
    const question = visible[next];
    if (question) bank.jump(rows.current.findIndex(item => item.id === question.id) + 1);
  };
  const filteredBank = { ...bank, count: visible.length, position: position + 1, canPrevious: position > 0,
    previous: () => jump(position - 1), next: () => jump((position + 1) % visible.length), jump: number => jump(Number(number) - 1) };
  useEffect(() => {
    if (q && sourceMode && !explicit && !usesExactPassage(q)) {
      const first = rows.current.findIndex(usesExactPassage);
      if (first >= 0) bank.jump(first + 1);
    }
  }, [q, sourceMode, explicit, bank.jump]);
  function changeMode(source) {
    const candidates = source ? sources : rows.current;
    const first = candidates.find(item => item.id === q?.id) || candidates[0];
    const next = new URLSearchParams(params);
    if (source) next.set("mode", "source"); else next.delete("mode");
    next.delete("retry");
    if (first) next.set("q", first.id);
    setParams(next, { replace: true });
  }
  const { data: notes } = useJsonArray(dataFile("notes"));
  useExamPlay({ q, setVal, setResult, kind: "blank" });

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

  const fullPassage = usesExactPassage(q);
  const cloze = q ? fullPassage ? exactCloze(q) : clozeAround(q, notes) : null;

  return (
    <Chrome title="빈칸 채우기" appeal={{ question: q && { ...q, prompt: cloze ? `${cloze.before}_____${cloze.after}` : q.prompt }, type: "blank", record: bank.record }}>
      <ExamFrame>
        {!guide && q && sources.length > 0 && <div className="study-mode-filter" role="group" aria-label="빈칸 유형">
          <button type="button" className={sourceMode ? "ghost" : ""} aria-pressed={!sourceMode} onClick={() => changeMode(false)}>전체<span className="bank-count">{rows.current.length}</span></button>
          <button type="button" className={sourceMode ? "" : "ghost"} aria-pressed={sourceMode} onClick={() => changeMode(true)}>사료탐구<span className="bank-count">{sources.length}</span></button>
        </div>}
        <BankStatus bank={filteredBank} />
        {q && cloze && (
          <div className="card q" data-guide="result">
            <p className="kicker">{fullPassage ? "사료탐구" : q.match === "keywords" ? "문장 완성" : "정확한 용어"}</p>
            {fullPassage && <p className="muted source-reading-note">발췌문을 읽고 빈칸에 들어갈 표현을 쓰세요.</p>}
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
            <ExamBar graded={result} onRetry={bank.retry} onNext={filteredBank.next} onPrevious={filteredBank.previous} canPrevious={filteredBank.canPrevious} onGrade={grade} gradeDisabled={!q || !val.trim()} />
            {result && <After q={q} result={result} />}
          </div>
        )}
      </ExamFrame>
    </Chrome>
  );
}
import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
