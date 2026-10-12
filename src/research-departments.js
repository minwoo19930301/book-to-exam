export const RESEARCH_DEPARTMENTS = Object.freeze({
  all: "전체 소속",
  history: "일반 역사학과·사학과",
  education: "역사교육과·사범대",
  other: "기타·소속 확인 필요",
});

// Classify the recorded affiliation, never a person's presumed examiner role.
export function researchDepartment(person) {
  if (["history", "education", "other"].includes(person.departmentKind)) return person.departmentKind;
  const affiliation = String(person.affiliation || "");
  if (/역사교육|사범대/.test(affiliation)) return "education";
  if (/역사학|사학|역사콘텐츠|역사문화/.test(affiliation)) return "history";
  return "other";
}
