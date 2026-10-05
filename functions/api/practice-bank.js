import memoQuestions from "../../public/data/questions.json" with { type: "json" };
import memoBlanks from "../../public/data/blanks.json" with { type: "json" };
import memoEssays from "../_data/essays.json" with { type: "json" };
import westernQuestions from "../../public/data/subjects/seoyangsa/questions.json" with { type: "json" };
import westernBlanks from "../../public/data/subjects/seoyangsa/blanks.json" with { type: "json" };
import westernEssays from "../_data/subjects/seoyangsa/essays.json" with { type: "json" };
import koreanQuestions from "../../public/data/subjects/hanguksa/questions.json" with { type: "json" };
import koreanBlanks from "../../public/data/subjects/hanguksa/blanks.json" with { type: "json" };
import koreanEssays from "../_data/subjects/hanguksa/essays.json" with { type: "json" };
import easternQuestions from "../../public/data/subjects/dongyangsa/questions.json" with { type: "json" };
import easternBlanks from "../../public/data/subjects/dongyangsa/blanks.json" with { type: "json" };
import easternEssays from "../_data/subjects/dongyangsa/essays.json" with { type: "json" };
import educationQuestions from "../../public/data/subjects/gyoyukron/questions.json" with { type: "json" };
import educationBlanks from "../../public/data/subjects/gyoyukron/blanks.json" with { type: "json" };
import educationEssays from "../_data/subjects/gyoyukron/essays.json" with { type: "json" };
import { listPredictions } from "../_lib/research.js";

const banks = [
  ["hand-memo", memoQuestions, memoBlanks, memoEssays],
  ["seoyangsa", westernQuestions, westernBlanks, westernEssays],
  ["hanguksa", koreanQuestions, koreanBlanks, koreanEssays],
  ["dongyangsa", easternQuestions, easternBlanks, easternEssays],
  ["gyoyukron", educationQuestions, educationBlanks, educationEssays],
];
const subjects = new Set(["all", ...banks.map(([subject]) => subject)]);
const types = ["mc", "short", "blank", "essay", "research"];
const parameters = new Set(["subject", "type", "q", "page", "pageSize", "sourcePage"]);
const normalize = value => String(value).normalize("NFKC").toLowerCase();

function sourceEvidence(item, criteria) {
  const unique = new Map();
  for (const evidence of [...(item.evidence || []), ...(criteria || []).flatMap(criterion => criterion.evidence || [])]) {
    const key = JSON.stringify([evidence.page, evidence.quote]);
    if (!unique.has(key)) unique.set(key, evidence);
  }
  return [...unique.values()];
}
function practiceItem(entry, subject, type) {
  const { rubric, ...item } = entry;
  const criteria = rubric || item.criteria;
  const evidence = sourceEvidence(item, criteria);
  let prompt = item.prompt || "";
  if (type === "blank") {
    if (typeof item.before === "string" && typeof item.after === "string") prompt = `${item.before}_____${item.after}`;
    else if (!prompt && typeof item.passage === "string" && typeof item.answer === "string" && item.answer)
      prompt = item.passage.replace(item.answer, "_____");
  }
  return { ...item, subject, type, title: item.title || item.keyword || item.stem || prompt,
    prompt, evidence,
    sourcePages: [...new Set([...(item.sourcePages || []), item.page, ...evidence.map(source => source.page)].filter(Boolean))],
    ...(item.explain !== undefined ? { explanation: item.explain } : {}),
    ...(criteria ? { criteria } : {}),
    ...(type === "essay" && item.modelAnswer === undefined && typeof item.answer === "string" ? { modelAnswer: item.answer } : {}),
  };
}

// Static, authored data only. No model call, source-page download, or answer generation.
const catalog = [
  ...banks.flatMap(([subject, questions, blanks, essays]) => [
    ...questions.map(item => practiceItem(item, subject, item.type === "mc" ? "mc" : "short")),
    ...blanks.map(item => practiceItem(item, subject, "blank")),
    ...essays.map(item => practiceItem(item, subject, "essay")),
  ]),
  ...listPredictions().map(item => practiceItem(item, item.subject, "research")),
].map(item => ({ item, search: normalize(JSON.stringify([
  item.id, item.title, item.prompt, item.choices, item.answer, item.modelAnswer,
  item.explanation, item.choiceExplanations, item.criteria, item.evidence, item.sourcePages, item.caution,
])) }));

export function findPracticeQuestion(subject, type, id) {
  return catalog.find(({ item }) => item.subject === subject && item.type === type && item.id === id)?.item || null;
}

function parseParameters(request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!parameters.has(key)) throw new Error("지원하지 않는 검색 조건입니다.");
    if (params.getAll(key).length !== 1) throw new Error("검색 조건은 각각 한 번만 지정해 주세요.");
  }
  const subject = params.get("subject") ?? "all";
  const type = params.get("type") ?? "all";
  const query = params.get("q") ?? "";
  const sourcePage = params.get("sourcePage") ?? "";
  const rawPage = params.get("page") ?? "1";
  const rawSize = params.get("pageSize") ?? "20";
  if (!subjects.has(subject)) throw new Error("없는 과목입니다.");
  if (type !== "all" && !types.includes(type)) throw new Error("없는 문제 유형입니다.");
  if (query.length > 200) throw new Error("검색어는 200자 이내로 입력해 주세요.");
  if (sourcePage && (sourcePage.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourcePage))) throw new Error("원문 페이지 조건을 확인해 주세요.");
  if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage))) throw new Error("페이지는 양의 정수여야 합니다.");
  if (!["20", "50", "100"].includes(rawSize)) throw new Error("페이지 크기는 20, 50, 100 중 하나여야 합니다.");
  return { subject, type, sourcePage, terms: normalize(query).trim().split(/\s+/).filter(Boolean), page: Number(rawPage), pageSize: Number(rawSize) };
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=300" : "no-store",
  } });
}

export function onRequestGet({ request }) {
  try {
    const { subject, type, sourcePage, terms, page, pageSize } = parseParameters(request);
    const matches = catalog.filter(({ item, search }) => (subject === "all" || item.subject === subject)
      && (!sourcePage || item.page === sourcePage) && terms.every(term => search.includes(term)));
    const counts = Object.fromEntries(["all", ...types].map(kind => [kind, 0]));
    for (const { item } of matches) { counts.all++; counts[item.type]++; }
    const selected = matches.filter(({ item }) => type === "all" || item.type === type);
    const total = selected.length;
    const pageCount = Math.ceil(total / pageSize);
    // A requested page beyond the result range stays empty; no hidden page clamping.
    const items = page > pageCount ? [] : selected.slice((page - 1) * pageSize, page * pageSize).map(({ item }) => item);
    return json({ items, total, page, pageSize, pageCount, counts });
  } catch (error) {
    return json({ error: error.message || "문제 목록을 가져오지 못했습니다." }, 400);
  }
}

export function onRequest() {
  return new Response(JSON.stringify({ error: "GET 요청만 지원합니다." }), {
    status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: "GET", "cache-control": "no-store" },
  });
}
