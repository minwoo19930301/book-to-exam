"""Attach exported crops only to their verified source cards."""
from hashlib import sha256
import json


def matches_source(figure, note, by_id):
    source = figure["source"]
    original = note["source"]
    if source["commit"] != original["commit"]:
        return False
    if source["imagePath"] in original["imagePaths"]:
        return True
    # A clearer sibling scan is allowed only with an explicit visual comparison.
    owner = by_id.get(source.get("alternateSourceNoteId"))
    if not owner or owner["subject"] != note["subject"] or owner["source"]["commit"] != source["commit"]:
        return False
    if source["imagePath"] not in owner["source"]["imagePaths"]:
        return False
    for match in source.get("alternateFor", []):
        if match.get("noteId") != note["id"] or match.get("reviewStatus") != "visually-verified-same-printed-pages":
            continue
        if match.get("originalImagePath") not in original["imagePaths"]:
            continue
        pages = set(match.get("matchedPrintedPages", []))
        original_pages = set(original.get("printedPages", []))
        if match.get("sourceLabelCorrection") and match.get("verifiedOriginalPrintedPages"):
            original_pages = set(match["verifiedOriginalPrintedPages"])
        if pages and pages <= original_pages and pages <= set(owner["source"].get("printedPages", [])):
            return True
    return False


def load_figures(root):
    result = {}
    all_figures = []
    for filename in ["figure-assets.json", "kice-figure-assets.json"]:
        path = root / "public/data" / filename
        if path.exists():
            all_figures.extend(json.loads(path.read_text())["figures"])
    for f in all_figures:
        relative = f["src"].removeprefix("/")
        asset = (root / "public" / relative).resolve()
        if not asset.is_relative_to((root / "public/figures").resolve()):
            raise ValueError(f"Invalid figure asset path: {f['id']}")
        if sha256(asset.read_bytes()).hexdigest() != f["assetSha256"]:
            raise ValueError(f"Figure asset changed: {f['id']}")
        for note_id in f["noteIds"]:
            result.setdefault(note_id, []).append({k: v for k, v in f.items() if k != "noteIds"})
    return result


def attach_figures(notes, figures):
    by_id = {n["id"]: n for n in notes}
    for n in notes:
        attached = figures.get(n["id"], [])
        for f in attached:
            if not matches_source(f, n, by_id):
                raise ValueError(f"Figure source mismatch: {n['id']} / {f['id']}")
        if attached:
            n["figures"] = attached
