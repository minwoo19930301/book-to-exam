import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreQuestionOrder, shuffleQuestions } from '../src/question-order.js';
import { gradeOnEnter } from '../src/grade-key.js';

const questions = ['a', 'b', 'c', 'd'].map(id => ({ id, prompt: id }));
const ids = rows => rows.map(question => question.id);

test('random practice visits every question once without mutating the source bank', () => {
  const shuffled = shuffleQuestions(questions, () => 0);
  assert.notDeepEqual(ids(shuffled), ids(questions));
  assert.deepEqual(ids(shuffled).sort(), ids(questions));
  assert.equal(new Set(ids(shuffled)).size, questions.length);
  assert.deepEqual(ids(questions), ['a', 'b', 'c', 'd']);
  assert.deepEqual(shuffleQuestions([]), []);
  assert.deepEqual(shuffleQuestions(questions.slice(0, 1)), questions.slice(0, 1));
  assert.notDeepEqual(ids(shuffleQuestions(questions, () => 0.9999)), ids(questions));
});

test('saved random order survives reload, additions and removals by question identity', () => {
  assert.deepEqual(ids(restoreQuestionOrder(questions, ['c', 'a', 'd', 'b'])), ['c', 'a', 'd', 'b']);
  const changed = [...questions.filter(question => question.id !== 'b'), { id: 'e' }, { id: 'f' }];
  const restored = ids(restoreQuestionOrder(changed, ['c', 'a', 'd', 'b'], () => 0));
  assert.deepEqual(restored.slice(0, 3), ['c', 'a', 'd']);
  assert.deepEqual(restored.slice(3).sort(), ['e', 'f']);
});

test('legacy or malformed session order cannot hide or duplicate questions', () => {
  for (const saved of [undefined, 'a,b', {}, ['a', 'a', 'deleted', null]]) {
    const restored = restoreQuestionOrder(questions, saved, () => 0);
    assert.deepEqual(ids(restored).sort(), ids(questions));
  }
});

function key(patch = {}) {
  const event = { key: 'Enter', nativeEvent: {}, preventDefault() { this.prevented = true; }, ...patch };
  let graded = 0;
  gradeOnEnter(event, () => graded++, { disabled: Boolean(patch.disabled) });
  return { graded, prevented: Boolean(event.prevented) };
}

test('Enter grades while Shift+Enter preserves multiline answers', () => {
  assert.deepEqual(key(), { graded: 1, prevented: true });
  assert.deepEqual(key({ shiftKey: true }), { graded: 0, prevented: false });
  for (const patch of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { key: 'a' }]) assert.equal(key(patch).graded, 0);
});

test('Korean IME confirmation never submits or interferes with composing text', () => {
  for (const patch of [{ nativeEvent: { isComposing: true } }, { isComposing: true }, { nativeEvent: { keyCode: 229 } }, { keyCode: 229 }]) {
    assert.deepEqual(key(patch), { graded: 0, prevented: false });
  }
});

test('held Enter and disabled grading do not submit; native navigation still works', () => {
  assert.deepEqual(key({ repeat: true }), { graded: 0, prevented: true });
  assert.deepEqual(key({ disabled: true }), { graded: 0, prevented: true });
  assert.deepEqual(key({ defaultPrevented: true }), { graded: 0, prevented: false });
  assert.deepEqual(key({ target: { closest: () => ({ tagName: 'BUTTON' }) } }), { graded: 0, prevented: false });
});
