"""Small synthetic fixtures exercise crop fidelity and source attribution.

Run: python3 -m unittest discover -s tools/history-figures -p 'test_*.py'
No source scans, real manifests, or generated data are changed by these tests.
"""
from copy import deepcopy
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
COMMIT = "a" * 40


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


figures = load_module("history_kb_figures_under_test", ROOT / "tools/history-kb/figures.py")
# Both pipelines have a build.py. Resolve ours by path, and keep its ordinary
# `from figures` import local even when other test modules were imported first.
with patch.dict(sys.modules, {"figures": figures}), patch.object(sys, "path", list(sys.path)):
    exporter = load_module("history_figure_exporter_under_test", ROOT / "tools/history-figures/build.py")


def note(note_id="dongyangsa-page-1", image_path="scans/original.jpg", pages=(12, 13), subject="dongyangsa"):
    return {
        "id": note_id, "subject": subject, "text": "▲ 지도",
        "source": {"commit": COMMIT, "imagePaths": [image_path], "printedPages": list(pages)},
    }


def figure(image_path="scans/original.jpg"):
    return {
        "id": "dongyangsa-page-1-figure-1", "noteIds": ["dongyangsa-page-1"],
        "kind": "map", "caption": "자료 지도", "alt": "자료 지도",
        "reviewStatus": "visually-verified",
        "source": {"commit": COMMIT, "imagePath": image_path},
    }


class CropTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cache = self.root / "cache"
        self.original_path = self.cache / "scans/original.jpg"
        self.original_path.parent.mkdir(parents=True)
        image = Image.new("RGB", (20, 16))
        image.putdata([(x * 11, y * 13, (x * 19 + y * 23) % 256)
                       for y in range(image.height) for x in range(image.width)])
        image.save(self.original_path, quality=91)
        self.figure = figure()
        self.figure["source"].update({
            "rect": [3, 2, 7, 5], "imageSize": [20, 16],
            "sha256": sha256(self.original_path.read_bytes()).hexdigest(),
        })

    def test_exported_png_preserves_each_decoded_source_pixel(self):
        for folder in ("public/data/subjects/dongyangsa", "tools/history-figures", "knowledge"):
            (self.root / folder).mkdir(parents=True)
        (self.root / "public/data/subjects/dongyangsa/notes.json").write_text(json.dumps([note()]))
        manifest = {
            "schemaVersion": 1, "subject": "dongyangsa", "sourceCommit": COMMIT,
            "figures": [self.figure], "reviewedNotes": [note()["id"]], "unresolved": [],
        }
        (self.root / "tools/history-figures/manifest-dongyangsa.json").write_text(json.dumps(manifest))
        result = exporter.build(self.root, self.cache)
        self.assertEqual(result["figures"], 1)
        attached = figures.load_figures(self.root)
        notes = [note()]
        figures.attach_figures(notes, attached)
        asset = notes[0]["figures"][0]
        with Image.open(self.original_path) as original, Image.open(self.root / "public" / asset["src"].lstrip("/")) as crop:
            self.assertEqual(crop.format, "PNG")
            self.assertEqual(crop.size, (7, 5))
            self.assertEqual(
                [crop.getpixel((x, y)) for y in range(crop.height) for x in range(crop.width)],
                [original.getpixel((x, y)) for y in range(2, 7) for x in range(3, 10)],
            )
        self.assertEqual(asset["source"]["commit"], COMMIT)

    def test_invalid_rectangles_are_rejected(self):
        for rect in ([-1, 2, 7, 5], [3, -1, 7, 5], [3, 2, 0, 5], [3, 2, 7, -1],
                     [19, 2, 2, 5], [3, 15, 7, 2], [3, 2, 7], [3.0, 2, 7, 5],
                     [True, 2, 7, 5]):
            with self.subTest(rect=rect):
                self.figure["source"]["rect"] = rect
                with self.assertRaises(ValueError):
                    exporter.crop_image(self.figure, self.cache)

    def test_full_page_is_not_accepted_as_an_illustration(self):
        self.figure["source"]["rect"] = [0, 0, 20, 16]
        with self.assertRaisesRegex(ValueError, "Full-page crop"):
            exporter.crop_image(self.figure, self.cache)

    def test_source_checksum_or_dimensions_mismatch_is_rejected(self):
        for field, value, message in (("sha256", "0" * 64, "Source image changed"),
                                      ("imageSize", [21, 16], "Source dimensions changed")):
            with self.subTest(field=field):
                candidate = deepcopy(self.figure)
                candidate["source"][field] = value
                with self.assertRaisesRegex(ValueError, message):
                    exporter.crop_image(candidate, self.cache)

    def test_source_path_cannot_escape_cache(self):
        for path in ("../outside.jpg", str(self.original_path.resolve())):
            with self.subTest(path=path):
                self.figure["source"]["imagePath"] = path
                with self.assertRaisesRegex(ValueError, "Path outside source directory"):
                    exporter.crop_image(self.figure, self.cache)


