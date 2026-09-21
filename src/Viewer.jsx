import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import { formatNote } from "./noteFormat.jsx";

export default function Viewer() {
  const [search] = useSearchParams();
  const [notes, setNotes] = useState([]);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    fetch("/data/notes.json").then((r) => r.json()).then(setNotes);
  }, []);

  useEffect(() => {
    const found = notes.findIndex(n => n.id === search.get("page"));
    if (found >= 0) setI(found);
  }, [notes, search]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.target.closest("input, textarea, [role=dialog]")) return;
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") setI((n) => n + 1);
      if (e.key === "ArrowLeft") setI((n) => n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!notes.length) return <Chrome title="뷰어">불러오는 중</Chrome>;
  const idx = ((i % notes.length) + notes.length) % notes.length;
  const n = notes[idx];

  return (
    <Chrome title="뷰어">
      <div className="viewer">
        <aside className="side">
          {notes.map((item, k) => (
            <button key={item.id} className={k === idx ? "on" : ""} type="button" onClick={() => setI(k)}>
              {item.title}
            </button>
          ))}
        </aside>
        <section className="spread" data-guide="spread">
          <div className="row">
            <button className="ghost" type="button" onClick={() => setI(idx - 1)}>이전</button>
            <button className="ghost" type="button" onClick={() => setI(idx + 1)}>다음</button>
            <span className="mono muted">{idx + 1} / {notes.length}</span>
          </div>
          <h1>{n.title}</h1>
          <div className="page-grid">
            <div data-guide="note-text" className="hand" dangerouslySetInnerHTML={{ __html: formatNote(n.text) }} />
            <img
              data-guide="page-img"
              className="page-img"
              src={`/pages/${n.img}`}
              alt={n.title}
              onClick={() => setZoom(true)}
            />
          </div>
        </section>
      </div>
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)}>
          <img src={`/pages/${n.img}`} alt={n.title} />
        </div>
      )}
    </Chrome>
  );
}
