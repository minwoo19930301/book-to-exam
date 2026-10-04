"""Compile the small, editorially selected Markdown KB for internal retrieval.

Markdown is the source of truth. Full transcriptions stay in notes/pages JSON;
they are loaded separately when a question needs evidence or an illustration.
"""
from collections import Counter
import json
from pathlib import Path
import re

META = re.compile(r"^<!-- kb: (\{.*\}) -->$", re.M)
SUBJECTS = {"hand-memo": "손글씨 메모", "seoyangsa": "서양사", "hanguksa": "한국사", "dongyangsa": "동양사", "gyoyukron": "역사교육론"}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def compile_kb(root):
    raw = []
    for subject in SUBJECTS:
        path = root / ("public/data/notes.json" if subject == "hand-memo" else f"public/data/subjects/{subject}/notes.json")
        if path.exists():
            raw += [{**n, "subject": subject} for n in json.loads(path.read_text())]
    notes = {n["id"]: n for n in raw}
    exams = {e["id"]: e for e in json.loads((root / "public/data/subjects/kice/pages.json").read_text())}
    entries, ids, used = [], set(), set()
    for path in sorted((root / "knowledge/compact").glob("*/*.md")):
        markdown = path.read_text()
        match = META.search(markdown)
        if not match:
            raise ValueError(f"Missing KB metadata: {path}")
        meta = json.loads(match[1])
        if not re.fullmatch(r"kb-[a-z0-9-]+", meta["id"]) or meta["id"] in ids:
            raise ValueError(f"Duplicate/unsafe KB id: {meta['id']}")
        ids.add(meta["id"])
        if meta["subject"] not in SUBJECTS or meta["subject"] != path.parent.name:
            raise ValueError(f"Wrong subject: {path}")
        source_ids = meta["sourceIds"]
        if not source_ids or len(source_ids) != len(set(source_ids)):
            raise ValueError(f"Missing or duplicate sources: {path}")
        for nid in source_ids:
            if nid not in notes or notes[nid]["subject"] != meta["subject"]:
                raise ValueError(f"Invalid source {nid}: {path}")
        if any(eid not in exams for eid in meta["examIds"]):
            raise ValueError(f"Missing exam evidence: {path}")
        text = META.sub("", markdown).strip()
        if len(text) > 10000:
            raise ValueError(f"KB document is not compact: {path}")
        if meta["priority"] not in {"core", "support"}:
            raise ValueError(f"Unknown selection priority: {path}")
        primary = notes[source_ids[0]]
        source_refs = [{"id": n, "title": notes[n]["title"], "url": f'/viewer?subject={meta["subject"]}&page={n}',
                       "source": notes[n].get("source"),
                       "figureIds": [f["id"] for f in notes[n].get("figures", [])]} for n in source_ids]
        entry = {**meta, "kind": "curated-topic", "text": text,
                 "page": source_ids[0], "path": path.relative_to(root).as_posix(),
                 "sourceUrl": primary.get("sourceUrl") or source_refs[0]["url"],
                 "source": primary.get("source"), "sources": source_refs,
                 "selectionStatus": "editorially-selected-from-transcription",
                 "automaticExamEligible": False}
        entries.append(entry)
        used.update(source_ids)
    if not entries:
        raise ValueError("No compact Markdown KB documents")
    counts = Counter(e["subject"] for e in entries)
    text_chars = sum(len(e["text"]) for e in entries)
    original_chars = sum(len(n["text"]) for n in raw)
    report = {"topics": len(entries), "topicsBySubject": dict(counts), "selectedSourceCards": len(used),
              "rawSourceCards": len(raw), "rawTextCharacters": original_chars, "compactTextCharacters": text_chars,
              "compactToRawPercent": round(100 * text_chars / max(1, original_chars), 2),
              "metric": "Unicode characters, not model tokens; excludes metadata. Editorial coverage is selective, not exhaustive.",
              "selectionPolicy": "knowledge/selection-policy.md"}
    write_json(root / "functions/_data/knowledge.json", entries)
    write_json(root / "knowledge/retrieval-index.json", entries)
    write_json(root / "knowledge/compact-report.json", report)
    index = ["# 출제용 압축 지식", "", "학습 화면에 노출하지 않는 내부 KB. 필요한 주제만 읽고 원문 근거와 그림을 별도로 조회한다.", "",
             "[선별·출제 기준](selection-policy.md) · [원문과 그림의 출처](methodology.md)", "",
             "문서의 S1, S2 표기는 해당 문서 metadata sourceIds의 순서다. priority는 편집상 우선순위이며 통계적 출제 확률이 아니다.", ""]
    for subject, title in SUBJECTS.items():
        group = [e for e in entries if e["subject"] == subject]
        if group:
            index += [f"## {title}", ""] + [f'- [{e["title"]}]({e["path"].removeprefix("knowledge/")})' for e in group] + [""]
    (root / "knowledge/index.md").write_text("\n".join(index))
    manifest_file = root / "public/data/subjects.json"
    if manifest_file.exists():
        manifest = json.loads(manifest_file.read_text())
        for m in manifest:
            m["counts"].pop("wiki", None)
            m["counts"]["knowledge"] = counts[m["id"]]
        write_json(manifest_file, manifest)
    return report


if __name__ == "__main__":
    print(json.dumps(compile_kb(Path(__file__).resolve().parents[2]), ensure_ascii=False, indent=2))
