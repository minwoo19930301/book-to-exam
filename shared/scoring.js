export function clean(value) {
  return String(value ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}
// Ignore spacing and Unicode composition only; partial terms and synonyms are not exact answers.
export function exact(value) {
  return clean(value).normalize("NFC").replace(/\s+/g, "");
}
export function scoreLocal(q, value) {
  let good = false;
  if (q.type === "mc") {
    good = value !== "" && value != null && Number.isInteger(Number(value)) && Number(value) === q.answer;
  } else if (q.type === "blank" && q.match === "keywords") {
    const v = exact(value);
    const groups = q.keywordGroups || [];
    good = Boolean(v) && groups.length > 0 && groups.every(group => group.some(word => v.includes(exact(word))))
      && !(q.rejectPatterns || []).some(pattern => new RegExp(pattern, "u").test(v));
  } else {
    good = Boolean(exact(value)) && exact(value) === exact(q.answer);
  }
  return { good, score: good ? 1 : 0, max: 1, explain: clean(q.explain) };
}
