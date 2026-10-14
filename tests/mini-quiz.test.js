import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildMiniCards } from "../src/mini-quiz.js";
import { clean, clozeAround, usable } from "../src/text.js";
import { exactCloze, excerptText, maskExcerpt, shortExcerpts, usesExactPassage } from "../src/source-excerpts.js";

const short = { id: "shared", type: "blank", prompt: "정치 개혁을 제안한 인물의 이름을 쓰시오.", answer: "솔론", explain: "교재에 수록된 해설", page: "p1" };
const blank = { id: "shared", type: "blank", before: "아테네의 ", answer: "솔론", after: "이 개혁을 추진하였다.", explain: "빈칸의 원래 해설", page: "p1" };

test("cards keep stable kind/source identity, exclude MC and invalid items, and never mutate banks", () => {
  const input = { questions: [short, { ...short }, { ...short, id: "mc", type: "mc" }, { ...short, id: "bad", prompt: "짧음" }, null],
    blanks: [blank, { ...blank }, { ...blank, id: "no-answer", answer: " " }, { ...blank, id: "no-context", before: "", after: "" }, { ...blank, id: "mc", type: "mc" }, null], notes: [] };
  const before = JSON.stringify(input);
  const cards = buildMiniCards(input);
  assert.deepEqual(cards.map(card => card.key), ["short:shared", "blank:shared"]);
  assert.equal(cards[0].question, short);
  assert.equal(cards[1].question, blank);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(buildMiniCards(), []);
  assert.deepEqual(buildMiniCards({ questions: null, blanks: {}, notes: null }), []);
});

test("short front uses only eligible exact evidence, masking prompt, aliases, spacing and attached glosses", () => {
  const quote = "[사료탐구] 경 당(扃堂)은 글을 읽고 활쏘기를 익히는 교육 기관이었다. 扃堂이라는 표현도 교재 발췌에 함께 등장한다. ".repeat(2);
  const question = { ...short, answer: "경당", acceptedAnswers: ["扃堂"], prompt: "고구려의 경 당(扃堂)은 어떤 교육 기관인가?", evidence: [{ page: "p1", quote }, { page: "p2", quote: "짧은 제목" }] };
  const [card] = buildMiniCards({ questions: [question], notes: [{ id: "p1", text: "추가하면 안 되는 별개의 설명과 정답 경당" }] });
  assert.equal(card.prompt, "고구려의 ［해당 용어］은 어떤 교육 기관인가?");
  assert.equal(card.passage, maskExcerpt(quote, question));
  assert.ok(!card.passage.includes("별개의 설명"));
  assert.deepEqual(card.acceptedAnswers, ["경당", "扃堂"]);
  assert.equal(card.answer, "경당");
  assert.equal(card.sourcePage, "p1");
});

test("concept cards do not manufacture source text from notes or short evidence", () => {
  const [card] = buildMiniCards({ questions: [{ ...short, evidence: [{ page: "p1", quote: "솔론이라는 짧은 표제" }] }], notes: [{ id: "p1", text: "솔론의 행적에 대한 전체 교재 문장" }] });
  assert.equal(card.passage, "");
  assert.equal(card.prompt, short.prompt);
});

test("full source cloze stays inside its authored span and masks repeated answers and reviewed aliases", () => {
  const question = { ...blank, contextMode: "source-excerpt", answer: "NEP", acceptedAnswers: ["신경제정책"], before: "[사료탐구] NEP(New Economic Policy)라고도 불린 ", after: "은 신경제정책의 영문 약어이다.\n마지막 문장." };
  const [card] = buildMiniCards({ blanks: [question], notes: [{ id: "p1", text: `확장하면 안 될 앞 문장.\n${question.before}${question.answer}${question.after}\n확장하면 안 될 뒤 문장.` }] });
  assert.equal(card.passage, "[사료탐구] ［해당 용어］라고도 불린 _____은 ［해당 용어］의 영문 약어이다.\n마지막 문장.");
  assert.equal(card.explanation, blank.explain);
  assert.equal(card.answer, "NEP");
});

