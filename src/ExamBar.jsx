export function ExamFrame({ children }) {
  return <div className="exam-wrap">{children}</div>;
}
export default function ExamBar({ graded, onNext, onPrevious, canPrevious, onGrade, gradeDisabled }) {
  return <div className="exam-actions">
    <div className="question-navigation">
      <button className="ghost" type="button" onClick={onPrevious} disabled={!canPrevious}>이전 문제</button>
      <button className="ghost" type="button" onClick={onNext}>다음 문제</button>
    </div>
    <button type="button" data-guide="grade" onClick={onGrade} disabled={Boolean(graded) || gradeDisabled}>채점</button>
  </div>;
}
