#!/usr/bin/env python3
"""Import reviewed, complete 사료탐구 excerpts as one-concept cloze questions.

Only <subject>-source-cloze-* rows are replaced. Existing cloze questions and
all other banks are preserved. Source text is never rewritten by this importer.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
from expansion import ROOT, SUBJECTS, exact_evidence, normalized, read_json, require, save, text

VERSION = 'history-source-cloze.1'
MINIMUMS = {'seoyangsa': 80, 'hanguksa': 80, 'dongyangsa': 80, 'gyoyukron': 0}
SOURCE_MARKER = re.compile(r'[\[【〈<]사료\s*탐구[\]】〉>]')


def blank_exact(value):
    value = unicodedata.normalize('NFKC', value.replace('**', ''))
    return re.sub(r'[.。]+$', '', re.sub(r'[\s·ㆍ・,，]', '', value)).lower()


def locate_source(note, passage, heading, owner):
    """Require a unique, verbatim excerpt under the claimed source-box marker."""
    body = note['text']
    require(body.count(passage) == 1, f'{owner}: passage must occur exactly once in source')
    start = body.index(passage)
    markers = list(SOURCE_MARKER.finditer(body, 0, start + 1))
    require(markers, f'{owner}: passage must follow a 사료탐구 marker')
    marker = markers[-1]
    line_end = body.find('\n', marker.start())
    marker_line = body[marker.start():line_end if line_end >= 0 else len(body)].strip()
    require(marker_line == heading.strip(), f'{owner}: sectionHeading must match the closest source marker line')
    require(not SOURCE_MARKER.search(passage), f'{owner}: exclude source-box heading from the passage')
    return {'start': start, 'end': start + len(passage), 'sectionStart': marker.start()}


def prepare_subject(root, subject, document, *, allow_partial=False, baseline_outputs=None):
    require(subject in SUBJECTS, f'unsupported subject {subject}')
    require(isinstance(document, dict) and type(document.get('schemaVersion')) is int and document['schemaVersion'] == 1,
            f'{subject}: schemaVersion 1 required')
    require(document.get('subject') == subject, f'{subject}: input subject mismatch')
    rows = document.get('questions')
    require(isinstance(rows, list), f'{subject}: questions array required')
    if not allow_partial:
        require(len(rows) >= MINIMUMS[subject], f'{subject}: at least {MINIMUMS[subject]} reviewed excerpts required')
    if subject == 'gyoyukron':
        require(len(rows) <= 40, 'gyoyukron: at most 40 suitable excerpts; do not pad the count')
    folder = root / 'public/data/subjects' / subject
    notes_list = read_json(folder / 'notes.json')
    notes = {n['id']: n for n in notes_list}
    require(len(notes) == len(notes_list) and all(n.get('subject') == subject for n in notes.values()),
            f'{subject}: invalid source IDs or subject')
    paths = {name: folder / f'{name}.json' for name in ('questions', 'blanks', 'essays')}
    banks = {name: baseline_outputs[path] if baseline_outputs is not None else read_json(path)
             for name, path in paths.items()}
    prefix = f'{subject}-source-cloze-'
    existing = [q for q in banks['blanks'] if not q['id'].startswith(prefix)]
    others = banks['questions'] + banks['essays'] + existing
    ids = {q['id'] for q in others}
    prompts = {normalized(q['prompt']): q['id'] for q in others}
    tasks = set()
    added, pages, eras = [], set(), Counter()
    for row in rows:
        require(isinstance(row, dict), f'{subject}: question object required')
        owner = text(row.get('id'), subject, 'id')
        require(bool(re.fullmatch(re.escape(prefix) + r'[a-z0-9]+(?:-[a-z0-9]+)*', owner)), f'{owner}: invalid source-cloze ID')
        require(owner not in ids, f'{owner}: duplicate ID'); ids.add(owner)
        page = text(row.get('page'), owner, 'page')
        require(page in notes and page.startswith(subject + '-'), f'{owner}: wrong-subject or missing source')
        passage = text(row.get('passage'), owner, 'passage')
        require(len(passage.strip()) >= 60, f'{owner}: excerpt too short to provide source context')
        require('_____' not in passage and '**' not in passage, f'{owner}: passage must be plain source text without blank/emphasis markers')
        heading = text(row.get('sectionHeading'), owner, 'sectionHeading')
        span = locate_source(notes[page], passage, heading, owner)
        evidence = exact_evidence(owner, [{'page': page, 'quote': passage}], notes)
        require(row.get('reviewed') is True, f'{owner}: manual passage/answer review required')
        answer = text(row.get('answer'), owner, 'answer').strip()
        require(1 < len(answer) <= 40 and '\n' not in answer and not re.search(r'[.!?。！？]', answer)
                and not answer.isdigit(), f'{owner}: answer must be one exact concept, not a sentence/date')
        require(passage.count(answer) == 1, f'{owner}: answer must occur exactly once in passage')
        before, after = passage.split(answer, 1)
        prompt = before + '_____' + after
        fingerprint = normalized(prompt)
        require(fingerprint not in prompts, f'{owner}: duplicate prompt of {prompts.get(fingerprint)}')
        prompts[fingerprint] = owner
        aliases = row.get('acceptedAnswers', [])
        require(isinstance(aliases, list), f'{owner}: aliases must be an array')
        seen = set()
        for allowed in [answer, *aliases]:
            text(allowed, owner, 'acceptedAnswers')
            require(blank_exact(allowed) not in seen, f'{owner}: equivalent duplicate alias')
            seen.add(blank_exact(allowed))
            require(normalized(allowed) not in fingerprint, f'{owner}: answer/alias revealed in unmasked passage')
        task = (page, normalized(answer), normalized(passage))
        require(task not in tasks, f'{owner}: same passage and concept recycled'); tasks.add(task)
        # A larger source box does not make an already-used sentence a new task.
        concept_forms = {normalized(value) for value in [answer, *aliases]}
        for old in existing + added:
            old_forms = {normalized(str(value)) for value in [old.get('answer', ''), *old.get('acceptedAnswers', [])]}
            if old.get('page') != page or not concept_forms.intersection(old_forms):
                continue
            old_passage = old.get('passage') or (old.get('before', '') + str(old.get('answer', '')) + old.get('after', ''))
            if len(old_passage.strip()) >= 20:
                a, b = normalized(old_passage), normalized(passage)
                require(a not in b and b not in a, f'{owner}: source task overlaps existing {old["id"]}')
        era = text(row.get('era'), owner, 'era')
        explain = text(row.get('explain'), owner, 'explain')
        pages.add(page); eras[era] += 1
        added.append(dict(id=owner, type='blank', stem='사료의 빈칸에 들어갈 정확한 용어를 쓰시오.',
            contextMode='source-excerpt', passage=passage, before=before, after=after, prompt=prompt,
            keyword=era, answer=answer, match='aliases', acceptedAnswers=aliases, page=page,
            evidence=evidence, explain=explain, provenance=dict(origin='authored-source-cloze', version=VERSION,
                sourceStatus='transcription-unverified', sectionHeading=heading, sourceSpan=span,
                era=era, reviewed=True,
                inputSha256=sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode()).hexdigest())))
    return {paths['blanks']: existing + added}, dict(subject=subject, added=len(added),
        preservedBlanks=len(existing), total=len(existing)+len(added), sourcePages=len(pages), eras=dict(eras))


def extend_generated(subject, root, outputs):
    """Call after expansion and short additions; absent input leaves fixtures intact."""
    path = root / 'tools/history-questions/source-cloze-inputs' / f'{subject}.json'
    if not path.exists(): return outputs
    changed, _ = prepare_subject(root, subject, read_json(path), baseline_outputs=outputs)
    return {**outputs, **changed}


def prepare(root, input_dir, subjects, *, allow_partial=False):
    require(len(set(subjects)) == len(subjects), 'duplicate --subject')
    manifest_path = root / 'public/data/subjects.json'
    manifest = read_json(manifest_path)
    outputs, reports = {}, []
    for subject in subjects:
        changed, report = prepare_subject(root, subject, read_json(input_dir / f'{subject}.json'), allow_partial=allow_partial)
        outputs.update(changed); reports.append(report)
        entries = [m for m in manifest if m['id'] == subject]
        require(len(entries) == 1, f'{subject}: manifest missing or duplicated')
        entries[0]['counts']['blanks'] = report['total']
    outputs[manifest_path] = manifest
    return outputs, reports


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--input-dir', type=Path)
    p.add_argument('--subject', action='append', choices=SUBJECTS, required=True)
    mode = p.add_mutually_exclusive_group(); mode.add_argument('--validate-only', action='store_true'); mode.add_argument('--check', action='store_true')
    p.add_argument('--allow-partial', action='store_true')
    a = p.parse_args(); require(not a.allow_partial or a.validate_only, '--allow-partial requires --validate-only')
    outputs, reports = prepare(a.root, a.input_dir or a.root/'tools/history-questions/source-cloze-inputs', a.subject, allow_partial=a.allow_partial)
    if not a.validate_only: save(outputs, check=a.check)
    print(json.dumps(dict(version=VERSION, validatedOnly=a.validate_only, subjects=reports), ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
