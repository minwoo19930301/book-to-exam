import unittest

from build import DOM, concept_exam_refs, outer_wrappers, quality_flags, source_chapters, source_for, terms
from search import search


class ImportTests(unittest.TestCase):
    def test_nested_wrapper_is_imported_once_and_entities_preserved(self):
        root = DOM('<section class="book-page-card"><div class="raw-text-wrapper"><h3>A &amp; B</h3><div class="raw-text-wrapper"><p>① <strong>개념</strong> ㉠</p></div></div><script>bad()</script></section>').root
        wrappers = outer_wrappers(root.find(cls="book-page-card")[0])
        self.assertEqual(len(wrappers), 1)
        self.assertEqual(wrappers[0].text(), 'A & B\n① 개념 ㉠')

    def test_printed_pages_never_inferred_from_anchor_or_spread_index(self):
        src = source_for('source.html', 'a' * 40, 'page-71', '펼침 71', 'textbook')
        self.assertNotIn('printedPages', src)
        self.assertEqual(source_for('source.html', 'a' * 40, 'page-311', '2–3쪽', 'textbook')['printedPages'], [2, 3])
        self.assertFalse(src['scanVerified'])

    def test_navigation_uses_source_heading(self):
        root = DOM('<div class="toc-chapter-header">PART 1 고대</div><a class="toc-item" href="#page-3">메소포타미아</a><div class="toc-chapter-header">PART 2 중세</div><a class="toc-item" href="#page-9">봉건제</a>').root
        self.assertEqual(source_chapters(root), {'page-3': 'PART 1 고대', 'page-9': 'PART 2 중세'})

    def test_source_noise_never_becomes_automatic_exam_material(self):
        quality = quality_flags('OCR 확인 필요 �', '원문')
        self.assertIn('source-noise-or-placeholder', quality['flags'])
        self.assertFalse(quality['automaticExamEligible'])

    def test_retrieval_matches_actual_text_and_filter(self):
        records = [dict(id='x', subject='hanguksa', kind='curated-concept', title='균역법', text='균역법으로 군포 부담을 줄였다.', sourceUrl='https://example.org/source'), dict(id='y', subject='kice', kind='exam-page-excerpt', title='2024 전공A', text='다음 균역법 자료를 읽으시오.', sourceUrl='https://example.org/exam')]
        result = search('균역법', records, 'kice')
        self.assertEqual([r['id'] for r in result], ['y'])
        self.assertEqual(result[0]['matchStatus'], 'candidate')
        self.assertIn(result[0]['excerpt'], records[1]['text'])
        self.assertEqual(search('없는개념', records), [])

    def test_concept_exam_link_requires_concept_not_generic_page_words(self):
        def exam(id, text):
            return dict(id=id, title=id, text=text, sourceUrl='https://example.org/' + id, source={'pageLabel': '2면'}, document={'id': id, 'year': '2026'})
        exams = [exam('wrong', '십자군 전쟁의 영향과 조약과 관련된 문제'), exam('right', '베스트팔렌\n조약이 유럽에 미친 영향을 쓰시오.')]
        refs = concept_exam_refs('베스트팔렌 조약', exams)
        self.assertEqual([r['id'] for r in refs], ['right'])
        self.assertIn(refs[0]['excerpt'], exams[1]['text'])
        self.assertNotIn('전쟁의', terms('전쟁의 조약과 배경 내용의'))
        self.assertNotIn('조약과', terms('전쟁의 조약과 배경 내용의'))


if __name__ == '__main__':
    unittest.main()
