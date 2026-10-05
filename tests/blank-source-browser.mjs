// Exercises the published, authored source-cloze bank (no mocked question data).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const subject of ['hanguksa', 'seoyangsa', 'dongyangsa']) {
    const bank = await fetch(`${origin}/data/subjects/${subject}/blanks.json`).then(response => response.json());
    const sources = bank.filter(question => question.contextMode === 'source-excerpt');
    const original = bank.find(question => question.contextMode !== 'source-excerpt');
    assert.ok(sources.length >= 80, `${subject} has the expanded source bank`);
    await page.goto(`${origin}/blank?subject=${subject}&mode=source`);
    await page.waitForFunction(id => new URL(location.href).searchParams.get('q') === id, sources[0].id);
    await page.getByLabel('빈칸 답안').waitFor();
    assert.equal(await page.getByRole('button', { name: /^사료탐구\d/ }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByLabel('문항 번호').inputValue(), '1');
    assert.equal(await page.locator('.cloze').innerText(), sources[0].before + sources[0].after);
    const answer = sources[0].acceptedAnswers[0] || sources[0].answer;
    await page.getByLabel('빈칸 답안').fill(answer);
    await page.getByRole('button', { name: '채점', exact: true }).click();
    await page.locator('.cloze .mark-ok').waitFor();
    await page.getByLabel('문항 번호').fill(String(sources.length));
    await page.getByRole('button', { name: '이동', exact: true }).click();
    await page.getByLabel('빈칸 답안').fill('마지막 사료의 작성 중인 답안');
    await page.reload();
    await page.getByLabel('빈칸 답안').waitFor();
    assert.equal(await page.getByLabel('문항 번호').inputValue(), String(sources.length));
    assert.equal(await page.getByLabel('빈칸 답안').inputValue(), '마지막 사료의 작성 중인 답안');
    await page.getByRole('button', { name: /^전체\d/ }).click();
    assert.equal(await page.getByLabel('빈칸 답안').inputValue(), '마지막 사료의 작성 중인 답안');
    await page.goto(`${origin}/blank?subject=${subject}&mode=source&q=${original.id}`);
    await page.getByLabel('빈칸 답안').waitFor();
    assert.equal(await page.getByRole('button', { name: /^전체\d/ }).getAttribute('aria-pressed'), 'true', 'explicit original question overrides a stale source filter');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/blank?subject=hanguksa&mode=source`);
  await page.locator('.cloze').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('All three source-cloze banks: canonical/alias scoring, full passage, filtered jump, resume, draft persistence, explicit-question priority and mobile passed.');
} finally { await browser.close(); }
