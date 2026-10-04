#!/usr/bin/env python3
"""Validate authored exam-format predicted questions and place them in the banks.

Inputs live in tools/history-questions/predicted-inputs/<subject>/*.json and use the
reserved <subject>-pred- id namespace. Re-running replaces only that namespace.
Banks keep the order starter -> predicted -> <subject>-ext- so that generate.py,
expansion.py and this tool produce identical files in any run order.
No network, model call, or third-party package is used. Exact quotation checks
do not establish historical accuracy; authors review answers separately.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import re
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
SUBJECTS = ("seoyangsa", "hanguksa", "dongyangsa", "gyoyukron")
TYPES = ("short", "essay")
SKILLS = ("fact", "comparison", "causation", "source-analysis")
VERSION = "history-predicted.1"
# 평가원 1차 전공 서술형은 문항당 4점이다(전공A 8문항 32점, 전공B 9문항 36점).
ESSAY_POINTS = 4
LABEL = "[예상] "
MIN_QUOTE = 6


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def encoded(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def text(value, owner, field):
    require(isinstance(value, str) and bool(value.strip()), f"{owner}: nonempty {field} required")
    return value


def strings(values, owner, field):
    require(isinstance(values, list) and bool(values), f"{owner}: {field} must be a nonempty array")
    for value in values:
        text(value, owner, field)
    return values


def normalized(value):
    """Catch punctuation/spacing/case-only duplicates without altering sources."""
    return "".join(c for c in unicodedata.normalize("NFKC", value).casefold() if c.isalnum())


def graded(value):
    """Mirror shared/scoring.js exact(): only emphasis, spacing and NFC are ignored."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", value.replace("**", "")))


def exact_evidence(owner, evidence, notes):
    require(isinstance(evidence, list) and bool(evidence), f"{owner}: evidence required")
    result, seen = [], set()
    for item in evidence:
        require(isinstance(item, dict), f"{owner}: evidence must be an object")
        page = text(item.get("page"), owner, "evidence.page")
        quote = text(item.get("quote"), owner, "evidence.quote")
        require(page in notes, f"{owner}: missing/wrong-subject source {page}")
        require(len(quote.strip()) >= MIN_QUOTE, f"{owner}: quote too short to support an answer: {quote!r}")
        require(quote in notes[page]["text"], f"{owner}: nonverbatim evidence in {page}: {quote!r}")
        for issue in notes[page].get("source", {}).get("knownIssues", []):
            bad_quote = issue.get("quote")
            require(not bad_quote or bad_quote not in quote,
                    f"{owner}: known source issue {issue.get('id', bad_quote)} cannot support an answer")
        require((page, quote) not in seen, f"{owner}: duplicate evidence")
        seen.add((page, quote))
        result.append({"page": page, "quote": quote})
    return result


def rubric_for(row, notes):
    owner = row["id"]
    criteria = row.get("rubric")
    require(isinstance(criteria, list) and 2 <= len(criteria) <= 5, f"{owner}: rubric needs 2-5 criteria")
    rubric, ids = [], set()
    for criterion in criteria:
        require(isinstance(criterion, dict), f"{owner}: rubric item must be an object")
        rid = text(criterion.get("id"), owner, "rubric.id")
        require(bool(re.fullmatch(r"[a-z][a-z0-9-]*", rid)), f"{owner}: unsafe rubric id {rid}")
        require(rid not in ids, f"{owner}: duplicate rubric id {rid}")
        ids.add(rid)
        maximum = criterion.get("max")
        require(type(maximum) in (int, float) and math.isfinite(maximum) and 0 < maximum <= 2,
                f"{owner}: each criterion max must be in (0, 2]")
        item = {"id": rid, "label": text(criterion.get("label"), owner, "rubric.label"),
                "max": maximum, "ok": text(criterion.get("ok"), owner, "rubric.ok"),
                "evidence": exact_evidence(owner, criterion.get("evidence"), notes),
                "scoring": text(criterion.get("scoring", "요소 단위로 판단한다. ok의 요구를 모두 충족하면 만점, "
                                "핵심이 없거나 모순되면 0점이다. allowedScores 밖의 점수는 주지 않는다."),
                                owner, "rubric.scoring")}
        scores = criterion.get("allowedScores", [0, maximum] if not float(maximum).is_integer() or maximum == 1
                               else list(range(int(maximum) + 1)))
        require(isinstance(scores, list) and len(scores) >= 2 and
                all(type(s) in (int, float) and math.isfinite(s) and 0 <= s <= maximum for s in scores),
                f"{owner}: invalid allowedScores")
        require(len(set(scores)) == len(scores) and 0 in scores and maximum in scores,
                f"{owner}: allowedScores must be unique and include 0 and max")
        item["allowedScores"] = scores
        for field in ("checkpoints", "acceptedConcepts", "rejectConditions"):
            if field in criterion:
                item[field] = strings(criterion[field], owner, field)
        if "requiredRelation" in criterion:
            item["requiredRelation"] = text(criterion["requiredRelation"], owner, "requiredRelation")
        rubric.append(item)
    require(math.isclose(sum(r["max"] for r in rubric), ESSAY_POINTS, abs_tol=1e-9),
            f"{owner}: rubric must total {ESSAY_POINTS} points like a 평가원 서술형 item")
    return rubric


