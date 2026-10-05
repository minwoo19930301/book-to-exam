"""Page coverage and source constraints for explicitly authored additions."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import page_practice as p
from expansion import encoded, save

class PagePracticeTests(unittest.TestCase):
 def setUp(self):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);self.root=Path(tmp.name)
  self.subject='hanguksa';self.page='hanguksa-textbook-page-1';self.empty='hanguksa-textbook-page-2';self.folder=p.folder_for(self.root,self.subject)
  self.source='검증용 가상 자료에서 백성을 구제하는 기관을 구호소라 한다. 곡식을 보관하는 창고는 비축고이다. 기록을 모은 책은 등록이다.'
  self.notes=[dict(id=self.page,title='검증용 자료',text=self.source,source={}),dict(id=self.empty,title='차례',text='목차의 한 줄',source={})]
  self.old=dict(id='existing',type='blank',prompt='기존에 있던 고유한 질문',page=self.page,answer='기존정답')
  self.write(self.folder/'notes.json',self.notes)
  for kind,rows in [('questions',[self.old]),('blanks',[]),('essays',[])]:self.write(self.folder/f'{kind}.json',rows)
  self.write(self.root/'public/data/subjects.json',[dict(id=self.subject,counts=dict(notes=2,questions=1,blanks=0,essays=0))])
 def write(self,path,data):
  path.parent.mkdir(parents=True,exist_ok=True);path.write_text(encoded(data))
 def row(self,n=1):
  return dict(id=f'hanguksa-page-practice-test-{n}',page=self.page,kind='short',answer='구호소' if n==1 else '비축고',acceptedAnswers=[],prompt='가상 검증용 자료에서 백성을 구제하는 기관은 무엇인가?' if n==1 else '가상 검증용 자료에서 곡식을 보관하는 창고는 무엇인가?',evidence=[dict(page=self.page,quote=self.source)],topic='검증용',explain='가상 자료에 명시된 개념을 확인한다.')
 def doc(self):return dict(schemaVersion=1,subject=self.subject,questions=[self.row(),self.row(2)],exclusions=[dict(page=self.empty,reason='목차 쪽')])
 def draft(self,doc):return p.prepare_subject(self.root,self.subject,doc)
 def test_primary_page_count_preservation_exceptions_and_idempotency(self):
  # Another page cited as evidence does not count as a primary-page question.
  self.old['evidence']=[dict(page=self.empty,quote='목차의 한 줄')]
  self.write(self.folder/'questions.json',[self.old]);self.write(self.root/'tools/history-questions/page-inputs/hanguksa.json',self.doc())
  before={name:(self.folder/f'{name}.json').read_bytes() for name in ['notes','essays']}
  outputs,reports=p.prepare(self.root,[self.subject]);report=reports[0]
  self.assertEqual(report['coveredPages'],1);self.assertEqual(report['exceptionPages'],1)
  self.assertEqual([x['count'] for x in report['pages']],[3,0])
  self.assertEqual(outputs[self.folder/'questions.json'][0],self.old)
  self.assertEqual(outputs[self.root/'public/data/subjects.json'][0]['counts']['questions'],3)
  save(outputs);again,_=p.prepare(self.root,[self.subject]);self.assertEqual(outputs,again)
  self.assertTrue(all((self.folder/f'{name}.json').read_bytes()==content for name,content in before.items()))
  data=self.doc();data['exclusions']=[]
  with self.assertRaisesRegex(ValueError,'no reviewed exception'):self.draft(data)
 def test_rejects_unattested_wrong_page_known_issue_and_answer_leaks(self):
  variations=[({'evidence':[dict(page=self.page,quote='없는 문장이다')]},'nonverbatim'),({'evidence':[dict(page=self.empty,quote='목차의 한 줄')]},'primary page'),({'prompt':'정답 구호소를 그대로 쓰도록 요구하는 잘못된 질문이다'},'revealed'),({'acceptedAnswers':['구 호소']},'duplicate alias'),({'acceptedAnswers':['기관']},'revealed')]
  for changes,pattern in variations:
   with self.subTest(changes=changes):
    data=self.doc();data['questions'][0].update(changes)
    with self.assertRaisesRegex(ValueError,pattern):self.draft(data)
  self.notes[0]['source']['knownIssues']=[dict(quote='백성을 구제하는 기관')];self.write(self.folder/'notes.json',self.notes)
  with self.assertRaisesRegex(ValueError,'known source issue'):self.draft(self.doc())
 def test_cloze_reconstructs_exact_source_and_uses_only_full_passage(self):
  data=self.doc();row=data['questions'][0];passage=self.source.split('. ')[0]+'.'
  row.update(kind='cloze',passage=passage,prompt=passage.replace(row['answer'],'_____'))
  outputs,_=self.draft(data);q=outputs[self.folder/'blanks.json'][0]
  self.assertEqual(q['before']+q['answer']+q['after'],passage);self.assertEqual(q['passageMode'],'full')
  for changes in [dict(passage=passage+' 추정 내용'),dict(prompt=row['prompt']+' 한 문장 추가')]:
   broken=copy.deepcopy(data);broken['questions'][0].update(changes)
   with self.assertRaises(ValueError):self.draft(broken)
 def test_duplicate_question_or_task_cannot_pad_coverage(self):
  for changes in [dict(id='hanguksa-page-practice-copy'),dict(id='hanguksa-page-practice-copy',prompt='검증 자료에 나온 구제 기관의 정확한 이름을 적으시오.')]:
   data=self.doc();data['questions'][1]={**data['questions'][0],**changes}
   with self.assertRaisesRegex(ValueError,'duplicate'):self.draft(data)
 def test_generate_hook_optional_and_preserves_other_outputs(self):
  baseline={self.folder/f'{name}.json':json.loads((self.folder/f'{name}.json').read_text()) for name in ['questions','blanks','essays']}
  self.assertIs(p.extend_generated(self.subject,self.root,baseline),baseline)
  self.write(self.root/'tools/history-questions/page-inputs/hanguksa.json',self.doc())
  extended=p.extend_generated(self.subject,self.root,baseline)
  self.assertEqual(extended[self.folder/'essays.json'],[]);self.assertEqual(len(extended[self.folder/'questions.json']),3)
if __name__=='__main__':unittest.main()
