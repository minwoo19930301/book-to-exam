// Real local Pages + D1 integration. Production runs must explicitly supply
// APPEALS_TEST_ALLOW_LIVE=1; every receipt is printed for operator cleanup.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.APPEALS_TEST_BASE_URL || 'http://localhost:4188';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname) && process.env.APPEALS_TEST_ALLOW_LIVE !== '1') throw new Error('Live submissions require explicit test opt-in.');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${origin}/short?subject=hanguksa`);
  await page.getByLabel('단답형 답안').fill('접수 동작 확인용 답안');
  await page.getByRole('button', { name: '채점', exact: true }).click();
  await page.locator('.typed').waitFor();
  await page.getByRole('link', { name: '이의제기', exact: true }).click();
  await page.getByRole('heading', { name: '이의제기', exact: true }).waitFor();
  await page.getByLabel('현재 문항·내 답·채점 결과 함께 보내기').waitFor();
  assert.equal(await page.getByLabel('과목', { exact: true }).inputValue(), 'hanguksa');
  await page.locator('.appeal-context summary').click();
  assert.match(await page.locator('.appeal-context').innerText(), /접수 동작 확인용 답안/);
  assert.match(await page.locator('.appeal-context').innerText(), /오답/);
  await page.getByLabel('이의제기 내용', { exact: true }).fill('[자동 검증] 이의제기 저장·답안 연결 확인입니다. 검증 후 삭제 대상입니다.');
  await page.getByLabel('제안하는 정답 / 인정해야 할 답').fill('테스트 답안');
  let attemptId;
  await page.route('**/api/appeals', async route => {
    attemptId = JSON.parse(route.request().postData()).id;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '검증용 일시 저장 오류' }) });
  });
  await page.getByRole('button', { name: '이의제기 제출', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '검증용 일시 저장 오류' }).waitFor();
  assert.match(await page.getByLabel('이의제기 내용', { exact: true }).inputValue(), /자동 검증/);
  await page.unroute('**/api/appeals');
  const received = page.waitForResponse(response => response.url().endsWith('/api/appeals') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '이의제기 제출', exact: true }).click();
  const response = await received;
  assert.equal(response.status(), 201);
  const receipt = await response.json();
  assert.equal(receipt.id, attemptId, 'network retry retains the same idempotency key');
  await page.getByRole('heading', { name: '이의제기를 접수했습니다.' }).waitFor();
  assert.match(await page.locator('.appeal-receipt').innerText(), new RegExp(receipt.id));
  console.log(JSON.stringify({ receipt: receipt.id, origin, tests: ['question attachment', 'answer and score', 'save failure keeps input', 'idempotent retry', 'D1 receipt'] }));
  const responseGet = await context.request.get(`${origin}/api/appeals`);
  assert.equal(responseGet.status(), 405);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.goto(`${origin}/appeal?subject=all`);
  await page.getByLabel('이의제기 내용', { exact: true }).fill('과목을 선택하지 않은 일반 의견');
  assert.equal(await page.getByRole('button', { name: '이의제기 제출', exact: true }).isDisabled(), true);
  await page.getByLabel('과목', { exact: true }).selectOption('seoyangsa');
  await page.waitForFunction(() => !document.querySelector('.appeal-actions button')?.disabled);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
} finally { await context.close(); await browser.close(); }
