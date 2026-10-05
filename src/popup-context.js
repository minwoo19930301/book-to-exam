import { createContext, useContext } from "react";

export const StudyPopupContext = createContext(null);
export function useStudyPopups() {
  return useContext(StudyPopupContext);
}

export function popupSource(location, page) {
  const params = new URLSearchParams(location.search);
  if (page) params.set("page", page);
  const kept = new URLSearchParams();
  for (const key of ["subject", "page", "q", "view", "facultyId", "topic", "mode"]) {
    if (params.has(key)) kept.set(key, params.get(key).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200));
  }
  return `${location.pathname}${kept.size ? `?${kept}` : ""}`;
}

