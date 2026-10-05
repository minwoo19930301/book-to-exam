#!/usr/bin/env python3
"""Render manually authored clue/answer seeds with exact, bounded source spans.

Each seed specifies its source page, unique starting text and number of complete
lines to cite, or an explicitly bounded exact quote to exclude adjacent errors.
This only assembles reviewed text; it does not invent questions.
Run with --subject to render one completed subject. Does not write public banks.
"""
import argparse,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def source_quote(note, selection, owner):
    if "quote" in selection:
        quote=selection["quote"]
        if not isinstance(quote,str) or not quote.strip() or quote not in note["text"]:
            raise ValueError(f"{owner}: explicit quote must match the source exactly")
        if "start" in selection or "lines" in selection:
            raise ValueError(f"{owner}: choose quote or start/lines, not both")
        return quote
    lines=note["text"].splitlines()
    count=selection.get("lines")
    if type(count) is not int or count<1:
        raise ValueError(f"{owner}: positive lines count required")
    hits=[j for j,line in enumerate(lines) if selection["start"] in line]
    if len(hits)!=1:raise ValueError(f"{owner}: expected unique span {selection}: {hits}")
    j=hits[0]
    if j+count>len(lines):raise ValueError(f"{owner}: source span extends beyond note")
    quote="\n".join(lines[j:j+count])
    if quote not in note["text"]:raise ValueError(f"{owner}: nonverbatim source span")
    return quote

def render(subject):
    notes={n['id']:n for n in json.loads((ROOT/f'public/data/subjects/{subject}/notes.json').read_text())}
    rows=[]
    path=ROOT/f'tools/history-questions/short-seeds/{subject}.json'
    seeds=json.loads(path.read_text())
    for i,seed in enumerate(seeds,1):
        evidence=[]
        for selection in seed['sources']:
            page=f"{subject}-textbook-page-{selection['page']}";n=notes[page]
            quote=source_quote(n,selection,f'{subject} #{i}')
            evidence.append(dict(page=page,quote=quote))
        rows.append(dict(id=f'{subject}-short150-{i:03}',type='short',skill=seed.get('skill','fact'),
            era=seed['era'],topic=seed.get('topic',seed['era']),prompt=seed['prompt'],answer=seed['answer'],
            acceptedAnswers=seed.get('acceptedAnswers',[]),explain=seed['explain'],evidence=evidence))
    out=ROOT/f'tools/history-questions/short-inputs/{subject}.json';out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(dict(schemaVersion=1,subject=subject,questions=rows),ensure_ascii=False,indent=2)+'\n')
    print(subject,len(rows))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--subject',action='append',required=True);a=p.parse_args()
    for subject in a.subject:render(subject)
