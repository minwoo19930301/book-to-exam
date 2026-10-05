import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import { QuestionCard } from "./Questions.jsx";
import { useSubjects } from "./subjects.jsx";

const list = value => Array.isArray(value) ? value : [];
const prose = value => Array.isArray(value) ? value.map(prose).filter(Boolean).join(" · ") : typeof value === "string" || typeof value === "number" ? String(value) : "";
const safeUrl = value => typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
const VIEWS = { topics: "주제 분석", faculty: "교수·논문", questions: "연구 예상문항" };
const SUBJECTS = { seoyangsa: "서양사", hanguksa: "한국사", dongyangsa: "동양사", gyoyukron: "역사교육론" };
const READ_SCOPES = { metadata: "서지 확인", abstract: "초록 검토", "abstract-excerpt": "초록 일부", excerpt: "본문 일부", fulltext: "전문 검토", unspecified: "확인 범위 미기재" };
const paperKey = paper => `${paper.subject}:${paper.id}`;

function ExternalLink({ url, children }) {
  return safeUrl(url) ? <a href={url} target="_blank" rel="noreferrer">{children} ↗</a> : null;
}
function Points({ values, className }) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  return items.length ? <ul className={className}>{items.map((item, index) => <li key={index}>{prose(item)}</li>)}</ul> : null;
}
function Level({ level }) {
  return <span className={`research-level level-${level || "none"}`}>주제 예상도 · {level || "검토 중"}</span>;
}
function Paper({ paper }) {
  return <article className="research-paper" id={`paper-${paper.subject}-${paper.id}`}>
    <div className="research-paper-meta"><span>{paper.year || paper.publicationDate || "연도 미기재"} · {prose(paper.authors)}</span><span>{READ_SCOPES[paper.reviewClass] || "확인 범위 참고"}</span></div>
    <h4>{paper.title}</h4>
    <p className="muted research-small">{[prose(paper.journal), prose(paper.issue), paper.pages && `${paper.pages}쪽`].filter(Boolean).join(" · ")}</p>
    {paper.summary && <p>{prose(paper.summary)}{paper.summaryTruncated && " (요약 일부)"}</p>}
    <p className="research-small"><strong>확인 범위</strong> {prose(paper.readScope)}{paper.readDetails && ` · ${prose(paper.readDetails)}`}</p>
    {paper.caution && <p className="muted research-small">{prose(paper.caution)}</p>}
    <Points values={paper.sourceWarnings} className="muted research-small" />
    <div className="research-links"><ExternalLink url={paper.url}>논문 원문·서지</ExternalLink>{paper.doi && !safeUrl(paper.url) && <ExternalLink url={`https://doi.org/${paper.doi}`}>DOI</ExternalLink>}</div>
  </article>;
}

