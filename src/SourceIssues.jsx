import { sourceUrl } from "./subjects.jsx";

export default function SourceIssues({ item }) {
  const issues = item?.knownIssues || item?.source?.knownIssues || item?.quality?.knownIssues || [];
  if (!issues.length) return null;
  return <aside className="source-issues" aria-label="원문 확인 사항">
    <strong>원문 확인 사항</strong>
    {issues.map((issue, index) => <div key={issue.id || index}>
      {issue.quote && <p>원문 표기: “{issue.quote}”</p>}
      <p>{typeof issue === "string" ? issue : issue.message || issue.description || issue.note || issue.title}</p>
      {sourceUrl(issue.referenceUrl) && <a className="source-link" href={issue.referenceUrl} target="_blank" rel="noreferrer">{issue.referenceTitle || "확인 자료"} ↗</a>}
    </div>)}
  </aside>;
}
