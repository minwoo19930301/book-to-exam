// Mocked receipts only: two tabs and failed storage must not substitute answers.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
async function open(page) {
  await page.getByRole('button', { name: '이의제기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '이의제기', exact: true });
  await dialog.getByLabel('이의제기 내용', { exact: true }).fill('현재 화면 문항과 내 답을 확인해 주세요.');
  return dialog;
}
async function inspect(page, dialog) {
  let payload;
  await page.route('**/api/appeals', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '검증용 저장 오류' }) });
  });
  await dialog.getByRole('button', { name: '전송', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  await page.unroute('**/api/appeals');
  await dialog.getByRole('button', { name: '이의제기 닫기', exact: true }).click();
  return payload;
}
try {
  const questions = (await fetch(`${origin}/api/practice-bank?subject=hanguksa&type=short&pageSize=20`).then(r => r.json())).items;
  for (const sameQuestion of [false, true]) {
    const context = await browser.newContext();
    const a = await context.newPage(), b = await context.newPage();
    for (const page of [a, b]) page.on('pageerror', e => errors.push(e.message));
    await a.goto(`${origin}/short?subject=hanguksa`); // Deliberately no q.
    await a.getByLabel('단답형 답안').fill('A 탭에서 보고 있던 답');
    const pinned = await inspect(a, await open(a));
    const questionId = pinned.context.questionId;
    assert.ok(questionId);
    const otherId = sameQuestion ? questionId : questions.find(q => q.id !== questionId).id;
    const pendingA = await open(a); // The open popup must retain its own snapshot.
    await b.goto(`${origin}/short?subject=hanguksa&q=${otherId}`);
    await b.getByLabel('단답형 답안').waitFor();
    if (sameQuestion) await b.getByRole('button', { name: '다시 풀기', exact: true }).click();
    await b.getByLabel('단답형 답안').fill('B 탭의 별도 시도 답');
    const other = await inspect(b, await open(b));
    assert.equal(other.context.questionId, otherId);
    assert.equal(other.context.submittedAnswer, 'B 탭의 별도 시도 답');
    const actual = await inspect(a, pendingA);
    assert.equal(actual.context.questionId, questionId);
    assert.equal(actual.context.submittedAnswer, 'A 탭에서 보고 있던 답');
    assert.equal(actual.context.observed.prompt, pinned.context.observed.prompt);
    assert.equal(new URL(a.url()).searchParams.get('q'), null, 'opening/submitting/closing retains the original no-q URL');
    assert.equal(await a.getByLabel('단답형 답안').inputValue(), 'A 탭에서 보고 있던 답');
    await context.close();
  }
  const context = await browser.newContext();
  await context.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { return undefined; } }); });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/blank?subject=hanguksa&mode=source`);
  await page.getByLabel('빈칸 답안').fill('저장 불가 상태의 현재 답');
  const displayed = await page.locator('.cloze').innerText();
  const actual = await inspect(page, await open(page));
  assert.equal(actual.context.submittedAnswer, '저장 불가 상태의 현재 답');
  assert.equal(actual.context.type, 'blank');
  assert.equal(new URL(actual.source, origin).searchParams.get('mode'), 'source');
  assert.equal(actual.context.observed.prompt.replace('_____', ''), displayed, 'blank attachment preserves the rendered excerpt');
  assert.equal(await page.getByLabel('빈칸 답안').inputValue(), '저장 불가 상태의 현재 답');
  await context.close();
  assert.deepEqual(errors, []);
  console.log('Popup snapshots passed: two tabs/different questions, two attempts/same question, source-mode excerpt, and unavailable-storage current answer. No appeals saved.');
} finally { await browser.close(); }
