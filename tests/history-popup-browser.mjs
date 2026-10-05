// Run against Vite with PLAYWRIGHT_MODULE pointing to Playwright's index.mjs.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.HISTORY_TEST_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const attempts = () => page.evaluate(async () => (await import('/src/history-store.js')).historyStore.listAttempts());
const waitCount = count => page.waitForFunction(async count => (await (await import('/src/history-store.js')).historyStore.listAttempts()).length === count, count);
const dialog = () => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '나의 풀이 기록', exact: true }) });
async function openHistory() {
  await page.getByRole('button', { name: '히스토리', exact: true }).click();
  await dialog().getByRole('heading', { name: '나의 풀이 기록', exact: true }).waitFor();
  await dialog().getByRole('status').filter({ hasText: /개의 풀이 기록/ }).waitFor();
  assert.match(await dialog().innerText(), /30일/);
  return dialog();
}
async function closeWithEscape() {
  await page.keyboard.press('Escape');
  await dialog().waitFor({ state: 'detached' });
}
try {
  await page.goto(`${origin}/short?subject=hanguksa`);
  const answer = page.getByLabel('단답형 답안');
  await answer.fill('히스토리를 열어도 보존할 작성 중 답안');
  await waitCount(1);
  const first = (await attempts())[0];
  const beforePopup = page.url();
  let panel = await openHistory();
  assert.equal(page.url(), beforePopup, 'opening history must keep the current study route');
  await panel.getByText('내 답안과 결과 보기', { exact: true }).click();
  assert.equal(await panel.locator('.history-answer').innerText(), '히스토리를 열어도 보존할 작성 중 답안');
  await closeWithEscape();
  assert.equal(await answer.inputValue(), '히스토리를 열어도 보존할 작성 중 답안');
  assert.equal(await page.getByRole('button', { name: '히스토리', exact: true }).evaluate(node => node === document.activeElement), true);
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');

  await page.getByRole('button', { name: '채점', exact: true }).click();
  await page.waitForFunction(async () => (await (await import('/src/history-store.js')).historyStore.listAttempts()).some(row => row.result?.good === false));
  await page.getByRole('button', { name: '다시 풀기', exact: true }).click();
  await answer.fill(String(first.question.answer));
  await page.getByRole('button', { name: '채점', exact: true }).click();
  await page.waitForFunction(async () => (await (await import('/src/history-store.js')).historyStore.listAttempts()).some(row => row.result?.good === true));
  await waitCount(2);

  // Real IndexedDB records for result states that must remain readable in the popup.
  await page.evaluate(async () => {
    const { historyStore } = await import('/src/history-store.js');
    const now = Date.now();
    for (const row of [
      { id: 'popup-review', subject: 'dongyangsa', type: 'blank', questionId: 'popup-review-question', question: { prompt: '표현 검토가 필요한 답안', answer: '원문 용어' }, value: '다른 표현', result: { good: null, status: 'review', score: null, max: 1, explain: '표현을 원문과 비교해 주세요.' } },
      { id: 'popup-essay', subject: 'seoyangsa', type: 'essay', questionId: 'popup-essay-question', question: { title: '서술형 보관 검증', prompt: '근거를 서술하시오.' }, value: '보관한 서술형 답안', result: { total: 7, max: 10, feedback: '일부 근거 보완', items: [{ id: 'r1', label: '근거 제시', score: 3, max: 4, comment: '일부 충족', studentQuote: '보관한 서술형 답안' }] } },
    ]) await historyStore.saveAttempt({ ...row, startedAt: now, updatedAt: now, attemptNumber: 1 });
  });
  await waitCount(4);
  panel = await openHistory();
  await panel.getByLabel('결과', { exact: true }).selectOption('correct');
  assert.equal(await panel.locator('.history-entry').count(), 1);
  await panel.getByRole('link', { name: '새 시도로 다시 풀기', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await answer.waitFor();
  assert.equal(await answer.inputValue(), '');
  assert.equal(new URL(page.url()).searchParams.get('q'), first.questionId);
  assert.equal(new URL(page.url()).searchParams.get('subject'), 'hanguksa');
  await waitCount(5);
  await page.reload();
  await answer.waitFor();
  assert.equal((await attempts()).length, 5, 'retry reload must not create another attempt');

  panel = await openHistory();
  await panel.getByLabel('기록 과목', { exact: true }).selectOption('hanguksa');
  await panel.getByLabel('기록 유형', { exact: true }).selectOption('short');
  await panel.getByLabel('결과', { exact: true }).selectOption('incorrect');
  assert.equal(await panel.locator('.history-entry').count(), 1);
  await panel.getByRole('link', { name: '새 시도로 다시 풀기', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await waitCount(6);
  assert.equal(await answer.inputValue(), '');
  panel = await openHistory();
  await panel.getByLabel('기록 과목', { exact: true }).selectOption('dongyangsa');
  await panel.getByLabel('결과', { exact: true }).selectOption('ungraded');
  assert.equal(await panel.locator('.history-entry').count(), 1);
  assert.match(await panel.locator('.history-outcome').innerText(), /검토 필요/);
  await panel.getByRole('button', { name: '기록 삭제', exact: true }).click();
  await waitCount(5);
  await panel.getByRole('heading', { name: '조건에 맞는 기록이 없습니다.', exact: true }).waitFor();
  await panel.getByLabel('기록 과목', { exact: true }).selectOption('seoyangsa');
  await panel.getByLabel('기록 유형', { exact: true }).selectOption('essay');
  await panel.getByLabel('결과', { exact: true }).selectOption('all');
  assert.match(await panel.locator('.history-outcome').innerText(), /7 \/ 10점/);
  await panel.getByText('내 답안과 결과 보기', { exact: true }).click();
  assert.match(await panel.locator('.score-items').innerText(), /근거 제시 · 3 \/ 4점/);
  await panel.getByRole('button', { name: '전체 삭제', exact: true }).click();
  await panel.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal((await attempts()).length, 5);
  await panel.getByRole('button', { name: '전체 삭제', exact: true }).click();
  await panel.getByRole('button', { name: '모든 기록 삭제', exact: true }).click();
  await waitCount(0);
  await panel.getByRole('heading', { name: '아직 풀이 기록이 없습니다.', exact: true }).waitFor();
  await panel.getByRole('link', { name: '학습하러 가기 ↗', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, '/menu');

  // Enough saved attempts to exercise scrolling and pagination at mobile width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { historyStore } = await import('/src/history-store.js');
    const { revision } = await historyStore.loadBank({ subject: 'hanguksa', type: 'short' });
    const now = Date.now();
    for (let index = 0; index < 31; index++) await historyStore.saveAttempt({ id: `popup-page-${index}`, subject: 'hanguksa', type: 'short', questionId: `popup-page-question-${index}`, question: { prompt: `페이지 이동 확인 문항 ${index}` }, value: '작성 답안', result: null, startedAt: now + index, updatedAt: now + index, attemptNumber: 1 }, { revision });
  });
  panel = await openHistory();
  assert.equal(await panel.locator('.history-entry').count(), 30);
  const bounds = await panel.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'mobile dialog must fit the viewport');
  await panel.getByRole('button', { name: '다음', exact: true }).click();
  assert.equal(await panel.locator('.history-entry').count(), 1);
  await panel.getByRole('button', { name: '이전', exact: true }).click();
  assert.equal(await panel.locator('.history-entry').count(), 30);
  await closeWithEscape();

  // Native modal must stay above the viewer's search/results and leave its draft intact.
  await page.goto(`${origin}/viewer?subject=hanguksa&q=${encodeURIComponent('삼국')}`);
  const search = page.getByRole('searchbox', { name: '현재 과목 원문 검색', exact: true });
  await search.fill('아직 제출하지 않은 검색어');
  const viewerUrl = page.url();
  panel = await openHistory();
  assert.equal(await panel.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), true, 'history must occupy the top layer above viewer content');
  await page.keyboard.press('ArrowRight');
  assert.equal(page.url(), viewerUrl, 'viewer keyboard shortcuts must not turn pages inside history');
  await panel.getByRole('button', { name: '히스토리 닫기', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  assert.equal(await search.inputValue(), '아직 제출하지 않은 검색어');
  assert.equal(page.url(), viewerUrl);
  await openHistory();
  await page.mouse.click(1, 1);
  await dialog().waitFor({ state: 'detached' });
  assert.equal(await search.inputValue(), '아직 제출하지 않은 검색어');
  assert.deepEqual(errors, []);
  console.log('History popup checks passed: route/draft retention, Escape/focus/backdrop, filters, review and essay details, correct/incorrect retries, deletion, empty navigation, mobile/pagination and viewer top-layer/search preservation.');
} finally { await context.close(); await browser.close(); }
