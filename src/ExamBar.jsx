import { useEffect, useLayoutEffect, useRef } from "react";
import { useGuide } from "./guide-mode.jsx";
import { gradeOnEnter } from "./grade-key.js";

const modalOpen = () => Boolean(document.querySelector('dialog[open], [role="dialog"]'));

export function ExamFrame({ children }) {
  return <div className="exam-wrap" tabIndex={-1}>{children}</div>;
}
export default function ExamBar({ questionId, graded, onNext, onPrevious, canPrevious, onGrade, gradeDisabled, onRetry, retryDisabled }) {
  const guide = useGuide();
  const actions = useRef(null);
  const focusAfterNavigation = useRef(false);
  function navigate(move) {
    focusAfterNavigation.current = true;
    move();
  }
  useLayoutEffect(() => {
    if (!focusAfterNavigation.current || guide || modalOpen()) return;
    focusAfterNavigation.current = false;
    const frame = actions.current?.closest(".exam-wrap");
    const answer = frame?.querySelector('.q input:not(:disabled), .q textarea:not(:disabled)');
    (answer || frame)?.focus({ preventScroll: true });
    frame?.scrollIntoView({ block: "start" });
  }, [questionId, guide]);
  useEffect(() => {
    if (!graded || guide) return;
    const frame = actions.current?.closest(".exam-wrap");
    // Grading removes short/blank inputs and disables the submit button. Keep
    // keyboard focus on the exercise, without stealing it from a popup/control.
    const active = document.activeElement;
    if (!modalOpen() && (active === document.body || (frame?.contains(active) && active?.matches(":disabled"))))
      frame?.focus({ preventScroll: true });
    function nextOnEnter(event) {
      if (modalOpen() || event.target?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      gradeOnEnter(event, () => navigate(onNext));
    }
    document.addEventListener("keydown", nextOnEnter);
    return () => document.removeEventListener("keydown", nextOnEnter);
  }, [graded, guide, onNext]);
  return <>
    {!guide && graded && <p className="grade-key-hint">채점 완료 · Enter로 다음 문제</p>}
    <div ref={actions} className="exam-actions exam-toolbar" role="group" aria-label="문제 이동 및 채점">
    <div className="question-navigation">
      <button className="ghost" type="button" onClick={() => navigate(onPrevious)} disabled={!canPrevious}>이전 문제</button>
      <button className="ghost" type="button" onClick={() => navigate(onNext)}>다음 문제</button>
    </div>
    <div className="grade-actions">{!guide && onRetry && <button className="ghost" type="button" onClick={onRetry} disabled={retryDisabled}>다시 풀기</button>}<button type="button" data-guide="grade" onClick={onGrade} disabled={Boolean(graded) || gradeDisabled}>채점</button></div>
  </div></>;
}
