"""Incremental short-bank validation: preservation, evidence and idempotency."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import shorts
import expansion
import generate
import author_short150


class ShortAdditionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.subject = 'hanguksa'
        self.folder = self.root / 'public/data/subjects/hanguksa'
        self.page = 'hanguksa-textbook-page-1'
        self.quotes = [f'자료 {n}: 관원이 장부에 기록한 제도의 명칭은 정답{n}이다.' for n in range(150)]
        self.notes = [{'id': self.page, 'subject': self.subject, 'text': '\n'.join(self.quotes), 'source': {}}]
        self.write(self.folder/'notes.json', self.notes)
        self.baseline = [
            {'id': 'hanguksa-old-mc', 'type': 'mc', 'prompt': '기존 객관식 질문과 선택지는 모두 보존합니다.', 'choices': ['가','나','다','라'], 'answer': 0},
            {'id': 'hanguksa-ext-short-001', 'type': 'blank', 'prompt': '기존 확장 단답의 질문과 허용 정답도 보존합니다.', 'answer': '기존', 'acceptedAnswers': ['옛것']},
        ]
        self.write(self.folder/'questions.json', self.baseline)
        self.write(self.folder/'blanks.json', [{'id':'hanguksa-cloze','prompt':'원문 빈칸은 _____ 그대로 유지합니다.','answer':'모두'}])
        self.essay = {'id':'hanguksa-essay','title':'기존 서술형','prompt':'기존 서술형 발문은 변경하지 않고 보존합니다.','page':self.page}
        self.write(self.folder/'essays.json', [self.essay])
        self.write(self.root/'functions/_data/subjects/hanguksa/essays.json', [{**self.essay,'rubric':[{'id':'r1','max':10}]}])
        self.manifest = [{'id':'hanguksa','counts':{'questions':2,'blanks':1,'essays':1,'notes':1,'knowledge':12}},
                         {'id':'hand-memo','counts':{'questions':98}}]
        self.write(self.root/'public/data/subjects.json', self.manifest)
        self.input_dir = self.root/'tools/history-questions/short-inputs'

    def write(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(expansion.encoded(data), encoding='utf-8')

    def row(self,n=0):
        return dict(id=f'hanguksa-short150-{n:03}',type='short',skill='fact',era='검증 시대',topic='제도',
            prompt=f'자료 번호 {n}의 장부에 나타난 제도 명칭을 단답으로 쓰시오.',answer=f'정답{n}',acceptedAnswers=[f'별칭{n}'],
            explain='자료의 장부에 제도의 명칭이 명시되어 있다.',evidence=[{'page':self.page,'quote':self.quotes[n]}])

    def document(self, rows=None):
        return {'schemaVersion':1,'subject':self.subject,'questions':rows if rows is not None else [self.row(n) for n in range(150)]}

    def draft(self, rows):
        return shorts.prepare_subject(self.root,self.subject,self.document(rows),allow_partial=True)

    def test_incremental_import_writes_only_questions_and_counts_and_is_idempotent(self):
        self.write(self.input_dir/'hanguksa.json',self.document())
        untouched={p:p.read_bytes() for p in self.root.rglob('*.json') if p not in [self.folder/'questions.json',self.root/'public/data/subjects.json']}
        outputs,reports=shorts.prepare(self.root,self.input_dir,[self.subject])
        self.assertEqual(set(outputs),{self.folder/'questions.json',self.root/'public/data/subjects.json'})
        rows=outputs[self.folder/'questions.json']
        self.assertEqual(rows[:2],self.baseline)
        self.assertEqual(len(rows),152)
        self.assertEqual(reports[0]['shortTotal'],151)
        manifest=copy.deepcopy(self.manifest);manifest[0]['counts']['questions']=152
        self.assertEqual(outputs[self.root/'public/data/subjects.json'],manifest)
        expansion.save(outputs)
        repeated,_=shorts.prepare(self.root,self.input_dir,[self.subject])
        self.assertEqual(repeated,outputs)
        expansion.save(repeated,check=True)
        self.assertTrue(all(p.read_bytes()==data for p,data in untouched.items()))
        self.assertEqual(rows[-1]['match'],'aliases')
        self.assertEqual(rows[-1]['acceptedAnswers'],['별칭149'])
        self.assertEqual(rows[-1]['provenance']['origin'],'authored-short-practice')

    def test_update_replaces_only_reserved_rows_and_removes_obsolete_reserved_rows(self):
        old=self.row(); out,_=self.draft([old]);expansion.save(out)
        self.write(self.folder/'questions.json',json.loads((self.folder/'questions.json').read_text())+[{'id':'hanguksa-short150-stale','prompt':'사라져야 할 이전 증분 입력','type':'blank'}])
        revised=self.row();revised['explain']='근거를 더 정확하게 설명하도록 수정한 해설이다.'
        out,_=self.draft([revised]); rows=out[self.folder/'questions.json']
        self.assertEqual(rows[:2],self.baseline)
        self.assertEqual(len(rows),3)
        self.assertEqual(rows[-1]['explain'],revised['explain'])
        self.assertNotEqual(rows[-1]['provenance']['inputSha256'],shorts.prepare_subject(self.root,self.subject,self.document([old]),allow_partial=True)[0][self.folder/'questions.json'][-1]['provenance']['inputSha256'])

    def test_wrong_kind_count_subject_namespace_and_unknown_quote_fail(self):
        mutations=[({'type':'mc'},'only short'),({'id':'hanguksa-ext-new'},'short150 ID'),
                   ({'evidence':[{'page':'seoyangsa-textbook-page-1','quote':self.quotes[0]}]},'wrong-subject'),
                   ({'evidence':[{'page':self.page,'quote':'인용하지 않은 원문 문장입니다.'}]},'nonverbatim')]
        for mutation,pattern in mutations:
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError,pattern): self.draft([{**self.row(),**mutation}])
        with self.assertRaisesRegex(ValueError,'exactly 150'):shorts.prepare_subject(self.root,self.subject,self.document([self.row()]))
        with self.assertRaisesRegex(ValueError,'input subject mismatch'):shorts.prepare_subject(self.root,self.subject,{**self.document(),'subject':'seoyangsa'})

    def test_known_source_issue_duplicate_question_answer_leak_and_bad_alias_fail(self):
        for mutation,pattern in [({'prompt':self.baseline[0]['prompt']},'duplicate prompt'),
                                 ({'prompt':'자료의 정답0이 어떤 명칭인지 그대로 쓰시오.'},'answer revealed'),
                                 ({'acceptedAnswers':['정 답0']},'duplicate alias'),
                                 ({'acceptedAnswers':['자료 번호']},'alias revealed')]:
            with self.subTest(mutation=mutation),self.assertRaisesRegex(ValueError,pattern):self.draft([{**self.row(),**mutation}])
        self.notes[0]['source']['knownIssues']=[{'id':'wrong-sentence','quote':self.quotes[0]}]
        self.write(self.folder/'notes.json',self.notes)
        with self.assertRaisesRegex(ValueError,'known source issue'):self.draft([self.row()])

    def test_validation_is_read_only_and_all_subjects_are_checked_before_save(self):
        self.write(self.input_dir/'hanguksa.json',self.document())
        snapshot={p:p.read_bytes() for p in self.root.rglob('*.json')}
        shorts.prepare(self.root,self.input_dir,[self.subject])
        self.assertTrue(all(p.read_bytes()==data for p,data in snapshot.items()))
        with self.assertRaises(FileNotFoundError):shorts.prepare(self.root,self.input_dir,[self.subject,'seoyangsa'])
        self.assertTrue(all(p.read_bytes()==data for p,data in snapshot.items()))

    def test_aliases_keep_short_exact_case_and_punctuation_distinctions(self):
        row = self.row()
        row['acceptedAnswers'] = ['A·B', 'AB', 'ab']
        outputs, _ = self.draft([row])
        self.assertEqual(outputs[self.folder/'questions.json'][-1]['acceptedAnswers'], ['A·B', 'AB', 'ab'])
        row['acceptedAnswers'].append('A B')
        with self.assertRaisesRegex(ValueError, 'duplicate alias'):
            self.draft([row])

    def test_generate_hook_and_expansion_rerun_preserve_order_and_values(self):
        self.write(self.input_dir/'hanguksa.json',self.document())
        paths=expansion.bank_paths(self.root,self.subject)
        baseline={p:json.loads(p.read_text()) for p in paths.values()}
        original=copy.deepcopy(baseline)
        combined=shorts.extend_generated(self.subject,self.root,baseline)
        self.assertEqual(baseline,original)
        self.assertEqual(combined[paths['questions']][:2],self.baseline)
        expansion.save(combined)
        # Existing extension namespace is intentionally replaced with this one
        # authored MC; all new short rows survive byte-for-byte and stay last.
        ext=dict(id='hanguksa-ext-mc-new',type='mc',skill='fact',prompt='새 확장 객관식의 올바른 제도 설명을 고르시오.',
                 choices=['첫 설명','둘째 설명','셋째 설명','넷째 설명'],answer=0,choiceExplanations=['옳다','아니다','아니다','아니다'],
                 explain='첫 설명이 맞다.',evidence=[{'page':self.page,'quote':self.quotes[0]}])
        outputs,_=expansion.prepare_subject(self.root,self.subject,{'schemaVersion':1,'subject':self.subject,'questions':[ext]},allow_partial=True)
        rows=outputs[paths['questions']]
        self.assertEqual(rows[1]['id'],'hanguksa-ext-mc-new')
        self.assertEqual(rows[-150:],combined[paths['questions']][-150:])
        self.assertEqual(outputs[paths['blanks']],original[paths['blanks']])
        self.assertEqual(outputs[paths['essays']],original[paths['essays']])
        self.assertEqual(outputs[paths['private']],original[paths['private']])

    def test_seed_spans_allow_bounded_exact_quote_but_reject_ambiguous_or_oversized_ranges(self):
        note={'text':'같은 제목\n검증된 설명 뒤 인접한 오류 문장\n같은 제목'}
        self.assertEqual(author_short150.source_quote(note,{'quote':'검증된 설명'},'test'),'검증된 설명')
        for selection,pattern in [({'quote':'없는 설명'},'match the source'),
                                  ({'quote':'검증된 설명','start':'검증된'},'not both'),
                                  ({'start':'같은 제목','lines':1},'unique span'),
                                  ({'start':'검증된','lines':3},'beyond note')]:
            with self.subTest(selection=selection),self.assertRaisesRegex(ValueError,pattern):
                author_short150.source_quote(note,selection,'test')

    def test_absent_optional_inputs_keep_starter_output_unchanged(self):
        output={self.folder/'questions.json':copy.deepcopy(self.baseline)}
        self.assertIs(shorts.extend_generated(self.subject,self.root,output),output)

if __name__=='__main__':unittest.main()
