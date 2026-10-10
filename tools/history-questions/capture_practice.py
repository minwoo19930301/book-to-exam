#!/usr/bin/env python3
"""Compile questions from visually compared capture excerpts, without rewriting OCR.

This validates traceability and structure, not whether a human or model read the
pixels correctly. The authored input records a partial excerpt review only.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
from expansion import ROOT, normalized, read_json, require, save, text
from shorts import graded
from source_cloze import blank_exact

SUBJECTS = ('hand-memo', 'seoyangsa', 'hanguksa', 'dongyangsa', 'gyoyukron')
VERSION = 'history-capture-practice.1'
ORIGIN = 'authored-capture-practice'
STATUS = 'capture-compared-excerpt'

def folder_for(root, subject):
    return root / 'public/data' if subject == 'hand-memo' else root / 'public/data/subjects' / subject

def capture_inventory(root, notes):
    manifest = read_json(root / 'public/data/source-pages.json')['pages']
    result = {}
    for page, note in notes.items():
        captures = manifest.get(page, {}).get('captures', [])
        if note.get('img'):
            src = '/pages/' + note['img']
            captures = [dict(src=src, sha256=sha256((root / 'public' / src.lstrip('/')).read_bytes()).hexdigest())]
        result[page] = {c['src']: c['sha256'] for c in captures}
    return result

def prepare_subject(root, subject, document, *, baseline_outputs=None, require_complete=True):
    require(subject in SUBJECTS, f'unsupported subject {subject}')
    require(document.get('schemaVersion') == 1 and document.get('subject') == subject, f'{subject}: invalid capture input')
    folder = folder_for(root, subject)
    notes = {n['id']: n for n in read_json(folder / 'notes.json')}
    inventory = capture_inventory(root, notes)
    targets = set(read_json(root / 'tools/history-questions/capture-targets.json')['subjects'][subject])
    reviews, verified_files = {}, {}

    def capture(owner, entry, page):
        require(isinstance(entry, dict), f'{owner}: invalid capture')
        src, digest = entry.get('src'), entry.get('sha256')
        require(src in inventory.get(page, {}), f'{owner}: capture does not belong to {page}')
        require(digest == inventory[page][src], f'{owner}: capture manifest hash differs')
        if src not in verified_files:
            path = root / 'public' / src.lstrip('/')
            require(path.is_file(), f'{owner}: missing capture asset')
            verified_files[src] = sha256(path.read_bytes()).hexdigest()
        require(verified_files[src] == digest, f'{owner}: capture bytes have changed')
        return dict(src=src, sha256=digest)

    entries = document.get('reviews')
    require(isinstance(entries, list), f'{subject}: reviews required')
    for entry in entries:
        page = entry.get('page')
        require(page in notes and page in targets and page not in reviews, f'{subject}: invalid/duplicate review {page}')
        status = entry.get('status')
        require(status in ('content', 'non-content', 'duplicate', 'unreadable', 'capture-mismatch'), f'{page}: invalid review status')
        caps = entry.get('captures')
        require(isinstance(caps, list) and caps, f'{page}: captures required')
        caps = [capture(page, c, page) for c in caps]
        require(len({c['src'] for c in caps}) == len(caps), f'{page}: duplicate capture')
        summary = text(entry.get('summary'), page, 'summary')
        item = dict(status=status, summary=summary, captures=caps, excerpts=[])
        if status != 'content': item['reason'] = text(entry.get('reason'), page, 'reason')
        if status == 'duplicate':
            other = entry.get('duplicateOf')
            require(other in notes and other != page, f'{page}: duplicate target required')
            item['duplicateOf'] = other
        reviews[page] = item
    if require_complete:
        require(set(reviews) == targets, f'{subject}: unreviewed captures: {sorted(targets - set(reviews))}')

    paths = {name: folder / f'{name}.json' for name in ('questions', 'blanks', 'essays')}
    prefix = f'{subject}-capture-practice-'
    banks = {name: [q for q in (baseline_outputs[path] if baseline_outputs and path in baseline_outputs else read_json(path))
                   if not q['id'].startswith(prefix)] for name, path in paths.items()}
    previous = [q for bank in banks.values() for q in bank]
    ids = {q['id'] for q in previous}
    prompts = {normalized(q['prompt']): q['id'] for q in previous}
    tasks, added = {}, Counter()
    rows = document.get('questions')
    require(isinstance(rows, list), f'{subject}: questions required')
    for row in rows:
        owner = text(row.get('id'), subject, 'id')
        require(bool(re.fullmatch(re.escape(prefix) + r'[a-z0-9]+(?:-[a-z0-9]+)*', owner)), f'{owner}: invalid ID')
        require(owner not in ids, f'{owner}: duplicate ID'); ids.add(owner)
        page = row.get('page')
        require(page in reviews and reviews[page]['status'] in ('content', 'unreadable', 'capture-mismatch'), f'{owner}: no reviewed content source')
        kind = row.get('kind'); require(kind in ('short', 'cloze'), f'{owner}: unsupported kind')
        prompt = text(row.get('prompt'), owner, 'prompt').strip()
        require(len(prompt) >= 16, f'{owner}: insufficient question context')
        fingerprint = normalized(prompt)
        require(fingerprint not in prompts, f'{owner}: duplicate prompt of {prompts.get(fingerprint)}'); prompts[fingerprint] = owner
        answer = text(row.get('answer'), owner, 'answer').strip()
        require(1 < len(answer) <= 60 and '\n' not in answer, f'{owner}: answer must be one precise concept')
        aliases = row.get('acceptedAnswers', [])
        require(isinstance(aliases, list), f'{owner}: aliases required')
        forms = set(); normalizer = graded if kind == 'short' else blank_exact
        for value in [answer, *aliases]:
            text(value, owner, 'answer/alias')
            require(normalizer(value) not in forms, f'{owner}: equivalent duplicate alias'); forms.add(normalizer(value))
            require(normalized(value) not in fingerprint, f'{owner}: answer/alias revealed in prompt')
        ev = row.get('evidence'); ce = row.get('captureEvidence')
        require(isinstance(ev, list) and ev and isinstance(ce, list) and ce, f'{owner}: capture evidence required')
        checked = []
        for e in ce:
            c = capture(owner, e, page)
            require(c in reviews[page]['captures'], f'{owner}: capture was not reviewed')
            c.update(quote=text(e.get('quote'), owner, 'capture quote'), location=text(e.get('location'), owner, 'capture location'))
            quote_kind = e.get('quoteKind', 'excerpt')
            require(quote_kind in ('excerpt', 'label'), f'{owner}: invalid quote kind')
            if quote_kind == 'label': c['quoteKind'] = quote_kind
            require(len(c['quote'].strip()) >= (2 if quote_kind == 'label' else 4) and '**' not in c['quote'], f'{owner}: insufficient or marked-up capture quote')
            checked.append(c)
        for e in ev:
            require(e.get('page') == page, f'{owner}: evidence must support primary page')
            quote = text(e.get('quote'), owner, 'quote')
            require(any(quote == c['quote'] for c in checked), f'{owner}: evidence differs from compared excerpt')
        require({e['quote'] for e in ev} == {c['quote'] for c in checked}, f'{owner}: unused capture excerpt')
        key = (page, normalized(answer), tuple(e['quote'] for e in ev))
        require(key not in tasks, f'{owner}: repeated task of {tasks.get(key)}'); tasks[key] = owner
        explain = text(row.get('explain'), owner, 'explain'); topic = text(row.get('topic'), owner, 'topic')
        item = dict(id=owner, type='blank', page=page, answer=answer, match='aliases', acceptedAnswers=aliases,
                    prompt=prompt, keyword=topic, explain=explain, evidence=ev, captureEvidence=checked,
                    provenance=dict(origin=ORIGIN, version=VERSION, sourceStatus=STATUS, topic=topic,
                      inputSha256=sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode()).hexdigest()))
        if row.get('corroboration'):
            links = row['corroboration']
            require(isinstance(links, list) and all(isinstance(link, dict) and
                    isinstance(link.get('url'), str) and link['url'].startswith('https://') and
                    isinstance(link.get('title'), str) and link['title'].strip() for link in links), f'{owner}: invalid corroborating sources')
            item['corroboration'] = links
        if kind == 'cloze':
            passage = text(row.get('passage'), owner, 'passage')
            require(passage.count(answer) == 1 and any(passage in c['quote'] for c in checked), f'{owner}: cloze must mask one capture-attested answer')
            require('_____' not in passage and '**' not in passage, f'{owner}: invalid passage markup')
            before, after = passage.split(answer, 1)
            require(prompt == before + '_____' + after, f'{owner}: cloze reconstruction differs')
            item.update(stem='원본 캡처 발췌문의 빈칸에 들어갈 개념을 쓰시오.', before=before, after=after, passage=passage, passageMode='full')
            banks['blanks'].append(item)
        else:
            require('_____' not in prompt, f'{owner}: short answer needs an authored question')
            item.update(stem='원본 캡처를 바탕으로 개념을 쓰시오.', choices=None, contextMode='source-excerpt')
            banks['questions'].append(item)
        for c in checked:
            excerpts = reviews[page]['excerpts']
            existing = next((e for e in excerpts if all(e[k] == c[k] for k in ('src', 'sha256', 'quote', 'location'))), None)
            if existing: existing['questionIds'].append(owner)
            else: excerpts.append({**c, 'questionIds': [owner]})
        added[kind] += 1
    counts = Counter(q.get('page') for bank in banks.values() for q in bank)
    for page, review in reviews.items():
        if review['status'] == 'content':
            require(3 <= counts[page] <= 4, f'{page}: reviewed content needs 3–4 questions, found {counts[page]}')
    return {paths['questions']: banks['questions'], paths['blanks']: banks['blanks']}, dict(
        subject=subject, reviewedPages=len(reviews), added=dict(added), reviews=reviews,
        totalQuestions=sum(len(bank) for bank in banks.values()), counts=counts)

def extend_generated(subject, root, outputs):
    path = root / 'tools/history-questions/capture-inputs' / f'{subject}.json'
    if not path.exists(): return outputs
    changed, _ = prepare_subject(root, subject, read_json(path), baseline_outputs=outputs)
    return {**outputs, **changed}

def update_report(report, capture_report):
    report['captureAdded'] = capture_report['added']
    report['captureReviewedPages'] = capture_report['reviewedPages']
    report['totalQuestions'] = capture_report['totalQuestions']
    for row in report['pages']:
        row['count'] = capture_report['counts'][row['page']]
        row['status'] = 'covered' if row['count'] >= 3 else 'exception'
        review = capture_report['reviews'].get(row['page'])
        if review:
            row['captureReview'] = review
            if row['count'] >= 3: row.pop('reason', None)
            else: row['reason'] = review['reason']
    report['coveredPages'] = sum(row['count'] >= 3 for row in report['pages'])
    report['exceptionPages'] = report['totalPages'] - report['coveredPages']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--subject', required=True, choices=SUBJECTS)
    parser.add_argument('--input', type=Path)
    parser.add_argument('--allow-partial', action='store_true')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    path = args.input or args.root / 'tools/history-questions/capture-inputs' / f'{args.subject}.json'
    outputs, report = prepare_subject(args.root, args.subject, read_json(path), require_complete=not args.allow_partial)
    if not args.validate_only:
        require(not args.allow_partial, 'partial reviews may only be validated, not published')
        save(outputs)
    print(json.dumps({k: v for k, v in report.items() if k not in ('reviews', 'counts')}, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
