#!/usr/bin/env python3
"""Export visually reviewed illustration rectangles without changing source pixels.

Coordinates refer to the original image at a pinned Git commit, never a resized
preview. No automatic guessing, generative fill, or full-page fallback is used.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/history-kb"))
from figures import matches_source
MARKERS = re.compile(r"▲|<지도|〈지도|\[지도|<그림|〈그림|\[그림|<사진|〈사진|\[사진|\[도표|〈도표|그림\s*\d")


def safe_path(root, relative):
    path = (root / relative).resolve()
    if Path(relative).is_absolute() or not path.is_relative_to(root.resolve()):
        raise ValueError(f"Path outside source directory: {relative}")
    return path


def crop_image(figure, cache):
    source = figure["source"]
    path = safe_path(cache, source["imagePath"])
    digest = sha256(path.read_bytes()).hexdigest()
    if source["sha256"] != digest:
        raise ValueError(f"Source image changed: {path}")
    with Image.open(path) as image:
        if list(image.size) != source["imageSize"]:
            raise ValueError(f"Source dimensions changed: {path}")
        rect = source["rect"]
        if len(rect) != 4 or any(type(v) is not int for v in rect):
            raise ValueError(f"Expected integer pixel rectangle: {figure['id']}")
        x, y, width, height = rect
        if min(x, y) < 0 or min(width, height) <= 0 or x + width > image.width or y + height > image.height:
            raise ValueError(f"Out-of-bounds crop: {figure['id']}")
        if width * height >= image.width * image.height * .8:
            raise ValueError(f"Full-page crop is not a separate illustration: {figure['id']}")
        return image.crop((x, y, x + width, y + height)).convert("RGB")


def build(root=ROOT, cache=None):
    cache = cache or root / ".cache/history-figures"
    notes = {}
    for path in (root / "public/data/subjects").glob("*/notes.json"):
        notes.update({n["id"]: n for n in json.loads(path.read_text())})
    exam_path = root / "public/data/subjects/kice/pages.json"
    if exam_path.exists():
        notes.update({n["id"]: n for n in json.loads(exam_path.read_text())})
    assets, reports, ids = [], [], set()
    manifests = sorted((root / "tools/history-figures").glob("manifest-*.json"))
    if not manifests:
        raise ValueError("No reviewed figure manifests")
    for path in manifests:
        manifest = json.loads(path.read_text())
        reviewed = set(manifest["reviewedNotes"])
        attached = set()
        for f in manifest["figures"]:
            if f["id"] in ids or not re.fullmatch(r"[a-z0-9-]+", f["id"]):
                raise ValueError(f"Duplicate or unsafe figure id: {f['id']}")
            ids.add(f["id"])
            if f["reviewStatus"] != "visually-verified" or not f["noteIds"]:
                raise ValueError(f"Unreviewed/orphan figure: {f['id']}")
            if f["kind"] not in {"photo", "map", "diagram", "table"}:
                raise ValueError(f"Unknown figure kind: {f['id']}")
            for note_id in f["noteIds"]:
                note = notes[note_id]
                if note["subject"] != manifest["subject"] or note_id not in reviewed:
                    raise ValueError(f"Unreviewed or wrong-subject note: {note_id}")
                checked = {**f, "source": {**f["source"], "commit": manifest["sourceCommit"]}}
                if not matches_source(checked, note, notes):
                    raise ValueError(f"Figure does not belong to note's pinned source: {note_id}")
                attached.add(note_id)
            crop = crop_image(f, cache)
            # PNG keeps the cropped decoded pixels intact, including map labels.
            relative = f"figures/{manifest['subject']}/{f['id']}.png"
            dest = safe_path(root / "public", relative)
            dest.parent.mkdir(parents=True, exist_ok=True)
            crop.save(dest, optimize=True)
            assets.append({**f, "src": f"/{relative}", "width": crop.width, "height": crop.height,
                           "assetSha256": sha256(dest.read_bytes()).hexdigest(),
                           "source": {**f["source"], "commit": manifest["sourceCommit"]}})
        candidates = {n["id"] for n in notes.values() if n["subject"] == manifest["subject"] and MARKERS.search(n["text"])}
        reports.append({"subject": manifest["subject"], "candidateNotes": len(candidates),
                        "reviewedNotes": sorted(reviewed), "notesWithFigures": len(attached),
                        "figures": len(manifest["figures"]), "unresolved": manifest.get("unresolved", []),
                        "unreviewedCandidates": sorted(candidates - reviewed)})
    output = {"schemaVersion": 1, "method": "visually-reviewed-source-pixel-crops", "figures": assets}
    (root / "public/data/figure-assets.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    (root / "knowledge/figure-audit.json").write_text(json.dumps({"schemaVersion": 1,
        "scope": "Figure markers in imported text, plus explicitly reviewed pages. This is not a visual census of every scan.",
        "subjects": reports}, ensure_ascii=False, indent=2) + "\n")
    return {"figures": len(assets), "notes": len({n for f in assets for n in f["noteIds"]}), "subjects": reports}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/history-figures")
    args = parser.parse_args()
    print(json.dumps(build(cache=args.cache), ensure_ascii=False, indent=2))
