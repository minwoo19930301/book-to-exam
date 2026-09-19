import { useCallback, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import SettingsPopup from "./SettingsPopup.jsx";
import { useGuide } from "./guide-mode.jsx";

export default function Chrome({ title, children }) {
  const guide = useGuide();
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
        <Link className="brand" to={guide ? "#" : "/menu"} onClick={tabClick}>Book To Exam</Link>
        <div className="bar-actions">
          {!guide && <Link className="text-link" to="/guide">사용법</Link>}
        <button className="text-btn" type="button" data-guide="settings-btn" aria-expanded={settingsOpen} aria-controls="reading-settings" onClick={() => setOpen((v) => !v)}>설정</button>
        </div>
      </div>
      {settingsOpen && <SettingsPopup onClose={closeSettings} guided={Boolean(guide?.openSettings)} />}
      <nav aria-label="학습 모드" className="tabs" data-guide="tabs">
        <NavLink to="/viewer" className={tabClass("viewer")} onClick={tabClick}>뷰어</NavLink>
        <NavLink to="/quiz" className={tabClass("quiz")} onClick={tabClick}>객관식</NavLink>
        <NavLink to="/blank" className={tabClass("blank")} onClick={tabClick}>빈칸 채우기</NavLink>
        <NavLink to="/short" className={tabClass("short")} onClick={tabClick}>단답형</NavLink>
        <NavLink to="/essay" className={tabClass("essay")} onClick={tabClick}>서술형</NavLink>
      </nav>
      {children}
    </div>
  );
}
