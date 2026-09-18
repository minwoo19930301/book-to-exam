import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useSettings } from "./settings.jsx";

export default function Chrome({ title, children }) {
  const { s, setS } = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <div className="page">
      <div className="bar">
        <Link className="brand" to="/exam">BookVideoToExam</Link>
        <span className="kicker hide-sm">{title}</span>
        <button className="ghost pill" type="button" onClick={() => setOpen((v) => !v)}>설정</button>
      </div>
      <nav className="tabs">
        <NavLink to="/exam">시험</NavLink>
        <NavLink to="/viewer">뷰어</NavLink>
        <NavLink to="/quiz">객관식</NavLink>
        <NavLink to="/essay">서술형</NavLink>
      </nav>
      {open && (
        <div className="settings">
          <label>글씨 크기 <b>{s.fontSize}</b>
            <input type="range" min="14" max="22" value={s.fontSize} onChange={(e) => setS({ ...s, fontSize: Number(e.target.value) })} />
          </label>
          <label>줄 간격 <b>{s.lineHeight}</b>
            <input type="range" min="1.4" max="2.2" step="0.1" value={s.lineHeight} onChange={(e) => setS({ ...s, lineHeight: Number(e.target.value) })} />
          </label>
          <label className="chk">
            <input type="checkbox" checked={s.dark} onChange={(e) => setS({ ...s, dark: e.target.checked })} />
            다크 모드
          </label>
        </div>
      )}
      {children}
    </div>
  );
}
