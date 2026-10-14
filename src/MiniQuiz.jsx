import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { buildMiniCards } from "./mini-quiz.js";
import { useMiniDeck } from "./useMiniDeck.js";
import { useJsonArray, useSubject } from "./subjects.jsx";
import { useMiniCardFit } from "./useMiniCardFit.js";
import "./mini-quiz.css";

const TYPES = { mixed: "전체", short: "단답형", blank: "빈칸" };
const EMPTY = [];

export default function MiniQuiz() {
  const [params] = useSearchParams();
  const type = Object.hasOwn(TYPES, params.get("type")) ? params.get("type") : "mixed";
  const { id: subjectId, subject, dataFile, loading: subjectLoading, error: subjectError } = useSubject();
  const questions = useJsonArray(dataFile("questions"), "단답형 문제");
  const blanks = useJsonArray(dataFile("blanks"), "빈칸 문제");
  const notes = useJsonArray(dataFile("notes"), "교재 원문");
  const error = subjectError || questions.error || blanks.error || notes.error;
  const ready = Boolean(subject) && !subjectLoading && !questions.loading && !blanks.loading && !notes.loading && !error;
  const cards = useMemo(() => ready ? buildMiniCards({ questions: questions.data, blanks: blanks.data, notes: notes.data }) : EMPTY,
    [ready, questions.data, blanks.data, notes.data]);
  const selected = useMemo(() => type === "mixed" ? cards : cards.filter(card => card.kind === type), [cards, type]);
  const deck = useMiniDeck(selected, subjectId, type, ready);
  const { card, session, position } = deck;
  const revealed = session?.side === "answer";
  const fitArea = useRef(null);
  const content = useRef(null);
  useMiniCardFit(fitArea, content, `${card?.key}:${session?.side}`);
  const gesture = useRef(null);
  const keyboardFocus = useRef(false);
  const [drag, setDrag] = useState(0);
  useLayoutEffect(() => {
    gesture.current = null;
    setDrag(0);
    if (keyboardFocus.current) fitArea.current?.focus({ preventScroll: true });
    keyboardFocus.current = false;
  }, [card?.key, session?.side]);

  function forward() { if (card) revealed ? deck.next() : deck.reveal(); }
  function backward() { if (card) revealed ? deck.hide() : deck.previous(); }
  function keyDown(event) {
    if (event.target?.closest("button, a, input, select, textarea") || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229
      || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!["Enter", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat) return;
    keyboardFocus.current = true;
    if (event.key === "ArrowLeft") backward(); else forward();
  }
  function pointerDown(event) {
    if (!event.isPrimary || event.button !== 0 || event.target?.closest("button, a, input, select, textarea")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, key: card?.key, side: session?.side };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) start.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
    if (start.axis === "x") setDrag(Math.max(-90, Math.min(90, dx * 0.35)));
  }
  function pointerEnd(event) {
    const start = gesture.current;
    gesture.current = null;
    setDrag(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!start || start.id !== event.pointerId || start.key !== card?.key || start.side !== session?.side) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (start.axis === "y" || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) forward(); else backward();
  }
  function cancelGesture() { gesture.current = null; setDrag(0); }

  return <main className="mini-quiz" onKeyDown={keyDown}>
    <section className="mini-stage" aria-label="복습 카드">
      {error ? <div className="mini-card mini-state" role="alert"><h2>문제를 불러오지 못했어요</h2><p>잠시 후 새로고침해 주세요.</p></div>
        : !ready || (selected.length > 0 && !card) ? <div className="mini-card mini-state" role="status">카드를 섞고 있어요…</div>
        : !card ? <div className="mini-card mini-state"><h2>준비된 카드가 없어요</h2></div>
        : <article className="mini-card" data-question-id={card.id} data-kind={card.kind} data-side={session.side} data-tone={(position - 1) % 6}
          aria-label={`${position}번째 ${card.kind === "short" ? "단답형" : "빈칸"} 카드, ${revealed ? "정답과 해설" : "문제"}`}
          style={{ "--mini-drag": `${drag}px` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}>
          <div ref={fitArea} className="mini-card-fit" tabIndex={0} aria-label={revealed ? "정답과 해설" : "문제 카드"}>
            <div ref={content} className="mini-card-content">
              {revealed ? <><p className="mini-answer-label">정답</p><h2 className="mini-answer">{card.answer}</h2>{card.explanation && <p className="mini-explanation">{card.explanation}</p>}</>
                : <><h2 className="mini-prompt">{card.prompt}</h2>{card.passage && <p className="mini-passage">{card.passage}</p>}</>}
            </div>
          </div>
        </article>}
    </section>
    <p className="mini-sr-only" role="status">{card && `${position}번째 카드, ${revealed ? "정답과 해설" : "문제"}. 왼쪽으로 밀면 ${revealed ? "다음 카드" : "정답"}, 오른쪽으로 밀면 ${revealed ? "문제" : "이전 카드"}.`}{deck.storageError}</p>
  </main>;
}
