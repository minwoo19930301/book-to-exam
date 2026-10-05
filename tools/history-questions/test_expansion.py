"""Expansion import safety, scoring contracts and preservation of existing banks."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import expansion as bank
import generate


class ExpansionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.subject = "dongyangsa"
        self.page = self.subject + "-textbook-page-1"
        self.quote = "균전제는 토지 제도이며 조용조는 조세 제도이다."
        self.notes = [{"id": self.page, "subject": self.subject, "text": self.quote + "\n" +
                       "\n".join(f"자료 {n}의 세금은 조용조이다." for n in range(300)),
                       "source": {}}]
        self.paths = bank.bank_paths(self.root, self.subject)
        self.baseline = {
            "questions": [{"id": "dongyangsa-existing-mc", "type": "mc", "prompt": "기존 객관식 문제를 그대로 보존하시오.",
                           "choices": ["1", "2", "3", "4"], "answer": 0, "page": self.page}],
            "blanks": [{"id": "dongyangsa-existing-blank", "type": "blank", "prompt": "기존 빈칸 _____ 유지",
                        "before": "기존 빈칸 ", "after": " 유지", "answer": "문제", "page": self.page}],
            "essays": [{"id": "dongyangsa-existing-essay", "title": "기존 서술형", "prompt": "기존 서술형 문제를 설명하시오.",
                        "page": self.page}],
        }
        self.baseline["private"] = [{**self.baseline["essays"][0], "rubric": [{"id": "r1", "max": 10}],
                                      "rubricVersion": "existing"}]
        self.write(self.root / "public/data/subjects" / self.subject / "notes.json", self.notes)
        for name, path in self.paths.items():
            self.write(path, self.baseline[name])
        self.write(self.root / "public/data/subjects.json", [
            {"id": self.subject, "counts": {"notes": 1, "concepts": 0, "questions": 1, "blanks": 1, "essays": 1, "knowledge": 1}},
            {"id": "hand-memo", "counts": {"notes": 75, "questions": 98}},
        ])

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(bank.encoded(value), encoding="utf-8")

    def question(self, kind="mc", n=0):
        row = {"id": f"dongyangsa-ext-{kind}-{n}", "type": kind, "skill": "comparison",
               "prompt": f"자료 {n}에서 토지 제도와 조세 제도를 비교한 설명을 고르시오.",
               "explain": "균전제는 토지 제도, 조용조는 조세 제도에 해당한다.",
               "evidence": [{"page": self.page, "quote": self.quote}]}
        if kind == "mc":
            row.update(choices=["균전제는 토지 제도이다", "균전제는 조세 제도이다", "조용조는 토지 제도이다", "두 제도는 같다"],
                       answer=0, choiceExplanations=["토지 제도라는 점이 맞다", "조세 제도는 조용조다", "토지 제도는 균전제다", "두 제도는 성격이 다르다"])
        elif kind == "short":
            row.update(prompt=f"자료 {n}에서 토지를 나누는 제도의 이름은 무엇인가?", answer="균전제", acceptedAnswers=["균전"])
        elif kind == "blank":
            passage = f"자료 {n}의 세금은 조용조이다."
            row.pop("prompt")
            row.update(passage=passage, answer="조용조", evidence=[{"page": self.page, "quote": passage}])
        else:
            row.update(title=f"제도의 비교 {n}", prompt=f"자료 {n}의 두 제도가 담당한 분야를 구분하여 설명하시오.",
                       answer="균전제는 토지를 분급하는 제도이며 조용조는 조세를 거두는 제도이다.",
                       rubric=[{"id": "r1", "label": "제도의 성격 비교", "max": 10,
                                "ok": "토지 제도와 조세 제도를 정확히 구별한다.", "evidence": copy.deepcopy(row["evidence"]),
                                "allowedScores": [0, 5, 10], "checkpoints": ["토지", "조세"],
                                "acceptedConcepts": ["토지의 분급", "세금 수취"],
                                "requiredRelation": "두 제도가 담당하는 분야를 비교한다.",
                                "rejectConditions": ["두 제도의 역할을 반대로 서술한다."]}])
        return row

    def document(self, rows):
        return {"schemaVersion": 1, "subject": self.subject, "questions": rows}

    def draft(self, rows):
        return bank.prepare_subject(self.root, self.subject, self.document(rows), allow_partial=True)

    def full_document(self):
        return self.document([self.question(kind, n) for kind, count in [("mc", 120), ("short", 100), ("blank", 50), ("essay", 30)]
                              for n in range(count)])

    def test_300_append_is_idempotent_and_preserves_baseline_and_manifest(self):
        directory = self.root / "tools/history-questions/extended-inputs"
        self.write(directory / "dongyangsa.json", self.full_document())
        outputs, reports = bank.prepare(self.root, directory, [self.subject])
        self.assertEqual(reports[0]["added"], 300)
        self.assertEqual(reports[0]["existingPreserved"], 3)
        self.assertEqual(reports[0]["total"], 303)
        self.assertEqual(reports[0]["types"], {"mc": 120, "short": 100, "blank": 50, "essay": 30})
        for name, path in self.paths.items():
            self.assertEqual(outputs[path][0], self.baseline[name][0])
        manifest = outputs[self.root / "public/data/subjects.json"]
        self.assertEqual(manifest[0]["counts"], {"notes": 1, "concepts": 0, "questions": 221, "blanks": 51, "essays": 31, "knowledge": 1})
        self.assertEqual(manifest[1], {"id": "hand-memo", "counts": {"notes": 75, "questions": 98}})
        bank.save(outputs)
        repeated, _ = bank.prepare(self.root, directory, [self.subject])
        self.assertEqual(outputs, repeated)
        bank.save(repeated, check=True)
        changed = self.full_document()
        changed["questions"][0]["explain"] = "수정된 해설도 기존 문항을 중복 추가하지 않는다."
        self.write(directory / "dongyangsa.json", changed)
        revised, _ = bank.prepare(self.root, directory, [self.subject])
        with self.assertRaisesRegex(ValueError, "Expanded bank differs"):
            bank.save(revised, check=True)

    def test_essay_boundary_and_rubric_options_are_preserved(self):
        row = self.question("essay")
        outputs, _ = self.draft([row])
        public = outputs[self.paths["essays"]][-1]
        private = outputs[self.paths["private"]][-1]
        self.assertEqual(set(public), {"id", "title", "prompt", "page"})
        self.assertEqual(private["answer"], row["answer"])
        self.assertEqual(private["rubricVersion"], bank.VERSION)
        for field in ["allowedScores", "checkpoints", "acceptedConcepts", "requiredRelation", "rejectConditions"]:
            self.assertEqual(private["rubric"][0][field], row["rubric"][0][field])

    def test_short_and_blank_match_existing_ui_contract(self):
        outputs, _ = self.draft([self.question("short"), self.question("blank")])
        short = outputs[self.paths["questions"]][-1]
        self.assertEqual((short["type"], short["match"], short["acceptedAnswers"]), ("blank", "aliases", ["균전"]))
        blank = outputs[self.paths["blanks"]][-1]
        self.assertEqual(blank["before"] + blank["answer"] + blank["after"], self.question("blank")["passage"])
        self.assertEqual(blank["match"], "exact")

    def test_score_levels_preserve_conditions_and_reject_incomplete_grids(self):
        row = self.question("essay")
        levels = [{"score": 0, "condition": "두 제도를 혼동하거나 답을 쓰지 않았다."},
                  {"score": 5, "condition": "한 제도의 성격만 정확하게 설명했다."},
                  {"score": 10, "condition": "두 제도의 성격을 모두 정확하게 구별했다."}]
        row["rubric"][0]["scoreLevels"] = levels
        outputs, _ = self.draft([row])
        self.assertEqual(outputs[self.paths["private"]][-1]["rubric"][0]["scoreLevels"], levels)
        for invalid in [levels[:2], [levels[0], levels[0], levels[2]],
                        [levels[0], {"score": 7, "condition": "임의 점수"}, levels[2]],
                        [levels[0], {"score": 5, "condition": ""}, levels[2]]]:
            row["rubric"][0]["scoreLevels"] = invalid
            with self.subTest(levels=invalid), self.assertRaisesRegex(ValueError, "scoreLevels"):
                self.draft([row])

    def test_missing_cross_subject_and_fabricated_quotes_fail(self):
        for page, quote, pattern in [("hanguksa-textbook-page-1", self.quote, "wrong-subject"),
                                     (self.page, "원문에 없는 인용", "nonverbatim")]:
            row = self.question()
            row["evidence"] = [{"page": page, "quote": quote}]
            with self.subTest(pattern=pattern), self.assertRaisesRegex(ValueError, pattern):
                self.draft([row])

    def test_known_source_error_is_not_usable_as_evidence(self):
        self.notes[0]["source"]["knownIssues"] = [{"id": "test-issue", "quote": "토지 제도"}]
        self.write(self.root / "public/data/subjects" / self.subject / "notes.json", self.notes)
        with self.assertRaisesRegex(ValueError, "known source issue"):
            self.draft([self.question()])

    def test_choices_require_one_index_and_distinct_text(self):
        for mutation, pattern in [({"answer": True}, "one answer index"), ({"answer": [0, 1]}, "one answer index"),
                                  ({"choices": ["균 전 제", "균전제!", "2", "3"]}, "duplicate/equivalent"),
                                  ({"choiceExplanations": ["정답"]}, "four choiceExplanations")]:
            row = self.question()
            row.update(mutation)
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, pattern):
                self.draft([row])

    def test_duplicate_ids_and_prompts_including_starter_are_rejected(self):
        first = self.question()
        second = self.question(n=1)
        for mutation, pattern in [({"id": first["id"]}, "duplicate question id"),
                                  ({"prompt": first["prompt"].replace(" ", "") + "!!"}, "duplicate question prompt"),
                                  ({"prompt": self.baseline["questions"][0]["prompt"]}, "duplicate question prompt")]:
            row = {**second, **mutation}
            with self.subTest(pattern=pattern), self.assertRaisesRegex(ValueError, pattern):
                self.draft([first, row])

    def test_passage_and_rubric_invalid_data_rejected(self):
        for kind, mutation, pattern in [
            ("blank", {"answer": "없는 정답"}, "exactly once"),
            ("blank", {"prompt": "원문과 다른 빈칸 _____"}, "masked passage"),
            ("essay", {"rubric": []}, "rubric required"),
        ]:
            row = self.question(kind)
            row.update(mutation)
            with self.subTest(pattern=pattern), self.assertRaisesRegex(ValueError, pattern):
                self.draft([row])
        for mutation, pattern in [({"max": 9}, "allowedScores|total 10"),
                                  ({"allowedScores": [0, 11]}, "invalid allowedScores"),
                                  ({"allowedScores": [1, 10]}, "include 0 and max"),
                                  ({"evidence": []}, "evidence required"),
                                  ({"acceptedConcepts": "문자열"}, "nonempty array")]:
            row = self.question("essay")
            row["rubric"][0].update(mutation)
            with self.subTest(pattern=pattern), self.assertRaisesRegex(ValueError, pattern):
                self.draft([row])

    def test_same_sentence_answer_recycled_in_three_types_is_rejected(self):
        mc, short, blank = self.question(), self.question("short"), self.question("blank")
        mc["choices"][0] = "균전제"
        blank.update(passage=self.quote, answer="균전제", evidence=copy.deepcopy(mc["evidence"]))
        with self.assertRaisesRegex(ValueError, "recycled across three types"):
            self.draft([mc, short, blank])

    def test_full_import_requires_300_and_validation_does_not_write(self):
        before = {path: path.read_bytes() for path in self.paths.values()}
        with self.assertRaisesRegex(ValueError, "exactly 300"):
            bank.prepare_subject(self.root, self.subject, self.document([self.question()]))
        self.assertEqual(before, {path: path.read_bytes() for path in self.paths.values()})
        self.draft([self.question()])
        self.assertEqual(before, {path: path.read_bytes() for path in self.paths.values()})

    def test_generator_optional_hook_uses_authored_input_and_keeps_absent_fixture_identical(self):
        starter = {path: self.baseline[name] for name, path in self.paths.items()}
        self.assertIs(bank.expand_generated(self.subject, self.root, starter), starter)
        path = self.root / "tools/history-questions/extended-inputs/dongyangsa.json"
        self.write(path, self.full_document())
        expanded = bank.expand_generated(self.subject, self.root, starter)
        self.assertEqual(len(expanded[self.paths["questions"]]), 221)
        # Isolate this hook assertion from optional authored short inputs in the
        # real repository; their integration is covered by test_shorts.py.
        with patch.object(bank, "expand_generated", return_value={}) as hook, \
                patch("shorts.extend_generated", side_effect=lambda subject, root, outputs: outputs) as short_hook:
            self.assertEqual(generate.generate(self.subject, generate.ROOT), {})
            hook.assert_called_once()
            short_hook.assert_called_once_with(self.subject, generate.ROOT, {})


if __name__ == "__main__":
    unittest.main()
