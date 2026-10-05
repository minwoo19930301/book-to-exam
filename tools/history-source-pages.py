#!/usr/bin/env python3
"""Publish pinned source captures alongside imported notes, without changing pixels.

Run with --source /path/to/smart-textbooks; --check needs no private repository.
Only image paths explicitly linked by the original viewer are included. A missing
source link stays missing: a neighboring scan is not an interchangeable page.
"""
import argparse
from hashlib import sha1, sha256
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/history-figures"))
from fetch import git_environment, safe_path

SUBJECTS = ("seoyangsa", "hanguksa", "dongyangsa", "gyoyukron")
MANIFEST = ROOT / "public/data/source-pages.json"


def note_sources():
    for subject in SUBJECTS:
        for note in json.loads((ROOT / f"public/data/subjects/{subject}/notes.json").read_text()):
            yield subject, note


def git(source, env, *args):
    result = subprocess.run(["git", "-C", str(source), *args], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f"Cannot read pinned source images (git {args[0]} exit {result.returncode}); check repository access.")
    return result.stdout


def build(source, account):
    env = git_environment(account)
    notes = list(note_sources())
    trees = {}
    for commit in sorted({n["source"]["commit"] for _, n in notes}):
        tree = git(source, env, "ls-tree", "-rz", commit)
        trees[commit] = {}
        for row in tree.split(b"\0"):
            if row:
                meta, path = row.split(b"\t", 1)
                trees[commit][path.decode()] = meta.split()[2].decode()
    objects = {trees[n["source"]["commit"]][p] for _, n in notes for p in n["source"].get("imagePaths", [])}
    # Batch promisor fetches instead of one network round trip for each image.
    git(source, env, "-c", "fetch.negotiationAlgorithm=noop", "fetch", "--no-tags",
        "--no-write-fetch-head", "--recurse-submodules=no", "--filter=blob:none", "origin", *sorted(objects))
    pages = {}
    assets = {}
    for subject, note in notes:
        captures = []
        provenance = note["source"]
        for path in provenance.get("imagePaths", []):
            safe_path(ROOT / ".cache/history-figures", path)
            oid = trees[provenance["commit"]][path]
            if oid not in assets:
                data = git(source, env, "cat-file", "blob", oid)
                if sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() != oid:
                    raise ValueError(f"Source blob mismatch: {path}")
                with Image.open(BytesIO(data)) as img:
                    width, height = img.size
                    if img.format != "JPEG":
                        raise ValueError(f"Unexpected source format: {path}")
                    img.verify()
                digest = sha256(data).hexdigest()
                src = f"/source-pages/{digest}.jpg"
                target = ROOT / "public" / src.lstrip("/")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                assets[oid] = {"src": src, "sha256": digest, "width": width, "height": height, "bytes": len(data), "gitBlob": oid}
            captures.append({**assets[oid], "sourcePath": path, "sourceCommit": provenance["commit"]})
        pages[note["id"]] = {"subject": subject, "captures": captures,
                             "status": "source-linked" if captures else "source-link-missing"}
    manifest = {"version": 1, "pages": pages, "assetCount": len(assets),
                "sourceNoteCount": len(pages), "notesWithCaptures": sum(bool(p["captures"]) for p in pages.values()),
                "totalBytes": sum(a["bytes"] for a in assets.values())}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def check():
    manifest = json.loads(MANIFEST.read_text())
    checked = set()
    for subject, note in note_sources():
        page = manifest["pages"][note["id"]]
        assert page["subject"] == subject
        assert [c["sourcePath"] for c in page["captures"]] == note["source"].get("imagePaths", [])
        for capture in page["captures"]:
            assert capture["sourceCommit"] == note["source"]["commit"]
            src = capture["src"]
            assert src == f"/source-pages/{capture['sha256']}.jpg"
            if src in checked:
                continue
            checked.add(src)
            data = (ROOT / "public" / src.lstrip("/")).read_bytes()
            assert sha256(data).hexdigest() == capture["sha256"]
            assert sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == capture["gitBlob"]
            assert len(data) == capture["bytes"]
            with Image.open(BytesIO(data)) as img:
                assert img.size == (capture["width"], capture["height"])
                img.verify()
    assert len(checked) == manifest["assetCount"]
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--github-account")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check and not args.source:
        parser.error("--source is required unless --check is given")
    manifest = check() if args.check else build(args.source.resolve(), args.github_account)
    print(json.dumps({k: v for k, v in manifest.items() if k != "pages"}, ensure_ascii=False))
