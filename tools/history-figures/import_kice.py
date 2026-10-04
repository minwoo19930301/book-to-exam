#!/usr/bin/env python3
"""Reuse only the small figures explicitly embedded in the source KICE HTML.

These are pre-existing source assets, not newly reviewed crop coordinates.
Never infer question numbers or include unreferenced PNGs from the repository.
"""
import argparse
from hashlib import sha1, sha256
import json
from io import BytesIO
import os
from pathlib import Path
import re
import subprocess
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/history-kb"))
from build import DOM


def import_figures(source, account=None):
    commit = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    env = dict(os.environ)
    if account:
        env["GH_TOKEN"] = subprocess.check_output(["gh", "auth", "token", "--hostname", "github.com", "--user", account], text=True).strip()
    html = source / "평가원_역사기출_스마트_교재뷰어.html"
    cards = DOM(html.read_text()).root.find(cls="book-page-card")
    tree = subprocess.check_output(["git", "-C", str(source), "ls-tree", "-r", "-z", commit, "--", "kice_gichul_pages"], text=True)
    objects = {entry.split("\t", 1)[1]: entry.split("\t", 1)[0].split()[2] for entry in tree.split("\0") if entry}
    notes = {n["id"]: n for n in json.loads((ROOT / "public/data/subjects/kice/pages.json").read_text())}
    reviews = {}
    for review_file in sorted((ROOT / "tools/history-figures").glob("kice-review-*.json")):
        for review in json.loads(review_file.read_text())["reviewed"]:
            if review["id"] in reviews:
                raise ValueError(f"Duplicate figure review: {review['id']}")
            reviews[review["id"]] = review
    figures = []
    excluded = []
    for card in cards:
        note_id = "kice-exam-" + card.attrs["id"]
        if note_id not in notes:
            continue
        note = notes[note_id]
        for number, wrapper in enumerate(card.find(cls="inline-fig"), 1):
            images = wrapper.find(tag="img")
            if len(images) != 1:
                raise ValueError(f"Unexpected inline figure structure: {note_id}")
            path = images[0].attrs["src"]
            if not re.fullmatch(r"kice_gichul_pages/[^/]+/fig_\d+_\d+\.png", path) or path not in note["source"]["imagePaths"]:
                raise ValueError(f"Unrecognized inline source: {path}")
            cached = ROOT / ".cache/history-figures" / path
            expected = objects[path]
            def blob_hash(payload):
                return sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()
            if not cached.exists() or blob_hash(cached.read_bytes()) != expected:
                cached.parent.mkdir(parents=True, exist_ok=True)
                temp = cached.with_suffix(".part")
                with temp.open("wb") as stream:
                    subprocess.run(["git", "show", f"{commit}:{path}"], cwd=source, env=env, stdout=stream, check=True)
                temp.replace(cached)
            payload = cached.read_bytes()
            if blob_hash(payload) != expected:
                raise ValueError(f"Asset does not match pinned Git blob: {path}")
            with Image.open(cached) as image:
                image.verify()
            with Image.open(cached) as image:
                width, height = image.size
            fid = f"{note_id}-figure-{number}"
            review = reviews.get(fid)
            if review and review.get("sourceSha256") and review["sourceSha256"] != sha256(payload).hexdigest():
                raise ValueError(f"Review belongs to an older source image: {fid}")
            if not review or review["decision"] != "include":
                excluded.append({"id": fid, "noteId": note_id, "sourcePath": path,
                    "reason": review["reason"] if review else "Awaiting visual review"})
                continue
            original_hash = sha256(payload).hexdigest()
            rotation = review.get("rotation", 0)
            if rotation not in (0, 180):
                raise ValueError(f"Unsupported review rotation: {fid}")
            if rotation:
                with Image.open(cached) as image:
                    corrected = image.transpose(Image.Transpose.ROTATE_180)
                    output = BytesIO()
                    corrected.save(output, format="PNG")
                    payload = output.getvalue()
            src = f"/figures/kice/{fid}.png"
            dest = ROOT / "public" / src.lstrip("/")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(payload)
            caption = f'{note["title"]} · 자료 {number}'
            figures.append({"id": fid, "noteIds": [note_id], "src": src, "caption": caption,
                "alt": caption, "kind": review["kind"], "width": width, "height": height,
                "assetSha256": sha256(payload).hexdigest(), "reviewStatus": "visually-reviewed-embedded-asset",
                "source": {"imagePath": path, "commit": commit, "sha256": original_hash, "gitBlobId": expected,
                           "rotation": rotation, "reviewNote": review["reason"],
                           "imageSize": [width, height], "extractionMethod": "existing-inline-figure",
                           "anchor": card.attrs["id"], "questionMappingStatus": "page-only-not-segmented"}})
        if figures and len(figures) % 25 < 4:
            print(f"Imported {len(figures)} embedded figures", flush=True)
    (ROOT / "public/data/kice-figure-assets.json").write_text(json.dumps({"schemaVersion": 1,
        "method": "source-html-inline-figure-reuse", "figures": figures}, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "knowledge/kice-figure-audit.json").write_text(json.dumps({"included": len(figures), "excluded": excluded}, ensure_ascii=False, indent=2) + "\n")
    # Remove only this importer's named outputs, leaving manual page crops alone.
    current = {f["id"] + ".png" for f in figures}
    for stale in (ROOT / "public/figures/kice").glob("kice-exam-spread-*-figure-*.png"):
        if stale.name not in current:
            stale.unlink()
    return {"figures": len(figures), "pages": len({n for f in figures for n in f["noteIds"]})}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--github-account", help="Optional gh account for private promisor blobs")
    args = p.parse_args()
    print(json.dumps(import_figures(args.source, args.github_account)))
