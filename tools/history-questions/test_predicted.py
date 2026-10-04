import copy
import json
import tempfile
import unittest
from pathlib import Path

import predicted

SOURCE = ("① 미천왕(美川王, 300~331)\n"
          "• 내용 : 요동군 서안평(311)·낙랑군(313)·대방군(314) 확보\n"
          "• 의의 : 고조선 멸망 이후 400여 년간 지속된 한반도 내 중국 군현의 소멸\n")
PAGE = "hanguksa-textbook-page-1"
Q1 = "요동군 서안평(311)·낙랑군(313)·대방군(314) 확보"
Q2 = "고조선 멸망 이후 400여 년간 지속된 한반도 내 중국 군현의 소멸"


def short_row(**extra):
    row = {"id": "hanguksa-pred-p1-cheonwang", "type": "short", "skill": "fact", "topic": "고구려 팽창",
           "basis": "교재 기출 표시 주제", "prompt": "4세기 초 서안평을 점령하고 낙랑군을 몰아낸 고구려 국왕을 쓰시오.",
           "answer": "미천왕", "acceptedAnswers": ["을불"], "explain": "311~314년 확보",
           "evidence": [{"page": PAGE, "quote": Q1}]}
    row.update(extra)
    return row


def essay_row(**extra):
    row = {"id": "hanguksa-pred-p1-expansion", "type": "essay", "skill": "causation", "topic": "고구려 팽창",
           "basis": "교재 기출 표시 주제", "title": "4세기 고구려의 대외 팽창",
           "prompt": "〈자료〉 ㉠ 왕은 서안평을 공격하였다. 〈작성 방법〉 • ㉠ 왕을 쓸 것. • ㉠ 왕의 팽창이 갖는 의의를 서술할 것.",
           "answer": "㉠은 미천왕이다. 중국 군현이 한반도에서 소멸하였다.", "explain": "교재 근거",
           "evidence": [{"page": PAGE, "quote": Q1}],
           "rubric": [{"id": "r1", "label": "㉠ 국왕", "max": 1, "ok": "미천왕", "evidence": [{"page": PAGE, "quote": Q1}]},
                      {"id": "r2", "label": "의의", "max": 2, "ok": "군현 소멸", "allowedScores": [0, 1, 2],
                       "acceptedConcepts": ["중국 군현 축출"], "evidence": [{"page": PAGE, "quote": Q2}]},
                      {"id": "r3", "label": "영향", "max": 1, "ok": "군현의 소멸", "evidence": [{"page": PAGE, "quote": Q2}]}]}
    row.update(extra)
    return row


class PredictedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        folder = self.root / "public/data/subjects/hanguksa"
        private = self.root / "functions/_data/subjects/hanguksa"
        folder.mkdir(parents=True)
        private.mkdir(parents=True)
        note = {"id": PAGE, "subject": "hanguksa", "title": "고구려", "text": SOURCE, "source": {}}
        base_essay = {"id": "hanguksa-essay-base", "title": "기존", "prompt": "기존 서술형 질문입니다.", "page": PAGE}
        ext_essay = {"id": "hanguksa-ext-essay", "title": "확장", "prompt": "확장 서술형 질문입니다.", "page": PAGE}
        self.write(folder / "notes.json", [note])
        self.write(folder / "questions.json", [{"id": "hanguksa-base-mc", "prompt": "기존 객관식 질문입니다."},
                                               {"id": "hanguksa-ext-short", "prompt": "확장 단답형 질문입니다."}])
        self.write(folder / "blanks.json", [])
        self.write(folder / "essays.json", [base_essay, ext_essay])
        self.write(private / "essays.json", [{**base_essay, "rubric": []}, {**ext_essay, "rubric": []}])

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, path, data):
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def prepare(self, rows):
        outputs, report = predicted.prepare_subject(self.root, "hanguksa", rows)
        return {path.relative_to(self.root).as_posix(): data for path, data in outputs.items()}, report

    def test_places_predicted_rows_between_starter_and_extension(self):
        outputs, report = self.prepare([short_row(), essay_row()])
        questions = outputs["public/data/subjects/hanguksa/questions.json"]
        self.assertEqual([q["id"] for q in questions],
                         ["hanguksa-base-mc", "hanguksa-pred-p1-cheonwang", "hanguksa-ext-short"])
        short = questions[1]
        self.assertEqual((short["type"], short["match"], short["acceptedAnswers"]), ("blank", "aliases", ["을불"]))
        self.assertTrue(short["prompt"].startswith("[예상] "))
        essays = outputs["public/data/subjects/hanguksa/essays.json"]
        self.assertEqual([e["id"] for e in essays], ["hanguksa-essay-base", "hanguksa-pred-p1-expansion", "hanguksa-ext-essay"])
        self.assertEqual(set(essays[1]), {"id", "title", "prompt", "page"})
        private = outputs["functions/_data/subjects/hanguksa/essays.json"][1]
        self.assertEqual(sum(r["max"] for r in private["rubric"]), 4)
        self.assertEqual(private["rubric"][0]["allowedScores"], [0, 1])
        self.assertEqual(private["rubric"][1]["acceptedConcepts"], ["중국 군현 축출"])
        self.assertEqual(report["types"], {"short": 1, "essay": 1})

    def test_rerun_replaces_only_the_predicted_namespace(self):
        outputs, _ = self.prepare([short_row(), essay_row()])
        for relative, data in outputs.items():
            self.write(self.root / relative, data)
        again, _ = self.prepare([short_row(), essay_row()])
        self.assertEqual(again, outputs)
        fewer, _ = self.prepare([short_row()])
        self.assertEqual([e["id"] for e in fewer["public/data/subjects/hanguksa/essays.json"]],
                         ["hanguksa-essay-base", "hanguksa-ext-essay"])

    def test_rejects_unsafe_rows(self):
        cases = {
            "reveals the answer": short_row(prompt="미천왕이 서안평을 점령한 사건의 국왕을 쓰시오."),
            "id must use": short_row(id="hanguksa-ext-other"),
            "nonverbatim": short_row(evidence=[{"page": PAGE, "quote": "낙랑군을 완전히 멸망시킴"}]),
            "must total 4": essay_row(rubric=essay_row()["rubric"][:2]),
            "작성 방법": essay_row(prompt="㉠ 왕의 팽창이 갖는 의의를 서술하시오."),
        }
        for message, row in cases.items():
            with self.subTest(message):
                with self.assertRaisesRegex(ValueError, message):
                    self.prepare([row])
        duplicate = copy.deepcopy(short_row(id="hanguksa-pred-p1-copy"))
        with self.assertRaisesRegex(ValueError, "duplicate question prompt"):
            self.prepare([short_row(), duplicate])
        with self.assertRaisesRegex(ValueError, "alias duplicates"):
            self.prepare([short_row(acceptedAnswers=["미천 왕"])])

    def test_punctuation_variants_are_real_aliases_for_the_exact_scorer(self):
        outputs, _ = self.prepare([short_row(acceptedAnswers=["『미천왕』", "을불"])])
        self.assertEqual(outputs["public/data/subjects/hanguksa/questions.json"][1]["acceptedAnswers"],
                         ["『미천왕』", "을불"])

    def test_adds_the_bracketed_title_form_used_by_the_source(self):
        notes = self.root / "public/data/subjects/hanguksa/notes.json"
        data = json.loads(notes.read_text(encoding="utf-8"))
        data[0]["text"] += "• 편찬 : 이승휴의 『제왕운기』에 단군 기록\n"
        self.write(notes, data)
        row = short_row(id="hanguksa-pred-p1-title", prompt="이승휴가 단군 기록을 실은 역사서를 쓰시오.",
                        answer="제왕운기", acceptedAnswers=[],
                        evidence=[{"page": PAGE, "quote": "이승휴의 『제왕운기』에 단군 기록"}])
        outputs, _ = self.prepare([row])
        self.assertEqual(outputs["public/data/subjects/hanguksa/questions.json"][1]["acceptedAnswers"], ["『제왕운기』"])


if __name__ == "__main__":
    unittest.main()
