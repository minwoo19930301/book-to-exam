"""Validate evidence boundaries and rubric contracts; does not verify historical truth."""
import argparse,collections,hashlib,json,re,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SUBJECTS=['seoyangsa','hanguksa','dongyangsa','gyoyukron']
def validate(subject):
    report=json.loads((ROOT/f'knowledge/prediction-research/{subject}.json').read_text())
    notes={x['id']:x for x in json.loads((ROOT/f'public/data/subjects/{subject}/notes.json').read_text())}
    papers={x['id']:x for x in report['papers']}
    rows=report['predictions'];assert len(rows)==30,(subject,len(rows))
    ids=set();prompts=set();empty=[]
    for q in rows:
        assert q['id'].startswith(subject+'-') and q['id'] not in ids;ids.add(q['id'])
        norm=re.sub(r'\W','',q['prompt']);assert norm not in prompts;q['prompt'];prompts.add(norm)
        assert len(q['criteria'])==3 and sum(c['max'] for c in q['criteria'])==10
        for c in q['criteria']:
            weights=[1 if isinstance(p,str) else p['points'] for p in c['checkpoints']]
            assert all(isinstance(w,int) and w>0 for w in weights)
            assert sum(weights)==c['max'];scores={0}
            for w in weights:scores|={v+w for v in list(scores)}
            assert sorted(scores)==c['allowedScores'],q['id']
        assert set(q['sourcePages'])=={e['page'] for e in q['evidence']}
        for e in q['evidence']:
            note=notes[e['page']];assert e['quote'] in note['text']
            for issue in note.get('source',{}).get('knownIssues',[]):
                assert not issue.get('quote') or issue['quote'] not in e['quote'],(q['id'],issue['id'])
        if not q['evidence']:empty.append(q['id']);assert '확인하지 못해' in ' '.join(q['forecast']['basis'])
        assert q['paperIds'] and len(q['paperIds'])<=6
        for id in q['paperIds']:assert id in papers and 'metadata' not in papers[id]['readScope']
        f=q['forecast'];assert f['level'] in ['상','중상','중'] and '편집적 판단' in f['label']
        assert len(f['basis'])>=2 and len(f['limitations'])>=2
        assert not any(k in f for k in ['probability','percentage','chance'])
        if '-expanded-' in q['id']:
            assert q['exerciseKind']=='research-perspective-application'
            for i,c in enumerate(q['criteria']): assert f'{i+1}. '+c['label'] in q['prompt']
            assert {p['paperId'] for p in q['sourceReadScopes']}==set(q['paperIds'])
            for p in q['sourceReadScopes']:assert p['scope']==papers[p['paperId']]['readScope']
    return {'subject':subject,'predictions':len(rows),'new':sum('-expanded-' in q['id'] for q in rows),'levels':dict(collections.Counter(q['forecast']['level'] for q in rows)),'withoutDirectTextbookEvidence':empty,'uniquePapersUsed':len({p for q in rows for p in q['paperIds']})}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check-reproducibility',action='store_true');args=parser.parse_args()
    if args.check_reproducibility:
        paths=[ROOT/f'knowledge/prediction-research/{s}.json' for s in SUBJECTS]
        before=[p.read_bytes() for p in paths]
        for subject in SUBJECTS:subprocess.run([sys.executable,str(Path(__file__).with_name(subject+'.py'))],check=True,cwd=ROOT)
        assert before==[p.read_bytes() for p in paths],'regeneration changed files'
    results=[validate(s) for s in SUBJECTS]
    print(json.dumps({'status':'PASS','subjects':results,'limitation':'Structural and exact-source checks; not independent historical fact verification or measured prediction probability.'},ensure_ascii=False,indent=2))
