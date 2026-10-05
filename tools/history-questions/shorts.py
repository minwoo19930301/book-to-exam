#!/usr/bin/env python3
"""Validate 150 independently authored short-answer additions per subject.

Only <subject>-short150- rows in questions.json are replaced. Other question
kinds, passage blanks, essays, notes and handwritten material are not written.
Exact source checks supplement, rather than replace, editorial review.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
from expansion import SUBJECTS, SKILLS, ROOT, exact_evidence, normalized, read_json, require, save, text

REQUIRED_COUNT = 150
VERSION = 'history-short150.1'

def graded(value):
    # Short.jsx sends type='short', so this mirrors scoring.exact (not blankExact).
    return re.sub(r'\s+', '', unicodedata.normalize('NFC', value.replace('**', '')))

def prepare_subject(root, subject, document, *, allow_partial=False, baseline_outputs=None):
    require(subject in SUBJECTS, f'unsupported subject {subject}')
    require(isinstance(document, dict) and type(document.get('schemaVersion')) is int and document['schemaVersion']==1, 'schemaVersion 1 required')
    require(document.get('subject')==subject, f'{subject}: input subject mismatch')
    rows=document.get('questions')
    require(isinstance(rows,list), f'{subject}: questions array required')
    require(0<len(rows)<=REQUIRED_COUNT if allow_partial else len(rows)==REQUIRED_COUNT,
            f'{subject}: exactly {REQUIRED_COUNT} short questions required (got {len(rows)})')
    folder=root/'public/data/subjects'/subject
    notes_list=read_json(folder/'notes.json'); notes={n['id']:n for n in notes_list}
    require(len(notes)==len(notes_list) and all(n.get('subject')==subject for n in notes.values()), f'{subject}: invalid source IDs/subject')
    paths={name:folder/f'{name}.json' for name in ('questions','blanks','essays')}
    banks={name:baseline_outputs[path] if baseline_outputs is not None else read_json(path) for name,path in paths.items()}
    prefix=f'{subject}-short150-'
    existing=[q for q in banks['questions'] if not q['id'].startswith(prefix)]
    others=existing+banks['blanks']+banks['essays']
    ids={q['id'] for q in others}; prompts={normalized(q['prompt']):q['id'] for q in others}
    added=[]; eras=Counter(); skills=Counter(); pages=set(); duplicate_tasks=set()
    for row in rows:
        require(isinstance(row,dict), f'{subject}: question object required')
        owner=text(row.get('id'),subject,'id')
        require(bool(re.fullmatch(re.escape(prefix)+r'[a-z0-9]+(?:-[a-z0-9]+)*',owner)), f'{owner}: invalid short150 ID')
        require(owner not in ids, f'{owner}: duplicate ID'); ids.add(owner)
        require(row.get('type')=='short', f'{owner}: only short questions allowed')
        skill=row.get('skill'); require(skill in SKILLS,f'{owner}: unsupported skill')
        era=text(row.get('era'),owner,'era'); topic=text(row.get('topic'),owner,'topic')
        prompt=text(row.get('prompt'),owner,'prompt').strip()
        require(len(prompt)>=20 and '_____' not in prompt,f'{owner}: standalone clue-based prompt required')
        fingerprint=normalized(prompt)
        require(fingerprint not in prompts,f'{owner}: duplicate prompt of {prompts.get(fingerprint)}'); prompts[fingerprint]=owner
        answer=text(row.get('answer'),owner,'answer').strip()
        require(1<len(answer)<=50,f'{owner}: answer must be one precise term, 2–50 characters')
        require(normalized(answer) not in fingerprint,f'{owner}: answer revealed in prompt')
        aliases=row.get('acceptedAnswers',[])
        require(isinstance(aliases,list),f'{owner}: aliases must be an array')
        seen={graded(answer)}
        for alias in aliases:
            text(alias,owner,'acceptedAnswers')
            require(graded(alias) not in seen,f'{owner}: duplicate alias');seen.add(graded(alias))
            require(normalized(alias) not in fingerprint,f'{owner}: alias revealed in prompt')
        evidence=exact_evidence(owner,row.get('evidence'),notes)
        require(all(len(e['quote'].strip())>=8 for e in evidence),f'{owner}: evidence too short')
        explain=text(row.get('explain'),owner,'explain')
        task=(normalized(answer),tuple(sorted((e['page'],e['quote']) for e in evidence)))
        require(task not in duplicate_tasks,f'{owner}: same answer and evidence recycled');duplicate_tasks.add(task)
        eras[era]+=1;skills[skill]+=1;pages.update(e['page'] for e in evidence)
        added.append(dict(id=owner,type='blank',stem='원문 근거로 답을 쓰시오.',keyword=topic,prompt=prompt,
            choices=None,answer=answer,match='aliases',acceptedAnswers=aliases,explain=explain,
            page=evidence[0]['page'],evidence=evidence,provenance=dict(origin='authored-short-practice',version=VERSION,
            sourceStatus='transcription-unverified',skill=skill,era=era,topic=topic,
            inputSha256=sha256(json.dumps(row,ensure_ascii=False,sort_keys=True).encode()).hexdigest())))
    return {paths['questions']:existing+added},dict(subject=subject,added=len(added),shortTotal=sum(q['type']=='blank' for q in existing)+len(added),
        sourcePages=len(pages),eras=dict(eras),skills=dict(skills),preservedQuestions=len(existing))

def extend_generated(subject, root, outputs):
    path=root/'tools/history-questions/short-inputs'/f'{subject}.json'
    if not path.exists(): return outputs
    added,_=prepare_subject(root,subject,read_json(path),baseline_outputs=outputs)
    return {**outputs,**added}

def prepare(root,input_dir,subjects=SUBJECTS,*,allow_partial=False):
    require(len(set(subjects))==len(subjects),'duplicate --subject')
    outputs={};reports=[];manifest_path=root/'public/data/subjects.json';manifest=read_json(manifest_path)
    for subject in subjects:
        changed,report=prepare_subject(root,subject,read_json(input_dir/f'{subject}.json'),allow_partial=allow_partial)
        outputs.update(changed);reports.append(report)
        entries=[e for e in manifest if e['id']==subject]
        require(len(entries)==1,f'{subject}: manifest entry missing/duplicated')
        entries[0]['counts']['questions']=len(next(iter(changed.values())))
    outputs[manifest_path]=manifest
    return outputs,reports

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--input-dir',type=Path);parser.add_argument('--subject',action='append',choices=SUBJECTS)
    mode=parser.add_mutually_exclusive_group();mode.add_argument('--validate-only',action='store_true');mode.add_argument('--check',action='store_true')
    parser.add_argument('--allow-partial',action='store_true');args=parser.parse_args()
    require(not args.allow_partial or args.validate_only,'--allow-partial requires --validate-only')
    outputs,reports=prepare(args.root,args.input_dir or args.root/'tools/history-questions/short-inputs',args.subject or SUBJECTS,allow_partial=args.allow_partial)
    if not args.validate_only:save(outputs,check=args.check)
    print(json.dumps(dict(version=VERSION,validatedOnly=args.validate_only,subjects=reports),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
