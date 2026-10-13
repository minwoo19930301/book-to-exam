// Run against Vite or a deployed build. Real banks/history; AI scoring never leaves the test.
import assert from 'node:assert/strict';
import { shortStudyMode, usesExactPassage } from '../src/source-excerpts.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const subject = 'seoyangsa';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(10000);

async function readBank(name) {
  const response = await fetch(`${origin}/data/subjects/${subject}/${name}.json`);
  assert.ok(response.ok, `${name}: real bank available`);
  return response.json();
}
const [questions, blanks, essays] = await Promise.all(['questions', 'blanks', 'essays'].map(readBank));
const modes = [
  { route: 'short', type: 'short', rows: questions.filter(row => row.type === 'blank'), eligible: row => shortStudyMode(row) === 'source', label: '단답형 답안', filter: 'source', result: '.typed .mark-ok' },
  { route: 'blank', type: 'blank', rows: blanks, eligible: usesExactPassage, label: '빈칸 답안', filter: 'source', result: '.cloze .mark-ok' },
  { route: 'quiz', type: 'mc', rows: questions.filter(row => row.type === 'mc'), eligible: () => true, result: '.choice.ok' },
  { route: 'essay', type: 'essay', rows: essays, eligible: () => true, label: '서술형 답안', result: '[aria-label="채점 결과"]' },
];
for (const mode of modes) {
  mode.question = mode.rows.find(mode.eligible);
  assert.ok(mode.question, `${mode.type}: eligible fixture from current bank`);
}

