#!/usr/bin/env python3
"""Fetch only reviewed figure source images from their pinned Git commits.

Credentials remain in subprocess environment variables. Cache entries, including
existing ones, must match the manifest's SHA-256 and decoded image dimensions.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def safe_path(root: Path, relative: str) -> Path:
    # Kept local to avoid the unrelated history-kb/build.py module of the same
    # name. Reject traversal before resolving, and reject symlinks escaping root.
    if (not isinstance(relative, str) or not relative or "\\" in relative
            or "\0" in relative or ":" in relative
            or PurePosixPath(relative).is_absolute()
            or any(part in {"", ".", ".."} for part in relative.split("/"))):
        raise ValueError("Expected a safe repository-relative source image path")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Source image path escapes the cache directory")
    return path


def load_sources(manifest_dir: Path, cache: Path) -> list[dict]:
    manifests = sorted(manifest_dir.glob("manifest-*.json"))
    if not manifests:
        raise ValueError("No reviewed figure manifests found")
    sources = {}
    for path in manifests:
        manifest = json.loads(path.read_text())
        commit = manifest.get("sourceCommit", "")
        if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", commit):
            raise ValueError(f"Manifest must pin a full Git commit: {path.name}")
        for figure in manifest["figures"]:
            source = figure["source"]
            relative = source["imagePath"]
            safe_path(cache, relative)
            digest = source.get("sha256", "")
            size = source.get("imageSize")
            if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
                raise ValueError(f"Missing source SHA-256: {path.name}")
            if not isinstance(size, list) or len(size) != 2 or any(type(n) is not int or n <= 0 for n in size):
                raise ValueError(f"Missing positive source dimensions: {path.name}")
            spec = {"imagePath": relative, "commit": commit.lower(), "sha256": digest.lower(), "imageSize": size}
            previous = sources.get(relative)
            if previous and (previous["sha256"], previous["imageSize"]) != (spec["sha256"], size):
                raise ValueError(f"Conflicting source versions share a cache path: {relative}")
            # A visually checked alternate frame is the figure's imagePath too;
            # originalImagePath is provenance, not the pixels exported by build.
            sources.setdefault(relative, spec)
    return [sources[key] for key in sorted(sources)]


def validate_image(path: Path, spec: dict) -> None:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != spec["sha256"]:
        raise ValueError(f"Source checksum mismatch: {spec['imagePath']}")
    with Image.open(path) as image:
        if list(image.size) != spec["imageSize"]:
            raise ValueError(f"Source dimensions mismatch: {spec['imagePath']}")
        image.verify()


def git_environment(account: str | None) -> dict:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    if account:
        result = subprocess.run(
            ["gh", "auth", "token", "--hostname", "github.com", "--user", account],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        token = result.stdout.strip()
        if result.returncode or not token:
            raise RuntimeError("Could not load the requested GitHub account from gh")
        env["GH_TOKEN"] = token
    return env


def fetch_images(source: Path, cache: Path = ROOT / ".cache/history-figures",
                 account: str | None = None, manifest_dir: Path = Path(__file__).resolve().parent) -> dict:
    if not source.is_dir():
        raise ValueError("Source checkout directory does not exist")
    specs = load_sources(manifest_dir, cache)
    environment = None
    counts = {"sourceImages": len(specs), "reused": 0, "fetched": 0}
    for spec in specs:
        dest = safe_path(cache, spec["imagePath"])
        if dest.is_file():
            try:
                validate_image(dest, spec)
            except (OSError, ValueError, SyntaxError):
                pass
            else:
                counts["reused"] += 1
                continue
        if environment is None:
            environment = git_environment(account)
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = None
        try:
            with tempfile.NamedTemporaryFile(prefix=f".{dest.name}.", suffix=".part", dir=dest.parent, delete=False) as stream:
                temp = Path(stream.name)
                result = subprocess.run(
                    ["git", "-C", str(source.resolve()), "show", f"{spec['commit']}:{spec['imagePath']}"],
                    env=environment, stdout=stream, stderr=subprocess.PIPE,
                )
                stream.flush()
                os.fsync(stream.fileno())
            if result.returncode:
                # Never echo remote/credential-helper stderr; it can contain
                # credential-bearing URLs or secrets from a local helper.
                raise RuntimeError(f"Could not read pinned source image: {spec['imagePath']} (git exit {result.returncode}). Check repository access or --github-account.")
            validate_image(temp, spec)
            temp.replace(dest)
            counts["fetched"] += 1
        finally:
            if temp is not None:
                temp.unlink(missing_ok=True)
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Existing smart-textbooks Git checkout")
    parser.add_argument("--github-account", help="Optional gh account for fetching private promisor blobs")
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/history-figures")
    parser.add_argument("--manifest-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    try:
        result = fetch_images(args.source, args.cache, args.github_account, args.manifest_dir)
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"Figure fetch failed: {error}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
