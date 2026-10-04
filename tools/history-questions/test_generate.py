"""Checks the bank's provenance contract and failure behavior, not its wording."""
import copy
import unittest
from unittest.mock import patch

import generate as bank


class QuestionBankTests(unittest.TestCase):
    def test_all_quotes_and_public_private_boundaries(self):
        ids = set()
        for subject in bank.CONCEPTS:
            outputs = bank.generate(subject, bank.ROOT, include_expansion=False)
            folder = bank.ROOT / 'public/data/subjects' / subject
            for name in ['facts', 'questions', 'blanks', 'essays']:
                for row in outputs[folder / f'{name}.json']:
                    self.assertTrue(row['id'].startswith(subject + '-'))
                    self.assertNotIn(row['id'], ids)
                    ids.add(row['id'])
            public = outputs[folder / 'essays.json']
            private = outputs[bank.ROOT / 'functions/_data/subjects' / subject / 'essays.json']
            self.assertEqual([x['id'] for x in public], [x['id'] for x in private])
            for row in public:
                self.assertEqual(set(row), {'id', 'title', 'prompt', 'page'})
            for row in private:
                self.assertEqual(len(row['rubric']), 3)
                self.assertEqual(sum(c['max'] for c in row['rubric']), 10)
                self.assertTrue(row['rubricVersion'])
                self.assertTrue(all(c['evidence'] for c in row['rubric']))

    def test_missing_source_quote_is_rejected(self):
        subject = 'seoyangsa'
        seeds = copy.deepcopy(bank.CONCEPTS[subject])
        seeds[0]['quote'] = 'This deliberately nonexistent quote must never be accepted.'
        with patch.dict(bank.CONCEPTS, {subject: seeds}):
            with self.assertRaisesRegex(ValueError, 'unmatched source quote'):
                bank.generate(subject, bank.ROOT, include_expansion=False)

    def test_duplicate_mc_choices_are_rejected(self):
        subject = 'hanguksa'
        seeds = copy.deepcopy(bank.CONCEPTS[subject])
        seeds[0]['distractors'][0] = seeds[0]['correct']
        with patch.dict(bank.CONCEPTS, {subject: seeds}):
            with self.assertRaisesRegex(ValueError, 'duplicate choices'):
                bank.generate(subject, bank.ROOT, include_expansion=False)

    def test_missing_essay_evidence_is_rejected(self):
        subject = 'gyoyukron'
        seeds = copy.deepcopy(bank.ESSAYS[subject])
        seeds[0]['criteria'][0]['quote'] = 'A fabricated source for a rubric.'
        with patch.dict(bank.ESSAYS, {subject: seeds}):
            with self.assertRaisesRegex(ValueError, 'unmatched source quote'):
                bank.generate(subject, bank.ROOT, include_expansion=False)

    def test_ambiguous_passage_replacement_is_rejected(self):
        subject = 'dongyangsa'
        seeds = copy.deepcopy(bank.CONCEPTS[subject])
        seed = next(s for s in seeds if s['key'] == 'diding')
        seed['blank_quote'] = seed['quote']  # This passage contains 정세 twice.
        with patch.dict(bank.CONCEPTS, {subject: seeds}):
            with self.assertRaisesRegex(ValueError, 'exactly once'):
                bank.generate(subject, bank.ROOT, include_expansion=False)


if __name__ == '__main__':
    unittest.main()
