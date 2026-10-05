#!/usr/bin/env python3
"""Generate the reviewed starter bank after tools/history-kb imports the sources.

No network, API key, LLM, or third-party Python package is required. Fail closed
when a source quote disappears: changed transcriptions require editorial review.
The generator never touches the existing handwritten-note data files.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from curated import ADDITIONAL_EVIDENCE, CONCEPTS, ESSAYS

ROOT = Path(__file__).resolve().parents[2]
SCORING = ('0점: 핵심 의미가 없거나 모순됨. 부분점수: 일부 핵심 의미만 충족. '
           '만점: 기준의 핵심 의미를 모두 충족. 동의 표현은 인정하되 근거 없는 '
           '주장에는 점수를 주지 않음.')
VERSION = '2026-10-03.starter.1'


def page_id(subject: str, anchor: str) -> str:
    return f'{subject}-textbook-{anchor}'


def generate(subject: str, root: Path, *, include_expansion: bool = True) -> dict[Path, list]:
    folder = root / 'public/data/subjects' / subject
    notes = json.loads((folder / 'notes.json').read_text(encoding='utf-8'))
    by_id = {note['id']: note for note in notes}

    def evidence(anchor: str, quote: str) -> dict:
        page = page_id(subject, anchor)
        if page not in by_id:
            raise ValueError(f'{subject}: missing note {page}')
        if not quote or quote not in by_id[page]['text']:
            raise ValueError(f'{subject}: unmatched source quote in {page}: {quote!r}')
        return {'page': page, 'quote': quote}

    facts, questions, blanks, private_essays, public_essays = [], [], [], [], []
    for index, seed in enumerate(CONCEPTS[subject]):
        ev = evidence(seed['page'], seed['quote'])
        evidence_list = [ev] + [evidence(seed['page'], quote) for quote in
                                ADDITIONAL_EVIDENCE.get(subject, {}).get(seed['key'], [])]
        page = ev['page']
        note = by_id[page]
        key = f"{subject}-{seed['key']}"
        if len(seed['distractors']) != 3:
            raise ValueError(f'{key}: exactly 3 authored distractors required')
        choices = list(seed['distractors'])
        answer_index = index % 4
        choices.insert(answer_index, seed['correct'])
        if len(set(choices)) != 4:
            raise ValueError(f'{key}: ambiguous duplicate choices')
        explain = f"{seed['correct']} 교재 근거: “{seed['quote']}”"
        provenance = {'origin': 'authored-practice', 'sourceStatus': 'transcription-unverified',
                      'version': VERSION}
        facts.append({'id': key, 'term': seed['term'], 'def': seed['definition'],
                      'page': page, 'title': note['title'], 'evidence': evidence_list})
        questions.append({'id': f'{key}-mc', 'type': 'mc',
                          'stem': '교재 기반 자체 제작 연습문항',
                          'keyword': seed['term'], 'prompt': seed['prompt'],
                          'choices': choices, 'answer': answer_index,
                          'explain': explain, 'page': page, 'evidence': evidence_list,
                          'provenance': provenance})
        questions.append({'id': f'{key}-short', 'type': 'blank',
                          'stem': '설명에 해당하는 용어를 쓰시오.',
                          'keyword': seed['term'],
                          'prompt': f"{seed['definition']} → 해당 용어는?",
                          'choices': None, 'answer': seed['term'],
                          'match': 'aliases', 'acceptedAnswers': seed['accept'], 'page': page,
                          'explain': f"{seed['term']}: {seed['definition']} 교재 근거: “{seed['quote']}”",
                          'evidence': evidence_list, 'provenance': provenance})

        blank_ev = evidence(seed['page'], seed['blank_quote'])
        if seed['blank_quote'].count(seed['blank_answer']) != 1:
            raise ValueError(f'{key}: passage must contain the blank answer exactly once')
        before, after = seed['blank_quote'].split(seed['blank_answer'], 1)
        blanks.append({'id': f'{key}-passage', 'type': 'blank', 'page': page,
                       'prompt': before + '_____' + after, 'before': before, 'after': after,
                       'answer': seed['blank_answer'], 'match': 'exact', 'keywordGroups': [],
                       'rejectPatterns': [], 'explain': f"{note['title']} — {seed['blank_quote']}",
                       'evidence': [blank_ev], 'provenance': provenance})

    for seed in ESSAYS[subject]:
        if len(seed['criteria']) != 3 or sum(c['max'] for c in seed['criteria']) != 10:
            raise ValueError(f"{subject}-{seed['key']}: requires 3 criteria totalling 10")
        rubric = []
        for index, criterion in enumerate(seed['criteria'], 1):
            quoted = [evidence(criterion['page'], criterion['quote'])]
            quoted.extend(evidence(page, quote) for page, quote in criterion.get('additional', []))
            rubric.append({'id': f'r{index}', 'label': criterion['label'],
                           'max': criterion['max'], 'ok': criterion['ok'],
                           'evidence': quoted, 'scoring': SCORING})
        public = {'id': f"{subject}-essay-{seed['key']}", 'title': seed['title'],
                  'prompt': seed['prompt'], 'page': rubric[0]['evidence'][0]['page']}
        public_essays.append(public)
        private_essays.append({**public, 'rubric': rubric, 'rubricVersion': VERSION})

    outputs = {folder / 'facts.json': facts, folder / 'questions.json': questions,
               folder / 'blanks.json': blanks, folder / 'essays.json': public_essays,
               root / 'functions/_data/subjects' / subject / 'essays.json': private_essays}
    if include_expansion:
        from expansion import expand_generated
        from shorts import extend_generated
        from source_cloze import extend_generated as extend_source_cloze
        from page_practice import extend_generated as extend_page_practice
        return extend_page_practice(subject, root, extend_source_cloze(subject, root, extend_generated(subject, root, expand_generated(subject, root, outputs))))
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--check', action='store_true', help='Validate sources and generated-file equality without writing.')
    args = parser.parse_args()
    outputs = {}
    # Validate every subject first, so a failed quote does not leave a half-updated bank.
    for subject in CONCEPTS:
        outputs.update(generate(subject, args.root))
    for path, data in outputs.items():
        text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            if not path.exists() or path.read_text(encoding='utf-8') != text:
                raise ValueError(f'Generated file differs: {path}. Run generate.py after reviewing changes.')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
    for subject in CONCEPTS:
        folder = args.root / 'public/data/subjects' / subject
        print(f"{subject}: {len(outputs[folder / 'facts.json'])} facts, "
              f"{len(outputs[folder / 'questions.json'])} questions, "
              f"{len(outputs[folder / 'blanks.json'])} passage blanks, "
              f"{len(outputs[folder / 'essays.json'])} essays; quotes verified")


if __name__ == '__main__':
    main()
