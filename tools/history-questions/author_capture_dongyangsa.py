#!/usr/bin/env python3
"""AI-authored questions from individually inspected source photographs.
No enhancement can restore unreadable pixels; uncertain small type is not quoted.
"""
import json
from pathlib import Path
from shorts import graded
ROOT=Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'public/data/source-pages.json').read_text())['pages']
targets=json.loads((ROOT/'tools/history-questions/capture-targets.json').read_text())['subjects']['dongyangsa']
reviews=[]; questions=[]
def pg(n,book='textbook'):return f'dongyangsa-{book}-page-{n}'
def caps(page):return [{k:c[k] for k in ('src','sha256')} for c in manifest[page]['captures']]
def review(n,status,summary,reason=None,book='textbook',duplicate=None):
 r=dict(page=pg(n,book),status=status,captures=caps(pg(n,book)),summary=summary)
 if reason:r['reason']=reason
 if duplicate:r['duplicateOf']=duplicate
 reviews.append(r)
def add(n,slug,prompt,answer,quote,location,explain,aliases=(),book='textbook',links=()):
 page=pg(n,book); c=caps(page)[0]
 q=dict(id=f'dongyangsa-capture-practice-{book}-{n}-{slug}',page=page,kind='short',prompt=prompt,answer=answer,acceptedAnswers=list(aliases),evidence=[dict(page=page,quote=quote)],captureEvidence=[dict(**c,quote=quote,location=location)],explain=explain,topic=answer)
 if links:q['corroboration']=[dict(url=u,title=t) for u,t in links]
 seen={graded(answer)}; clean=[]
 for a in q['acceptedAnswers']:
  if graded(a) not in seen: clean.append(a); seen.add(graded(a))
 q['acceptedAnswers']=clean
 questions.append(q)
for n,summary in [(1,'왼쪽 교재 표지와 오른쪽 저자 소개·약력이다.'),(3,'중국사·일본사 차례와 각 단원의 쪽수이다.'),(4,'인도사·동남아시아사 차례와 단원 쪽수이다.'),(6,'중국의 역사라는 부문 표지와 단원 시작면이다.'),(308,'왼쪽 참고문헌 목록과 오른쪽 발행 정보·판권면이다. 전사 제목의 동남아시아사 개관에 해당하는 독립 본문은 사진에 없다.')]:
 review(n,'non-content',summary,'표지·차례·서지 안내로서 새 역사 개념 문항을 뒷받침하는 독립 설명이 없다.')
