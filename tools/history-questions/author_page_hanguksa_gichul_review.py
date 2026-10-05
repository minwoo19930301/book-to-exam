#!/usr/bin/env python3
"""Record exclusions for exam pages explicitly presented as inferred reconstruction.

This supplementary file is reviewed/merged by the main hanguksa author; it is not
an automatic importer input and does not alter notes or existing questions.
"""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
notes=json.loads((ROOT/'public/data/subjects/hanguksa/notes.json').read_text())
gichul=[n for n in notes if n['source'].get('kind')=='gichul']
assert len(gichul)==75
rows=[]
for n in gichul:
 p=int(n['id'].rsplit('-',1)[1])
 if p==1:
  reason='머리말·학습법·교재 홍보로 역사 본문이 없다.'
 elif p==74:
  reason='분야별 참고문헌 목록이며 독립 역사 본문이 없다.'
 elif p==75:
  reason='원문이 양면 모두 비어 있다고 표시된 빈 면이다.'
 elif p==72:
  reason='OCR 문장이 심하게 훼손되어 인물·법령·사건의 정확한 내용과 지문 범위를 확인할 수 없다. 원본 대조 전에는 신규 출제하지 않는다.'
 elif p==4:
  reason='복원 해설이 수혈·수신제의 고구려와 질투 처벌의 부여를 뒤집어 서술하며, 옥저 복속 관련 사료를 동예로 표기한다. 원 기출·원전 대조 전에는 어떤 복원 문구도 새 정답 근거로 사용하지 않는다.'
 elif p==3:
  reason='복원본의 수정 후 문항은 신석기 움집을 제시하면서 사냥·물고기잡이만 정답으로 하고 돌갈판 사용을 제외하여 지문·정답 관계가 불명확하다. 원 기출 그림과 선지의 대조 전 신규 출제를 제외한다.'
 elif p==16:
  reason='복원 해설 자체가 보기 조합의 정답을 하나로 확정하지 못하고 원문 대조를 요구한다. 원 기출의 사신 그림·선지 확인 전에는 신규 출제하지 않는다.'
 elif p in [2,6,17,20,27,37,48,63]:
  reason='기출 연도·주제·배점의 경향표이다. 원본 HTML은 OCR 단서로 문항·선지·사료를 유추한 복원문임을 명시하므로 목록을 독립 출제 근거로 쓰지 않는다.'
 else:
  reason='원본 HTML 상단은 「Apple OCR을 힌트로 문항·선지·사료를 유추해 다듬었습니다」라고 명시한다. 실제 원 기출이나 검증된 전사를 확인하지 않은 복원 문구를 새 정답 근거로 쓰거나 기존 기출 질문을 복제하지 않는다.'
 rows.append({'page':n['id'],'reason':reason})
doc={'schemaVersion':1,'subject':'hanguksa','questions':[],'exclusions':rows,
 'sourceReview':{'status':'inferred-reconstruction-not-verified','reviewMethod':'AI read-only review of source HTML and selected transcriptions; no claim of expert or complete scan verification',
 'sourceCommit':'c27126b8b11008d96bdca159e534fbb6ec564f2b','sourcePath':'한국사기출_스마트_교재뷰어.html','sourceLine':967,
 'notice':'사진 위, 왼/오른 복원문. Apple OCR을 힌트로 문항·선지·사료를 유추해 다듬었습니다.'}}
p=ROOT/'tools/history-questions/page-inputs/hanguksa-gichul-supplement.json'
p.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
assert len({r['page'] for r in rows})==75
print(f'{p}: questions=0, exclusions=75')
