import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import { formatNote } from "./noteFormat.jsx";
import { sourceUrl, subjectUrl, useJsonArray, useSubject } from "./subjects.jsx";
import { useGuide } from "./guide-mode.jsx";
import SourceIssues from "./SourceIssues.jsx";
import FigureGallery from "./FigureGallery.jsx";
import { buildViewerIndex, highlightParts, searchViewerNotes } from "./viewer-search.js";
import "./viewer.css";

function Highlight({ text, ranges }) {
  return highlightParts(text, ranges).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : part.text);
}

export default function Viewer() {
  const [search, setSearch] = useSearchParams();
  const { dataFile, id: subject } = useSubject();
  const { data: notes, loading, error } = useJsonArray(dataFile("notes"));
  const guide = useGuide();
  const query = guide ? "" : search.get("q") || "";
  const [draft, setDraft] = useState(query);
  const composing = useRef(false);
  const searchInput = useRef(null);
  const spread = useRef(null);
  useEffect(() => { setDraft(query); composing.current = false; }, [query, subject]);
  const [zoom, setZoom] = useState(null);
  const [failedImages, setFailedImages] = useState({});
  const [captures, setCaptures] = useState({ pages: {}, loading: true, error: false });
  const [coverage, setCoverage] = useState({});
  const searchableNotes = useMemo(() => notes.map(note => ({ ...note, text: [note.text,
    ...(coverage[`${subject}:${note.id}`]?.captureReview?.excerpts || []).map(entry => entry.quote)].join("\n") })), [notes, coverage, subject]);
  const index = useMemo(() => buildViewerIndex(searchableNotes), [searchableNotes]);
  const results = useMemo(() => searchViewerNotes(index, query), [index, query]);
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
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/page-practice-coverage.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("page coverage"); return response.json(); })
      .then(data => setCoverage(Object.fromEntries((data.subjects || []).flatMap(entry =>
        (entry.pages || []).map(page => [`${entry.subject}:${page.page}`, page])))))
      .catch(error => { if (error.name !== "AbortError") setCoverage({}); });
    return () => controller.abort();
  }, []);
  function show(index) {
    if (!notes.length) return;
    const next = notes[((index % notes.length) + notes.length) % notes.length];
    setSearch(current => { const params = new URLSearchParams(current); params.set("page", next.id); return params; });
    setZoom(null);
  }

  function submitSearch(event) {
    event.preventDefault();
    if (composing.current) return;
    setSearch(current => {
      const params = new URLSearchParams(current);
      if (draft.trim()) params.set("q", draft.trim()); else params.delete("q");
      return params;
    });
  }
  function clearSearch() {
    setDraft("");
    setSearch(current => { const params = new URLSearchParams(current); params.delete("q"); return params; });
    searchInput.current?.focus();
  }
  function showResult(result) {
    show(result.index);
    requestAnimationFrame(() => spread.current?.focus({ preventScroll: false }));
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
  const practice = coverage[`${subject}:${n.id}`];

  return (
    <Chrome title="뷰어" sourcePage={n.id}>
      {selectedPage && found < 0 && <p role="status">선택한 페이지를 찾을 수 없어 첫 자료를 표시합니다.</p>}
      {!guide && <section className="viewer-search" aria-label="뷰어 검색">
        <form role="search" onSubmit={submitSearch}>
          <label htmlFor="viewer-query">현재 과목 원문 검색</label>
          <div className="viewer-search-controls"><input id="viewer-query" ref={searchInput} type="search" value={draft} placeholder="제목이나 본문에서 찾기" maxLength={200}
            aria-describedby="viewer-search-help" onChange={event => setDraft(event.target.value)}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229 || composing.current)) event.preventDefault(); }} />
            <button type="submit">검색</button>{(query || draft) && <button type="button" className="ghost" onClick={clearSearch}>검색 지우기</button>}</div>
        </form>
        <p id="viewer-search-help">띄어쓰기·줄바꿈·대소문자를 무시합니다. 여러 검색어는 모두 포함하며, %는 사이에 어떤 글자가 있어도 찾습니다.</p>
        {query.trim() && <p className="viewer-search-count" role="status">‘{query}’ 검색 결과 {results.length}개</p>}
      </section>}
      <div className={`viewer${query.trim() ? " viewer-search-active" : ""}`}>
        <aside className={`side${query.trim() ? " viewer-results" : ""}`} aria-label={query.trim() ? "원문 검색 결과" : "원문 목록"}>
          {query.trim() ? results.length ? results.map(result => <button key={result.note.id} className={result.index === idx ? "on" : ""} aria-current={result.index === idx ? "page" : undefined} type="button" onClick={() => showResult(result)}>
            <span className="viewer-result-location">{result.location}</span>
            <span className="viewer-result-title"><Highlight text={result.title.text} ranges={result.titleRanges} /></span>
            {result.snippets.map((snippet, k) => <span className="viewer-result-snippet" key={k}>{snippet.before && "…"}<Highlight text={snippet.text} ranges={snippet.ranges} />{snippet.after && "…"}</span>)}
          </button>) : <p className="viewer-no-results">일치하는 자료가 없습니다. 검색어를 줄이거나 다른 표현으로 찾아보세요.</p> : notes.map((item, k) => (
            <button key={item.id} className={k === idx ? "on" : ""} aria-current={k === idx ? "page" : undefined} type="button" onClick={() => show(k)}>
              {item.title}
            </button>
          ))}
        </aside>
        <section className="spread" data-guide="spread" ref={spread} tabIndex={-1} aria-label="선택한 원문">
          <div className="row">
            <button className="ghost" type="button" onClick={() => show(idx - 1)}>이전</button>
            <button className="ghost" type="button" onClick={() => show(idx + 1)}>다음</button>
            <span className="mono muted">{idx + 1} / {notes.length}</span>
          </div>
          <h1>{n.title}</h1>
          <SourceIssues item={n} />
          {!guide && <div className="source-actions">
            {practice?.count > 0 && <Link className="source-link viewer-page-practice" to={subjectUrl(`/questions?sourcePage=${encodeURIComponent(n.id)}`, subject)}>이 쪽 문제 {practice.count}개 보기 →</Link>}
            {n.figures?.length > 0 && <a className="source-link" href="#figures">사진·지도·도표 {n.figures.length}개 보기 ↓</a>}
            {original && <a className="source-link" href={original} target="_blank" rel="noreferrer">원문 출처 열기 ↗</a>}
          </div>}
          {!guide && practice?.status === "exception" && <p className="muted source-hint">문제 구성 안내: {practice.reason}</p>}
          <div className={`page-grid source-comparison${images.length ? " has-capture" : ""}`}>
            <div>
              {!guide && practice?.captureReview && <section className="capture-review" aria-label="원본 캡처 대조 기록">
                <h2>원본 캡처 대조 발췌</h2>
                <p className="muted source-hint">문항에 사용한 부분을 AI가 사진과 대조했습니다. 전체 페이지 전사·전문가 검수를 뜻하지 않습니다.</p>
                <p>{practice.captureReview.summary}</p>
                {practice.captureReview.excerpts.map((entry, index) => <blockquote key={`${entry.src}-${index}`}>
                  <p>{entry.quote}</p><small>{entry.location}</small>
                  <button className="ghost" type="button" onClick={() => setZoom(entry.src)}>해당 원본 캡처 확대</button>
                </blockquote>)}
                {practice.captureReview.duplicateOf && <Link to={subjectUrl(`/viewer?page=${encodeURIComponent(practice.captureReview.duplicateOf)}`, subject)}>중복되지 않는 원문 쪽으로 이동 →</Link>}
              </section>}
              {!guide && practice?.captureReview && <h2>기존 전사</h2>}
              <div data-guide="note-text" className="hand" dangerouslySetInnerHTML={{ __html: formatNote(n.text) }} />
            </div>
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