review(48,'content','사진은 원제·성제·애제의 통치와 한전제, 왕망의 왕전제·사속 명칭을 담는다. 과거의 근거 부족 예외와 달리 좌우 본문 및 사료 상자에서 짧은 근거를 직접 판독했다.')
add(48,'yuandi','전한에서 소망지와 공우 등을 중용하며 왕도정치를 지향했고, 재위 기간이 기원전 48~33년인 황제는?','원제','원제(元帝, B.C. 48~33년)','왼쪽 면 맨 위 소제목','사진의 원제 항목 아래에는 소망지·공우 중용과 왕도정치가 제시되어 있다.',['한 원제','전한 원제','元帝'])
add(48,'limited-land','애제 때 사단이 제안하여 토지 소유 면적을 30경으로 제한하려 한 제도의 명칭은?','한전제','사단(師丹)의 한전제(限田制) 발포','왼쪽 면 중하단 애제 항목 두 번째 줄','사진은 한전제 아래에 토지 소유 면적 30경 제한과 신분별 노비 소유 제한을 열거한다.',['한전법','限田制'])
add(48,'royal-land','왕망이 전국 토지를 국유화하고 토지 매매를 금지하려 한 토지 제도의 명칭은?','왕전제','왕전제(王田制)','오른쪽 면 중하단 주례에 입각한 개혁 첫 항목','사진의 왕전제 항목에 전국 토지 국유화와 토지 매매 금지가 명시되어 있다.',['왕전 제도','王田制'])
add(48,'private-dependents','왕망이 토지와 함께 노비의 매매도 금지하면서 노비를 새로 부르도록 한 명칭은?','사속','노비들은 사속(私屬)이라 부르며, 두 가지 모두 매매할 수 없다.','오른쪽 아래 왕전제 실시 사료 상자 첫 문장 중간','왕망은 토지를 왕전, 노비를 사속이라 부르고 양자의 매매를 금지했다.',['私屬'])
review(173,'unreadable','대부분 단원 학습 요소와 기출 주제표지만 오른쪽 상단 연표는 1861년 총리각국사무아문, 1901년 외무부를 분명히 표시한다. 이 두 기관 변화는 문항화했다.','추가 표의 작은 세부 문구는 안정적으로 판독하기 어렵고, 주제 이름을 독립적인 역사 설명으로 확대하지 않아 2문항만 작성했다.')
add(173,'zongli-yamen','청이 1861년에 설치했고 사진의 연표에서 1901년 외무부 이전 단계에 표시된 외교 전담 기구는?','총리각국사무아문','총리각국사무아문','오른쪽 맨 위 연표 1861년 표지 오른쪽 아래','연표에는 1861년 총리각국사무아문이 표시되어 있다. 총리아문은 그 약칭이다.',['총리아문','총리 아문'])
add(173,'foreign-ministry','사진의 청 말 외교 기구 변천 연표에서 1901년 이후 총리각국사무아문을 대신한 관서는?','외무부','1901년','오른쪽 맨 위 연표 마지막 연도와 그 오른쪽 외무부 표지','연표는 1901년을 경계로 외무부를 표시한다.')
review(176,'content','실제 사진에는 제2차 아편 전쟁의 배경·애로호 사건·톈진 조약 원문이 좌우로 이어진다. 기존 전사보다 많은 본문이 보이며 짧은 표제와 사건 설명을 직접 읽었다.')
add(176,'arrow','중국인 승무원을 해적 혐의로 연행한 선박 문제를 영국이 제2차 아편 전쟁의 구실로 삼은 사건은?','애로호 사건','애로호의 중국인 승무원 해적 혐의 연행','오른쪽 면 상단 전쟁의 발발 아래 첫 사건 설명','사진은 애로호 사건을 중국인 승무원 연행과 영국의 항의로 설명한다.',['애로호','애로 사건','애로우호 사건','애로우호'])
add(176,'tianjin','제2차 아편 전쟁 중인 1858년 6월 체결되어 영국 사절의 수도 파견 등을 규정한 조약은?','톈진 조약','톈진 조약의 체결(1858.6)','오른쪽 면 하단 사료탐구 상자 표제','사진의 사료 상자는 1858년 톈진 조약을 제시하며 제2조에서 외교관의 파견을 규정한다.',['천진 조약','天津條約'])
for n in (265,268):review(n,'duplicate','하마구치 내각·쌀 소동·관동 대지진·만주사변이 실린 펼침면이다. 264쪽과 동일한 JPEG 바이트·SHA-256이며 같은 원본면을 재등록한 기록이다.','동일 원본 캡처와 역사 내용은 264쪽에서 다루므로 별도 문항을 복제하지 않는다.',duplicate=pg(264))
for n in (1,2,5,8,12,18,22,25,29,30):
 summary='머리말과 교재 활용 안내이다.' if n==1 else ('참고문헌과 발행 정보·판권면이다.' if n==30 else '단원 표지와 기출 연도·주제·배점의 목록표이다. 역사 설명 본문이 아니라 출제 위치를 안내한다.')
 review(n,'non-content',summary,'머리말·단원 표지·출제 목록·판권 안내이므로 이를 역사적 사실 설명으로 확대해 문항을 만들지 않는다.',book='gichul')
for n in (3,4,6,7,9,10,11,13,14,15,16,17,19,20,21,23,24,27):
 extras={13:' 두 지도 모두 중국에서 동남아시아·인도양으로 이어지는 항로 그림이며, 기존 두 번째 제목의 명·청 강역 지도와 다르다.',16:' 사진의 문항 번호는 23·24로 기존 제목의 23·26과 다르다.',17:' 오른쪽 지도는 중국의 여러 옛 수도 위치를 문자로 표시하며, 기존 제목의 청 강역 지도와 다르다.',27:' 일본 근대의 헌정·대외관계 사료와 해설이 있으나 작은 문장을 확정하기 어렵다.'}
 review(n,'unreadable','기출 문제·사료 상자·해설이 있는 실제 내용면이다. 1280×720 원본과 원비율 확대본을 모두 살폈으나 움직임 흐림과 낮은 문자 해상도로 정답을 뒷받침할 안정적인 발췌를 확정하지 못했다.'+extras.get(n,''),'기출 또는 유추 복원 여부가 아니라 원본 사진의 판독 한계로 보류했다. 외부 지식이나 기존 전사문을 사진에서 읽었다고 대신 기록하지 않는다.',book='gichul')
