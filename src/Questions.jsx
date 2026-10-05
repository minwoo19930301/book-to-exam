import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import Chrome from "./Chrome.jsx";
import { subjectUrl, useSubjects } from "./subjects.jsx";

const TYPES = { all: "전체", mc: "객관식", short: "단답형", blank: "빈칸", essay: "서술형", research: "연구 예상문항" };
const SUBJECT_NAMES = { "hand-memo": "손글씨 메모", seoyangsa: "서양사", hanguksa: "한국사", dongyangsa: "동양사", gyoyukron: "역사교육론" };
const list = value => Array.isArray(value) ? value : [];
const readable = value => typeof value === "string" ? value.replace(/\*\*/g, "") : "";

function Criterion({ criterion, index }) {
  return <li className="bank-criterion">
    <strong>{index + 1}. {criterion.label || criterion.title || "채점 요소"} <span className="muted">· {criterion.max}점</span></strong>
    {criterion.ok && <p>{readable(criterion.ok)}</p>}
    {list(criterion.checkpoints).length > 0 && <ul>{criterion.checkpoints.map((item, i) => <li key={i}>{readable(typeof item === "string" ? item : item.text)}{typeof item?.points === "number" ? ` (${item.points}점)` : ""}</li>)}</ul>}
    {criterion.requiredRelation && <p>필수 관계: {readable(criterion.requiredRelation)}</p>}
    {list(criterion.acceptedConcepts).length > 0 && <p>인정 개념: {criterion.acceptedConcepts.join(" · ")}</p>}
    {list(criterion.rejectConditions).length > 0 && <p className="muted">감점에 해당하는 내용: {criterion.rejectConditions.join(" / ")}</p>}
    {list(criterion.scoreLevels).length > 0 && <ul className="muted">{criterion.scoreLevels.map((level, i) => <li key={i}>{level.score}점: {readable(level.condition)}</li>)}</ul>}
    {criterion.scoring && <p className="muted">{readable(criterion.scoring)}</p>}
  </li>;
}

export function QuestionCard({ item, number, expanded, onExpanded }) {
  const location = useLocation();
  const essay = item.type === "essay" || item.type === "research";
  const evidence = list(item.evidence);
  const sources = [...new Set([...list(item.sourcePages), ...evidence.map(entry => entry.page)].filter(Boolean))];
  const answer = item.type === "mc" && Number.isInteger(item.answer)
    ? `${item.answer + 1}번 · ${readable(item.choices?.[item.answer])}`
    : Array.isArray(item.answer) ? item.answer.join(" / ") : readable(item.answer);
  return <article className="card bank-question" id={item.id}>
    <div className="bank-question-meta"><span>{number}. {SUBJECT_NAMES[item.subject] || item.subject}</span><span className="bank-type">{TYPES[item.type]}</span></div>
    {essay && item.title && <h2>{readable(item.title)}</h2>}
    <p className="bank-prompt">{readable(item.prompt)}</p>
    {list(item.choices).length > 0 && <ol className="bank-choices">{item.choices.map((choice, index) => <li key={index} className={expanded && index === item.answer ? "bank-correct" : ""}>{readable(choice)}{expanded && index === item.answer && <span className="bank-answer-mark">정답</span>}</li>)}</ol>}
    <details className="bank-answer" open={expanded} onToggle={event => onExpanded(event.currentTarget.open)}>
      <summary>{essay ? "예시 답안·채점 기준" : "정답·해설"}</summary>
      <div className="bank-answer-body">
        {answer && !(essay && item.modelAnswer) && <p className="bank-answer-value"><strong>정답</strong> {answer}</p>}
        {item.modelAnswer && <><h3>예시 답안</h3><p className="bank-prose">{readable(item.modelAnswer)}</p></>}
        {item.explanation && <><h3>해설</h3><p className="bank-prose">{readable(item.explanation)}</p></>}
        {list(item.choiceExplanations).length > 0 && <ol className="bank-choice-explanations">{item.choiceExplanations.map((value, index) => <li key={index}>{readable(value)}</li>)}</ol>}
        {list(item.criteria).length > 0 && <><h3>채점 기준 · {item.criteria.reduce((sum, criterion) => sum + criterion.max, 0)}점</h3><ol className="bank-criteria">{item.criteria.map((criterion, index) => <Criterion key={criterion.id || index} criterion={criterion} index={index} />)}</ol></>}
        {item.scoreNote && <p className="muted bank-note">{readable(item.scoreNote)}</p>}
        {item.caution && <p className="muted bank-note">{readable(item.caution)}</p>}
        {evidence.length > 0 && <details className="bank-evidence"><summary>교재 근거 {evidence.length}개</summary>{evidence.map((entry, index) => <blockquote key={`${entry.page}-${index}`} className="evidence-excerpt">{readable(entry.quote)}<br /><Link className="source-link" to={subjectUrl(`/viewer?page=${encodeURIComponent(entry.page)}`, item.subject)}>원문 보기 ↗</Link></blockquote>)}</details>}
      </div>
    </details>
    {sources.length > 0 && <div className="bank-source-links">{sources.map((page, index) => <Link key={page} className="source-link" to={subjectUrl(`/viewer?page=${encodeURIComponent(page)}`, item.subject)}>교재 원문{sources.length > 1 ? ` ${index + 1}` : ""} ↗</Link>)}</div>}
    <div className="bank-source-links"><Link className="source-link" to={subjectUrl(`/appeal?${new URLSearchParams({ from: location.pathname + location.search, type: item.type, question: item.id })}`, item.subject)}>이 문항 이의제기</Link></div>
  </article>;
}

