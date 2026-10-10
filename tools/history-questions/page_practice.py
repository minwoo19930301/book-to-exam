#!/usr/bin/env python3
"""Validate page-specific authored additions and publish an auditable coverage index.

Counts use primary page only. Front matter, duplicated scans and insufficient
sources must be explicitly recorded, not padded with repeated questions.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
from expansion import ROOT, exact_evidence, normalized, read_json, require, save, text
from shorts import graded
from source_cloze import blank_exact

SUBJECTS = ('hand-memo', 'seoyangsa', 'hanguksa', 'dongyangsa', 'gyoyukron')
VERSION = 'history-page-practice.1'

def folder_for(root, subject):
    return root / 'public/data' if subject == 'hand-memo' else root / 'public/data/subjects' / subject

def prepare_subject(root, subject, document, *, baseline_outputs=None, require_coverage=True):
    require(subject in SUBJECTS, f'unsupported subject {subject}')
    require(document.get('schemaVersion') == 1 and document.get('subject') == subject, f'{subject}: invalid document')
    rows = document.get('questions'); require(isinstance(rows, list), f'{subject}: questions required')
    folder = folder_for(root, subject)
    notes = {n['id']: n for n in read_json(folder / 'notes.json')}
    paths = {name: folder / f'{name}.json' for name in ('questions', 'blanks', 'essays')}
    prefix = f'{subject}-page-practice-'
    banks = {name: [q for q in (baseline_outputs[path] if baseline_outputs is not None else read_json(path))
                   if not q['id'].startswith(prefix)] for name, path in paths.items()}
    original = [q for bank in banks.values() for q in bank]
    ids = {q['id'] for q in original}
    prompts = {normalized(q['prompt']): q['id'] for q in original}
    tasks = {}
    added = Counter()
    for row in rows:
        owner = text(row.get('id'), subject, 'id')
        require(bool(re.fullmatch(re.escape(prefix) + r'[a-z0-9]+(?:-[a-z0-9]+)*', owner)), f'{owner}: invalid ID')
        require(owner not in ids, f'{owner}: duplicate ID'); ids.add(owner)
        page = row.get('page'); require(page in notes, f'{owner}: missing primary page')
        kind = row.get('kind'); require(kind in ('short', 'cloze'), f'{owner}: unsupported kind')
        prompt = text(row.get('prompt'), owner, 'prompt').strip()
        require(len(prompt) >= 16, f'{owner}: insufficient question context')
        fp = normalized(prompt)
        require(fp not in prompts, f'{owner}: duplicate prompt of {prompts.get(fp)}'); prompts[fp] = owner
        answer = text(row.get('answer'), owner, 'answer').strip()
        require(1 < len(answer) <= 60 and '\n' not in answer, f'{owner}: answer must be one precise concept')
        aliases = row.get('acceptedAnswers', [])
        require(isinstance(aliases, list), f'{owner}: aliases must be an array')
        forms = set(); normalizer = graded if kind == 'short' else blank_exact
        for value in [answer, *aliases]:
            text(value, owner, 'answer/alias')
            require(normalizer(value) not in forms, f'{owner}: equivalent duplicate alias')
            forms.add(normalizer(value))
            require(normalized(value) not in fp, f'{owner}: answer/alias revealed in prompt')
        ev = exact_evidence(owner, row.get('evidence'), notes)
        require(ev[0]['page'] == page and all(e['page'] == page for e in ev), f'{owner}: evidence must support the primary page')
        require(all(len(e['quote'].strip()) >= 8 for e in ev), f'{owner}: insufficient source context')
        task = (page, normalized(answer), tuple(e['quote'] for e in ev))
        require(task not in tasks, f'{owner}: duplicate task of {tasks.get(task)}'); tasks[task] = owner
        explain = text(row.get('explain'), owner, 'explain')
        topic = text(row.get('topic'), owner, 'topic')
        item = dict(id=owner, type='blank', page=page, answer=answer, match='aliases',
                    acceptedAnswers=aliases, prompt=prompt, keyword=topic, explain=explain, evidence=ev,
                    provenance=dict(origin='authored-page-practice', version=VERSION,
                      sourceStatus='transcription-unverified', topic=topic,
                      inputSha256=sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode()).hexdigest()))
        if kind == 'cloze':
            passage = text(row.get('passage'), owner, 'passage')
            require(passage in notes[page]['text'] and passage.count(answer) == 1, f'{owner}: cloze must mask exactly one source-attested answer')
            require('_____' not in passage and '**' not in passage, f'{owner}: invalid passage markup')
            before, after = passage.split(answer, 1)
            require(prompt == before + '_____' + after, f'{owner}: cloze reconstruction differs')
            require(any(passage in e['quote'] for e in ev), f'{owner}: cloze evidence must contain passage')
            item.update(stem='원문의 빈칸에 들어갈 개념을 쓰시오.', before=before, after=after, passage=passage, passageMode='full')
            banks['blanks'].append(item)
        else:
            require('_____' not in prompt, f'{owner}: short answer needs an authored question')
            item.update(stem='원문을 바탕으로 개념을 쓰시오.', choices=None)
            banks['questions'].append(item)
        added[kind] += 1
    exceptions = {}
    for entry in document.get('exclusions', []):
        page = entry.get('page'); require(page in notes and page not in exceptions, f'{subject}: invalid/duplicate exception {page}')
        exceptions[page] = text(entry.get('reason'), page, 'reason')
    counts = Counter(q.get('page') for bank in banks.values() for q in bank)
    page_rows = []
    for page, note in notes.items():
        if require_coverage:
            require(counts[page] >= 3 or page in exceptions, f'{page}: only {counts[page]} questions and no reviewed exception')
        page_rows.append(dict(page=page, title=note['title'], count=counts[page],
                              status='covered' if counts[page] >= 3 else 'exception',
                              **({'reason': exceptions[page]} if page in exceptions else {})))
    report = dict(subject=subject, totalPages=len(notes), coveredPages=sum(c['count'] >= 3 for c in page_rows),
                  exceptionPages=sum(c['count'] < 3 for c in page_rows), added=dict(added),
                  totalQuestions=sum(len(bank) for bank in banks.values()), pages=page_rows)
    return {paths['questions']: banks['questions'], paths['blanks']: banks['blanks']}, report

def extend_generated(subject, root, outputs):
    path = root / 'tools/history-questions/page-inputs' / f'{subject}.json'
    if not path.exists(): return outputs
    changed, _ = prepare_subject(root, subject, read_json(path), baseline_outputs=outputs)
    return {**outputs, **changed}

def prepare(root, subjects=SUBJECTS):
    outputs, reports = {}, []
    manifest_path = root / 'public/data/subjects.json'
    manifest = read_json(manifest_path)
    for subject in subjects:
        path = root / 'tools/history-questions/page-inputs' / f'{subject}.json'
        changed, report = prepare_subject(root, subject, read_json(path))
        capture_path = root / 'tools/history-questions/capture-inputs' / f'{subject}.json'
        if capture_path.exists():
            from capture_practice import prepare_subject as prepare_captures, update_report
            capture_changed, capture_report = prepare_captures(root, subject, read_json(capture_path), baseline_outputs=changed)
            changed.update(capture_changed)
            update_report(report, capture_report)
        outputs.update(changed); reports.append(report)
        entry = next(e for e in manifest if e['id'] == subject)
        folder = folder_for(root, subject)
        for kind in ('questions', 'blanks'):
            entry['counts'][kind] = len(changed[folder / f'{kind}.json'])
    outputs[manifest_path] = manifest
    coverage_path = root / 'public/data/page-practice-coverage.json'
    coverage = read_json(coverage_path) if coverage_path.exists() else {'version': VERSION, 'counting': 'primary-page', 'subjects': []}
    coverage['subjects'] = [r for r in coverage['subjects'] if r['subject'] not in subjects] + reports
    coverage['subjects'].sort(key=lambda r: SUBJECTS.index(r['subject']))
    outputs[coverage_path] = coverage
    return outputs, reports

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--subject', action='append', choices=SUBJECTS)
    p.add_argument('--check', action='store_true')
    p.add_argument('--validate-only', action='store_true')
    a = p.parse_args()
    outputs, reports = prepare(a.root, a.subject or SUBJECTS)
    if not a.validate_only: save(outputs, check=a.check)
    print(json.dumps([{k:v for k,v in r.items() if k != 'pages'} for r in reports], ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
