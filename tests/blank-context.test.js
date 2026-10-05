import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clozeAround } from "../src/text.js";
import { scoreLocal } from "../shared/scoring.js";

test("같은 글머리표가 반복돼도 출제된 문장 위치만 빈칸으로 표시", () => {
  const q = { page: "p", before: "① ", answer: "정방", after: "을 폐지하였다." };
  const text = "① 군대를 개편하였다.\n② 학교를 설립하였다.\n① 정방을 폐지하였다.";
  const cloze = clozeAround(q, [{ id: "p", text }]);
  assert.equal(cloze.before + q.answer + cloze.after, text);
  assert.ok(cloze.before.endsWith("① "));
  assert.equal(cloze.after, "을 폐지하였다.");
});

test("근거가 없거나 같은 전체 문장이 중복되면 다른 위치를 추측하지 않음", () => {
  const q = { page: "p", before: "① ", answer: "정방", after: "을 폐지하였다." };
  for (const text of ["① 삼사법을 시행하였다. 정방이라는 말도 등장한다.", "① 정방을 폐지하였다.\n① 정방을 폐지하였다."]) {
    assert.deepEqual(clozeAround(q, [{ id: "p", text }]), { before: q.before, after: q.after });
  }
});

test("게시된 빈칸 전체: 실제 원문 위치를 가리고 정답 입력은 인정", () => {
  for (const scope of ["", ...["seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"].map(s => `subjects/${s}/`)]) {
    const data = name => JSON.parse(readFileSync(new URL(`../public/data/${scope}${name}.json`, import.meta.url)));
    const notes = data("notes");
    for (const q of data("blanks")) {
      const cloze = clozeAround(q, notes);
      const text = notes.find(n => n.id === q.page).text.replace(/\*\*/g, "");
      assert.ok(text.includes(cloze.before + q.answer + cloze.after), q.id);
      assert.equal(scoreLocal(q, q.answer).good, true, q.id);
    }
  }
});

test("빈칸의 구두점·검토한 이형 표기는 인정하지만 부분어·부정·유사 개념은 거부", () => {
  const cases = [
    [{ answer: "메타인지." }, "메타인지"],
    [{ answer: "여름·가을", id: "dongyangsa-two-tax-passage" }, "여름과 가을"],
    [{ answer: "나·당 동맹" }, "나당동맹"],
    [{ answer: "화(和)", id: "dongyangsa-ext-blank-043" }, "화"],
    [{ answer: "TVA" }, "tva"],
    [{ answer: "100분의 3", id: "dongyangsa-land-tax-passage" }, "3%"],
  ];
  for (const [q, value] of cases) assert.equal(scoreLocal({ type: "blank", ...q }, value).good, true);
  for (const value of ["나당", "나당 동맹이 아니다", "신라", "나당 전쟁"]) assert.equal(scoreLocal({ type: "blank", answer: "나·당 동맹" }, value).good, false);
  assert.equal(scoreLocal({ type: "blank", answer: "3정보" }, "3").good, false);
  assert.equal(scoreLocal({ type: "short", answer: "화(和)" }, "화").good, false);
});
