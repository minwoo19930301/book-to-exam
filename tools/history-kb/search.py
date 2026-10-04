#!/usr/bin/env python3
"""Search the compact internal Markdown KB without an LLM or API key."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def search(query, records, subject=None, limit=5):
    tokens = re.findall(r"[\w가-힣]+", query.casefold())
    if not tokens:
        return []
    found = []
    for r in records:
        if subject and r["subject"] != subject:
            continue
        title, text = r["title"].casefold(), r["text"].casefold()
        matches = [t for t in tokens if t in title or t in text]
        if not matches:
            continue
        score = sum(8 * title.count(t) + min(text.count(t), 8) for t in matches)
        score += 20 if len(matches) == len(tokens) else 0
        score += 5 if r["kind"] in {"curated-topic", "curated-concept"} else 0
        positions = [text.find(t) for t in matches if t in text]
        start = max(0, min(positions) - 70) if positions else 0
        found.append({k: r[k] for k in ("id", "subject", "kind", "title", "sourceUrl")} | {
            "score": score, "matchedTerms": matches, "excerpt": r["text"][start:start + 450],
            "path": r.get("path"), "matchStatus": "candidate", "sourceStatus": "unverified-transcription",
            "sourceIds": r.get("sourceIds", []), "examIds": r.get("examIds", []),
        })
    return sorted(found, key=lambda x: (-x["score"], x["id"]))[:limit]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("query")
    p.add_argument("--subject", choices=["hand-memo", "seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"])
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--index", type=Path, default=ROOT / "knowledge/retrieval-index.json")
    args = p.parse_args()
    records = json.loads(args.index.read_text())
    print(json.dumps(search(args.query, records, args.subject, max(1, min(args.limit, 50))), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
