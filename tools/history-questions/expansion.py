#!/usr/bin/env python3
"""Validate independently authored questions and append them to the existing banks.

Only rows in the reserved <subject>-ext- namespace belong to this importer.
All inputs are checked before any bank is written. No generation or network call
is performed here; exact quotation checks do not establish historical accuracy.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import re
import tempfile
import unicodedata

from generate import ROOT, SCORING

SUBJECTS = ("seoyangsa", "hanguksa", "dongyangsa", "gyoyukron")
TYPES = ("mc", "short", "blank", "essay")
SKILLS = ("fact", "comparison", "causation", "source-analysis")
VERSION = "history-expansion.1"
REQUIRED_COUNT = 300


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


def normalized(value):
    """Catch punctuation/spacing/case-only duplicates without altering sources."""
    return "".join(c for c in unicodedata.normalize("NFKC", value).casefold() if c.isalnum())


def exact_evidence(owner, evidence, notes):
    require(isinstance(evidence, list) and bool(evidence), f"{owner}: evidence required")
    result, seen = [], set()
    for item in evidence:
        require(isinstance(item, dict), f"{owner}: evidence must be an object")
        page = text(item.get("page"), owner, "evidence.page")
        quote = text(item.get("quote"), owner, "evidence.quote")
        require(page in notes, f"{owner}: missing/wrong-subject source {page}")
        require(quote in notes[page]["text"], f"{owner}: nonverbatim evidence in {page}: {quote!r}")
        for issue in notes[page].get("source", {}).get("knownIssues", []):
            bad_quote = issue.get("quote")
            require(not bad_quote or bad_quote not in quote,
                    f"{owner}: known source issue {issue.get('id', bad_quote)} cannot support an answer")
        pair = (page, quote)
        require(pair not in seen, f"{owner}: duplicate evidence")
        seen.add(pair)
        result.append({"page": page, "quote": quote})
    return result


def rubric_for(row, notes):
    owner = row["id"]
    criteria = row.get("rubric")
    require(isinstance(criteria, list) and bool(criteria), f"{owner}: rubric required")
    rubric, ids = [], set()
    for criterion in criteria:
        require(isinstance(criterion, dict), f"{owner}: rubric item must be an object")
        rid = text(criterion.get("id"), owner, "rubric.id")
        require(bool(re.fullmatch(r"[a-z][a-z0-9-]*", rid)), f"{owner}: unsafe rubric id {rid}")
        require(rid not in ids, f"{owner}: duplicate rubric id {rid}")
        ids.add(rid)
        maximum = criterion.get("max")
        require(type(maximum) in (int, float) and math.isfinite(maximum) and 0 < maximum <= 10,
                f"{owner}: rubric max must be positive and finite")
        item = {"id": rid, "label": text(criterion.get("label"), owner, "rubric.label"),
                "max": maximum, "ok": text(criterion.get("ok"), owner, "rubric.ok"),
                "evidence": exact_evidence(owner, criterion.get("evidence"), notes),
                "scoring": text(criterion.get("scoring", SCORING), owner, "rubric.scoring")}
        if "allowedScores" in criterion:
            scores = criterion["allowedScores"]
            require(isinstance(scores, list) and len(scores) >= 2 and
                    all(type(score) in (int, float) and math.isfinite(score) and 0 <= score <= maximum
                        for score in scores), f"{owner}: invalid allowedScores")
            require(len(set(scores)) == len(scores) and 0 in scores and maximum in scores,
                    f"{owner}: allowedScores must be unique and include 0 and max")
            item["allowedScores"] = scores
        for field in ("checkpoints", "acceptedConcepts", "rejectConditions"):
            if field in criterion:
                values = criterion[field]
                require(isinstance(values, list) and bool(values), f"{owner}: {field} must be a nonempty array")
                for value in values:
                    text(value, owner, field)
                item[field] = values
        if "requiredRelation" in criterion:
            item["requiredRelation"] = text(criterion["requiredRelation"], owner, "requiredRelation")
        if "scoreLevels" in criterion:
            levels = criterion["scoreLevels"]
            require(isinstance(levels, list) and bool(levels), f"{owner}: scoreLevels required")
            scores = item.get("allowedScores")
            require(scores is not None and len(levels) == len(scores), f"{owner}: scoreLevels must match allowedScores")
            require(all(isinstance(level, dict) and type(level.get("score")) in (int, float)
                        and level["score"] in scores for level in levels), f"{owner}: invalid scoreLevels")
            require(len({level['score'] for level in levels}) == len(scores), f"{owner}: duplicate scoreLevels")
            for level in levels:
                text(level.get("condition"), owner, "scoreLevels.condition")
            item["scoreLevels"] = levels
        rubric.append(item)
    require(math.isclose(sum(r["max"] for r in rubric), 10, abs_tol=1e-9),
            f"{owner}: rubric must total 10 points")
    return rubric


def convert_question(row, subject, notes):
    require(isinstance(row, dict), f"{subject}: each question must be an object")
    owner = text(row.get("id"), subject, "id")
    require(bool(re.fullmatch(re.escape(subject) + r"-ext-[a-z0-9]+(?:-[a-z0-9]+)*", owner)),
            f"{owner}: id must use {subject}-ext-<slug>")
    kind = row.get("type")
    require(kind in TYPES, f"{owner}: unsupported type {kind!r}")
    skill = row.get("skill")
    require(skill in SKILLS, f"{owner}: skill must be one of {SKILLS}")
    evidence = exact_evidence(owner, row.get("evidence"), notes)
    page = evidence[0]["page"]
    explain = text(row.get("explain"), owner, "explain")
    provenance = {"origin": "authored-practice", "sourceStatus": "transcription-unverified",
                  "version": VERSION, "skill": skill,
                  "inputSha256": sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode()).hexdigest()}
    base = {"id": owner, "page": page, "explain": explain, "evidence": evidence,
            "provenance": provenance}

    if kind == "blank":
        passage = text(row.get("passage"), owner, "passage")
        answer = text(row.get("answer"), owner, "answer")
        require(passage in notes[page]["text"], f"{owner}: passage must be verbatim in primary source")
        require(any(passage in e["quote"] and e["page"] == page for e in evidence),
                f"{owner}: evidence must include the entire passage")
        require(passage.count(answer) == 1, f"{owner}: passage must contain answer exactly once")
        require("_____" not in passage, f"{owner}: source passage already contains a blank marker")
        before, after = passage.split(answer, 1)
        prompt = before + "_____" + after
        require(row.get("prompt", prompt) == prompt, f"{owner}: blank prompt must match masked passage")
        # The existing reader strips Markdown emphasis before locating a cloze.
        require("**" not in passage, f"{owner}: choose a passage without Markdown emphasis")
        return "blanks", {**base, "type": "blank", "prompt": prompt, "before": before,
                          "after": after, "answer": answer, "match": "exact",
                          "keywordGroups": [], "rejectPatterns": []}, None

    prompt = text(row.get("prompt"), owner, "prompt")
    require(len(re.sub(r"\s+", " ", prompt).strip()) >= 8 and not re.match(r"^[).,\]]", prompt),
            f"{owner}: prompt would be hidden by the current question UI")
    base["prompt"] = prompt
    if kind == "mc":
        choices = row.get("choices")
        require(isinstance(choices, list) and len(choices) == 4, f"{owner}: exactly four choices required")
        for choice in choices:
            text(choice, owner, "choice")
            require(bool(normalized(choice)), f"{owner}: choice must contain letters or numbers")
        require(len({normalized(choice) for choice in choices}) == 4,
                f"{owner}: duplicate/equivalent choices")
        answer = row.get("answer")
        require(type(answer) is int and 0 <= answer < 4, f"{owner}: one answer index from 0 to 3 required")
        reasons = row.get("choiceExplanations")
        require(isinstance(reasons, list) and len(reasons) == 4,
                f"{owner}: four choiceExplanations required for single-answer review")
        for reason in reasons:
            text(reason, owner, "choiceExplanations")
        return "questions", {**base, "type": "mc", "stem": "교재 기반 자체 제작 연습문항",
                             "choices": choices, "answer": answer, "choiceExplanations": reasons}, None
    if kind == "short":
        answer = text(row.get("answer"), owner, "answer")
        accepted = row.get("acceptedAnswers", [])
        require(isinstance(accepted, list), f"{owner}: acceptedAnswers must be an array")
        for alias in accepted:
            text(alias, owner, "acceptedAnswers")
        return "questions", {**base, "type": "blank", "stem": "답을 쓰시오.", "choices": None,
                             "answer": answer, "match": "aliases", "acceptedAnswers": accepted}, None

    title = text(row.get("title"), owner, "title")
    model_answer = text(row.get("answer"), owner, "answer (model answer)")
    rubric = rubric_for(row, notes)
    require(any(e["page"] == page for r in rubric for e in r["evidence"]),
            f"{owner}: primary source must support a rubric criterion")
    public = {"id": owner, "title": title, "prompt": prompt, "page": page}
    private = {**public, "answer": model_answer, "explain": explain, "evidence": evidence,
               "rubric": rubric, "rubricVersion": VERSION, "provenance": provenance}
    return "essays", public, private


def bank_paths(root, subject):
    folder = root / "public/data/subjects" / subject
    return {name: folder / f"{name}.json" for name in ("questions", "blanks", "essays")} | {
        "private": root / "functions/_data/subjects" / subject / "essays.json"}


def prepare_subject(root, subject, document, *, allow_partial=False, baseline_outputs=None):
    require(subject in SUBJECTS, f"unsupported subject {subject!r}")
    require(isinstance(document, dict) and type(document.get("schemaVersion")) is int and document["schemaVersion"] == 1,
            f"{subject}: schemaVersion 1 required")
    require(document.get("subject") == subject, f"{subject}: input subject mismatch")
    rows = document.get("questions")
    require(isinstance(rows, list), f"{subject}: questions must be an array")
    require(0 < len(rows) <= REQUIRED_COUNT if allow_partial else len(rows) == REQUIRED_COUNT,
            f"{subject}: requires exactly {REQUIRED_COUNT} additional questions (got {len(rows)})")
    notes_list = read_json(root / "public/data/subjects" / subject / "notes.json")
    notes = {note["id"]: note for note in notes_list}
    require(len(notes) == len(notes_list), f"{subject}: duplicate source ids")
    require(all(note.get("subject") == subject for note in notes.values()), f"{subject}: source subject mismatch")
    paths = bank_paths(root, subject)
    current = {name: baseline_outputs[path] if baseline_outputs is not None else read_json(path)
               for name, path in paths.items()}
    for name, items in current.items():
        require(isinstance(items, list), f"{subject}: {name} bank must be an array")
    prefix = subject + "-ext-"
    baseline = {name: [row for row in items if not row["id"].startswith(prefix)]
                for name, items in current.items()}
    public_private = [{key: essay[key] for key in ("id", "title", "prompt", "page")}
                      for essay in baseline["private"]]
    require(baseline["essays"] == public_private, f"{subject}: existing public/private essays disagree")
    existing_ids, prompts = set(), {}
    for name in ("questions", "blanks", "essays"):
        for row in baseline[name]:
            require(row["id"] not in existing_ids, f"{subject}: duplicate existing id {row['id']}")
            existing_ids.add(row["id"])
            prompts.setdefault(normalized(row["prompt"]), row["id"])
    outputs = {name: list(items) for name, items in baseline.items()}
    counts, skills, source_counts = Counter(), Counter(), Counter()
    quote_tasks = defaultdict(list)
    for row in rows:
        name, public, private = convert_question(row, subject, notes)
        owner = public["id"]
        require(owner not in existing_ids, f"{owner}: duplicate question id")
        existing_ids.add(owner)
        fingerprint = normalized(public["prompt"])
        require(bool(fingerprint), f"{owner}: prompt must contain letters or numbers")
        require(fingerprint not in prompts, f"{owner}: duplicate question prompt of {prompts.get(fingerprint)}")
        prompts[fingerprint] = owner
        outputs[name].append(public)
        if private:
            outputs["private"].append(private)
        counts[row["type"]] += 1
        skills[row["skill"]] += 1
        for page in {e["page"] for e in row["evidence"]}:
            source_counts[page] += 1
        ev = row["evidence"][0]
        answer = row["choices"][row["answer"]] if row["type"] == "mc" else row["answer"]
        quote_tasks[(ev["page"], ev["quote"], normalized(answer))].append((owner, row["type"]))
    if not allow_partial:
        require(all(counts[kind] for kind in TYPES), f"{subject}: include all four question types")
    # Three versions of the same answer in the same source sentence are the old
    # starter generator's pattern, not three independently authored tasks.
    for same_task in quote_tasks.values():
        require(len({kind for _, kind in same_task}) < 3,
                f"{subject}: same quote/answer recycled across three types: {[key for key, _ in same_task]}")
    report = {"subject": subject, "added": len(rows), "types": dict(counts), "skills": dict(skills),
              "sourcePages": len(source_counts), "sourceQuestionCounts": dict(sorted(source_counts.items())),
              "existingPreserved": sum(len(baseline[k]) for k in ("questions", "blanks", "essays")),
              "total": sum(len(outputs[k]) for k in ("questions", "blanks", "essays"))}
    return {paths[name]: values for name, values in outputs.items()}, report


def expand_generated(subject, root, starter_outputs):
    """Optional generate.py hook: starter fixtures without authored input stay identical."""
    input_path = root / "tools/history-questions/extended-inputs" / f"{subject}.json"
    if not input_path.exists():
        return starter_outputs
    expanded, _ = prepare_subject(root, subject, read_json(input_path), baseline_outputs=starter_outputs)
    return {**starter_outputs, **expanded}


def prepare(root, input_dir, subjects=SUBJECTS, *, allow_partial=False):
    require(len(set(subjects)) == len(subjects), "duplicate --subject")
    outputs, reports = {}, []
    manifest_path = root / "public/data/subjects.json"
    manifest = read_json(manifest_path)
    for subject in subjects:
        subject_outputs, report = prepare_subject(root, subject, read_json(input_dir / f"{subject}.json"),
                                                  allow_partial=allow_partial)
        outputs.update(subject_outputs)
        reports.append(report)
        matches = [entry for entry in manifest if entry["id"] == subject]
        require(len(matches) == 1, f"{subject}: manifest entry missing or duplicated")
        paths = bank_paths(root, subject)
        for name in ("questions", "blanks", "essays"):
            matches[0]["counts"][name] = len(subject_outputs[paths[name]])
    outputs[manifest_path] = manifest
    return outputs, reports


def save(outputs, *, check=False):
    serialized = {path: encoded(data) for path, data in outputs.items()}
    if check:
        for path, content in serialized.items():
            require(path.exists() and path.read_text(encoding="utf-8") == content,
                    f"Expanded bank differs: {path}. Run expansion.py after reviewing inputs.")
        return
    # Stage every file before replacing destinations. Validation and serialization
    # errors therefore cannot leave a partially expanded bank.
    staged = []
    try:
        for path, content in serialized.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                             prefix=".expansion-", delete=False) as handle:
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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Validate and compare committed output without writing")
    mode.add_argument("--validate-only", action="store_true", help="Validate inputs without comparing or writing banks")
    parser.add_argument("--allow-partial", action="store_true", help="Allow 1–300 draft questions; only with --validate-only")
    args = parser.parse_args()
    require(not args.allow_partial or args.validate_only, "--allow-partial requires --validate-only")
    input_dir = args.input_dir or args.root / "tools/history-questions/extended-inputs"
    outputs, reports = prepare(args.root, input_dir, args.subject or SUBJECTS, allow_partial=args.allow_partial)
    if not args.validate_only:
        save(outputs, check=args.check)
    print(encoded({"version": VERSION, "validatedOnly": args.validate_only, "subjects": reports}), end="")


if __name__ == "__main__":
    main()
