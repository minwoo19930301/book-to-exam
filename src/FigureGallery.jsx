import { useEffect, useId, useRef, useState } from "react";

const KIND_LABELS = {
  photo: "사진", photograph: "사진", map: "지도", chart: "도표",
  diagram: "도해", table: "표", illustration: "그림", image: "그림",
  사진: "사진", 지도: "지도", 도표: "도표", 도해: "도해", 표: "표", 그림: "그림",
};

function captionOf(figure) {
  return figure.caption || figure.alt || KIND_LABELS[figure.kind] || "교재 그림";
}

function FigureCard({ figure, onOpen }) {
  const [failed, setFailed] = useState(false);
  const caption = captionOf(figure);
  return <figure className="figure-card">
    {failed ? <p className="figure-unavailable" role="status">그림을 불러오지 못했습니다.</p> : <button
      className="figure-open" type="button" aria-label={`${caption} 크게 보기`} onClick={() => onOpen(figure)}>
      <img src={figure.src} alt={figure.alt || caption} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      <span className="figure-open-hint" aria-hidden="true">크게 보기 ↗</span>
    </button>}
    <figcaption>
      {KIND_LABELS[figure.kind] && <span className="figure-kind">{KIND_LABELS[figure.kind]}</span>}
      <p>{caption}</p>
    </figcaption>
  </figure>;
}

export default function FigureGallery({ figures, id }) {
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  const titleId = useId();
  const items = (Array.isArray(figures) ? figures : []).filter(figure => typeof figure?.src === "string" && figure.src.startsWith("/figures/"));

  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);

  if (!items.length) return null;
  return <section className="figure-gallery" id={id} aria-label="사진·지도·도표">
    <div className="figure-gallery-heading">
      <h2>사진·지도·도표</h2>
      <span className="muted">{items.length}개</span>
    </div>
    <div className="figure-grid">
      {items.map(figure => <FigureCard key={`${figure.id || figure.src}:${figure.src}`} figure={figure} onOpen={setSelected} />)}
    </div>
    <dialog ref={dialog} className="figure-dialog" aria-labelledby={titleId}
      onCancel={() => setSelected(null)} onClose={() => setSelected(null)}
      onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}
      onKeyDown={event => event.stopPropagation()}>
      {selected && <div className="figure-dialog-content">
        <div className="figure-dialog-heading">
          <h2 id={titleId}>{captionOf(selected)}</h2>
          <button className="ghost" type="button" onClick={() => setSelected(null)} autoFocus>닫기</button>
        </div>
        <img src={selected.src} alt={selected.alt || captionOf(selected)} />
      </div>}
    </dialog>
  </section>;
}
