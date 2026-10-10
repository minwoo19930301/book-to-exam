// Study excerpts always come from the authored, exact evidence spans. Do not
// widen them to surrounding note text: that can add unrelated or faulty claims.
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const excerptText = value => String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/\*\*/g, "");

export function maskExcerpt(text, question) {
  const terms = [...new Set([question.answer, ...(question.acceptedAnswers || [])]
    .filter(value => typeof value === "string" && value.trim()).map(value => value.normalize("NFC").trim()))]
    .sort((a, b) => b.length - a.length);
  if (!terms.length) return excerptText(text);
  const patterns = terms.map(term => [...term.replace(/\s+/g, "")].map(escape).join("\\s*"));
  // Hide the immediately attached Chinese/Latin gloss too, so a parenthesized
  // translation of the answer does not give away a masked Korean term.
  const expression = new RegExp(`(?:${patterns.join("|")})(?:[ \\t]*[（(][\\p{Script=Han}A-Za-z .·-]+[)）])?`, "giu");
  return excerptText(text).normalize("NFC").replace(expression, "［해당 용어］");
}

export function shortExcerpts(question) {
  const compared = question.provenance?.sourceStatus === "capture-compared-excerpt";
  const selected = (question.evidence || []).filter(entry => typeof entry?.quote === "string" && entry.quote.trim().length >= 25 && entry.page);
  const hasSource = selected.some(entry => /사료탐구|『|「|제\d+조|서문|선언|칙령/.test(entry.quote));
  const enoughContext = selected.reduce((sum, entry) => sum + excerptText(entry.quote).trim().length, 0) >= (compared ? 25 : 80);
  if (!enoughContext || !(hasSource || question.provenance?.skill === "source-analysis" || question.contextMode === "source-excerpt")) return [];
  return selected.map(entry => ({ page: entry.page, text: excerptText(entry.quote) }));
}

export function shortStudyMode(question) {
  return shortExcerpts(question).length ? "source" : "concept";
}

export function exactCloze(question) {
  return { before: question.before || "", after: question.after || "" };
}

export function usesExactPassage(question) {
  return question?.contextMode === "source-excerpt" || question?.passageMode === "full";
}
