import test from 'node:test';
import assert from 'node:assert/strict';
import { buildViewerIndex, searchViewerNotes, highlightParts, normalizeSearchText, noteLocation } from '../src/viewer-search.js';

const notes = [
  { id: 'textbook-90', kind: 'textbook', title: '로마 시민권', text: '먼저 기록\n카라 칼라 황제는\n시 민 권을 부여했다.\nNew Economic Policy는 다른 시대이다.', source: { pageLabel: '22–23쪽' } },
  { id: 'exam-1', kind: 'gichul', title: '러시아 혁명', text: 'NEP와 시장 요소를 비교한다. 특수 문자 C++ [x] a.b를 그대로 찾는다.', source: { printedPages: [56] } },
  { id: 'p1', title: '반례', text: '칼라 카라, 로마라는 글자만 있는 자료' },
];
const index = buildViewerIndex(notes);
const ids = query => searchViewerNotes(index, query).map(row => row.note.id);

test('partial matching ignores source spaces, newlines and case while AND terms can occur in different fields', () => {
  assert.deepEqual(ids('카라칼라'), ['textbook-90']);
  assert.deepEqual(ids('로마 economicPOLICY'), ['textbook-90']);
  assert.deepEqual(ids('러시아 시장'), ['exam-1']);
  assert.deepEqual(ids('러시아 카라칼라'), []);
  assert.equal(normalizeSearchText(' N eW\n정책\t'), 'new정책');
});

test('percent wildcards match literal pieces in order, including zero characters', () => {
  assert.deepEqual(ids('카라%황제'), ['textbook-90']);
  assert.deepEqual(ids('카라%칼라'), ['textbook-90']);
  assert.deepEqual(ids('황제%카라'), []);
  assert.deepEqual(ids('러시아%시장'), [], 'one pattern must match inside one field');
  assert.deepEqual(ids('%'), notes.map(note => note.id));
  assert.deepEqual(ids(' % NEP'), ['exam-1']);
  assert.deepEqual(ids('  \n'), []);
});

test('regex syntax stays literal and cannot expand results or throw', () => {
  assert.deepEqual(ids('C++ [x] a.b'), ['exam-1']);
  assert.deepEqual(ids('a.*b'), []);
  assert.deepEqual(ids('['), ['exam-1']);
  assert.deepEqual(ids('(?='), []);
});

test('highlights preserve the exact displayed whitespace of each matching span', () => {
  const row = searchViewerNotes(index, '시민권 카라칼라')[0];
  const parts = row.snippets.flatMap(snippet => highlightParts(snippet.text, snippet.ranges));
  assert.ok(parts.some(part => part.match && part.text === '카라 칼라'));
  assert.ok(parts.some(part => part.match && part.text === '시 민 권'));
  for (const snippet of row.snippets) assert.equal(highlightParts(snippet.text, snippet.ranges).map(part => part.text).join(''), snippet.text);
  assert.deepEqual(highlightParts(row.title.text, row.titleRanges).filter(part => part.match).map(part => part.text), ['시민권']);
});

test('snippets reach late full-text matches and preserve separate contexts for distant AND matches', () => {
  const text = '앞 문단 '.repeat(100) + '베스트\n팔렌 조약' + '중간 문단 '.repeat(100) + '주권 국가' + '뒷 문단 '.repeat(100);
  const row = searchViewerNotes(buildViewerIndex([{ id: 'long', title: '자료', text }]), '베스트팔렌 주권국가')[0];
  assert.equal(row.snippets.length, 2);
  assert.ok(row.snippets[0].before && row.snippets[1].after);
  const matches = row.snippets.flatMap(snippet => highlightParts(snippet.text, snippet.ranges).filter(part => part.match).map(part => part.text));
  assert.deepEqual(matches, ['베스트\n팔렌', '주권 국가']);
});

test('normalization and source offsets support decomposed Korean and Unicode characters', () => {
  const unicode = buildViewerIndex([{ id: 'unicode', title: '한글'.normalize('NFD'), text: '😀 앞\nİSTANBUL 뒤 😀' }]);
  const row = searchViewerNotes(unicode, '한글 i\u0307stanbul')[0];
  assert.ok(row);
  assert.deepEqual(row.snippets.flatMap(s => highlightParts(s.text, s.ranges)).filter(p => p.match).map(p => p.text), ['İSTANBUL']);
  assert.deepEqual(searchViewerNotes(unicode, '😀').map(row => row.note.id), ['unicode']);
});

test('page labels use source metadata, and search never mutates supplied notes', () => {
  const before = JSON.stringify(notes);
  searchViewerNotes(index, '로마');
  assert.equal(JSON.stringify(notes), before);
  assert.equal(noteLocation(notes[0], 0), '교재 · 22–23쪽');
  assert.equal(noteLocation(notes[1], 1), '기출 · 56쪽');
  assert.equal(noteLocation(notes[2], 2), '메모 · 자료 3');
});