export default function PredictionAnalysis() {
  const { subjects } = useSubjects();
  const [params, setParams] = useSearchParams();
  const requestedSubject = params.get("subject") || "all";
  const subject = SUBJECTS[requestedSubject] ? requestedSubject : "all";
  const query = params.get("q") || "";
  const facultyId = params.get("facultyId") || "";
  const topicId = params.get("topic") || "";
  const view = VIEWS[params.get("view")] ? params.get("view") : "topics";
  const page = Math.max(1, Number.parseInt(params.get("page"), 10) || 1);
  const [search, setSearch] = useState(query);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ key: "", data: null, error: "" });
  const [opened, setOpened] = useState({});
  const request = new URLSearchParams({ subject, q: query, ...(facultyId ? { facultyId } : {}) }).toString();
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key: request, data: null, error: "" });
    fetch(`/api/research?${request}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "연구 분석 자료를 불러오지 못했습니다.");
      if (!["faculty", "papers", "topics", "predictions"].every(key => Array.isArray(data[key]))) throw new Error("연구 자료의 응답 형식을 확인할 수 없습니다.");
      if (!controller.signal.aborted) setState({ key: request, data, error: "" });
    }).catch(error => { if (!controller.signal.aborted) setState({ key: request, data: null, error: error.message }); });
    return () => controller.abort();
  }, [request, reload]);
  const data = state.key === request ? state.data : null;
  const error = state.key === request ? state.error : "";
  function change(values, reset = true) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) if (value) next.set(key, value); else next.delete(key);
    if (reset) next.delete("page");
    setParams(next);
  }
  const topic = data?.topics.find(item => item.id === topicId);
  const topics = topic ? [topic] : list(data?.topics);
  const predictions = list(data?.predictions).filter(item => !topic || list(topic.predictionIds).includes(item.id));
  const pageCount = Math.max(1, Math.ceil(predictions.length / 10));
  const currentPage = Math.min(page, pageCount);
  const shown = predictions.slice((currentPage - 1) * 10, currentPage * 10);
  const facultyName = id => data?.faculty.find(person => person.id === id)?.name || "연구 참고 인물";
  const relevantPapers = item => list(data?.papers).filter(paper => paper.subject === item.subject && list(item.paperIds).includes(paper.id));
  const selectFaculty = id => change({ facultyId: id, topic: "", view: "faculty" });

  return <Chrome title="출제자 예상" subjectControls={false} feedbackSubject={subject} navigationSubject={subject === "all" ? "hand-memo" : subject}>
    <header className="research-heading">
      <p className="kicker">출제자 예상 · 공개 연구 참고</p>
      <h1>공개 연구를 바탕으로 한<br className="research-mobile-break" /> 출제 주제 분석</h1>
      <p className="muted">교수의 연구 분야와 최근 논문을 교재의 핵심 쟁점, 연구 기반 연습문항으로 연결합니다.</p>
      <p className="research-scope-note">여기에 소개한 교수는 공개 연구 참고 인물입니다. 실제 출제위원 여부는 확인되지 않았습니다. ‘상·중상·중’은 연구 주제와 교재 핵심 개념의 연결을 살핀 편집적 판단이며 실제 출제 확률이 아닙니다.</p>
      {data && <div className="research-counts" aria-label="연구 자료 수"><span><strong>{data.faculty.length}</strong> 교수</span><span><strong>{data.papers.length}</strong> 검토 논문</span><span><strong>{list(data.bibliography).length}</strong> 수집 서지</span><span><strong>{data.predictions.length}</strong> 예상 연습문항</span><span className="muted">확인 기준 {prose(data.asOf) || "자료별 표시"}</span></div>}
    </header>
    <section className="card research-filters" aria-label="연구 분석 필터">
      <div className="research-filter-row"><label>과목<select aria-label="연구 과목" value={subject} onChange={event => change({ subject: event.target.value, facultyId: "", topic: "" })}><option value="all">전체 과목</option>{Object.entries(SUBJECTS).map(([id, name]) => <option key={id} value={id}>{subjects.find(item => item.id === id)?.title || name}</option>)}</select></label>
        <form onSubmit={event => { event.preventDefault(); change({ q: search.trim(), topic: "" }); }}><label>연구 검색<input aria-label="교수·논문·주제 검색" placeholder="교수, 논문, 주제 검색" value={search} onChange={event => setSearch(event.target.value)} /></label><button type="submit">검색</button></form></div>
      {(facultyId || topicId || query) && <div className="research-active-filters">{facultyId && <span>교수: {facultyName(facultyId)}</span>}{topic && <span>주제: {topic.title}</span>}{query && <span>검색: {query}</span>}<button className="text-btn" type="button" onClick={() => change({ facultyId: "", topic: "", q: "" })}>조건 지우기</button></div>}
      <div className="study-mode-filter" role="group" aria-label="연구 분석 보기">{Object.entries(VIEWS).map(([id, label]) => <button type="button" key={id} className={view === id ? "" : "ghost"} aria-pressed={view === id} onClick={() => change({ view: id })}>{label}</button>)}</div>
    </section>
    {error && <div className="card" role="alert"><p>{error}</p><button type="button" className="ghost" onClick={() => setReload(value => value + 1)}>다시 불러오기</button></div>}
    {!data && !error && <p role="status">공개 연구 자료를 불러오는 중…</p>}
    {data && <>
      {!data.faculty.length && !data.topics.length && !data.predictions.length && <section className="card"><h2>조건에 맞는 자료가 없습니다.</h2><p className="muted">다른 검색어나 전체 과목으로 확인해 보세요.</p></section>}
      {view === "topics" && <section aria-label="출제 주제 분석" className="research-topic-list">{topics.map(item => <article className="card research-topic" key={item.id}>
        <div className="research-card-meta"><span>{SUBJECTS[item.subject]}</span><Level level={item.level} /></div><h2>{item.title}</h2>
        <h3>판단 근거</h3><Points values={item.rationale} />
        <div className="research-faculty-links">{list(item.facultyIds).map(id => <button className="text-btn" type="button" key={id} onClick={() => selectFaculty(id)}>{facultyName(id)} 연구 보기 ↗</button>)}</div>
        <details className="research-paper-details"><summary>관련 논문 {relevantPapers(item).length}편 · 확인 범위</summary>{relevantPapers(item).map(paper => <Paper key={paperKey(paper)} paper={paper} />)}</details>
        <Points values={item.limitations} className="muted research-small" />
        <button type="button" className="ghost" disabled={!list(item.predictionIds).length} onClick={() => change({ topic: item.id, view: "questions" })}>연결 예상문항 {list(item.predictionIds).length}개 보기</button>
      </article>)}</section>}
      {view === "faculty" && <section aria-label="공개 연구 교수와 논문">{data.faculty.map(person => {
        const selected = data.papers.filter(paper => list(paper.facultyIds).includes(person.id) || (paper.subject === person.subject && list(person.paperIds).includes(paper.id)));
        const bibliography = list(data.bibliography).filter(paper => list(paper.facultyIds).includes(person.id) || list(person.bibliographyIds).includes(paper.id));
        return <article className="card research-faculty" key={person.id}>
          <div className="research-card-meta"><span>{SUBJECTS[person.subject]} · 공개 연구 참고 인물</span>{person.verifiedAt && <span>소속 확인 {person.verifiedAt}</span>}</div>
          <h2>{person.name} <span className="muted research-position">{person.position}</span></h2><p className="research-affiliation">{prose(person.affiliation)}</p>
          <p><strong>연구 분야</strong> {prose(person.field) || "공식 프로필·논문 참고"}</p>
          <div className="research-links">{list(person.profileUrls).map((url, index) => <ExternalLink key={url} url={url}>공식 소속·업적{person.profileUrls.length > 1 ? ` ${index + 1}` : ""}</ExternalLink>)}</div>
          {person.coverage && <p className="muted research-small">{prose(person.coverage)}</p>}
          <details className="research-paper-details"><summary>검토한 논문 {selected.length}편 · 요약과 확인 범위</summary>{selected.map(paper => <Paper key={paperKey(paper)} paper={paper} />)}{!selected.length && <p className="muted">이 필터에서 연결된 검토 논문이 없습니다.</p>}</details>
          {bibliography.length > 0 && <details className="research-paper-details"><summary>공개 목록에서 수집한 서지 {bibliography.length}건</summary><p className="muted research-small">목록 수집과 내용 검토는 다릅니다. 내용 확인 범위는 연결된 검토 논문을 기준으로 표시합니다.</p><ol className="research-bibliography">{bibliography.map((paper, index) => <li key={`${paper.id}-${index}`}><strong>{paper.title || paper.citation}</strong>{paper.title && paper.citation && <p>{paper.citation}</p>}<p className="muted">{[paper.year, paper.publicationType, prose(paper.readScope), prose(paper.contentReviewScope)].filter(Boolean).join(" · ")}</p><ExternalLink url={paper.url}>서지 출처</ExternalLink></li>)}</ol></details>}
          <button className="ghost" type="button" onClick={() => change({ facultyId: person.id, topic: "", view: "questions" })}>연결 예상문항 {list(person.predictionIds).length}개 보기</button>
        </article>;
      })}</section>}
      {view === "questions" && <section aria-label="연구 예상문항">
        <p className="muted">{predictions.length}개의 자체 제작 연습문항 · 실제 기출이나 적중 확률을 뜻하지 않습니다.</p>
        <p className="muted research-small">연구 관점 적용과 사료 탐구를 연습하는 자체 서술형 문항입니다. 초록에서 확인하지 못한 세부 결론은 요구하지 않으며, 논문별 확인 범위와 문항에서 제시한 관점을 함께 보세요.</p>
        {shown.map((item, index) => <div className="research-question" key={item.id}>
          <div className="research-question-context"><Level level={item.forecast?.level} /><Points values={item.forecast?.basis} className="research-small" /></div>
          <QuestionCard item={{ ...item, type: "research" }} number={(currentPage - 1) * 10 + index + 1} expanded={Boolean(opened[item.id])} onExpanded={value => setOpened(previous => ({ ...previous, [item.id]: value }))} />
          <details className="research-question-papers"><summary>이 문항의 논문 근거와 읽은 범위</summary>{relevantPapers(item).map(paper => <Paper key={paperKey(paper)} paper={paper} />)}<Points values={item.forecast?.limitations} className="muted research-small" /></details>
        </div>)}
        {!shown.length && <p>선택한 조건에 연결된 예상문항이 없습니다.</p>}
        {pageCount > 1 && <nav className="bank-pagination" aria-label="연구 예상문항 페이지"><button className="ghost" type="button" disabled={currentPage <= 1} onClick={() => change({ page: String(currentPage - 1) }, false)}>이전</button><span>{currentPage} / {pageCount}</span><button className="ghost" type="button" disabled={currentPage >= pageCount} onClick={() => change({ page: String(currentPage + 1) }, false)}>다음</button></nav>}
      </section>}
      <details className="research-limitations"><summary>자료 수집·분석 범위</summary><Points values={data.limitations} className="muted research-small" /><p className="muted research-small">서지 수는 수집한 목록의 규모이며, 논문 전문을 모두 읽은 수가 아닙니다. 논문별 확인 범위와 연결 근거를 함께 보세요.</p></details>
    </>}
  </Chrome>;
}
