import { getResearchAnalysis } from "../_lib/research.js";

const subjects = new Set(["all", "seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"]);
const parameters = new Set(["subject", "q", "facultyId"]);
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=300" : "no-store",
  } });
}
export function onRequestGet({ request }) {
  try {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) {
      if (!parameters.has(key) || params.getAll(key).length !== 1) throw new Error("지원하는 검색 조건을 한 번씩만 지정해 주세요.");
    }
    const subject = params.get("subject") ?? "all";
    if (!subjects.has(subject)) throw new Error("없는 과목입니다.");
    return response(getResearchAnalysis({ subject: subject === "all" ? undefined : subject,
      query: params.get("q") ?? "", ...(params.has("facultyId") ? { facultyId: params.get("facultyId") } : {}) }));
  } catch (error) {
    return response({ error: error.message || "연구 자료를 불러오지 못했습니다." }, 400);
  }
}
export function onRequest() {
  return new Response(JSON.stringify({ error: "GET 요청만 지원합니다." }), {
    status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: "GET", "cache-control": "no-store" },
  });
}
