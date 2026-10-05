import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { appealContext } from "./appeal-context.js";
import { popupSource, useStudyPopups } from "./popup-context.js";
import SettingsPopup from "./SettingsPopup.jsx";
import { useGuide } from "./guide-mode.jsx";
import { SubjectPicker, subjectUrl, useSubject, useSubjects } from "./subjects.jsx";

export default function Chrome({ title, children, subjectControls = true, navigationSubject, appeal, sourcePage, feedbackSubject }) {
  const guide = useGuide();
  const location = useLocation();
  const tabs = useRef(null);
  const { to: subjectTo, id: subjectId, error, loading } = useSubject();
  const to = navigationSubject ? path => subjectUrl(path, navigationSubject) : subjectTo;
  const popups = useStudyPopups();
  const { subjects } = useSubjects();
  function openAppeal() {
    setOpen(false);
    const selected = feedbackSubject || subjectId;
    popups.openAppeal({ subject: subjects.some(item => item.id === selected) ? selected : "all", source: popupSource(location, sourcePage),
      context: appeal?.question ? appealContext(appeal.question, appeal.type, { ...appeal.record, question: appeal.question }) : null });
  }
  const [open, setOpen] = useState(false);
  const dismissSettings = guide?.dismissSettings;
  const closeSettings = useCallback(() => { setOpen(false); dismissSettings?.(); }, [dismissSettings]);
  const settingsOpen = Boolean(guide?.openSettings) || open;
  useEffect(() => {
    const container = tabs.current;
    const active = container?.querySelector(".active");
    if (!active) return;
    const bounds = container.getBoundingClientRect();
    const selected = active.getBoundingClientRect();
    if (selected.right > bounds.right || selected.left < bounds.left)
      container.scrollLeft += selected.left - bounds.left - (bounds.width - selected.width) / 2;
  }, [location.pathname, guide?.tab]);

  function tabClick(e) {
    if (guide?.lockNav) e.preventDefault();
  }

  function tabClass(name) {
    return ({ isActive }) => (isActive || guide?.tab === name ? "active" : undefined);
  }

  return (
    <div className="page">
      <div className="bar">
        <Link className="brand" to={guide ? "#" : to("/menu")} onClick={tabClick}>Book To Exam</Link>
        <div className="bar-actions">
          {!guide && <Link className="text-link" to={to("/guide")}>사용법</Link>}
        <button className="text-btn" type="button" data-guide="settings-btn" aria-expanded={settingsOpen} aria-controls="reading-settings" onClick={() => setOpen((v) => !v)}>설정</button>
        {!guide && <button type="button" className="text-btn history-top-link" aria-haspopup="dialog" onClick={() => { setOpen(false); popups.openHistory(); }}>히스토리</button>}
        {!guide && <button type="button" className="text-btn" aria-haspopup="dialog" onClick={openAppeal}>이의제기</button>}
        </div>
      </div>
      {settingsOpen && <SettingsPopup onClose={closeSettings} guided={Boolean(guide?.openSettings)} />}
      {!guide && subjectControls && <SubjectPicker />}
      <nav ref={tabs} aria-label="학습 모드" className="tabs" data-guide="tabs">
        <NavLink to={to("/viewer")} className={tabClass("viewer")} onClick={tabClick}>뷰어</NavLink>
        <NavLink to={to("/quiz")} className={tabClass("quiz")} onClick={tabClick}>객관식</NavLink>
        <NavLink to={to("/blank")} className={tabClass("blank")} onClick={tabClick}>빈칸 채우기</NavLink>
        <NavLink to={to("/short")} className={tabClass("short")} onClick={tabClick}>단답형</NavLink>
        <NavLink to={to("/essay")} className={tabClass("essay")} onClick={tabClick}>서술형</NavLink>
        {!guide && <NavLink to={subjectControls ? to("/questions") : "/questions?subject=all"} className={tabClass("questions")}>문제은행</NavLink>}
        {!guide && <NavLink to={subjectControls ? to("/prediction-analysis") : "/prediction-analysis?subject=all"} className={tabClass("prediction-analysis")}>출제자 예상</NavLink>}
      </nav>
      {subjectControls && loading && <p role="status">과목을 불러오는 중…</p>}
      {subjectControls && error && <p role="alert">{error}</p>}
      {children}
    </div>
  );
}
