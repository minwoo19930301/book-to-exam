import { createContext, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGuide } from "./guide-mode.jsx";

const HAND_MEMO = { id: "hand-memo", title: "손글씨 메모", description: "손글씨 메모의 개념과 근거로 공부합니다.", dataPath: "/data" };
const SubjectsContext = createContext({ subjects: [HAND_MEMO], loading: true, error: "" });

export function SubjectsProvider({ children }) {
  const [state, setState] = useState({ subjects: [HAND_MEMO], loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/subjects.json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("과목 목록을 불러오지 못했습니다. 새로고침해 주세요.");
      return response.json();
    }).then(subjects => {
      if (!Array.isArray(subjects) || !subjects.length || subjects.some(subject => !subject.id || !subject.title || !/^\/data(?:\/[a-zA-Z0-9_-]+)*$/.test(subject.dataPath)))
        throw new Error("과목 목록 형식을 확인할 수 없습니다.");
      if (!controller.signal.aborted) setState({ subjects: subjects.some(subject => subject.id === HAND_MEMO.id) ? subjects : [HAND_MEMO, ...subjects], loading: false, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ subjects: [HAND_MEMO], loading: false, error: error.message });
    });
    return () => controller.abort();
  }, []);
  return <SubjectsContext.Provider value={state}>{children}</SubjectsContext.Provider>;
}

export function subjectUrl(path, subjectId) {
  if (!path?.startsWith("/") || path.startsWith("//")) return path;
  const url = new URL(path, "https://study.local");
  url.searchParams.set("subject", subjectId || HAND_MEMO.id);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sourceUrl(value) {
  if (typeof value !== "string") return null;
  if (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value)) return value;
  return null;
}

export function useSubjects() {
  return useContext(SubjectsContext);
}

export function studyDescription(subject) {
  return subject?.id === "hand-memo"
    ? "손글씨 메모를 읽고 문제를 풀어보세요."
    : `${subject?.title || "역사"} 교재와 그림을 읽고 문제를 풀어보세요.`;
}

export function useSubject() {
  const { subjects, loading, error } = useSubjects();
  const { search } = useLocation();
  const guide = useGuide();
  const id = guide ? HAND_MEMO.id : new URLSearchParams(search).get("subject") || HAND_MEMO.id;
  const subject = subjects.find(item => item.id === id) || (id === HAND_MEMO.id ? HAND_MEMO : null);
  return {
    id, subject, loading: loading && !subject,
    error: !subject && !loading ? error || "찾을 수 없는 과목입니다. 위에서 과목을 선택해 주세요." : "",
    dataFile: name => subject ? `${subject.dataPath}/${name}.json` : null,
    to: path => subjectUrl(path, id),
  };
}

export function SubjectPicker() {
  const { subjects, loading, error } = useSubjects();
  const { subject, id } = useSubject();
  const location = useLocation();
  const navigate = useNavigate();
  function change(nextId) {
    // Page, concept and search parameters belong to the previous subject.
    navigate(subjectUrl(location.pathname, nextId));
  }
  return <section className="subject-picker" aria-label="과목 선택">
    <div className="subject-picker-row">
      <label htmlFor="study-subject">학습 과목</label>
      <select id="study-subject" value={subject ? id : ""} onChange={event => change(event.target.value)}>
        {!subject && <option value="" disabled>{loading ? "과목을 불러오는 중…" : "과목을 선택하세요"}</option>}
        {subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
    </div>
    {subject && <p className="muted subject-description">{studyDescription(subject)}</p>}
    {error && <p role="alert" className="muted">{error}</p>}
  </section>;
}

export function useJsonArray(path, label = "자료") {
  const [state, setState] = useState({ path: null, data: [], loading: false, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ path, data: [], loading: Boolean(path), error: "" });
    if (path) fetch(path, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error(`${label}를 불러오지 못했습니다. 새로고침해 주세요.`);
      return response.json();
    }).then(data => {
      if (!Array.isArray(data)) throw new Error(`${label}의 형식을 확인할 수 없습니다.`);
      if (!controller.signal.aborted) setState({ path, data, loading: false, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ path, data: [], loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [path, label]);
  // Hide the previous subject immediately, before the new request effect runs.
  return state.path === path ? state : { path, data: [], loading: Boolean(path), error: "" };
}
