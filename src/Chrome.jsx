import { useCallback, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import SettingsPopup from "./SettingsPopup.jsx";
import { useGuide } from "./guide-mode.jsx";
import { SubjectPicker, subjectUrl, useSubject } from "./subjects.jsx";

export default function Chrome({ title, children, subjectControls = true, navigationSubject }) {
  const guide = useGuide();
  const { to: subjectTo, error, loading } = useSubject();
  const to = navigationSubject ? path => subjectUrl(path, navigationSubject) : subjectTo;
  const [open, setOpen] = useState(false);
  const dismissSettings = guide?.dismissSettings;
  const closeSettings = useCallback(() => { setOpen(false); dismissSettings?.(); }, [dismissSettings]);
  const settingsOpen = Boolean(guide?.openSettings) || open;

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
        {!guide && <Link className="text-link history-top-link" to={to("/history")}>히스토리</Link>}
        </div>
      </div>
      {settingsOpen && <SettingsPopup onClose={closeSettings} guided={Boolean(guide?.openSettings)} />}
      {!guide && subjectControls && <SubjectPicker />}
      <nav aria-label="학습 모드" className="tabs" data-guide="tabs">
        <NavLink to={to("/viewer")} className={tabClass("viewer")} onClick={tabClick}>뷰어</NavLink>
        <NavLink to={to("/quiz")} className={tabClass("quiz")} onClick={tabClick}>객관식</NavLink>
        <NavLink to={to("/blank")} className={tabClass("blank")} onClick={tabClick}>빈칸 채우기</NavLink>
        <NavLink to={to("/short")} className={tabClass("short")} onClick={tabClick}>단답형</NavLink>
        <NavLink to={to("/essay")} className={tabClass("essay")} onClick={tabClick}>서술형</NavLink>
        {!guide && <NavLink to={subjectControls ? to("/questions") : "/questions?subject=all"} className={tabClass("questions")}>문제은행</NavLink>}
      </nav>
      {subjectControls && loading && <p role="status">과목을 불러오는 중…</p>}
      {subjectControls && error && <p role="alert">{error}</p>}
      {children}
    </div>
  );
}
