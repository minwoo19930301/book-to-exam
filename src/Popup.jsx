import { useEffect, useId, useRef } from "react";
import "./popup.css";

export default function Popup({ title, wide = false, onClose, children }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    element.querySelector("textarea, [data-popup-autofocus]")?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className={`study-popup${wide ? " study-popup-wide" : ""}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    } }}>
    <div className="study-popup-inner">
      <header className="study-popup-heading"><h2 id={titleId}>{title}</h2><button type="button" className="text-btn" aria-label={`${title} 닫기`} onClick={onClose}>×</button></header>
      <div className="study-popup-body">{children}</div>
    </div>
  </dialog>;
}
