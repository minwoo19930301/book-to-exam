// Real local or deployed app; scoring transport is mocked only for the essay.
import assert from 'node:assert/strict';
import { shortStudyMode } from '../src/source-excerpts.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4196';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Inspect persisted data without importing source modules (not served in production).
const readStoredBank = ({ subject, type, waitForOrder = false, previous }) => new Promise((resolve, reject) => {
  const opened = indexedDB.open('bte-study-history', 1);
  opened.onerror = () => reject(opened.error);
  opened.onsuccess = () => {
    const db = opened.result;
    if (!db.objectStoreNames.contains('sessions')) { db.close(); resolve(false); return; }
    const tx = db.transaction(['sessions', 'attempts'], 'readonly');
    const session = tx.objectStore('sessions').get(`${subject}:${type}`);
    const attempts = tx.objectStore('attempts').getAll();
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.oncomplete = () => {
      db.close();
      const state = { session: session.result || null, attempts: attempts.result.filter(row => row.subject === subject && row.type === type) };
      resolve(waitForOrder ? Boolean(state.session?.order?.length && (!previous || JSON.stringify(state.session.order) !== JSON.stringify(previous))) : state);
    };
  };
});
const bankState = (subject, type) => page.evaluate(readStoredBank, { subject, type });
const settleSession = (subject, type) => page.waitForFunction(readStoredBank, { subject, type, waitForOrder: true });
const read = async name => fetch(`${origin}/data/subjects/seoyangsa/${name}.json`).then(response => response.json());
const questionRows = await read('questions');
const shortRows = questionRows.filter(row => row.type === 'blank');
const blankRows = await read('blanks');
const essayRows = await read('essays');
try {
  for (const [route, type, inputLabel] of [['short', 'short', '단답형 답안'], ['blank', 'blank', '빈칸 답안'], ['quiz', 'mc', null], ['essay', 'essay', '서술형 답안']]) {
    await page.goto(`${origin}/${route}?subject=seoyangsa`);
    await page.getByRole('button', { name: '순서 다시 섞기', exact: true }).waitFor();
    await settleSession('seoyangsa', type);
    const initial = await bankState('seoyangsa', type);
    assert.equal(new Set(initial.session.order).size, initial.session.order.length);
    const natural = (type === 'short' ? shortRows : type === 'blank' ? blankRows : type === 'essay' ? essayRows : questionRows.filter(row => row.type === 'mc')).map(row => row.id);
    assert.notDeepEqual(initial.session.order, natural, `${type}: random order on first visit`);
    await page.getByLabel('문항 번호').fill('2');
    await page.getByRole('button', { name: '이동', exact: true }).click();
    const chosen = initial.session.order[1];
    await page.waitForURL(url => url.searchParams.get('q') === chosen);
    if (inputLabel) await page.getByLabel(inputLabel).fill(`${type} 저장한 답안`);
    else await page.locator('input[type=radio]').first().check();
    await page.reload();
    await page.getByRole('button', { name: '순서 다시 섞기', exact: true }).waitFor();
    assert.equal(await page.getByLabel('문항 번호').inputValue(), '2');
    assert.deepEqual((await bankState('seoyangsa', type)).session.order, initial.session.order);
    if (inputLabel) assert.equal(await page.getByLabel(inputLabel).inputValue(), `${type} 저장한 답안`);
    else assert.ok(await page.locator('input[type=radio]').first().isChecked());
    await page.getByRole('button', { name: '순서 다시 섞기', exact: true }).click();
    await page.waitForFunction(readStoredBank, { subject: 'seoyangsa', type, previous: initial.session.order, waitForOrder: true });
    const shuffled = await bankState('seoyangsa', type);
    assert.equal(shuffled.session.questionId, chosen, 'reshuffle preserves current question');
    assert.deepEqual([...shuffled.session.order].sort(), [...initial.session.order].sort());
    assert.equal(shuffled.attempts.length, initial.attempts.length + 1, 'reshuffle must not create attempts');
    if (inputLabel) assert.equal(await page.getByLabel(inputLabel).inputValue(), `${type} 저장한 답안`);
    await page.reload();
    await page.getByRole('button', { name: '순서 다시 섞기', exact: true }).waitFor();
    assert.deepEqual((await bankState('seoyangsa', type)).session.order, shuffled.session.order);
  }
  const short = shortRows[0];
  await page.goto(`${origin}/short?subject=seoyangsa&q=${short.id}&retry=keyboard-test`);
  const input = page.getByLabel('단답형 답안');
  await input.fill(String(short.answer));
  for (const key of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
    await input.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...key });
    assert.equal(await page.locator('.typed').count(), 0, 'IME/repeat must not grade');
  }
  await input.press('Enter');
  await page.locator('.typed .mark-ok').waitFor();
  const shortState = await bankState('seoyangsa', 'short');
  assert.equal(shortState.attempts.filter(row => row.questionId === short.id && row.result).length, 1);
  const position = await page.getByLabel('문항 번호').inputValue();
  await page.goto(`${origin}/short?subject=seoyangsa`);
  await page.locator('.typed').waitFor();
  assert.equal(await page.getByLabel('문항 번호').inputValue(), position, 'resume preserves randomized position');
  await page.getByRole('button', { name: '히스토리', exact: true }).click();
  const entry = page.getByRole('dialog', { name: '히스토리', exact: true }).locator('.history-entry').filter({ hasText: short.prompt });
  await entry.getByRole('link', { name: '새 시도로 다시 풀기' }).first().click();
  await input.waitFor();
  assert.equal(await input.inputValue(), '');
  assert.equal(new URL(page.url()).searchParams.get('q'), short.id);
  assert.deepEqual((await bankState('seoyangsa', 'short')).session.order, shortState.session.order);
  // Type filters retain the saved random relative order and jump to its Nth item.
  await page.getByRole('button', { name: /^원문\d/ }).click();
  const filtered = (await bankState('seoyangsa', 'short')).session.order.filter(id => shortStudyMode(shortRows.find(row => row.id === id)) === 'source');
  assert.ok(filtered.length > 2);
  await page.getByLabel('문항 번호').fill('2');
  await page.getByRole('button', { name: '이동', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('q'), filtered[1]);
  const blank = blankRows.find(row => row.contextMode === 'source-excerpt');
  await page.goto(`${origin}/blank?subject=seoyangsa&q=${blank.id}&mode=source`);
  const blankInput = page.getByLabel('빈칸 답안');
  await blankInput.fill('첫 줄');
  await blankInput.press('Shift+Enter');
  assert.match(await blankInput.inputValue(), /\n$/);
  assert.equal(await page.locator('.cloze .mark-ok,.cloze .mark-bad').count(), 0);
  await blankInput.fill(String(blank.answer));
  await blankInput.press('Enter');
  await page.locator('.cloze .mark-ok').waitFor();
  const mc = questionRows.find(row => row.type === 'mc');
  await page.goto(`${origin}/quiz?subject=seoyangsa&q=${mc.id}`);
  const radio = page.locator('input[type=radio]').nth(mc.answer);
  await radio.check();
  await radio.press('Enter');
  await page.locator('.choice.ok').waitFor();
  const beforeNext = (await bankState('seoyangsa', 'mc')).session.questionId;
  await page.getByRole('button', { name: '다음 문제', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.notEqual(new URL(page.url()).searchParams.get('q'), beforeNext, 'card shortcut must not swallow keyboard navigation');
  let requests = 0, release;
  await page.route('**/api/score', async route => {
    requests++;
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { total: 7, max: 10, feedback: '검증용 결과', items: [] } });
  });
  await page.goto(`${origin}/essay?subject=seoyangsa&q=${essayRows[0].id}&retry=enter-essay`);
  const essayInput = page.getByLabel('서술형 답안');
  await essayInput.fill('역사적 근거를 제시하는 서술형 답안');
  await essayInput.press('Shift+Enter');
  assert.match(await essayInput.inputValue(), /\n$/);
  await essayInput.press('Enter');
  await page.getByRole('button', { name: 'AI API 키', exact: true }).click();
  await page.getByPlaceholder('API 키', { exact: true }).fill('AIza-demo-keyboard-only');
  await page.getByRole('button', { name: '이 모델로 채점', exact: true }).waitFor();
  await essayInput.evaluate(element => {
    for (let index = 0; index < 2; index++) element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  await page.getByText('근거를 확인하고 채점 중…', { exact: true }).waitFor();
  assert.equal(requests, 1, 'rapid repeated submissions issue only one score request');
  release();
  await page.getByRole('heading', { name: '7 / 10점', exact: true }).waitFor();
  const essayState = await bankState('seoyangsa', 'essay');
  assert.equal(essayState.attempts.filter(row => row.questionId === essayRows[0].id && row.result).length, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/short?subject=hanguksa`);
  await page.getByLabel('단답형 답안').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout');
  assert.deepEqual(errors, []);
  console.log('Random practice passed: all four modes, saved/reconciled order, reload, draft retention, reshuffle, filters, jump, history retry, IME-safe Enter, Shift+Enter, MC navigation and single essay submission.');
} finally { await context.close(); await browser.close(); }
