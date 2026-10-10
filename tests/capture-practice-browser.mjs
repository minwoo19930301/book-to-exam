// Real app and public data; browser automation only, with no external writes.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const read = async path => {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  return response.json();
};
const coverage = await read('/data/page-practice-coverage.json');
const isCapture = q => q.provenance?.origin === 'authored-capture-practice';
const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
try {
  for (const report of coverage.subjects) {
    const base = report.subject === 'hand-memo' ? '/data' : `/data/subjects/${report.subject}`;
    const bank = await read(`${base}/questions.json`);
    const additions = bank.filter(isCapture);
    const q = additions.find(q => q.evidence.some(e => e.quote.length >= 25)) || additions[0];
    assert.ok(q, report.subject);
    const row = report.pages.find(p => p.page === q.page);
    await page.goto(`${origin}/viewer?subject=${report.subject}&page=${q.page}`);
    const review = page.getByRole('region', { name: '원본 캡처 대조 기록' });
    await review.waitFor();
    assert.ok((await review.innerText()).includes(q.evidence[0].quote));
    await review.getByRole('button', { name: '해당 원본 캡처 확대' }).first().click();
    const zoom = page.getByRole('dialog', { name: '원문 이미지 확대' });
    await zoom.waitFor();
    assert.equal(await zoom.locator('img').getAttribute('src'), row.captureReview.excerpts[0].src);
    await zoom.getByRole('button', { name: '닫기' }).click();
    assert.equal(await page.locator('.viewer-page-practice').innerText(), `이 쪽 문제 ${row.count}개 보기 →`);
    await page.locator('.viewer-page-practice').click();
    const card = page.locator(`[id="${q.id}"]`);
    await card.waitFor();
    assert.equal(await page.locator('.bank-question').count(), row.count);
    await card.getByRole('link', { name: '답안 작성 →' }).click();
    const input = page.getByLabel('단답형 답안');
    await input.waitFor();
    if (await page.locator('.source-reading').count()) {
      const masked = normalize((await page.locator('.source-reading blockquote').allTextContents()).join('\n'));
      for (const answer of [q.answer, ...q.acceptedAnswers]) assert.ok(!masked.includes(normalize(answer)), q.id);
    }
    await input.fill(q.acceptedAnswers[0] || q.answer);
    await page.getByRole('button', { name: '채점', exact: true }).click();
    await page.locator('.typed .mark-ok').waitFor();
    await page.getByRole('button', { name: '히스토리', exact: true }).click();
    const history = page.getByRole('dialog', { name: '히스토리', exact: true });
    await history.locator('.history-entry').first().waitFor();
    assert.ok((await history.innerText()).includes(q.prompt));
    await page.keyboard.press('Escape');
    await page.goto(`${origin}/short?subject=${report.subject}`);
    await page.locator('.card.q h3').last().waitFor();
    assert.equal(await page.locator('.card.q > h3').innerText(), q.prompt, `${q.id}: resume lost`);

    for (const cloze of (await read(`${base}/blanks.json`)).filter(isCapture)) {
      await page.goto(`${origin}/blank?subject=${report.subject}&q=${cloze.id}`);
      await page.getByLabel('빈칸 답안').waitFor();
      assert.equal(await page.locator('.cloze').innerText(), cloze.before + cloze.after);
      await page.getByLabel('빈칸 답안').fill(cloze.acceptedAnswers[0] || cloze.answer);
      await page.getByRole('button', { name: '채점', exact: true }).click();
      await page.locator('.cloze .mark-ok').waitFor();
    }
  }
  // The original transcription for this page has only its heading. New photo
  // excerpts must be searchable without replacing that stored transcription.
  await page.goto(`${origin}/viewer?subject=gyoyukron&page=gyoyukron-textbook-page-17`);
  await page.getByRole('region', { name: '원본 캡처 대조 기록' }).waitFor();
  await page.getByLabel('현재 과목 원문 검색').fill('Newspaper % Education');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.locator('.viewer-results button[aria-current="page"]').waitFor();
  assert.ok((await page.locator('.viewer-results').innerText()).includes('Newspaper'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal overflow');
  const duplicate = coverage.subjects.find(s => s.subject === 'hand-memo').pages.find(p => p.captureReview?.status === 'duplicate');
  await page.goto(`${origin}/viewer?subject=hand-memo&page=${duplicate.page}`);
  await page.getByRole('link', { name: '중복되지 않는 원문 쪽으로 이동 →' }).click();
  assert.equal(new URL(page.url()).searchParams.get('page'), duplicate.captureReview.duplicateOf);
  assert.deepEqual(errors, []);
  console.log('Capture practice: five subjects, exact-page banks, original zoom, masked excerpts, alias grading, history/resume, clozes, new-excerpt search and mobile passed.');
} finally {
  await context.close();
  await browser.close();
}
