"""Capture traceability and publication gates, independent of unfinished inputs.

These tests validate asset/evidence consistency, not historical accuracy or
whether the authored quotation was read correctly from the image.
"""
import copy
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import capture_practice as capture
from expansion import encoded, save


class CapturePracticeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.subject = "dongyangsa"
        self.page = "dongyangsa-textbook-page-1"
        self.other = "dongyangsa-textbook-page-2"
        self.folder = capture.folder_for(self.root, self.subject)
        self.quote = "검증용 가상 자료에서 백성을 구제하는 기관은 구호소이며 곡식을 보관하는 창고는 비축고이다."
        # Deliberately different OCR: capture excerpts must not be silently
        # forced to match, or substituted with, this unverified transcription.
        self.notes = [dict(id=self.page, text="잘못 전사된 문장은 그대로 보존한다."),
                      dict(id=self.other, text="검증용 책의 차례")]
        self.assets = [self.asset(name, payload) for name, payload in
                       [("page-1", b"fixture image one"), ("page-1-detail", b"fixture detail"),
                        ("page-2", b"fixture image two")]]
        self.write(self.folder / "notes.json", self.notes)
        self.write(self.root / "public/data/source-pages.json", {"pages": {
            self.page: {"captures": self.assets[:2]}, self.other: {"captures": self.assets[2:]}}})
        self.write(self.root / "tools/history-questions/capture-targets.json",
                   {"subjects": {self.subject: [self.page, self.other]}})
        self.baseline = {
            "questions": [dict(id="existing-question", type="blank", page=self.page,
                               prompt="이전에 작성한 고유한 단답 질문", answer="이전답안")],
            "blanks": [dict(id="existing-cloze", type="blank", page=self.other,
                            prompt="기존의 _____ 빈칸 문제", answer="전사", before="기존의 ", after=" 빈칸 문제")],
            "essays": [dict(id="existing-essay", page=self.other, prompt="기존 서술형 질문을 보존하시오.")],
        }
        for name, bank in self.baseline.items():
            self.write(self.folder / f"{name}.json", bank)

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(encoded(value), encoding="utf-8")

    def asset(self, name, payload):
        src = f"/source-pages/{name}.png"
        path = self.root / "public" / src.lstrip("/")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        return dict(src=src, sha256=sha256(payload).hexdigest())

    def row(self, number=1):
        return dict(id=f"{self.subject}-capture-practice-1-test-{number}", page=self.page, kind="short",
                    prompt="검증용 가상 자료에서 백성을 구제하는 기관의 이름은 무엇인가?" if number == 1 else
                           "검증용 가상 자료에서 곡식을 보관하는 창고의 이름은 무엇인가?",
                    answer="구호소" if number == 1 else "비축고", acceptedAnswers=["구휼소"] if number == 1 else [],
                    evidence=[dict(page=self.page, quote=self.quote)],
                    captureEvidence=[dict(**self.assets[0], quote=self.quote, location="왼쪽 면의 첫 번째 문단")],
                    explain="가상의 검증 자료에 명시된 기능으로 이름을 구별한다.", topic="검증용 기관")

    def document(self):
        return dict(schemaVersion=1, subject=self.subject, questions=[self.row(), self.row(2)], reviews=[
            dict(page=self.page, status="content", captures=[self.assets[0]], summary="기관과 창고 이름을 대조했다."),
            dict(page=self.other, status="non-content", captures=[self.assets[2]], summary="차례만 표시된 면이다.", reason="차례")])

    def prepare(self, document=None, **options):
        return capture.prepare_subject(self.root, self.subject, document or self.document(), **options)

    def snapshot(self):
        return {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}

    def test_capture_quotes_can_differ_from_ocr_without_rewriting_any_source(self):
        before = self.snapshot()
        outputs, report = self.prepare()
        self.assertEqual(before, self.snapshot(), "validation must be read-only")
        row = outputs[self.folder / "questions.json"][-2]
        self.assertNotIn(row["evidence"][0]["quote"], self.notes[0]["text"])
        self.assertEqual(row["evidence"][0]["quote"], row["captureEvidence"][0]["quote"])
        self.assertEqual(row["provenance"]["sourceStatus"], "capture-compared-excerpt")
        self.assertEqual(row["contextMode"], "source-excerpt")
        self.assertEqual(report["reviews"][self.page]["excerpts"][0]["questionIds"],
                         [self.row()["id"], self.row(2)["id"]])
        self.assertEqual(report["counts"][self.page], 3)

    def test_manifest_hash_changed_bytes_and_missing_asset_are_rejected(self):
        broken = self.document()
        broken["reviews"][0]["captures"] = [{**self.assets[0], "sha256": "0" * 64}]
        with self.assertRaisesRegex(ValueError, "manifest hash differs"):
            self.prepare(broken)
        path = self.root / "public" / self.assets[0]["src"].lstrip("/")
        path.write_bytes(b"changed after review")
        with self.assertRaisesRegex(ValueError, "bytes have changed"):
            self.prepare()
        path.unlink()
        with self.assertRaisesRegex(ValueError, "missing capture asset"):
            self.prepare()

    def test_capture_must_belong_to_page_and_have_been_reviewed(self):
        for asset, expected in [(self.assets[2], "does not belong"), (self.assets[1], "was not reviewed")]:
            with self.subTest(asset=asset):
                broken = self.document()
                broken["questions"][0]["captureEvidence"][0].update(asset)
                with self.assertRaisesRegex(ValueError, expected):
                    self.prepare(broken)
        broken = self.document()
        broken["reviews"][0]["captures"] = [self.assets[2]]
        with self.assertRaisesRegex(ValueError, "does not belong"):
            self.prepare(broken)

    def test_evidence_must_match_exact_compared_excerpt_and_primary_page(self):
        for mutation, expected in [({"quote": self.quote + " 추가한 문장"}, "differs from compared excerpt"),
                                   ({"page": self.other}, "support primary page")]:
            broken = self.document()
            broken["questions"][0]["evidence"][0].update(mutation)
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, expected):
                self.prepare(broken)
        broken = self.document()
        broken["questions"][0]["captureEvidence"].append(
            dict(**self.assets[0], quote="사용하지 않은 발췌문이다.", location="오른쪽 면 아래"))
        with self.assertRaisesRegex(ValueError, "unused capture excerpt"):
            self.prepare(broken)

    def test_cloze_reconstructs_exact_capture_passage_and_keeps_all_lines(self):
        document = self.document()
        row = document["questions"][0]
        row.update(kind="cloze", passage=self.quote, prompt=self.quote.replace(row["answer"], "_____"))
        outputs, _ = self.prepare(document)
        cloze = outputs[self.folder / "blanks.json"][-1]
        self.assertEqual(cloze["before"] + cloze["answer"] + cloze["after"], self.quote)
        self.assertEqual(cloze["prompt"], cloze["before"] + "_____" + cloze["after"])
        self.assertEqual(cloze["passageMode"], "full")
        for changes, expected in [(dict(prompt=row["prompt"] + " 해설을 덧붙임"), "reconstruction differs"),
                                  (dict(passage=self.quote + " 추정한 내용"), "capture-attested"),
                                  (dict(passage=self.quote + row["answer"]), "capture-attested")]:
            broken = copy.deepcopy(document)
            broken["questions"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, expected):
                self.prepare(broken)

    def test_existing_banks_preserved_and_reserved_rows_replaced_idempotently(self):
        source_before = {path: path.read_bytes() for path in
                         [self.folder / "notes.json", self.folder / "essays.json", self.root / "public/data/source-pages.json"]}
        outputs, report = self.prepare()
        for bank in ("questions", "blanks"):
            self.assertEqual(outputs[self.folder / f"{bank}.json"][:len(self.baseline[bank])], self.baseline[bank])
        self.assertNotIn(self.folder / "essays.json", outputs)
        self.assertEqual(report["totalQuestions"], 5)
        save(outputs)
        self.assertEqual(self.prepare()[0], outputs)
        stale = dict(id=f"{self.subject}-capture-practice-stale", prompt="이전 초안")
        self.write(self.folder / "questions.json", outputs[self.folder / "questions.json"] + [stale])
        self.assertEqual(self.prepare()[0], outputs)
        self.assertEqual(source_before, {path: path.read_bytes() for path in source_before})

    def test_complete_review_gate_and_explicit_partial_content_reason(self):
        document = self.document()
        document["reviews"] = document["reviews"][:1]
        with self.assertRaisesRegex(ValueError, "unreviewed captures"):
            self.prepare(document)
        self.prepare(document, require_complete=False)
        document = self.document()
        document["questions"] = document["questions"][:1]
        with self.assertRaisesRegex(ValueError, "needs 3–4 questions"):
            self.prepare(document)
        document["reviews"][0].update(status="unreadable", reason="일부 짧은 구절만 판독했다.")
        outputs, report = self.prepare(document)
        self.assertEqual(report["counts"][self.page], 2)
        self.assertEqual(len(outputs[self.folder / "questions.json"]), 2)

    def test_partial_cli_can_validate_but_never_publish(self):
        document = self.document()
        document["reviews"] = document["reviews"][:1]
        path = self.root / "partial.json"
        self.write(path, document)
        args = [sys.executable, str(Path(capture.__file__).resolve()), "--root", str(self.root),
                "--subject", self.subject, "--input", str(path), "--allow-partial"]
        before = self.snapshot()
        validation = subprocess.run([*args, "--validate-only"], capture_output=True, text=True)
        self.assertEqual(validation.returncode, 0, validation.stderr)
        publish = subprocess.run(args, capture_output=True, text=True)
        self.assertNotEqual(publish.returncode, 0)
        self.assertIn("partial reviews may only be validated", publish.stderr)
        self.assertEqual(before, self.snapshot())

    def test_alias_leaks_and_duplicate_tasks_cannot_pad_coverage(self):
        for changes, expected in [(dict(acceptedAnswers=["구 호소"]), "duplicate alias"),
                                  (dict(acceptedAnswers=["기관"]), "revealed in prompt"),
                                  (dict(prompt="검증용 자료에 나오는 구호소의 이름은 무엇인가?"), "revealed in prompt")]:
            broken = self.document()
            broken["questions"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, expected):
                self.prepare(broken)
        broken = self.document()
        broken["questions"][1] = {**self.row(), "id": self.row(2)["id"],
                                   "prompt": "검증 자료에서 백성을 돕는 업무를 맡은 곳의 명칭은 무엇인가?"}
        with self.assertRaisesRegex(ValueError, "repeated task"):
            self.prepare(broken)

    def test_optional_hook_respects_generated_baseline_and_preserves_other_outputs(self):
        baseline = {self.folder / f"{name}.json": copy.deepcopy(bank) for name, bank in self.baseline.items()}
        baseline[self.folder / "questions.json"][0]["explain"] = "이번 생성 단계의 변경분"
        self.assertIs(capture.extend_generated(self.subject, self.root, baseline), baseline)
        self.write(self.root / "tools/history-questions/capture-inputs/dongyangsa.json", self.document())
        output = capture.extend_generated(self.subject, self.root, baseline)
        self.assertEqual(output[self.folder / "questions.json"][0], baseline[self.folder / "questions.json"][0])
        self.assertEqual(output[self.folder / "essays.json"], baseline[self.folder / "essays.json"])
        self.assertEqual(len(output[self.folder / "questions.json"]), 3)

    def test_hand_memo_inventory_uses_local_image_bytes(self):
        image = self.root / "public/pages/page17.jpg"
        image.parent.mkdir(parents=True)
        image.write_bytes(b"handwritten image bytes")
        inventory = capture.capture_inventory(self.root, {"p17": dict(id="p17", img="page17.jpg")})
        self.assertEqual(inventory, {"p17": {"/pages/page17.jpg": sha256(image.read_bytes()).hexdigest()}})


if __name__ == "__main__":
    unittest.main()
