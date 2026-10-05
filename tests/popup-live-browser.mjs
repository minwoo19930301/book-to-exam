// Works against built/production assets; uses only UI and public read APIs.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const { items } = await fetch(`${origin}/api/practice-bank?subject=hanguksa&type=short&pageSize=20`).then(response => response.json());
  const question = items[0];
  await page.goto(`${origin}/short?subject=hanguksa&q=${question.id}`);
  await page.getByLabel('단답형 답안').fill('팝업 동작 검증용 오답');
  await page.getByRole('button', { name: '채점', exact: true }).click();
  await page.locator('.typed').waitFor();
  const studyUrl = page.url();
  await page.getByRole('button', { name: '히스토리', exact: true }).click();
  let history = page.getByRole('dialog', { name: '히스토리', exact: true });
  await history.locator('.history-entry').waitFor();
  assert.equal(page.url(), studyUrl);
  await history.getByLabel('결과', { exact: true }).selectOption('incorrect');
  assert.equal(await history.locator('.history-entry').count(), 1);
  await history.getByRole('link', { name: '새 시도로 다시 풀기' }).click();
  await history.waitFor({ state: 'hidden' });
  await page.getByLabel('단답형 답안').fill('팝업 뒤에도 남는 작성 중 답안');
  await page.getByRole('button', { name: '히스토리', exact: true }).click();
  await history.waitFor();
  await page.keyboard.press('Escape');
  await history.waitFor({ state: 'hidden' });
  assert.equal(await page.getByLabel('단답형 답안').inputValue(), '팝업 뒤에도 남는 작성 중 답안');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), '히스토리');

  // Old bookmarked routes open a popup over a usable study screen.
  const back = `/short?subject=hanguksa&q=${question.id}`;
  await page.goto(`${origin}/appeal?${new URLSearchParams({ subject: 'hanguksa', type: 'short', question: question.id, from: back })}`);
  const appeal = page.getByRole('dialog', { name: '이의제기', exact: true });
  await appeal.getByLabel('이의제기 내용').waitFor();
  assert.equal(new URL(page.url()).pathname, '/short');
  assert.equal(await appeal.locator('textarea').count(), 1);
  assert.equal(await appeal.locator('input,select').count(), 0);
  await appeal.getByRole('button', { name: '이의제기 닫기' }).click();
  await page.getByLabel('단답형 답안').waitFor();
  await page.getByRole('link', { name: '뷰어', exact: true }).click();
  await page.getByRole('region', { name: '선택한 원문' }).waitFor();
  await page.getByRole('button', { name: '이의제기', exact: true }).click();
  await appeal.getByLabel('이의제기 내용').fill('다른 화면에서 작성한 의견');
  await page.goBack();
  await appeal.getByLabel('이의제기 내용').waitFor();
  assert.equal(new URL(page.url()).pathname, '/short');
  assert.equal(await appeal.getByLabel('이의제기 내용').inputValue(), '', 'a different popup context never inherits the previous draft or receipt');
  await appeal.getByRole('button', { name: '이의제기 닫기' }).click();
  await page.goto(`${origin}/history?subject=hanguksa`);
  await history.locator('.history-entry').first().waitFor();
  assert.notEqual(new URL(page.url()).pathname, '/history');
  await history.getByRole('button', { name: '히스토리 닫기' }).click();

  // Viewer feedback identifies the displayed first page even with no page query.
  const notes = await fetch(`${origin}/data/subjects/hanguksa/notes.json`).then(response => response.json());
  await page.goto(`${origin}/viewer?subject=hanguksa`);
  await page.getByRole('region', { name: '선택한 원문' }).waitFor();
  await page.getByRole('button', { name: '이의제기', exact: true }).click();
  await appeal.getByLabel('이의제기 내용').fill('화면 정보 연결 확인');
  let payload;
  await page.route('**/api/appeals', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { error: '검증용 응답' } });
  });
  await appeal.getByRole('button', { name: '전송', exact: true }).click();
  await appeal.getByRole('alert').waitFor();
  assert.equal(new URL(payload.source, origin).searchParams.get('page'), notes[0].id);
  assert.equal(payload.context, null);
  await appeal.getByRole('button', { name: '이의제기 닫기' }).click();
  assert.deepEqual(errors, []);
  console.log('Built-site popups passed: history filters/retry, preserved draft/focus, legacy bookmarks, single feedback input, exact viewer page. No appeals saved.');
} finally { await context.close(); await browser.close(); }