// Public IndexedDB schema also works against production, where source imports do not.
function storedBank({ type, questionId, graded = false }) {
  return new Promise((resolve, reject) => {
    const opened = indexedDB.open('bte-study-history', 1);
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result;
      if (!db.objectStoreNames.contains('sessions')) { db.close(); resolve(false); return; }
      const tx = db.transaction(['sessions', 'attempts'], 'readonly');
      const session = tx.objectStore('sessions').get(`seoyangsa:${type}`);
      const attempts = tx.objectStore('attempts').getAll();
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => {
        db.close();
        const state = { session: session.result, attempts: attempts.result.filter(row => row.subject === 'seoyangsa' && row.type === type) };
        if (questionId) resolve(state.session?.questionId === questionId && (!graded || state.attempts.some(row => row.questionId === questionId && row.result)));
        else resolve(state);
      };
    };
  });
}
const settleBank = (mode, questionId, graded = false) => page.waitForFunction(storedBank, { type: mode.type, questionId, graded });
const stateOf = mode => page.evaluate(storedBank, { type: mode.type });
const currentId = () => new URL(page.url()).searchParams.get('q');
const rendered = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const frame = () => page.locator('.exam-wrap');
const toolbar = () => page.getByRole('group', { name: '문제 이동 및 채점', exact: true });
async function open(mode, retry = 'enter-next') {
  const params = new URLSearchParams({ subject, q: mode.question.id, retry: `${retry}-${mode.type}` });
  if (mode.filter) params.set('mode', mode.filter);
  await page.goto(`${origin}/${mode.route}?${params}`, { waitUntil: 'domcontentloaded' });
  await toolbar().waitFor();
  await settleBank(mode, mode.question.id);
  assert.equal(currentId(), mode.question.id, `${mode.type}: explicit question is honored`);
  return mode.label ? page.getByLabel(mode.label, { exact: true }) : page.locator('.q input[type=radio]');
}
function filteredOrder(mode, state) {
  const byId = new Map(mode.rows.map(row => [row.id, row]));
  return state.session.order.filter(id => byId.has(id) && mode.eligible(byId.get(id)));
}
async function assertStayed(id, reason) {
  await rendered();
  assert.equal(currentId(), id, reason);
}
async function expectFocusedAnswer(mode) {
  const selector = mode.type === 'mc' ? '.q input[type=radio]:not(:disabled)' : `[aria-label="${mode.label}"]:not(:disabled)`;
  await page.waitForFunction(selector => document.activeElement?.matches(selector), selector);
}
async function guardKeys(mode) {
  await frame().focus();
  for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    await frame().dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...fields });
    await assertStayed(mode.question.id, `${mode.type}: guarded Enter ${JSON.stringify(fields)} must not advance`);
  }
}
async function assertToolbarHitTargets() {
  for (const name of ['이전 문제', '다음 문제']) {
    const button = toolbar().getByRole('button', { name, exact: true });
    assert.ok(await button.evaluate(element => {
      const r = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), `${name}: toolbar is reachable, including while essay grading methods are open`);
  }
}

let scoreRequests = 0;
let releaseScore;
await page.route('**/api/score', async route => {
  scoreRequests++;
  await new Promise(resolve => { releaseScore = resolve; });
  await route.fulfill({ json: { total: 7, max: 10, feedback: '실제 AI를 호출하지 않는 회귀 검증 결과', items: [] } });
});
// Defense in depth: even future model-list changes cannot spend resources.
await page.route('**/api/models', route => route.fulfill({ json: { models: [{ id: 'gemini-2.0-flash', label: '검증용 모델' }] } }));

try {
  for (const mode of modes) {
    const input = await open(mode);
    const initial = await stateOf(mode);
    const order = filteredOrder(mode, initial);
    assert.ok(order.length > 3, `${mode.type}: enough real filtered questions`);
    const index = order.indexOf(mode.question.id);
    const nextId = order[(index + 1) % order.length];
    if (mode.type === 'mc') await input.nth(mode.question.answer).check();
    else await input.fill(mode.type === 'essay' ? '사료와 역사적 맥락을 연결해 해석한 서술형 답안입니다.' : String(mode.question.answer));
    const gradeInput = mode.type === 'mc' ? input.nth(mode.question.answer) : input;
    if (['blank', 'essay'].includes(mode.type)) {
      await gradeInput.press('Shift+Enter');
      assert.match(await gradeInput.inputValue(), /\n$/);
    }
    for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
      await gradeInput.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...fields });
      assert.equal(await page.locator(mode.result).count(), 0, `${mode.type}: IME/repeat must not grade`);
    }
    await gradeInput.press('Enter');
    if (mode.type === 'essay') {
      await page.getByRole('button', { name: 'AI API 키', exact: true }).waitFor();
      await assertStayed(mode.question.id, 'essay: initial Enter opens grading choice, not next question');
      await assertToolbarHitTargets();
      await page.getByRole('button', { name: 'AI API 키', exact: true }).click();
      await page.getByPlaceholder('API 키', { exact: true }).fill('AIza-demo-enter-next-only');
      await page.getByRole('button', { name: '이 모델로 채점', exact: true }).waitFor();
      await gradeInput.evaluate(element => {
        for (let i = 0; i < 2; i++) element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });
      await page.getByText('근거를 확인하고 채점 중…', { exact: true }).waitFor();
      assert.equal(scoreRequests, 1, 'essay: simultaneous grading submits once');
      await frame().focus();
      await page.keyboard.press('Enter');
      await assertStayed(mode.question.id, 'essay: Enter during pending grade cannot skip');
      releaseScore();
    }
    await page.locator(mode.result).waitFor();
    await page.getByText('채점 완료 · Enter로 다음 문제', { exact: true }).waitFor();
    await settleBank(mode, mode.question.id, true);
    await assertStayed(mode.question.id, `${mode.type}: the grading Enter must show this result only`);
    const graded = await stateOf(mode);
    assert.equal(graded.attempts.filter(row => row.questionId === mode.question.id && row.result).length, 1, `${mode.type}: grade is recorded once`);
    await guardKeys(mode);

    // Enter in the jump form must retain its form semantics, not invoke next.
    const number = page.getByLabel('문항 번호', { exact: true });
    await number.fill(String(index + 1));
    await number.press('Enter');
    await assertStayed(mode.question.id, `${mode.type}: question-number Enter cannot advance`);

    if (mode.type === 'short') {
      for (const name of ['이의제기', '히스토리', '설정']) {
        await page.getByRole('button', { name, exact: true }).click();
        const dialog = page.getByRole('dialog', { name, exact: true });
        await dialog.waitFor();
        await dialog.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        await assertStayed(mode.question.id, `${name}: Enter cannot operate the graded page behind popup`);
        await assert.rejects(toolbar().getByRole('button', { name: '다음 문제', exact: true }).click({ trial: true, timeout: 350 }), `${name}: overlay must intercept underlying next button`);
        if (name === '이의제기') {
          await dialog.getByLabel('이의제기 내용', { exact: true }).fill('테스트 메모');
          await dialog.getByLabel('이의제기 내용', { exact: true }).press('Enter');
          await assertStayed(mode.question.id, 'appeal input Enter never advances');
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
      }
    }

    await frame().focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(url => url.searchParams.get('q') === nextId);
    await settleBank(mode, nextId);
    await expectFocusedAnswer(mode);
    assert.equal(await page.locator(mode.result).count(), 0, `${mode.type}: new question starts ungraded`);
    assert.deepEqual((await stateOf(mode)).session.order, initial.session.order, `${mode.type}: next preserves randomized order`);
    if (mode.filter) assert.equal(new URL(page.url()).searchParams.get('mode'), mode.filter, `${mode.type}: source filter survives next`);

    // Native Enter on navigation buttons remains operational, exactly once.
    if (index < order.length - 1) {
      await toolbar().getByRole('button', { name: '이전 문제', exact: true }).press('Enter');
      await page.waitForURL(url => url.searchParams.get('q') === mode.question.id);
      await page.locator(mode.result).waitFor();
      await toolbar().getByRole('button', { name: '다음 문제', exact: true }).press('Enter');
      await page.waitForURL(url => url.searchParams.get('q') === nextId);
      await expectFocusedAnswer(mode);
    }
    console.log(`${mode.type}: first Enter grades; result Enter advances within saved order/filter; guards and focus passed.`);
  }

  // Test the actual responsive toolbar and long real source cards, without synthetic content.
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => localStorage.setItem('bve-settings', JSON.stringify({ fontSize: 22, lineHeight: 1.7, dark: false })));
    for (const mode of modes) {
      await open(mode, `layout-${width}`);
      await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--fs').trim() === '22px');
      await page.evaluate(() => window.scrollTo(0, 0));
      await rendered();
      const before = await toolbar().boundingBox();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await rendered();
      const after = await toolbar().boundingBox();
      assert.ok(Math.abs(before.y - after.y) <= 1, `${mode.type}/${width}: toolbar must stay fixed while scrolling`);
      assert.ok(Math.abs(after.y + after.height - 844) <= 1, `${mode.type}/${width}: toolbar is anchored at viewport bottom`);
      assert.ok(after.x >= -1 && after.x + after.width <= width + 1, `${mode.type}/${width}: toolbar fits viewport`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode.type}/${width}: no horizontal overflow at 22px`);
      const card = await page.locator('.card.q').boundingBox();
      assert.ok(card.y + card.height <= after.y + 1, `${mode.type}/${width}: final question content can scroll clear of toolbar`);
      const buttons = await toolbar().getByRole('button').evaluateAll(elements => elements.map(element => {
        const r = element.getBoundingClientRect();
        return { text: element.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height };
      }));
      for (const button of buttons) {
        assert.ok(button.x >= 0 && button.right <= width && button.y >= after.y && button.bottom <= 844, `${mode.type}/${width}: ${button.text} is fully visible`);
        assert.ok(button.height >= 44, `${mode.type}/${width}: ${button.text} retains a usable touch target`);
      }
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i], b = buttons[j];
        assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `${mode.type}/${width}: toolbar buttons do not overlap`);
      }
      await assertToolbarHitTargets();
    }
    console.log(`Layout ${width}px/22px: all four toolbars fixed, unobscured, no overflow or overlapping controls.`);
  }
  assert.equal(scoreRequests, 1, 'only the mocked essay request was made');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('Enter-next regression passed: four modes, explicit IDs, filtered randomized next, single grading, keyboard guards, popup isolation, focus and responsive fixed toolbars.');
} finally {
  await context.close();
  await browser.close();
}
