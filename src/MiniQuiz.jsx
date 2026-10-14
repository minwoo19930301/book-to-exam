import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { buildMiniCards } from "./mini-quiz.js";
import { useMiniDeck } from "./useMiniDeck.js";
import { subjectUrl, useJsonArray, useSubject, useSubjects } from "./subjects.jsx";
import "./mini-quiz.css";

const TYPES = { mixed: "전체", short: "단답형", blank: "빈칸" };
const FONT_SIZES = [26, 30, 34];
const FONT_KEY = "bte-mini-font:v1";
const EMPTY = [];

export default function MiniQuiz() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const type = Object.hasOwn(TYPES, params.get("type")) ? params.get("type") : "mixed";
  const { id: subjectId, subject, dataFile, loading: subjectLoading, error: subjectError, to } = useSubject();
  const { subjects } = useSubjects();
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
  const [font, setFont] = useState(() => {
    try { const saved = Number(localStorage.getItem(FONT_KEY)); return [0, 1, 2].includes(saved) ? saved : 0; }
    catch { return 0; }
  });
  useEffect(() => { try { localStorage.setItem(FONT_KEY, String(font)); } catch { /* Reading still works without storage. */ } }, [font]);
  const scroller = useRef(null);
  const gesture = useRef(null);
  const keyboardFocus = useRef(false);
  const [drag, setDrag] = useState(0);
  useLayoutEffect(() => {
    gesture.current = null;
    setDrag(0);
    if (scroller.current) scroller.current.scrollTop = 0;
    if (keyboardFocus.current) scroller.current?.focus({ preventScroll: true });
    keyboardFocus.current = false;
  }, [card?.key, session?.side]);

  function selectSubject(id, nextType = type) {
    navigate(`${subjectUrl("/mini", id)}&type=${nextType}`);
  }
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

  return <main className="mini-quiz" style={{ "--mini-font-size": `${FONT_SIZES[font]}px` }} onKeyDown={keyDown}>
    <header className="mini-header">
      <Link to={to("/menu")} className="mini-back" aria-label="학습 화면으로 돌아가기"><span aria-hidden="true">←</span></Link>
      <div className="mini-title"><h1>미니 퀴즈</h1><p>한 장씩, 가볍게.</p></div>
      <button className="mini-font-toggle" type="button" onClick={() => setFont(value => (value + 1) % FONT_SIZES.length)} aria-label="글씨 크기 변경" title={`글씨 ${FONT_SIZES[font]}px · 누르면 크기 변경`}>가<span>{font + 1}</span></button>
    </header>
    <section className="mini-filters" aria-label="카드 고르기">
      <label className="mini-subject"><span className="mini-sr-only">미니 퀴즈 과목</span><select value={subject ? subjectId : ""} onChange={event => selectSubject(event.target.value)}>
        {!subject && <option value="" disabled>과목 선택</option>}
        {subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <div className="mini-types" role="group" aria-label="미니 퀴즈 유형">
        {Object.entries(TYPES).map(([id, label]) => <button type="button" key={id} aria-pressed={type === id} onClick={() => selectSubject(subjectId, id)}>{label}</button>)}
      </div>
      {deck.storageError && <p className="mini-notice" role="status">{deck.storageError}</p>}
    </section>
    <section className="mini-stage" aria-label="복습 카드">
      {error ? <div className="mini-state" role="alert"><h2>문제를 불러오지 못했어요</h2><p>{error}</p><button type="button" onClick={() => window.location.reload()}>다시 불러오기</button></div>
        : !ready || (selected.length > 0 && !card) ? <div className="mini-state" role="status">카드를 섞고 있어요…</div>
        : !card ? <div className="mini-state"><h2>준비된 카드가 없어요</h2><p>다른 과목이나 유형을 골라주세요.</p></div>
        : <article className="mini-card" data-question-id={card.id} data-kind={card.kind} data-side={session.side}
          style={{ "--mini-drag": `${drag}px` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}>
          <div className="mini-card-meta"><span className="mini-kind">{card.kind === "short" ? "단답형" : "빈칸"}</span><span className="mini-count">{position}<span> / {selected.length}</span></span></div>
          <div ref={scroller} className="mini-card-scroll" tabIndex={0} aria-label={revealed ? "정답과 해설" : "문제 카드"}>
            <div className="mini-card-content" key={`${card.key}:${session.side}`}>
              {revealed ? <><p className="mini-answer-label">정답</p><h2 className="mini-answer">{card.answer}</h2><p className="mini-explanation">{card.explanation || "아래 교재 원문에서 정답의 맥락을 확인해 보세요."}</p></>
                : <><h2 className="mini-prompt">{card.prompt}</h2>{card.passage && <p className="mini-passage">{card.passage}</p>}</>}
            </div>
          </div>
          <footer className="mini-card-footer">{revealed && card.sourcePage
            ? <Link className="mini-source" to={to(`/viewer?page=${encodeURIComponent(card.sourcePage)}`)}>교재 원문 보기 <span aria-hidden="true">↗</span></Link>
            : <span>{revealed ? "내용을 떠올린 뒤 다음 카드로" : "생각한 뒤 답을 확인해 보세요"}</span>}</footer>
        </article>}
    </section>
    <section className="mini-controls" aria-label="카드 이동">
      <div className="mini-face-dots" aria-label={revealed ? "정답 면" : "문제 면"}><span className={!revealed ? "is-active" : ""} /><span className={revealed ? "is-active" : ""} /></div>
      <p className="mini-swipe-hint">{revealed ? "← 밀어서 다음 카드 · 오른쪽은 문제 보기" : "← 옆으로 밀면 정답과 해설"}</p>
      <div className="mini-actions">
        <button className="mini-secondary" type="button" disabled={!card || (!revealed && position <= 1)} onClick={backward}>{revealed ? "문제 보기" : "이전 카드"}</button>
        <button className="mini-primary" type="button" disabled={!card} onClick={forward}>{revealed ? "다음 카드" : "정답 보기"}<span aria-hidden="true"> →</span></button>
      </div>
      <button className="mini-shuffle" type="button" onClick={deck.reshuffle} disabled={selected.length < 2}>다시 섞기</button>
    </section>
    <p className="mini-sr-only" role="status">{card && `${position}번째 ${card.kind === "short" ? "단답형" : "빈칸"} 카드, ${revealed ? "정답과 해설" : "문제"}`}</p>
  </main>;
}