review(26,'capture-mismatch','사진 왼쪽은 고대 일본 수도 이동 지도이며 694년 A, 710년 B, 784년 중간 지점, 794년 C가 보인다. 기존 전사 제목인 에도 막번·산킨코타이와 일치하지 않는다. 작은 해설은 사용하지 않고 지도 연도·지점과 일본 공공기관의 수도 연혁을 대조했다.','기존 전사와 사진 내용이 달라 새 문항 근거는 지도 라벨과 공적 연혁의 결합으로 한정했다.',book='gichul')
links=[('https://www.city.kashihara.nara.jp/pr/asobu/2/12523.html','가시하라시 공식: 후지와라궁터와 694~710년 수도 연혁'),('https://www.kkr.mlit.go.jp/asuka/initiatives-heijo/history.html','일본 국토교통성: 헤이조쿄 역사·수도 이전 연표')]
add(26,'fujiwara','일본 고대 수도 이동 지도에서 694년으로 표시된 A 지점에 조성되어 710년까지 수도였던 도성은?','후지와라쿄','694년','왼쪽 지도 남쪽 A 지점의 연도 표지','지도 A의 694년과 가시하라시 공식 연혁의 694~710년 후지와라쿄를 대조했다.',['후지와라 경','후지와라경','藤原京'],book='gichul',links=links[:1])
add(26,'heijo','일본 고대 수도 이동 지도에서 710년으로 표시된 B 지점으로 옮겨 나라 시대의 중심지가 된 도성은?','헤이조쿄','710년','왼쪽 지도 중앙 B 지점으로 향하는 화살표 옆 연도','지도 B의 710년과 국토교통성의 헤이조쿄 천도 연혁을 대조했다.',['헤이조 경','헤이조경','평성경','平城京'],book='gichul',links=links[1:])
add(26,'heian','일본 고대 수도 이동 지도에서 784년의 중간 수도를 거친 뒤 794년에 도달한 C 도성은?','헤이안쿄','794년','왼쪽 지도 북쪽 C 지점으로 향하는 화살표 옆 연도','지도 C의 794년은 공적 연표에 나타난 헤이안쿄 천도 연도와 일치한다.',['헤이안 경','헤이안경','평안경','平安京'],book='gichul',links=links[1:])
review(28,'unreadable','동남아시아의 문화유산 그림·건축물 사진 세 장과 지도가 있다. 가운데 사진의 앙코르와트 유적 표제는 읽을 수 있어 한 문항을 작성했다. 위·아래 사진의 작은 명칭과 옆 해설은 확정하지 않았다.','확실히 읽은 가운데 유적 표제에 근거한 1문항만 작성했다. 나머지 문화유산 명칭과 설명은 추측하여 채우지 않았다.',book='gichul')
add(28,'angkor','캄보디아에서 수리야바르만 2세가 12세기에 세웠으며, 처음에는 비슈누를 모시는 힌두교 사원이었던 크메르의 대표 유적은?','앙코르와트','앙코르와트의 유적','왼쪽 면 세 사진 중 가운데 사진 바로 아래 표제','사진의 표제로 앙코르와트를 확인하고 캄보디아 APSARA 국가기구의 건립 시기·건립자·종교 설명으로 발문의 단서를 보충했다.',['앙코르 와트','Angkor Wat'],book='gichul',links=[('https://apsaraauthority.gov.kh/2021/06/14/angkor-wat/','캄보디아 APSARA 국가기구: 앙코르와트')])
assert set(r['page'] for r in reviews)==set(targets)
out=ROOT/'tools/history-questions/capture-inputs/dongyangsa.json';out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(dict(schemaVersion=1,subject='dongyangsa',reviews=reviews,questions=questions),ensure_ascii=False,indent=2)+'\n')
print(len(reviews),'reviews',len(questions),'questions')
