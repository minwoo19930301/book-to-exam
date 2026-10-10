#!/usr/bin/env python3
"""Validate preserved sources, compact Markdown, question evidence and figures."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
from urllib.parse import parse_qs, urlparse

from build import ROOT, SUBJECTS, DOM, outer_wrappers
from compact import META
from figures import load_figures, matches_source

# Reuse the publication compiler's byte hashes, page ownership and review gate.
# The input path still comes from the root being validated, including fixtures.
sys.path.append(str(Path(__file__).resolve().parents[1] / "history-questions"))
from capture_practice import ORIGIN as CAPTURE_ORIGIN, STATUS as CAPTURE_STATUS, folder_for, prepare_subject as prepare_captures


def read_json(path):
    return json.loads(path.read_text())


def exact_evidence(owner, evidence, notes):
    for item in evidence:
        assert item["page"] in notes, f'wrong-subject/missing evidence: {owner} / {item["page"]}'
        assert item["quote"] and item["quote"] in notes[item["page"]]["text"], f'nonverbatim evidence: {owner}'


def validate_capture_banks(root, subject, files):
    """Return only capture IDs rebuilt exactly from the reviewed author input.

    A sourceStatus label alone must never exempt a question from OCR evidence
    checks. Recompilation also detects missing, extra or edited published rows.
    This establishes traceability; it does not independently read the pixels.
    """
    prefix = f"{subject}-capture-practice-"
    claimed = []
    for name in ("facts", "questions", "blanks", "essays"):
        for item in files[name]:
            provenance = item.get("provenance", {})
            if (item.get("id", "").startswith(prefix) or "captureEvidence" in item
                    or provenance.get("origin") == CAPTURE_ORIGIN
                    or provenance.get("sourceStatus") == CAPTURE_STATUS):
                claimed.append((name, item))
    path = root / "tools/history-questions/capture-inputs" / f"{subject}.json"
    if not path.exists():
        assert not claimed, f'capture input missing: {subject}'
        return set()
    folder = folder_for(root, subject)
    baseline = {folder / f"{name}.json": files[name] for name in ("questions", "blanks", "essays")}
    outputs, _ = prepare_captures(root, subject, read_json(path), baseline_outputs=baseline, require_complete=True)
    expected = {}
    for name in ("questions", "blanks"):
        rebuilt = outputs[folder / f"{name}.json"]
        assert rebuilt == files[name], f'published capture bank differs from reviewed input: {subject} / {name}'
        expected.update({item["id"]: (name, item) for item in rebuilt if item["id"].startswith(prefix)})
    for name, item in claimed:
        assert expected.get(item.get("id")) == (name, item), f'unverified capture provenance: {item.get("id")}'
    return set(expected)


def validate_banks(root, subject, files, notes):
    capture_ids = validate_capture_banks(root, subject, files)
    question_ids = set()
    for name in ["facts", "questions", "blanks"]:
        for item in files[name]:
            owner = item.get("id") or item.get("term")
            assert item["page"] in notes, f'missing question source: {owner}'
            if subject != "hand-memo":
                assert item.get("evidence"), f'missing authored evidence: {owner}'
            if owner not in capture_ids:
                exact_evidence(owner, item.get("evidence", []), notes)
            if name == "facts":
                continue
            assert item["id"] not in question_ids, f'duplicate question id: {item["id"]}'
            question_ids.add(item["id"])
            if item["type"] == "mc":
                choices = item["choices"]
                assert len(choices) >= 2, owner
                if subject != "hand-memo":
                    assert len(set(choices)) == len(choices), owner
                assert type(item["answer"]) is int and 0 <= item["answer"] < len(choices), owner
            if "before" in item:
                cloze = item["before"] + str(item["answer"]) + item.get("after", "")
                if owner in capture_ids:
                    assert any(cloze in e["quote"] for e in item["captureEvidence"]), f'cloze differs from reviewed capture: {owner}'
                else:
                    assert cloze in notes[item["page"]]["text"].replace("**", ""), f'cloze differs from source: {owner}'
    private_dir = root / "functions/_data"
    if subject != "hand-memo":
        private_dir /= "subjects/" + subject
    private_essays = read_json(private_dir / "essays.json")
    expected_public = [{key: e[key] for key in ["id", "title", "prompt", "page"]} for e in private_essays]
    assert files["essays"] == expected_public, f'public essay/rubric mismatch: {subject}'
    for essay in private_essays:
        assert essay["page"] in notes, essay["id"]
        assert essay["rubric"] and len({r["id"] for r in essay["rubric"]}) == len(essay["rubric"]), essay["id"]
        for criterion in essay["rubric"]:
            assert criterion["max"] > 0 and criterion["evidence"], essay["id"]
            exact_evidence(essay["id"], criterion["evidence"], notes)
    return question_ids, {e["id"] for e in private_essays}


def viewer_reference(url, subject, page):
    parsed = urlparse(url)
    assert parsed.path == "/viewer", f'knowledge link must open the source viewer: {url}'
    query = parse_qs(parsed.query)
    assert query.get("subject") == [subject] and query.get("page") == [page], url


def validate_compact(root, notes, exams):
    compiled = read_json(root / "functions/_data/knowledge.json")
    assert compiled and compiled == read_json(root / "knowledge/retrieval-index.json"), "compiled retrieval indexes differ"
    ids, paths, selected = set(), set(), set()
    counts = Counter()
    for entry in compiled:
        owner = entry["id"]
        assert owner not in ids and re.fullmatch(r"kb-[a-z0-9-]+", owner), f'duplicate/unsafe KB id: {owner}'
        ids.add(owner)
        assert entry["kind"] == "curated-topic", owner
        assert owner.startswith(f'kb-{entry["subject"]}-'), owner
        path = (root / entry["path"]).resolve()
        assert path.is_relative_to((root / "knowledge/compact").resolve()), f'KB outside compact directory: {path}'
        assert path.parent.name == entry["subject"] and path.suffix == ".md", path
        assert path not in paths, f'duplicate compiled Markdown path: {path}'
        paths.add(path)
        markdown = path.read_text()
        matches = META.findall(markdown)
        assert len(matches) == 1, f'missing/duplicate Markdown metadata: {path}'
        meta = json.loads(matches[0])
        for key in ["id", "subject", "title", "sourceIds", "examIds", "priority"]:
            assert entry[key] == meta[key], f'compiled metadata differs: {path} / {key}'
        assert entry["text"] == META.sub("", markdown).strip(), f'compiled body differs: {path}'
        assert 0 < len(entry["text"]) <= 10000, f'KB body is empty or too large: {path}'
        assert entry["priority"] in {"core", "support"}, owner
        assert entry["automaticExamEligible"] is False, owner
        source_ids = entry["sourceIds"]
        assert source_ids and len(source_ids) == len(set(source_ids)), f'missing/duplicate sources: {owner}'
        assert entry["page"] == source_ids[0], f'primary source differs: {owner}'
        assert len(entry["examIds"]) == len(set(entry["examIds"])), f'duplicate exam references: {owner}'
        assert all(eid in exams for eid in entry["examIds"]), f'missing exam reference: {owner}'
        for note_id in source_ids:
            assert note_id in notes and notes[note_id]["subject"] == entry["subject"], f'wrong-subject/missing compact source: {owner} / {note_id}'
        assert entry["source"] == notes[source_ids[0]].get("source"), f'primary provenance differs: {owner}'
        assert [s["id"] for s in entry["sources"]] == source_ids, f'compiled source order differs: {owner}'
        for ref in entry["sources"]:
            note = notes[ref["id"]]
            assert ref["title"] == note["title"] and ref["source"] == note.get("source"), f'source provenance differs: {owner}'
            assert ref["figureIds"] == [f["id"] for f in note.get("figures", [])], f'figure references differ: {owner}'
            viewer_reference(ref["url"], entry["subject"], note["id"])
        # S1, S2 etc. index this document's sourceIds, not another topic's sources.
        for marker in re.findall(r"\[S\d+(?:\s*,\s*S?\d+)*\]", entry["text"]):
            assert all(1 <= int(number) <= len(source_ids) for number in re.findall(r"\d+", marker)), f'out-of-range source marker: {owner} / {marker}'
        selected.update(source_ids)
        counts[entry["subject"]] += 1
    expected_paths = {p.resolve() for p in (root / "knowledge/compact").glob("*/*.md")}
    assert paths == expected_paths, "Markdown documents missing from compiled KB"
    report = read_json(root / "knowledge/compact-report.json")
    assert report["topics"] == len(compiled) and report["topicsBySubject"] == dict(counts), "compact report topic counts differ"
    assert report["selectedSourceCards"] == len(selected), "selected-source count differs"
    assert report["rawSourceCards"] == len(notes), "raw-source count differs"
    assert report["rawTextCharacters"] == sum(len(n["text"]) for n in notes.values()), "raw character count differs"
    assert report["compactTextCharacters"] == sum(len(e["text"]) for e in compiled), "compact character count differs"
    return compiled, counts


def validate(root=ROOT, source=None):
    data = root / "public/data"
    manifest = read_json(data / "subjects.json")
    assert {m["id"] for m in manifest} == {"hand-memo", *SUBJECTS}, "subject manifest coverage differs"
    assert len({m["id"] for m in manifest}) == len(manifest), "duplicate manifest subjects"
    assert not list(data.rglob("wiki.json")), "public wiki exports must be removed"
    exams = read_json(data / "subjects/kice/pages.json")
    exam_by_id = {e["id"]: e for e in exams}
    assert len(exam_by_id) == len(exams), "duplicate KICE record id"
    for e in exams:
        assert e["recordType"] == "exam-page-excerpt"
        assert e["questionNumbers"] == [] and e["questionNumbersStatus"] == "not-segmented"
        assert not e["source"]["scanVerified"]
        assert e["document"]["pdfUrl"] is None or e["document"]["pdfAvailability"] == "tracked-in-source-repo"
        assert sha256(e["text"].encode()).hexdigest() == e["source"]["textSha256"], f'exam transcription changed: {e["id"]}'
    all_notes, imported_notes, question_ids, essay_ids = {}, [], set(), set()
    for m in manifest:
        subject = m["id"]
        directory = data if subject == "hand-memo" else data / "subjects" / subject
        files = {name: read_json(directory / f"{name}.json") for name in ["notes", "facts", "questions", "blanks", "essays"]}
        assert "wiki" not in m["counts"], subject
        for counter, name in [("notes", "notes"), ("concepts", "facts"), ("questions", "questions"), ("blanks", "blanks"), ("essays", "essays")]:
            assert m["counts"][counter] == len(files[name]), (subject, counter)
        notes = {n["id"]: {**n, "subject": subject} for n in files["notes"]}
        assert len(notes) == len(files["notes"]), f'duplicate note id: {subject}'
        assert not set(notes) & set(all_notes), f'cross-subject note id collision: {subject}'
        all_notes.update(notes)
        qids, eids = validate_banks(root, subject, files, notes)
        assert not question_ids & qids and not essay_ids & eids, f'cross-subject question/essay id collision: {subject}'
        question_ids.update(qids)
        essay_ids.update(eids)
        if subject != "hand-memo":
            for note in notes.values():
                assert sha256(note["text"].encode()).hexdigest() == note["source"]["textSha256"], f'source text changed: {note["id"]}'
                assert not note["quality"]["automaticExamEligible"]
                assert not note["source"]["scanVerified"]
            imported_notes.extend(notes.values())
    assert not set(all_notes) & set(exam_by_id), "note/exam id collision"
    review = all_notes["seoyangsa-textbook-page-234"]
    assert review["source"]["knownIssues"] and "루스벨트 당선(1933)" in review["text"], "known source error must remain documented and unmodified"
    compiled, topic_counts = validate_compact(root, all_notes, exam_by_id)
    for m in manifest:
        assert m["counts"]["knowledge"] == topic_counts[m["id"]] > 0, f'compact topic count differs: {m["id"]}'
    # Reuse the loader's asset existence, path and checksum checks, then verify
    # each attachment against the original or explicitly reviewed sibling scan.
    figures = load_figures(root)
    source_records = {**all_notes, **exam_by_id}
    assert set(figures) <= set(source_records), "orphan figure attachment"
    attachments = 0
    for note_id, note in source_records.items():
        expected = figures.get(note_id, [])
        assert note.get("figures", []) == expected, f'figure attachment differs: {note_id}'
        assert len({f["id"] for f in expected}) == len(expected), f'duplicate figure attachment: {note_id}'
        for figure in expected:
            assert matches_source(figure, note, source_records), f'figure source mismatch: {note_id} / {figure["id"]}'
        attachments += len(expected)
    stats = read_json(root / "knowledge/source-manifest.json")
    assert stats["counts"]["notes"] == len(imported_notes), "source-card count differs"
    assert stats["counts"]["examPageExcerpts"] == len(exams), "KICE source-card count differs"
    if source:
        by_source = {}
        for note in imported_notes + exams:
            by_source.setdefault(note["source"]["path"], {})[note["source"]["anchor"]] = note
        for file in stats["files"]:
            path = source / file["path"]
            assert sha256(path.read_bytes()).hexdigest() == file["sha256"], f'source changed: {path}'
            imported = by_source[file["path"]]
            expected = {}
            for card in DOM(path.read_text()).root.find(cls="book-page-card"):
                wrappers = outer_wrappers(card)
                text = "\n\n".join(w.text() for w in wrappers if w.text())
                if text:
                    expected[card.attrs["id"]] = text
            assert set(expected) == set(imported), f'card coverage mismatch: {path}'
            for anchor, text in expected.items():
                assert text == imported[anchor]["text"], f'import text mismatch: {path}#{anchor}'
    return {"sourceNotes": len(all_notes), "importedSourceNotes": len(imported_notes),
            "compactTopics": len(compiled), "kicePageExcerpts": len(exams),
            "questionsAndBlanks": len(question_ids), "essays": len(essay_ids),
            "figureAttachments": attachments}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    print(json.dumps(validate(source=args.source), ensure_ascii=False, indent=2))