test("legacy cloze retains exact unique-span context, without guessing from a repeated prefix or duplicate passage", () => {
  const question = { ...blank, before: "① ", answer: "정방", after: "을 폐지하였다." };
  const unique = "① 군대를 개편하였다.\n② 학교를 설립하였다.\n① 정방을 폐지하였다.";
  const [card] = buildMiniCards({ blanks: [question], notes: [{ id: "p1", text: unique }] });
  assert.equal(card.passage, "① 군대를 개편하였다.\n② 학교를 설립하였다.\n① _____을 폐지하였다.");
  for (const text of ["① 삼사법을 시행하였다. 정방이란 말도 등장한다.", "① 정방을 폐지하였다.\n① 정방을 폐지하였다."]) {
    const [fallback] = buildMiniCards({ blanks: [question], notes: [{ id: "p1", text }] });
    assert.equal(fallback.passage, "① _____을 폐지하였다.");
  }
});

test("back content preserves authored explanations and does not promote unreviewed legacy accept", () => {
  const [card] = buildMiniCards({ questions: [{ ...short, explain: "**교재 원문**<br>둘째 줄", accept: ["틀린 옛 후보"], acceptedAnswers: ["솔론", " **솔론** ", null, 42, " " ] }] });
  assert.equal(card.explanation, "교재 원문\n둘째 줄");
  assert.deepEqual(card.acceptedAnswers, ["솔론"]);
  assert.equal(buildMiniCards({ questions: [{ ...short, explain: undefined }] })[0].explanation, "");
});

test("all five shipped subjects produce complete collision-free, answer-masked cards from existing source spans", () => {
  const subjects = JSON.parse(readFileSync(new URL("../public/data/subjects.json", import.meta.url)));
  assert.equal(subjects.length, 5);
  for (const subject of subjects) {
    const read = name => JSON.parse(readFileSync(new URL(`../public${subject.dataPath}/${name}.json`, import.meta.url)));
    const questions = read("questions"), blanks = read("blanks"), notes = read("notes");
    const before = JSON.stringify({ questions, blanks, notes });
    const cards = buildMiniCards({ questions, blanks, notes });
    assert.equal(cards.length, questions.filter(q => q.type === "blank" && usable(q)).length + blanks.length, subject.id);
    assert.equal(new Set(cards.map(card => card.key)).size, cards.length, subject.id);
    for (const card of cards) {
      const q = card.question;
      const masked = { answer: card.answer, acceptedAnswers: card.acceptedAnswers };
      const front = `${card.prompt}\n${card.passage}`.normalize("NFC").replace(/\s/g, "").toLowerCase();
      for (const answer of card.acceptedAnswers) assert.ok(!front.includes(answer.normalize("NFC").replace(/\s/g, "").toLowerCase()), `${subject.id}/${card.key}: front leaked ${answer}`);
      assert.equal(card.answer, excerptText(q.answer).trim(), card.key);
      assert.equal(card.explanation, excerptText(q.explain).trim(), card.key);
      assert.ok(notes.some(note => note.id === card.sourcePage), `${card.key}: valid viewer source`);
      if (card.kind === "short") {
        assert.equal(card.prompt, maskExcerpt(clean(q.prompt), masked), card.key);
        assert.equal(card.passage, shortExcerpts(q).map(entry => maskExcerpt(entry.text, masked)).join("\n\n"), card.key);
      } else {
        const cloze = usesExactPassage(q) ? exactCloze(q) : clozeAround(q, notes);
        assert.equal(card.passage, `${maskExcerpt(cloze.before, masked)}_____${maskExcerpt(cloze.after, masked)}`, card.key);
      }
    }
    assert.equal(JSON.stringify({ questions, blanks, notes }), before, `${subject.id}: original data unchanged`);
  }
});
