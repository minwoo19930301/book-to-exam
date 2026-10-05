"""Reproduce reviewed research exercises without generating claims from titles."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

def load(subject):
    report=json.loads((ROOT/f'knowledge/prediction-research/{subject}.json').read_text())
    notes={n['id']:n for n in json.loads((ROOT/f'public/data/subjects/{subject}/notes.json').read_text())}
    return report,notes

class Author:
    def __init__(self,subject):
        self.subject=subject; self.report,self.notes=load(subject); self.rows=[];self.anchors={}
        self.papers={p['id']:p for p in self.report['papers']}
    def anchor(self,key,page,quote):
        page=f'{self.subject}-textbook-page-{page}'
        assert quote in self.notes[page]['text'], (page,quote)
        self.anchors[key]={'page':page,'quote':quote}
    def old_anchor(self,key,index):
        self.anchors[key]=self.report['predictions'][index-1]['evidence'][0].copy()
    def q(self,title,topic,papers,anchors,context,tasks,points,level,rationale):
        assert len(tasks)==len(points)==3 and all(len(x)==2 for x in points)
        assert level in ['상','중상','중']
        linked=[self.papers[p] for p in papers]
        assert all('metadata' not in p['readScope'] for p in linked)
        evidence=[self.anchors[a] for a in anchors]
        criteria=[]
        for i,(task,pair) in enumerate(zip(tasks,points)):
            weights=[1,2] if i<2 else [2,2]
            criteria.append({'id':f'r{i+1}','label':task,'max':sum(weights),
                'checkpoints':[{'text':text,'points':weight} for text,weight in zip(pair,weights)],
                'allowedScores':[0,1,2,3] if i<2 else [0,2,4],
                'scoringNote':'각 체크포인트에 표시된 점수를 독립적으로 합산한다. 같은 뜻의 표현을 인정하고, 해당 설명을 부정하는 모순은 그 요소에서만 미충족 처리한다. 예시는 유일한 정답이 아니며 자료와 연결된 동등한 방안을 인정한다.'})
        self.rows.append({'id':f'{self.subject}-research-expanded-{len(self.rows)+7:03}',
            'title':title,'topic':topic,'type':'essay','skill':'source-analysis',
            'prompt':'[확인한 연구 내용을 요약하고 자체 구성한 과제]\n'+context+'\n\n'+'\n'.join(f'{i+1}. {t}' for i,t in enumerate(tasks)),
            'modelAnswer':'\n'.join(f'{i+1}. '+ ' '.join(p) for i,p in enumerate(points)),
            'criteria':criteria,'paperIds':papers,
            'sourceReadScopes':[{'paperId':p['id'],'scope':p['readScope'],'locator':p.get('readDetails',p.get('readLocator','기존 연구 기록의 초록 요약 범위'))} for p in linked],
            'sourcePages':list(dict.fromkeys(e['page'] for e in evidence)), 'evidence':evidence,'linkedQuestionIds':[],
            'forecast':{'label':'출제 예상도(편집적 판단)','level':level,'assessmentScope':'topic-connection; not exact-question probability','basis':[rationale,('연결 교재의 기본 사실을 배경으로 연구 관점을 적용한다.' if evidence else '직접 대응하는 교재 근거는 확인하지 못해 sourcePages와 evidence를 비워 두었다. 논문 요약을 제공한 심화 적용 과제이다.')+' 확인하지 않은 기출 빈도나 교육과정 세부 조항을 근거로 삼지 않았다.'],
                'limitations':['논문 선정과 핵심 개념·사료 탐구의 연결을 바탕으로 한 편집적 판단이며 실제 출제 확률을 계산하지 않았다.','연구별 읽은 범위를 넘는 본문 사례·수치·사료 판독을 정답으로 요구하지 않는다.']},
            'caution':'논문 요약은 제시된 관점의 적용 근거다. 교재 인용은 배경 사실의 근거이며 논문의 해석 자체를 증명하지 않는다. 가상 사례는 실제 논문 조사 결과가 아니다. '+ ' '.join(str(p.get('caution','')) for p in linked),
            'exerciseKind':'research-perspective-application',
            'passageProvenance':'논문 검토 기록의 요약 및 자체 구성; 논문·역사 사료의 직접 인용이 아님',
            'officialGradingStatus':'자체 연습용 10점 기준; 평가원의 공식 채점 기준이 아님','automaticExamEligible':False})
    def save(self,old_forecasts):
        assert len(self.rows)==24
        old=self.report['predictions'][:6]
        assert len(old_forecasts)==6
        for row,(level,reason) in zip(old,old_forecasts):
            row['forecast']={'label':'출제 예상도(편집적 판단)','level':level,'basis':[reason,'기존 문항에 연결된 교재 근거와 논문의 읽은 범위 내 관점을 함께 적용한다.'], 'limitations':['실제 출제 확률·기출 반복 빈도를 산출하지 않은 편집적 판단이다.','초록·본문 발췌의 확인 범위를 넘는 연구 결과는 요구하지 않는다.']}
        self.report['predictions']=old+self.rows
        for value in self.report.values():
            if isinstance(value,dict) and value.get('rubrics')=='서술형 6개 모두 기준 3개·합계 10점':
                value['rubrics']='서술형 30개 모두 기준 3개·합계 10점'
        for key,value in list(self.report.items()):
            if isinstance(value,list) and all(isinstance(v,str) for v in value):
                self.report[key]=[v.replace('6문항은 독립 연구','30문항은 독립 연구') for v in value]
        self.report['expansionReview']={'date':'2026-10-05','preservedInitial':6,'added':24,'total':30,'method':'논문 검토 기록과 교재 정확 인용에 근거한 개별 집필; 초록만 읽은 연구는 제시문 관점의 적용 과제로 한정','officialProbability':False}
        for key in ['counts','stats']:
            if isinstance(self.report.get(key),dict):
                for field in ['predictions','predictionCount','predictionEssays']:
                    if field in self.report[key]:self.report[key][field]=30
        (ROOT/f'knowledge/prediction-research/{self.subject}.json').write_text(json.dumps(self.report,ensure_ascii=False,indent=2)+'\n')
