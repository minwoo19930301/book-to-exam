"""Regression checks for dated research additions and their evidence boundaries."""
import copy
import json
import unittest
from unittest.mock import patch

import history_expansion as expansion
from validate import validate


class HistoryExpansionTests(unittest.TestCase):
    def setUp(self):
        self.report = json.loads((expansion.ROOT / 'knowledge/prediction-research/seoyangsa.json').read_text())

    def test_rebuild_preserves_existing_questions_and_does_not_duplicate(self):
        before = copy.deepcopy(self.report)
        after = expansion.apply(self.report)
        self.assertEqual(after, before)
        self.assertEqual(expansion.apply(after), before)

    def test_three_subjects_have_source_bound_complete_additions(self):
        for subject in ('seoyangsa', 'hanguksa', 'dongyangsa'):
            result = validate(subject)
            self.assertEqual(result['predictions'], 42)
            for source in expansion.sources(subject):
                self.assertEqual(source['faculty']['departmentKind'], 'history')
                self.assertFalse(source['faculty']['examSetterInference'])
                self.assertEqual(source['paper']['verifiedAt'], '2026-10-13')
                self.assertEqual(source['paper']['readScope'], 'abstract')
                self.assertEqual(len(source['questions']), 3)

    def test_invented_textbook_quote_is_rejected(self):
        rows = expansion.sources('seoyangsa')
        rows[0]['questions'][0]['anchor'][1] = '출처에 존재하지 않는 문장'
        with patch.object(expansion, 'sources', return_value=rows), self.assertRaises(AssertionError):
            expansion.apply(self.report)

    def test_wrong_faculty_paper_link_is_rejected(self):
        rows = expansion.sources('seoyangsa')
        rows[0]['paper']['facultyIds'] = ['different-person']
        with patch.object(expansion, 'sources', return_value=rows), self.assertRaises(AssertionError):
            expansion.apply(self.report)

    def test_metadata_only_cannot_be_used_for_research_content(self):
        rows = expansion.sources('seoyangsa')
        rows[0]['paper']['readScope'] = 'metadata-only'
        with patch.object(expansion, 'sources', return_value=rows), self.assertRaises(AssertionError):
            expansion.apply(self.report)


if __name__ == '__main__':
    unittest.main()