def convert(row, subject, notes):
    require(isinstance(row, dict), f"{subject}: each question must be an object")
    owner = text(row.get("id"), subject, "id")
    require(bool(re.fullmatch(re.escape(subject) + r"-pred-[a-z0-9]+(?:-[a-z0-9]+)*", owner)),
            f"{owner}: id must use {subject}-pred-<slug>")
    kind = row.get("type")
    require(kind in TYPES, f"{owner}: type must be one of {TYPES}")
    skill = row.get("skill")
    require(skill in SKILLS, f"{owner}: skill must be one of {SKILLS}")
    topic = text(row.get("topic"), owner, "topic")
    basis = text(row.get("basis"), owner, "basis")
    prompt = text(row.get("prompt"), owner, "prompt").strip()
    require(len(re.sub(r"\s+", " ", prompt)) >= 8 and not re.match(r"^[).,\]]", prompt),
            f"{owner}: prompt would be hidden by the current question UI")
    require(not prompt.startswith(LABEL.strip()), f"{owner}: the tool adds the {LABEL.strip()} label")
    evidence = exact_evidence(owner, row.get("evidence"), notes)
    page = evidence[0]["page"]
    explain = text(row.get("explain"), owner, "explain")
    answer = text(row.get("answer"), owner, "answer").strip()
    provenance = {"origin": "authored-predicted", "sourceStatus": "transcription-unverified",
                  "version": VERSION, "skill": skill, "examFormat": "단답형" if kind == "short" else "서술형",
                  "topic": topic, "basis": basis,
                  "inputSha256": sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode()).hexdigest()}
    if kind == "short":
        require(len(answer) <= 40, f"{owner}: 단답형 answer must be a short term (<=40 chars)")
        require(normalized(answer) not in normalized(prompt), f"{owner}: prompt reveals the answer")
        accepted = row.get("acceptedAnswers", [])
        require(isinstance(accepted, list), f"{owner}: acceptedAnswers must be an array")
        for alias in accepted:
            text(alias, owner, "acceptedAnswers")
            require(graded(alias) != graded(answer), f"{owner}: alias duplicates the answer")
            require(normalized(alias) not in normalized(prompt), f"{owner}: prompt reveals an accepted answer")
        require(len({graded(a) for a in accepted}) == len(accepted), f"{owner}: duplicate aliases")
        # The exact scorer keeps punctuation, so accept the bracketed title form the source itself uses.
        accepted = list(accepted)
        sources = [notes[e["page"]]["text"] for e in evidence]
        for value in [answer, *accepted]:
            for variant in (f"『{value}』", f"「{value}」"):
                if any(variant in source for source in sources) and \
                        graded(variant) not in {graded(a) for a in [answer, *accepted]}:
                    accepted.append(variant)
        public = {"id": owner, "type": "blank", "stem": "임용 예상 단답형", "keyword": topic,
                  "prompt": LABEL + prompt, "choices": None, "answer": answer, "match": "aliases",
                  "acceptedAnswers": accepted, "page": page, "explain": explain, "evidence": evidence,
                  "provenance": provenance}
        return "questions", public, None
    require("작성 방법" in prompt, f"{owner}: 서술형 prompt must state its 〈작성 방법〉 conditions")
    title = text(row.get("title"), owner, "title").strip()
    require(not title.startswith(LABEL.strip()), f"{owner}: the tool adds the {LABEL.strip()} label")
    rubric = rubric_for(row, notes)
    require(any(e["page"] == page for r in rubric for e in r["evidence"]),
            f"{owner}: primary source must support a rubric criterion")
    public = {"id": owner, "title": LABEL + title, "prompt": prompt, "page": page}
    private = {**public, "answer": answer, "explain": explain, "evidence": evidence,
               "rubric": rubric, "rubricVersion": VERSION, "provenance": provenance}
    return "essays", public, private


def bank_paths(root, subject):
    folder = root / "public/data/subjects" / subject
    return {name: folder / f"{name}.json" for name in ("questions", "blanks", "essays")} | {
        "private": root / "functions/_data/subjects" / subject / "essays.json"}


def read_inputs(input_dir, subject, files=None):
    paths = files if files is not None else sorted((input_dir / subject).glob("*.json"))
    rows = []
    for path in paths:
        document = read_json(path)
        require(isinstance(document, dict) and document.get("schemaVersion") == 1,
                f"{path}: schemaVersion 1 required")
        require(document.get("subject") == subject, f"{path}: input subject mismatch")
        questions = document.get("questions")
        require(isinstance(questions, list), f"{path}: questions must be an array")
        rows.extend(questions)
    return rows