class AttributionTests(unittest.TestCase):
    def setUp(self):
        self.note = note()
        self.sibling = note("dongyangsa-page-2", "scans/clearer.jpg")
        self.by_id = {n["id"]: n for n in (self.note, self.sibling)}

    def alternate(self):
        candidate = figure("scans/clearer.jpg")
        candidate["source"].update({
            "alternateSourceNoteId": self.sibling["id"],
            "alternateFor": [{
                "noteId": self.note["id"], "originalImagePath": "scans/original.jpg",
                "matchedPrintedPages": [13],
                "reviewStatus": "visually-verified-same-printed-pages",
            }],
        })
        return candidate

    def test_same_source_can_be_attached(self):
        candidate = figure()
        self.assertTrue(figures.matches_source(candidate, self.note, self.by_id))
        figures.attach_figures([self.note, self.sibling], {self.note["id"]: [candidate]})
        self.assertEqual(self.note["figures"], [candidate])
        self.assertNotIn("figures", self.sibling)

    def test_other_note_image_or_other_commit_is_rejected(self):
        unrelated = figure("scans/clearer.jpg")
        wrong_commit = figure()
        wrong_commit["source"]["commit"] = "b" * 40
        for candidate in (unrelated, wrong_commit):
            with self.subTest(source=candidate["source"]):
                self.assertFalse(figures.matches_source(candidate, self.note, self.by_id))
                with self.assertRaisesRegex(ValueError, "Figure source mismatch"):
                    figures.attach_figures([self.note, self.sibling], {self.note["id"]: [candidate]})
        self.assertNotIn("figures", self.note)

    def test_visually_verified_sibling_can_be_attached(self):
        candidate = self.alternate()
        self.assertTrue(figures.matches_source(candidate, self.note, self.by_id))
        figures.attach_figures([self.note, self.sibling], {self.note["id"]: [candidate]})
        self.assertEqual(self.note["figures"], [candidate])

    def test_alternate_requires_explicit_matching_pages_and_original(self):
        changes = (
            ("reviewStatus", "unverified"), ("noteId", "another-note"),
            ("originalImagePath", "scans/unrelated.jpg"), ("matchedPrintedPages", []),
            ("matchedPrintedPages", [99]),
        )
        for field, value in changes:
            with self.subTest(field=field, value=value):
                candidate = self.alternate()
                candidate["source"]["alternateFor"][0][field] = value
                self.assertFalse(figures.matches_source(candidate, self.note, self.by_id))

    def test_sibling_must_own_image_and_match_subject_and_commit(self):
        for field, value in (("subject", "hanguksa"), ("commit", "b" * 40),
                             ("imagePaths", ["scans/unrelated.jpg"]), ("printedPages", [12])):
            with self.subTest(field=field):
                owner = deepcopy(self.sibling)
                (owner if field == "subject" else owner["source"])[field] = value
                by_id = {self.note["id"]: self.note, owner["id"]: owner}
                self.assertFalse(figures.matches_source(self.alternate(), self.note, by_id))

    def test_documented_visual_page_label_correction_allows_sibling(self):
        self.note["source"]["printedPages"] = [12]
        candidate = self.alternate()
        self.assertFalse(figures.matches_source(candidate, self.note, self.by_id))
        match = candidate["source"]["alternateFor"][0]
        match["verifiedOriginalPrintedPages"] = [12, 13]
        self.assertFalse(figures.matches_source(candidate, self.note, self.by_id))
        match["sourceLabelCorrection"] = "Original photograph shows pages 12–13; HTML label lists only 12."
        self.assertTrue(figures.matches_source(candidate, self.note, self.by_id))
        figures.attach_figures([self.note, self.sibling], {self.note["id"]: [candidate]})
        self.assertEqual(self.note["figures"], [candidate])


class NativeAssetTests(unittest.TestCase):
    def test_native_kice_asset_needs_no_crop_rect_and_asset_tampering_is_rejected(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            asset = root / "public/figures/kice/figure-1.png"
            asset.parent.mkdir(parents=True)
            Image.new("RGB", (4, 3), "white").save(asset)
            (root / "public/data").mkdir()
            candidate = {
                "id": "kice-exam-spread-3-figure-1", "noteIds": ["kice-exam-spread-3"],
                "src": "/figures/kice/figure-1.png", "kind": "image",
                "assetSha256": sha256(asset.read_bytes()).hexdigest(),
                "reviewStatus": "source-embedded-asset",
                "source": {"commit": COMMIT, "imagePath": "kice/fig_003_2.png",
                           "extractionMethod": "existing-inline-figure"},
            }
            (root / "public/data/kice-figure-assets.json").write_text(json.dumps({"figures": [candidate]}))
            target = note("kice-exam-spread-3", "kice/fig_003_2.png", subject="kice")
            figures.attach_figures([target], figures.load_figures(root))
            self.assertEqual(target["figures"][0]["id"], candidate["id"])
            self.assertNotIn("rect", target["figures"][0]["source"])
            Image.new("RGB", (4, 3), "black").save(asset)
            with self.assertRaisesRegex(ValueError, "Figure asset changed"):
                figures.load_figures(root)


if __name__ == "__main__":
    unittest.main()
