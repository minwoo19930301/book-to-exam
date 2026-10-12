"""Supplements must survive both generation paths without bypassing validation."""
import copy
import unittest
import test_page_practice as fixtures
import page_practice as p
from expansion import save

class SupplementTests(unittest.TestCase):
    # Reuse only the isolated bank fixture helpers.
    setUp = fixtures.PagePracticeTests.setUp
    write = fixtures.PagePracticeTests.write
    row = fixtures.PagePracticeTests.row
    doc = fixtures.PagePracticeTests.doc
    draft = fixtures.PagePracticeTests.draft
    def supplement(self):
        return dict(schemaVersion=1, subject=self.subject, batch='20261013', questions=[
            dict(id=f'{self.subject}-page-practice-review20261013-001',page=self.page,kind='short',
                 answer='등록',acceptedAnswers=['가상등록'],prompt='검증용 가상 자료에서 여러 기록을 모아 만든 책의 이름은 무엇인가?',
                 topic='가상 문헌',explain='자료에 제시된 문헌의 명칭을 확인한다.',
                 evidence=[dict(page=self.page,quote=self.source)])])
    def install(self, document):
        self.write(self.root/f'tools/history-questions/page-supplements/{self.subject}.json',document)
    def test_supplement_preserves_old_rows_and_survives_both_generation_paths(self):
        doc=self.doc();self.write(self.root/f'tools/history-questions/page-inputs/{self.subject}.json',doc)
        self.install(self.supplement())
        before=copy.deepcopy(doc)
        outputs,reports=p.prepare(self.root,[self.subject])
        rows=outputs[self.folder/'questions.json']
        self.assertEqual(len(rows),4)
        self.assertEqual(rows[0],self.old)
        self.assertEqual(doc,before)
        self.assertEqual(reports[0]['added'],{'short':3})
        self.assertEqual(rows[-1]['acceptedAnswers'],['가상등록'])
        save(outputs)
        again,_=p.prepare(self.root,[self.subject]);self.assertEqual(outputs,again)
        baseline={self.folder/f'{name}.json':p.read_json(self.folder/f'{name}.json') for name in ('questions','blanks','essays')}
        self.assertEqual(p.extend_generated(self.subject,self.root,baseline)[self.folder/'questions.json'],rows)
    def test_supplement_rejects_wrong_subject_batch_ids_and_missing_source(self):
        cases=[('subject','seoyangsa','invalid supplement'),('batch','invalid','invalid supplement batch'),
               ('questions',[],'supplement questions required'),('schemaVersion',True,'invalid supplement')]
        for key,value,pattern in cases:
            with self.subTest(key=key):
                doc=self.supplement();doc[key]=value;self.install(doc)
                with self.assertRaisesRegex(ValueError,pattern):self.draft(self.doc())
        doc=self.supplement();doc['questions'][0]['id']='hanguksa-page-practice-old-001';self.install(doc)
        with self.assertRaisesRegex(ValueError,'supplement ID'):self.draft(self.doc())
        doc=self.supplement();doc['questions'][0]['evidence'][0]['quote']='원문에 없는 추정 내용을 근거로 추가하는 것은 허용하지 않는다.';self.install(doc)
        with self.assertRaisesRegex(ValueError,'nonverbatim'):self.draft(self.doc())
    def test_supplement_rejects_prompt_clones_and_equivalent_aliases(self):
        doc=self.supplement();doc['questions'][0]['prompt']=self.row()['prompt'];self.install(doc)
        with self.assertRaisesRegex(ValueError,'duplicate prompt'):self.draft(self.doc())
        doc=self.supplement();doc['questions'][0]['acceptedAnswers']=['등 록'];self.install(doc)
        with self.assertRaisesRegex(ValueError,'duplicate alias'):self.draft(self.doc())

