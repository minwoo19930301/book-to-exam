import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import { formatNote } from "./noteFormat.jsx";
import { sourceUrl, useJsonArray, useSubject } from "./subjects.jsx";
import { useGuide } from "./guide-mode.jsx";
import SourceIssues from "./SourceIssues.jsx";
import FigureGallery from "./FigureGallery.jsx";
import "./viewer.css";

export default function Viewer() {
  const [search, setSearch] = useSearchParams();
  const { dataFile } = useSubject();
  const { data: notes, loading, error } = useJsonArray(dataFile("notes"));
  const guide = useGuide();
  const [zoom, setZoom] = useState(null);
  const [failedImages, setFailedImages] = useState({});
  const [captures, setCaptures] = useState({ pages: {}, loading: true, error: false });
  const selectedPage = guide ? null : search.get("page");
  const found = notes.findIndex(note => note.id === selectedPage);
  const idx = found < 0 ? 0 : found;
  const n = notes[idx];
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/source-pages.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("capture manifest"); return response.json(); })
      .then(data => setCaptures({ pages: data.pages || {}, loading: false, error: false }))
      .catch(error => { if (error.name !== "AbortError") setCaptures({ pages: {}, loading: false, error: true }); });
    return () => controller.abort();
  }, []);
  function show(index) {
    if (!notes.length) return;
    const next = notes[((index % notes.length) + notes.length) % notes.length];
    setSearch(current => { const params = new URLSearchParams(current); params.set("page", next.id); return params; });
    setZoom(null);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setZoom(null);
      if (e.defaultPrevented || e.target.closest?.("input, textarea, select, dialog, [role=dialog]")) return;
      if (e.key === "ArrowRight") show(idx + 1);
      if (e.key === "ArrowLeft") show(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, notes, setSearch]);

  useEffect(() => setZoom(null), [n?.id]);

  if (loading) return <Chrome title="뷰어"><p role="status">자료를 불러오는 중…</p></Chrome>;
  if (error) return <Chrome title="뷰어"><p role="alert">{error}</p></Chrome>;
  if (!n) return <Chrome title="뷰어"><p>표시할 자료가 없습니다.</p></Chrome>;
  const imageUrl = n.img ? sourceUrl(n.img) || `/pages/${encodeURIComponent(n.img)}` : null;
  const images = imageUrl ? [{ src: imageUrl }] : (captures.pages[n.id]?.captures || []);
  const original = sourceUrl(n.sourceUrl || n.source?.url);

  return (
    <Chrome title="뷰어">
      {selectedPage && found < 0 && <p role="status">선택한 페이지를 찾을 수 없어 첫 자료를 표시합니다.</p>}
      <div className="viewer">
        <aside className="side">
          {notes.map((item, k) => (
            <button key={item.id} className={k === idx ? "on" : ""} aria-current={k === idx ? "page" : undefined} type="button" onClick={() => show(k)}>
              {item.title}
            </button>
          ))}
        </aside>
        <section className="spread" data-guide="spread">
          <div className="row">
            <button className="ghost" type="button" onClick={() => show(idx - 1)}>이전</button>
            <button className="ghost" type="button" onClick={() => show(idx + 1)}>다음</button>
            <span className="mono muted">{idx + 1} / {notes.length}</span>
          </div>
          <h1>{n.title}</h1>
          <SourceIssues item={n} />
          {!guide && <div className="source-actions">
            {n.figures?.length > 0 && <a className="source-link" href="#figures">사진·지도·도표 {n.figures.length}개 보기 ↓</a>}
            {original && <a className="source-link" href={original} target="_blank" rel="noreferrer">원문 출처 열기 ↗</a>}
          </div>}
          <div className={`page-grid source-comparison${images.length ? " has-capture" : ""}`}>
            <div data-guide="note-text" className="hand" dangerouslySetInnerHTML={{ __html: formatNote(n.text) }} />
            <section className="source-captures" aria-label="원문 캡처">
              <h2>원문 캡처</h2>
              {images.length > 0 && <p className="muted source-hint">눌러서 크게 볼 수 있습니다.</p>}
              {images.map((capture, index) => failedImages[capture.src] ?
                <p key={capture.src} className="muted source-hint" role="status">캡처를 불러오지 못했습니다. <a href={capture.src} target="_blank" rel="noreferrer">이미지 다시 열기 ↗</a></p> :
                <button className="capture-open" key={capture.src} type="button" onClick={() => setZoom(capture.src)} aria-label={`${n.title} 원문 캡처 ${index + 1} 확대`}>
                  <img data-guide="page-img" className="page-img" src={capture.src} alt={`${n.title} 원문 캡처 ${index + 1}`}
                    width={capture.width} height={capture.height} loading="lazy" decoding="async"
                    onError={() => setFailedImages(previous => ({ ...previous, [capture.src]: true }))} />
                </button>
              )}
              {!images.length && <p className="muted source-hint" role="status">{captures.loading ? "원문 캡처를 불러오는 중…" : captures.error ? "캡처 목록을 불러오지 못했습니다. 새로고침해 주세요." : "이 페이지는 원본 자료에 연결된 캡처가 없습니다."}</p>}
            </section>
          </div>
          <FigureGallery key={n.id} figures={n.figures} id="figures" />
        </section>
      </div>
      {zoom && (
        <div className="lightbox source-lightbox" role="dialog" aria-label="원문 이미지 확대" aria-modal="true" onClick={() => setZoom(null)}>
          <button type="button" className="lightbox-close" autoFocus onClick={() => setZoom(null)}>닫기</button>
          <img src={zoom} alt={n.title} />
        </div>
      )}
    </Chrome>
  );
}
