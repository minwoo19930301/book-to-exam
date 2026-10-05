// No appeal submission: verify that two tabs and failed storage cannot substitute answers.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
async function snapshot(page) {
  const link = page.getByRole('link', { name: '이의제기', exact: true });
  const url = new URL(await link.getAttribute('href'), origin);
  assert.ok(url.searchParams.get('question'));
  assert.ok(url.searchParams.get('attempt'));
  return url;
}
try {
  const questions = (await fetch(`${origin}/api/practice-bank?subject=hanguksa&type=short&pageSize=20`).then(r => r.json())).items;
  for (const sameQuestion of [false, true]) {
    const context = await browser.newContext();
    const a = await context.newPage(), b = await context.newPage();
    for (const page of [a, b]) page.on('pageerror', e => errors.push(e.message));
    await a.goto(`${origin}/short?subject=hanguksa`); // Deliberately no q.
    await a.getByLabel('단답형 답안').fill('A 탭에서 보고 있던 답');
    const pinned = await snapshot(a);
    const questionId = pinned.searchParams.get('question');
    const otherId = sameQuestion ? questionId : questions.find(q => q.id !== questionId).id;
    await b.goto(`${origin}/short?subject=hanguksa&q=${otherId}`);
    await b.getByLabel('단답형 답안').waitFor();
    if (sameQuestion) await b.getByRole('button', { name: '다시 풀기', exact: true }).click();
    await b.getByLabel('단답형 답안').fill('B 탭의 별도 시도 답');
    const other = await snapshot(b);
    assert.notEqual(other.searchParams.get('attempt'), pinned.searchParams.get('attempt'));
    await a.getByRole('link', { name: '이의제기', exact: true }).click();
    await a.locator('.appeal-context summary').click();
    const text = await a.locator('.appeal-context').innerText();
    assert.ok(text.includes(questionId));
    assert.match(text, /A 탭에서 보고 있던 답/);
    assert.ok(!text.includes('B 탭의 별도 시도 답'));
    // Opening the pinned URL without router state must resolve the exact stored try.
    const reopened = await context.newPage();
    await reopened.goto(pinned.href);
    await reopened.locator('.appeal-context summary').click();
    assert.match(await reopened.locator('.appeal-context').innerText(), /A 탭에서 보고 있던 답/);
    const missing = new URL(pinned);
    missing.searchParams.set('attempt', 'missing-attempt');
    await reopened.goto(missing.href);
    await reopened.locator('.appeal-context summary').click();
    const missingText = await reopened.locator('.appeal-context').innerText();
    assert.ok(!missingText.includes('B 탭의 별도 시도 답'));
    assert.match(missingText, /입력한 답 없음/);
    await context.close();
  }
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { return undefined; } });
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/blank?subject=hanguksa&mode=source`);
  await page.getByLabel('빈칸 답안').fill('저장 불가 상태의 현재 답');
  const pinned = await snapshot(page);
  const displayed = await page.locator('.cloze').innerText();
  assert.ok(pinned.searchParams.get('from').includes('mode=source'));
  await page.getByRole('link', { name: '이의제기', exact: true }).click();
  await page.locator('.appeal-context summary').click();
  assert.match(await page.locator('.appeal-context').innerText(), /저장 불가 상태의 현재 답/);
  assert.equal((await page.locator('.appeal-passage').innerText()).replace('_____', ''), displayed, 'blank attachment preserves the rendered excerpt');
  await context.close();
  assert.deepEqual(errors, []);
  console.log('Two tabs/different questions, two attempts/same question, exact-ID reopen, missing-ID refusal and failed-storage snapshot passed. No appeals submitted.');
} finally { await browser.close(); }
