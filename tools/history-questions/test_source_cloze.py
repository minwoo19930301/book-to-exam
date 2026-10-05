"""Source cloze integrity: exact full passages, no answer leaks, preservation."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import source_cloze
from expansion import encoded, save


class SourceClozeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.subject = 'hanguksa'
        self.folder = self.root/'public/data/subjects/hanguksa'
        self.page = 'hanguksa-textbook-page-1'
        self.passages = [f'검증 자료 {n}. 왕이 신하들에게 명하기를, 고을에서 거둔 물품과 백성의 사정을 장부에 빠짐없이 기록하도록 하였다. 이를 관리하는 직책을 관직{n}이라 하였으며, 관원은 정해진 기일에 중앙에 기록을 올렸다.\n— 가상의 검증용 사료' for n in range(80)]
        self.headings = [f'[사료탐구] 검증자료 {n}' for n in range(80)]
        self.note = dict(id=self.page, subject=self.subject, text='\n'.join(h+'\n'+p for h,p in zip(self.headings,self.passages)), source={})
        self.old = [dict(id='hanguksa-existing-cloze',type='blank',prompt='기존 _____ 문항',page=self.page,answer='기본',before='기존 ',after=' 문항')]
        self.write(self.folder/'notes.json',[self.note]); self.write(self.folder/'blanks.json',self.old)
        self.write(self.folder/'questions.json',[dict(id='old-mc',prompt='기존 객관식 질문',type='mc')])
        self.write(self.folder/'essays.json',[dict(id='old-essay',prompt='기존 서술형 질문')])
        self.write(self.root/'public/data/subjects.json',[dict(id=self.subject,counts=dict(blanks=1,questions=1,essays=1,notes=1))])
        self.input_dir=self.root/'tools/history-questions/source-cloze-inputs'

    def write(self,path,data):
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(encoded(data))

    def row(self,n=0):
        return dict(id=f'hanguksa-source-cloze-{n:03}',page=self.page,sectionHeading=self.headings[n],
            passage=self.passages[n],answer=f'관직{n}',acceptedAnswers=[f'벼슬{n}'],era='제도사',
            explain='원문에서 장부의 관리 책임을 맡는 관직을 묻는다.',reviewed=True)

    def doc(self,rows=None):
        return dict(schemaVersion=1,subject=self.subject,questions=rows if rows is not None else [self.row(n) for n in range(80)])

    def draft(self,rows):
        return source_cloze.prepare_subject(self.root,self.subject,self.doc(rows),allow_partial=True)

    def test_preserves_every_old_bank_and_full_passage_and_is_idempotent(self):
        self.write(self.input_dir/'hanguksa.json',self.doc())
        untouched={p:p.read_bytes() for p in self.root.rglob('*.json') if p not in [self.folder/'blanks.json',self.root/'public/data/subjects.json']}
        outputs,reports=source_cloze.prepare(self.root,self.input_dir,[self.subject]);rows=outputs[self.folder/'blanks.json']
        self.assertEqual(rows[:1],self.old);self.assertEqual(reports[0]['added'],80)
        for q in rows[1:]:
            self.assertEqual(q['before']+q['answer']+q['after'],q['passage'])
            self.assertEqual(q['prompt'],q['before']+'_____'+q['after'])
            self.assertEqual(q['contextMode'],'source-excerpt');self.assertEqual(q['match'],'aliases')
            self.assertTrue(q['after'].endswith('— 가상의 검증용 사료'))
        save(outputs);repeated,_=source_cloze.prepare(self.root,self.input_dir,[self.subject]);self.assertEqual(outputs,repeated)
        self.assertTrue(all(p.read_bytes()==data for p,data in untouched.items()))

    def test_rejects_wrong_source_heading_and_unreviewed_or_nonverbatim_excerpt(self):
        for changes,pattern in [({'sectionHeading':'[사료탐구] 다른 자료'},'sectionHeading'),
            ({'passage':self.passages[0]+'새로운 문장'},'occur exactly once'),({'reviewed':False},'manual'),
            ({'page':'seoyangsa-textbook-page-1'},'wrong-subject'),({'answer':'일이다.'},'one exact concept')]:
            with self.subTest(changes=changes),self.assertRaisesRegex(ValueError,pattern):self.draft([{**self.row(),**changes}])

    def test_answer_repetition_alias_leak_and_duplicate_alias_are_rejected(self):
        for changes,pattern in [({'answer':'기록'},'exactly once'),({'acceptedAnswers':['장부']},'revealed'),
            ({'acceptedAnswers':['관 직0']},'duplicate alias')]:
            with self.subTest(changes=changes),self.assertRaisesRegex(ValueError,pattern):self.draft([{**self.row(),**changes}])
        with self.assertRaisesRegex(ValueError,'duplicate prompt'):
            self.draft([self.row(),{**self.row(),'id':'hanguksa-source-cloze-copy'}])

    def test_existing_same_sentence_cannot_be_repackaged_as_a_longer_passage(self):
        before,after='이를 관리하는 직책을 ','이라 하였으며, 관원은 정해진 기일에 중앙에 기록을 올렸다.'
        self.old.append(dict(id='old-overlap',type='blank',page=self.page,before=before,after=after,answer='관직0',prompt=before+'_____'+after))
        self.write(self.folder/'blanks.json',self.old)
        with self.assertRaisesRegex(ValueError,'overlaps existing'):self.draft([self.row()])

    def test_same_concept_alias_cannot_evade_existing_source_overlap(self):
        # The old canonical answer can differ while its approved alias identifies
        # the same concept. Adding a larger quotation is still the same task.
        self.old.append(dict(id='old-alias-overlap',type='blank',page=self.page,
            answer='벼슬0',acceptedAnswers=['관직0'],passage=self.passages[0],
            prompt='다른 표기로 출제한 _____'))
        self.write(self.folder/'blanks.json',self.old)
        with self.assertRaisesRegex(ValueError,'overlaps existing'):self.draft([self.row()])

    def test_known_source_issue_and_markerless_passage_rejected(self):
        self.note['source']['knownIssues']=[dict(id='bad-ocr',quote='이를 관리하는 직책을')]
        self.write(self.folder/'notes.json',[self.note])
        with self.assertRaisesRegex(ValueError,'known source issue'):self.draft([self.row()])
        self.note['source']={};self.note['text']=self.passages[0];self.write(self.folder/'notes.json',[self.note])
        with self.assertRaisesRegex(ValueError,'사료탐구 marker'):self.draft([self.row()])

    def test_count_gate_and_optional_generate_hook(self):
        with self.assertRaisesRegex(ValueError,'at least 80'):
            source_cloze.prepare_subject(self.root,self.subject,self.doc([self.row()]))
        baseline={self.folder/f'{n}.json':json.loads((self.folder/f'{n}.json').read_text()) for n in ['questions','blanks','essays']}
        self.assertIs(source_cloze.extend_generated(self.subject,self.root,baseline),baseline)
        self.write(self.input_dir/'hanguksa.json',self.doc())
        result=source_cloze.extend_generated(self.subject,self.root,baseline)
        self.assertEqual(result[self.folder/'questions.json'],baseline[self.folder/'questions.json'])
        self.assertEqual(len(result[self.folder/'blanks.json']),81)

    def test_validation_does_not_write_and_stale_reserved_rows_are_removed(self):
        first,_=self.draft([self.row()]);save(first)
        self.write(self.folder/'blanks.json',json.loads((self.folder/'blanks.json').read_text())+[dict(id='hanguksa-source-cloze-obsolete',prompt='이전 초안')])
        snapshot={p:p.read_bytes() for p in self.root.rglob('*.json')}
        next_output,_=self.draft([{**self.row(),'explain':'원문의 관리 책임과 중앙 보고 절차를 단서로 판단한다.'}])
        self.assertEqual(len(next_output[self.folder/'blanks.json']),2)
        self.assertTrue(all(p.read_bytes()==data for p,data in snapshot.items()))

if __name__=='__main__':unittest.main()
