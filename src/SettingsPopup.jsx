import { useEffect, useRef } from "react";
import { useSettings } from "./settings.jsx";

export default function SettingsPopup({ onClose, guided = false }) {
  const { s, setS } = useSettings();
  const panel = useRef(null);
  useEffect(() => {
    if (guided) return;
    const previous = document.activeElement;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("button")?.focus();
    function keys(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key !== "Tab") return;
      const els = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keys, true);
    return () => { document.body.style.overflow = before; document.removeEventListener("keydown", keys, true); previous?.focus(); };
  }, [guided, onClose]);
  return <div className={`settings-overlay${guided ? " guided" : ""}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={panel} id="reading-settings" className="settings-popup" data-guide="settings-panel"
      role="dialog" aria-modal={!guided} aria-labelledby="settings-title">
      <div className="settings-heading"><h2 id="settings-title">설정</h2><button className="text-btn" onClick={onClose} aria-label="설정 닫기">×</button></div>
      <div className="set-row"><div><label htmlFor="font-size">글씨 크기</label><div className="set-val">{s.fontSize}px</div></div>
        <input id="font-size" type="range" min="14" max="22" value={s.fontSize} onChange={e => setS({ ...s, fontSize: Number(e.target.value) })} /></div>
      <div className="set-row"><div><label htmlFor="line-height">줄 간격</label><div className="set-val">{s.lineHeight}</div></div>
        <input id="line-height" type="range" min="1.4" max="2.2" step="0.1" value={s.lineHeight} onChange={e => setS({ ...s, lineHeight: Number(e.target.value) })} /></div>
      <div className="set-row"><div><div className="set-name">다크 모드</div><div className="set-val">{s.dark ? "켜짐" : "꺼짐"}</div></div>
        <button type="button" role="switch" aria-label="다크 모드" aria-checked={s.dark} className={s.dark ? "switch on" : "switch"} onClick={() => setS({ ...s, dark: !s.dark })} /></div>
    </section>
  </div>;
}