def place(items, predicted, subject):
    pred, ext = f"{subject}-pred-", f"{subject}-ext-"
    base = [row for row in items if not row["id"].startswith((pred, ext))]
    return base + predicted + [row for row in items if row["id"].startswith(ext)]


def prepare_subject(root, subject, rows, *, baseline_outputs=None):
    require(subject in SUBJECTS, f"unsupported subject {subject!r}")
    notes_list = read_json(root / "public/data/subjects" / subject / "notes.json")
    notes = {note["id"]: note for note in notes_list}
    require(len(notes) == len(notes_list), f"{subject}: duplicate source ids")
    paths = bank_paths(root, subject)
    current = {name: baseline_outputs[path] if baseline_outputs is not None else read_json(path)
               for name, path in paths.items()}
    prefix = subject + "-pred-"
    others = {name: [row for row in items if not row["id"].startswith(prefix)] for name, items in current.items()}
    ids, prompts = set(), {}
    for name in ("questions", "blanks", "essays"):
        for row in others[name]:
            ids.add(row["id"])
            prompts.setdefault(normalized(row["prompt"]), row["id"])
    added = {"questions": [], "essays": [], "private": []}
    counts = {"short": 0, "essay": 0}
    for row in rows:
        name, public, private = convert(row, subject, notes)
        owner = public["id"]
        require(owner not in ids, f"{owner}: duplicate question id")
        ids.add(owner)
        fingerprint = normalized(row["prompt"])
        require(fingerprint not in prompts, f"{owner}: duplicate question prompt of {prompts.get(fingerprint)}")
        prompts[fingerprint] = owner
        added[name].append(public)
        if private:
            added["private"].append(private)
        counts[row["type"]] += 1
    outputs = {name: place(current[name], added.get(name, []), subject) for name in current}
    public_private = [{key: essay[key] for key in ("id", "title", "prompt", "page")} for essay in outputs["private"]]
    require(outputs["essays"] == public_private, f"{subject}: public/private essays disagree")
    report = {"subject": subject, "predicted": len(rows), "types": counts,
              "total": sum(len(outputs[k]) for k in ("questions", "blanks", "essays"))}
    return {paths[name]: values for name, values in outputs.items()}, report


def predicted_generated(subject, root, starter_outputs):
    """generate.py hook: subjects without predicted inputs stay identical."""
    folder = root / "tools/history-questions/predicted-inputs" / subject
    if not folder.exists() or not any(folder.glob("*.json")):
        return starter_outputs
    rows = read_inputs(folder.parent, subject)
    placed, _ = prepare_subject(root, subject, rows, baseline_outputs=starter_outputs)
    return {**starter_outputs, **placed}


def save(outputs, *, check=False):
    serialized = {path: encoded(data) for path, data in outputs.items()}
    if check:
        for path, content in serialized.items():
            require(path.exists() and path.read_text(encoding="utf-8") == content,
                    f"Predicted bank differs: {path}. Run predicted.py after reviewing inputs.")
        return
    staged = []
    try:
        for path, content in serialized.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                             prefix=".predicted-", delete=False) as handle:
                staged.append((Path(handle.name), path))
                handle.write(content)
        for temporary, path in staged:
            os.replace(temporary, path)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--input-dir", type=Path)
    parser.add_argument("--subject", action="append", choices=SUBJECTS)
    parser.add_argument("--file", type=Path, action="append",
                        help="Validate only these draft files (requires one --subject and --validate-only)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Compare committed banks without writing")
    mode.add_argument("--validate-only", action="store_true", help="Validate inputs without writing banks")
    args = parser.parse_args()
    input_dir = args.input_dir or args.root / "tools/history-questions/predicted-inputs"
    subjects = args.subject or [s for s in SUBJECTS if (input_dir / s).exists()]
    if args.file:
        require(args.validate_only and len(subjects) == 1, "--file requires --validate-only and one --subject")
    manifest_path = args.root / "public/data/subjects.json"
    manifest = read_json(manifest_path)
    outputs, reports = {}, []
    for subject in subjects:
        rows = read_inputs(input_dir, subject, args.file)
        subject_outputs, report = prepare_subject(args.root, subject, rows)
        outputs.update(subject_outputs)
        reports.append(report)
        matches = [entry for entry in manifest if entry["id"] == subject]
        require(len(matches) == 1, f"{subject}: manifest entry missing or duplicated")
        paths = bank_paths(args.root, subject)
        for name in ("questions", "blanks", "essays"):
            matches[0]["counts"][name] = len(subject_outputs[paths[name]])
    outputs[manifest_path] = manifest
    if not args.validate_only:
        save(outputs, check=args.check)
    print(encoded({"version": VERSION, "validatedOnly": args.validate_only, "subjects": reports}), end="")


if __name__ == "__main__":
    main()