function Pagination({ data, onPage, position }) {
  return <nav className="bank-pagination" aria-label={`문제은행 페이지 ${position}`}>
    <button type="button" className="ghost" disabled={data.page <= 1} onClick={() => onPage(Math.max(1, data.page - 1))}>이전</button>
    <span>{data.page.toLocaleString()} / {Math.max(1, data.pageCount).toLocaleString()} 페이지</span>
    <button type="button" className="ghost" disabled={data.page >= data.pageCount} onClick={() => onPage(data.page + 1)}>다음</button>
  </nav>;
}

export default function Questions() {
  const { subjects } = useSubjects();
  const [params, setParams] = useSearchParams();
  const subject = params.get("subject") || "all";
  const type = params.get("type") || "all";
  const query = params.get("q") || "";
  const page = params.get("page") || "1";
  const pageSize = params.get("pageSize") || "20";
  const requestParams = new URLSearchParams({ subject, type, q: query, page, pageSize });
  const requestKey = requestParams.toString();
  const activeRequest = useRef(requestKey);
  activeRequest.current = requestKey;
  const [state, setState] = useState({ key: "", data: null, error: "" });
  const [search, setSearch] = useState(query);
  const [opened, setOpened] = useState({ key: "", ids: {} });
  const [retry, setRetry] = useState(0);
  const resultsRef = useRef(null);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key: requestKey, data: null, error: "" });
    fetch(`/api/practice-bank?${requestKey}`, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "문제은행을 불러오지 못했습니다.");
      if (!Array.isArray(result.items) || !Number.isInteger(result.total)) throw new Error("문제은행의 응답을 확인할 수 없습니다.");
      if (!controller.signal.aborted) setState({ key: requestKey, data: result, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key: requestKey, data: null, error: error.message || "문제은행을 불러오지 못했습니다." });
    });
    return () => controller.abort();
  }, [requestKey, retry]);
  const current = state.key === requestKey ? state : { data: null, error: "" };
  const data = current.data;
  const openIds = opened.key === requestKey ? opened.ids : {};
  function update(patch) {
    const next = new URLSearchParams({ subject, type, q: query, page: "1", pageSize, ...patch });
    if (!next.get("q")) next.delete("q");
    setOpened({ key: "", ids: {} });
    setParams(next);
  }
  function changePage(value) {
    update({ page: String(value) });
    resultsRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    resultsRef.current?.focus({ preventScroll: true });
  }
  function setExpanded(id, value) {
    // Ignore an old card's queued toggle after changing subject or page.
    if (activeRequest.current !== requestKey) return;
    setOpened(previous => ({ key: requestKey, ids: { ...(previous.key === requestKey ? previous.ids : {}), [id]: value } }));
  }
  return <Chrome title="문제은행" subjectControls={false} navigationSubject={Object.hasOwn(SUBJECT_NAMES, subject) ? subject : "seoyangsa"}>
    <header className="bank-heading"><p className="kicker">문제은행</p><h1>문제와 해설을 한눈에</h1><p className="muted">과목과 유형을 골라 연습문항을 둘러보세요. 정답과 해설, 서술형의 채점 기준을 펼쳐 확인할 수 있습니다.</p></header>
    <section className="card bank-filters" aria-label="문제 찾기">
      <div className="bank-filter-row"><label>과목<select value={subject} onChange={event => update({ subject: event.target.value })}><option value="all">전체 과목</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>한 번에 보기<select value={pageSize} onChange={event => update({ pageSize: event.target.value })}>{[20, 50, 100].map(size => <option key={size} value={size}>{size}문항</option>)}</select></label></div>
      <form className="bank-search" onSubmit={event => { event.preventDefault(); update({ q: search.trim() }); }}><label className="bank-search-input">내용 검색<input type="search" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder="예: 시민권, 신라, 사료 비판" /></label><button type="submit">검색</button></form>
      <div className="bank-types" role="group" aria-label="문제 유형">{Object.entries(TYPES).map(([id, label]) => <button type="button" className={type === id ? "" : "ghost"} key={id} aria-pressed={type === id} onClick={() => update({ type: id })}>{label}{data && <span className="bank-count">{data.counts[id].toLocaleString()}</span>}</button>)}</div>
    </section>
    {type === "research" && <p className="muted bank-note">논문에서 착안한 창작 연습문항입니다. 실제 출제 예정 문제나 공식 채점 기준을 뜻하지 않습니다.</p>}
    <section ref={resultsRef} className="bank-results" tabIndex={-1} aria-label="검색 결과" aria-busy={!data && !current.error}>
      {current.error ? <div className="card" role="alert"><p>{current.error}</p><div className="row"><button type="button" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button><button type="button" className="ghost" onClick={() => update({ subject: "all", type: "all", q: "", pageSize: "20" })}>필터 초기화</button></div></div> : !data ? <p role="status">문제를 불러오는 중…</p> : <>
        <div className="bank-results-bar"><p role="status"><strong>{data.total.toLocaleString()}문항</strong>{data.items.length > 0 && <span className="muted"> · {(data.page - 1) * data.pageSize + 1}–{(data.page - 1) * data.pageSize + data.items.length}번</span>}</p><div className="bank-bulk-actions"><button type="button" className="text-btn" disabled={!data.items.length} onClick={() => setOpened({ key: requestKey, ids: Object.fromEntries(data.items.map(item => [item.id, true])) })}>이 페이지 정답 모두 펼치기</button><button type="button" className="text-btn" disabled={!Object.values(openIds).some(Boolean)} onClick={() => setOpened({ key: requestKey, ids: {} })}>모두 접기</button></div></div>
        {data.pageCount > 1 && <Pagination data={data} onPage={changePage} position="위" />}
        {data.items.length ? data.items.map((item, index) => <QuestionCard key={`${requestKey}:${item.id}`} item={item} number={(data.page - 1) * data.pageSize + index + 1} expanded={Boolean(openIds[item.id])} onExpanded={value => setExpanded(item.id, value)} />) : <div className="card"><h2>{data.total ? "이 페이지에는 문항이 없습니다." : "조건에 맞는 문항이 없습니다."}</h2><p className="muted">검색어를 줄이거나 다른 과목과 유형을 선택해 보세요.</p><button type="button" className="ghost" onClick={() => update(data.total ? { page: "1" } : { type: "all", q: "" })}>{data.total ? "첫 페이지로" : "검색 조건 지우기"}</button></div>}
        {data.pageCount > 1 && <Pagination data={data} onPage={changePage} position="아래" />}
      </>}
    </section>
  </Chrome>;
}
