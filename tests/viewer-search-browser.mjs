// UI_TEST_BASE_URL=http://127.0.0.1:4193 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/viewer-search-browser.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const notes = read('../public/data/subjects/seoyangsa/notes.json');
const captures = read('../public/data/source-pages.json').pages;
const normalize = value => value.toLowerCase().replace(/\s+/gu, '');
const matched = notes.filter(note => normalize(`${note.title}\n${note.text}`).includes('로마'));
const target = matched.find(note => note.kind === 'gichul' && captures[note.id]?.captures?.length);
assert.ok(target, 'real source fixture has both a gichul match and an original capture');
const input = page.getByLabel('현재 과목 원문 검색', { exact: true });
const results = page.getByRole('complementary', { name: '원문 검색 결과' });
async function search(value) { await input.fill(value); await page.getByRole('button', { name: '검색', exact: true }).click(); }
try {
  await page.goto(`${origin}/viewer?subject=seoyangsa`);
  await input.waitFor();
  assert.equal(await page.getByRole('complementary', { name: '원문 목록' }).locator('button').count(), notes.length);
  await search('로마');
  assert.equal(await results.locator('button').count(), matched.length);
  assert.ok(await results.locator('mark').count());
  assert.ok((await results.locator('.viewer-result-location').allTextContents()).some(text => text.startsWith('교재')));
  const targetButton = results.locator('button').filter({ has: page.locator('.viewer-result-title', { hasText: target.title }) }).filter({ hasText: `기출 · ${target.source.pageLabel}` }).first();
  await targetButton.click();
  await page.getByRole('heading', { name: target.title, exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('page'), target.id);
  assert.equal(new URL(page.url()).searchParams.get('q'), '로마');
  await page.waitForFunction(() => document.querySelector('.spread') === document.activeElement);
  assert.equal(await page.locator('.source-captures img').first().getAttribute('src'), captures[target.id].captures[0].src);
  await page.locator('.capture-open').first().click();
  await page.getByRole('dialog', { name: '원문 이미지 확대' }).waitFor();
  await page.keyboard.press('ArrowRight');
  assert.equal(new URL(page.url()).searchParams.get('page'), target.id, 'capture dialog must not navigate underlying note');
  await page.keyboard.press('Escape');
  await page.reload();
  await input.waitFor();
  assert.equal(await input.inputValue(), '로마');
  await page.getByRole('heading', { name: target.title, exact: true }).waitFor();
  assert.equal(await results.locator('button').count(), matched.length);

  // Native study popups stay over the selected result; both button and textarea focus are guarded.
  const beforePopup = page.url();
  await page.getByRole('button', { name: '히스토리', exact: true }).click();
  const history = page.getByRole('dialog', { name: '히스토리', exact: true });
  await history.waitFor();
  await page.keyboard.press('ArrowRight');
  assert.equal(page.url(), beforePopup);
  await page.keyboard.press('Escape');
  await history.waitFor({ state: 'detached' });
  let appealPayload;
  await page.route('**/api/appeals', async route => {
    appealPayload = route.request().postDataJSON();
    await route.fulfill({ json: { received: true, id: 'viewer-search-test' } });
  });
  await page.getByRole('button', { name: '이의제기', exact: true }).click();
  const appeal = page.getByRole('dialog', { name: '이의제기', exact: true });
  await appeal.waitFor();
  await page.keyboard.press('ArrowLeft');
  assert.equal(page.url(), beforePopup);
  await appeal.getByLabel('이의제기 내용').fill('자동 테스트: 실제 전송되지 않는 원문 연결 확인');
  await appeal.getByRole('button', { name: '전송', exact: true }).click();
  await appeal.getByText('이의제기를 접수했습니다.', { exact: true }).waitFor();
  assert.equal(new URL(appealPayload.source, origin).searchParams.get('page'), target.id, 'viewer appeal attaches exact source page');
  await page.keyboard.press('Escape');
  await appeal.waitFor({ state: 'detached' });

  await search('일치하지않는검색어987xyz');
  await page.getByText('일치하는 자료가 없습니다. 검색어를 줄이거나 다른 표현으로 찾아보세요.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '검색 지우기', exact: true }).click();
  assert.equal(await input.inputValue(), '');
  assert.equal(new URL(page.url()).searchParams.get('q'), null);
  assert.equal(new URL(page.url()).searchParams.get('page'), target.id);
  assert.equal(await page.getByRole('complementary', { name: '원문 목록' }).locator('button').count(), notes.length);

  // Controlled source data exercises literal matching, IME, source boundaries and mobile wrapping.
  const fixtures = [
    { id: 'fixture-textbook', kind: 'textbook', title: '로마의 제도', text: '카라\n 칼라 황제의\n시 민 권. NEW\nECONOMIC POLICY', source: { pageLabel: '10–11쪽' } },
    { id: 'fixture-gichul', kind: 'gichul', title: '특수문자 예시', text: 'C++ [x] a.b\n카라 칼라 정책. 시장 경제\n다른 문맥', source: { pageLabel: '24쪽' } },
    { id: 'fixture-other', kind: 'gichul', title: '로마 반례', text: '시민권이 없는 별개 예시', source: { pageLabel: '26쪽' } },
  ];
  await page.route('**/data/subjects/seoyangsa/notes.json', route => route.fulfill({ json: fixtures }));
  await page.goto(`${origin}/viewer?subject=seoyangsa`);
  await input.fill('카라칼라');
  await input.dispatchEvent('compositionstart', { data: '라' });
  await input.press('Enter');
  assert.equal(new URL(page.url()).searchParams.get('q'), null, 'IME confirmation does not submit a partial composition');
  await input.dispatchEvent('compositionend', { data: '라' });
  await input.press('Enter');
  assert.equal(await results.locator('button').count(), 2);
  assert.equal(normalize(await results.locator('mark').first().textContent()), '카라칼라');
  const beforeArrow = page.url();
  await input.press('ArrowRight');
  assert.equal(page.url(), beforeArrow, 'cursor movement in search input does not turn a page');
  await search('로마 economicpolicy');
  assert.equal(await results.locator('button').count(), 1);
  assert.match(await results.innerText(), /10–11쪽/);
  await search('C++ [x] a.b');
  assert.equal(await results.locator('button').count(), 1);
  assert.match(await results.innerText(), /24쪽/);
  await search('카라%정책');
  assert.equal(await results.locator('button').count(), 1);
  await results.locator('button').click();
  assert.equal(new URL(page.url()).searchParams.get('page'), 'fixture-gichul');
  await page.goBack();
  await input.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), '카라%정책');
  assert.equal(new URL(page.url()).searchParams.get('page'), null);
  await page.setViewportSize({ width: 390, height: 844 });
  await search('카라칼라');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'mobile search does not overflow viewport');
  await page.screenshot({ path: '/tmp/book-to-exam-viewer-search-mobile.png', fullPage: false });
  await results.locator('button').last().click();
  await page.getByRole('heading', { name: '특수문자 예시', exact: true }).waitFor();
  // The title changes during React's commit; showResult moves focus/scroll in the
  // next animation frame. Wait for that observable interaction, not just the title.
  const mobileBeforeFocus = await page.locator('.spread').evaluate(node => ({ top: node.getBoundingClientRect().top, focused: node === document.activeElement, scrollY }));
  await page.waitForFunction(() => {
    const node = document.querySelector('.spread');
    const heading = node?.querySelector('h1')?.getBoundingClientRect();
    return node === document.activeElement && heading && heading.top >= 0 && heading.bottom <= innerHeight;
  });
  if (process.env.VIEWER_SEARCH_DIAGNOSTICS) {
    const mobileAfterFocus = await page.locator('.spread').evaluate(node => ({ top: node.getBoundingClientRect().top, focused: node === document.activeElement, scrollY }));
    console.log(JSON.stringify({ mobileBeforeFocus, mobileAfterFocus }));
    await page.screenshot({ path: '/tmp/book-to-exam-viewer-selected-mobile.png', fullPage: false });
  }
  assert.equal(await input.inputValue(), '카라칼라');
  await page.getByLabel('학습 과목', { exact: true }).selectOption('hanguksa');
  await input.waitFor();
  assert.equal(await input.inputValue(), '');
  assert.equal(new URL(page.url()).searchParams.get('q'), null);
  assert.deepEqual(errors, []);
  console.log(`Viewer search passed: ${matched.length} real source matches, source navigation/capture, persistence, IME, literal AND/wildcard matching, modal guards and mobile.`);
} finally { await browser.close(); }
