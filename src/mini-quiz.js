import { clean, clozeAround, usable } from "./text.js";
import { exactCloze, excerptText, maskExcerpt, shortExcerpts, usesExactPassage } from "./source-excerpts.js";

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === "string" ? excerptText(value).trim() : "";

function cardBase(question, kind) {
  if (!question || typeof question.id !== "string" || !question.id.trim() || !text(question.answer)) return null;
  // Legacy `accept` is deliberately not promoted to a reviewed answer variant.
  const acceptedAnswers = [...new Set([question.answer, ...list(question.acceptedAnswers)].map(text).filter(Boolean))];
  return {
    id: question.id,
    key: `${kind}:${question.id}`,
    kind,
    question,
    answer: text(question.answer),
    explanation: text(question.explain),
    acceptedAnswers,
    sourcePage: typeof question.page === "string" ? question.page : "",
  };
}

/**
 * Pure card projection. The front renders only `prompt` and `passage`; answer,
 * explanation and the original `question` belong to the revealed/back side.
 * `key` is the card identity: a short item and a cloze may share a source ID.
 * No grading/history writes occur when a card is built or its answer is shown.
 */
export function buildMiniCards({ questions = [], blanks = [], notes = [] } = {}) {
  const cards = [];
  const seen = new Set();
  const add = card => {
    if (!card || seen.has(card.key)) return;
    seen.add(card.key);
    cards.push(card);
  };
  for (const question of list(questions)) {
    if (question?.type !== "blank" || !usable(question)) continue;
    const card = cardBase(question, "short");
    if (!card) continue;
    const masked = { answer: card.answer, acceptedAnswers: card.acceptedAnswers };
    const excerpts = shortExcerpts(question);
    add({ ...card,
      prompt: maskExcerpt(clean(question.prompt), masked),
      // Never substitute a whole note page or broaden an authored source span.
      passage: excerpts.map(entry => maskExcerpt(entry.text, masked)).join("\n\n"),
      sourcePage: card.sourcePage || excerpts[0]?.page || "",
    });
  }
  for (const question of list(blanks)) {
    if (!question || (question.type != null && question.type !== "blank")) continue;
    const card = cardBase(question, "blank");
    if (!card) continue;
    // Follow the existing full-passage/legacy-cloze distinction exactly. The
    // legacy helper expands only when the complete authored span matches once.
    const cloze = usesExactPassage(question) ? exactCloze(question) : clozeAround(question, list(notes));
    if (!text(cloze.before) && !text(cloze.after)) continue;
    const masked = { answer: card.answer, acceptedAnswers: card.acceptedAnswers };
    add({ ...card,
      prompt: maskExcerpt("빈칸에 들어갈 답을 떠올려 보세요.", masked),
      // Repeated answer mentions elsewhere in the passage are hidden too.
      passage: `${maskExcerpt(cloze.before, masked)}_____${maskExcerpt(cloze.after, masked)}`,
    });
  }
  return cards;
}
