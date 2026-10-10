"""KB validation must attest capture publications without trusting status labels."""
import copy
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest

from validate import prepare_captures, validate_banks


class CaptureBankValidationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.subject = "dongyangsa"
        self.page = "dongyangsa-textbook-page-1"
        self.other = "dongyangsa-textbook-page-2"
        self.folder = self.root / "public/data/subjects" / self.subject
        self.input_path = self.root / "tools/history-questions/capture-inputs/dongyangsa.json"
        self.asset = {"src": "/source-pages/one.png", "sha256": sha256(b"reviewed image bytes").hexdigest()}
        self.asset_path = self.root / "public/source-pages/one.png"
        self.asset_path.parent.mkdir(parents=True)
        self.asset_path.write_bytes(b"reviewed image bytes")
        self.notes = {self.page: {"id": self.page, "text": "기존 전사 근거 문장을 보존한다."},
                      self.other: {"id": self.other, "text": "차례"}}
        self.write(self.folder / "notes.json", list(self.notes.values()))
        self.write(self.root / "public/data/source-pages.json", {"pages": {
            self.page: {"captures": [self.asset]}, self.other: {"captures": []}}})
        self.write(self.root / "tools/history-questions/capture-targets.json", {"subjects": {self.subject: [self.page]}})
        self.write(self.root / "functions/_data/subjects/dongyangsa/essays.json", [])
        self.files = {"facts": [], "essays": [], "blanks": [], "questions": [dict(
            id="legacy-question", page=self.page, type="blank", prompt="기존 문항의 고유한 질문을 보존한다.",
            answer="기존답", evidence=[dict(page=self.page, quote="기존 전사 근거 문장")])]}
        for name in ("questions", "blanks", "essays"):
            self.write(self.folder / f"{name}.json", self.files[name])
        quote = "가상의 사진 자료에서 구호소는 굶주린 백성을 돕고 비축고는 곡식을 보관한다."
        self.document = dict(schemaVersion=1, subject=self.subject, reviews=[dict(
            page=self.page, status="content", captures=[self.asset], summary="기관과 창고의 명칭을 대조했다.")], questions=[])
        for number, answer, kind in [(1, "구호소", "short"), (2, "비축고", "cloze")]:
            row = dict(id=f"dongyangsa-capture-practice-1-{number}", page=self.page, kind=kind,
                       answer=answer, acceptedAnswers=[], explain="사진에서 읽은 기능과 명칭으로 구별한다.", topic="가상 기관",
                       prompt="가상의 사진 자료에서 굶주린 백성을 돕는 기관의 명칭은 무엇인가?",
                       evidence=[dict(page=self.page, quote=quote)],
                       captureEvidence=[dict(**self.asset, quote=quote, location="왼쪽 본문의 첫 문단")])
            if kind == "cloze":
                row.update(passage=quote, prompt=quote.replace(answer, "_____"))
            self.document["questions"].append(row)
        self.write(self.input_path, self.document)
        outputs, _ = prepare_captures(self.root, self.subject, self.document)
        for name in ("questions", "blanks"):
            self.files[name] = outputs[self.folder / f"{name}.json"]

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def check(self, files=None):
        return validate_banks(self.root, self.subject, files or self.files, self.notes)

    def test_capture_excerpt_can_differ_from_ocr_and_cloze_remains_exact(self):
        before = copy.deepcopy(self.files)
        ids, essays = self.check()
        self.assertEqual(len(ids), 3)
        self.assertFalse(essays)
        self.assertEqual(self.files, before)
        self.assertNotIn(self.files["blanks"][0]["passage"], self.notes[self.page]["text"])

    def test_published_fields_must_match_compiled_author_input(self):
        for field, value in [("answer", "다른답"), ("acceptedAnswers", ["근거없는별칭"]),
                             ("prompt", "발행 후에 변경한 문제의 발문을 검증한다."),
                             ("evidence", [dict(page=self.page, quote="만들어 낸 인용")]),
                             ("captureEvidence", []), ("provenance", {})]:
            with self.subTest(field=field):
                files = copy.deepcopy(self.files)
                files["questions"][-1][field] = value
                with self.assertRaisesRegex(AssertionError, "differs from reviewed input"):
                    self.check(files)
        files = copy.deepcopy(self.files)
        files["blanks"][0]["after"] += " 발행 후 추가 문장"
        with self.assertRaisesRegex(AssertionError, "differs from reviewed input"):
            self.check(files)

    def test_missing_extra_or_reclassified_capture_rows_fail(self):
        for mode in ("missing", "extra", "moved"):
            with self.subTest(mode=mode):
                files = copy.deepcopy(self.files)
                if mode == "missing": files["questions"].pop()
                elif mode == "extra":
                    row = copy.deepcopy(files["questions"][-1])
                    row["id"] += "-orphan"
                    files["questions"].append(row)
                else: files["blanks"].append(files["questions"].pop())
                with self.assertRaisesRegex(AssertionError, "differs from reviewed input"):
                    self.check(files)

    def test_status_marker_cannot_exempt_legacy_or_orphan_evidence(self):
        files = copy.deepcopy(self.files)
        files["questions"][0]["provenance"] = {"sourceStatus": "capture-compared-excerpt"}
        with self.assertRaisesRegex(AssertionError, "unverified capture provenance"):
            self.check(files)
        self.input_path.unlink()
        with self.assertRaisesRegex(AssertionError, "capture input missing"):
            self.check()

    def test_legacy_evidence_still_requires_exact_ocr(self):
        files = copy.deepcopy(self.files)
        files["questions"][0]["evidence"][0]["quote"] = "전사에도 검토 입력에도 없는 문장"
        with self.assertRaisesRegex(AssertionError, "nonverbatim evidence"):
            self.check(files)

    def test_actual_asset_bytes_are_revalidated(self):
        self.asset_path.write_bytes(b"changed since review")
        with self.assertRaisesRegex(ValueError, "bytes have changed"):
            self.check()

    def test_review_input_must_have_valid_hash_page_and_matching_quotes(self):
        for mutation, error in [("hash", "manifest hash differs"), ("page", "does not belong"),
                                ("quote", "differs from compared excerpt"), ("partial", "unreviewed captures")]:
            with self.subTest(mutation=mutation):
                document = copy.deepcopy(self.document)
                if mutation == "hash": document["reviews"][0]["captures"][0]["sha256"] = "0" * 64
                elif mutation == "page":
                    document["questions"][0]["page"] = self.other
                    document["reviews"].append(dict(page=self.other, status="unreadable", captures=[self.asset],
                                                     summary="일부 판독", reason="짧은 구절만 판독"))
                    self.write(self.root / "tools/history-questions/capture-targets.json",
                               {"subjects": {self.subject: [self.page, self.other]}})
                elif mutation == "quote": document["questions"][0]["evidence"][0]["quote"] += " 변경"
                else: document["reviews"] = []
                self.write(self.input_path, document)
                with self.assertRaisesRegex(ValueError, error): self.check()
                self.write(self.root / "tools/history-questions/capture-targets.json", {"subjects": {self.subject: [self.page]}})


if __name__ == "__main__":
    unittest.main()
