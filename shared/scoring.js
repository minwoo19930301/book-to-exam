export function clean(value) {
  return String(value ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}
// Ignore spacing and Unicode composition only; partial terms and synonyms are not exact answers.
export function exact(value) {
  return clean(value).normalize("NFC").replace(/\s+/g, "");
}
// A blank asks for the missing words, not the source's punctuation. Preserve
// numbers, signs and letters; do not use edit distance or partial matching.
export function blankExact(value) {
  return exact(value).normalize("NFKC").replace(/[·ㆍ・,，]/g, "").replace(/[.。]+$/u, "").toLowerCase();
}
const BLANK_ALIASES = {
  "seoyangsa-worms-passage": ["반지와 지팡이", "반지 및 지팡이"],
  "hanguksa-gwajeon-passage": ["전직과 현직", "전직 및 현직"],
  "dongyangsa-two-tax-passage": ["여름과 가을", "여름 및 가을"],
  "dongyangsa-land-tax-passage": ["3%", "3퍼센트", "3/100"],
  "dongyangsa-ext-blank-015": ["나당 동맹", "신라와 당의 동맹"],
  "dongyangsa-ext-blank-043": ["화", "和"],
  "dongyangsa-ext-blank-057": ["영일 동맹", "영국과 일본의 동맹"],
};
export function scoreLocal(q, value) {
  let good = false;
  if (q.type === "mc") {
    good = value !== "" && value != null && Number.isInteger(Number(value)) && Number(value) === q.answer;
  } else if (q.type === "blank") {
    const v = blankExact(value);
    const allowed = [q.answer, ...(q.acceptedAnswers || []), ...(BLANK_ALIASES[q.id] || [])];
    good = Boolean(v) && allowed.some(answer => v === blankExact(answer));
    if (!good && v && q.match === "keywords") {
      // Keywords cannot determine paraphrase equivalence or negation scope.
      // Keep uncertain sentences out of correct/incorrect statistics.
      return { good: null, status: "review", score: null, max: 1,
        explain: "표현이 달라 자동 판정을 보류했어요. 아래 원문 답안과 비교해 주세요." };
    }
  } else if (q.match === "aliases") {
    // Only explicitly curated new banks opt in; legacy `accept` stays ignored.
    const allowed = [q.answer, ...(Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [])];
    good = Boolean(exact(value)) && allowed.some(answer => exact(value) === exact(answer));
  } else {
    good = Boolean(exact(value)) && exact(value) === exact(q.answer);
  }
  return { good, score: good ? 1 : 0, max: 1, explain: clean(q.explain) };
}
