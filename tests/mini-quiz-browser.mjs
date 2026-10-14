// Run against Vite or the deployed app. Only the small cycle fixture replaces data;
// the five-subject, storage, source masking, and layout checks use published rows.
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const subjects = await fetch(`${origin}/data/subjects.json`).then(response => response.json());
assert.equal(subjects.length, 5, 'all five study subjects are available');
const banks = new Map(await Promise.all(subjects.map(async subject => {
  const [questions, blanks] = await Promise.all(['questions', 'blanks'].map(name =>
    fetch(`${origin}${subject.dataPath}/${name}.json`).then(response => {
      assert.ok(response.ok, `${subject.id}/${name} data loads`);
      return response.json();
    })));
  return [subject.id, { questions, blanks }];
})));
const storageKey = (subject, type = 'mixed') => `bte-mini:v1:${subject}:${type}`;
const normalize = value => String(value || '').normalize('NFC').replace(/\*\*/g, '').replace(/\s+/g, '').toLowerCase();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [];
const errors = [];
async function freshPage(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, hasTouch: true });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
const card = page => page.locator('article.mini-card');
const scroll = page => page.locator('.mini-card-scroll');
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function cardState(page) {
  return card(page).evaluate(element => ({
    id: element.dataset.questionId, kind: element.dataset.kind, side: element.dataset.side,
    key: `${element.dataset.kind}:${element.dataset.questionId}`,
  }));
}
async function waitSide(page, side) {
  await page.locator(`article.mini-card[data-side="${side}"]`).waitFor();
}
async function saved(page, subject, type = 'mixed') {
  const key = storageKey(subject, type);
  await page.waitForFunction(key => {
    try { return JSON.parse(localStorage.getItem(key))?.order?.length > 0; } catch { return false; }
  }, key);
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
}
async function seed(page, subject, type, session) {
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: storageKey(subject, type), session: { version: 1, round: 1, side: 'question', updatedAt: Date.now(), ...session },
  });
}
async function openMini(page, subject, type = 'mixed') {
  await page.goto(`${origin}/mini?subject=${subject}&type=${type}`);
  await card(page).waitFor();
  return cardState(page);
}
function rowFor(subject, state) {
  return banks.get(subject)[state.kind === 'short' ? 'questions' : 'blanks'].find(row => row.id === state.id);
}
function assertHidden(text, row, message) {
  for (const term of [row.answer, ...(row.acceptedAnswers || [])].filter(term => typeof term === 'string' && term.trim()))
    assert.ok(!normalize(text).includes(normalize(term)), `${message}: answer/alias ${term} leaked`);
}
async function assertFront(page, subject) {
  const current = await cardState(page);
  assert.equal(current.side, 'question');
  const row = rowFor(subject, current);
  assert.ok(row, `${subject}: displayed ID belongs to its source bank`);
  assert.equal(await page.locator('.mini-answer, .mini-explanation').count(), 0, 'hidden answer is not rendered');
  const frontText = await page.locator('.mini-prompt, .mini-passage').allTextContents();
  assertHidden(frontText.join('\n'), row, current.key);
  return current;
}
// Read-only and production-compatible: never creates the normal history DB.
const readHistory = async ({ requireGraded = false } = {}) => {
  const databases = await indexedDB.databases();
  if (!databases.some(database => database.name === 'bte-study-history')) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bte-study-history');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['attempts', 'sessions'], 'readonly');
      const attempts = tx.objectStore('attempts').getAll();
      const sessions = tx.objectStore('sessions').getAll();
      tx.oncomplete = () => {
        const order = rows => rows.sort((a, b) => String(a.id || a.key).localeCompare(String(b.id || b.key)));
        const snapshot = { attempts: order(attempts.result), sessions: order(sessions.result) };
        db.close(); resolve(requireGraded ? snapshot.attempts.some(attempt => attempt.result) : snapshot);
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
};
async function swipe(page, direction) {
  const rect = await scroll(page).boundingBox();
  assert.ok(rect && rect.width > 100 && rect.height > 40, 'swipe surface is usable');
  const middleX = rect.x + rect.width / 2;
  const middleY = Math.max(rect.y + 12, Math.min(rect.y + rect.height / 2, (await page.viewportSize()).height - 20));
  const horizontal = Math.min(110, rect.width * 0.3);
  const vertical = Math.min(100, rect.height * 0.3);
  const start = { x: middleX + (direction === 'left' ? horizontal : direction === 'right' ? -horizontal : 0),
    y: middleY + (direction === 'up' ? vertical : 0) };
  const end = { x: middleX + (direction === 'left' ? -horizontal : direction === 'right' ? horizontal : 8),
    y: middleY - (direction === 'up' ? vertical : 0) };
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8, id: 1,
      }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}

try {
  const page = await freshPage();
  // Start with a genuine graded attempt, so mini mode cannot silently reset or
  // inflate existing scores while displaying answers and changing subjects.
  const graded = banks.get('seoyangsa').questions.find(row => row.type === 'blank');
  await page.goto(`${origin}/short?subject=seoyangsa&q=${graded.id}`);
  await page.getByLabel('단답형 답안').fill(String(graded.answer));
  await button(page, '채점').click();
  await page.locator('.typed').waitFor();
  await page.waitForFunction(readHistory, { requireGraded: true });
  const historyBefore = await page.evaluate(readHistory);
  assert.equal(historyBefore.attempts.length, 1);

  for (const subject of subjects) {
    await openMini(page, subject.id);
    assert.deepEqual(await page.getByLabel('미니 퀴즈 과목').locator('option').evaluateAll(options => options.map(option => option.value)), subjects.map(item => item.id));
    await assertFront(page, subject.id);
    const session = await saved(page, subject.id);
    assert.equal(new Set(session.order).size, session.order.length, `${subject.id}: no duplicate random IDs`);
    assert.ok(session.order.some(key => key.startsWith('short:')) && session.order.some(key => key.startsWith('blank:')));
    for (const key of session.order) {
      const [kind, ...rest] = key.split(':');
      assert.ok(rowFor(subject.id, { kind, id: rest.join(':') }), `${subject.id}: unknown saved question ${key}`);
    }
    for (const [label, type] of [['단답형', 'short'], ['빈칸', 'blank']]) {
      await page.getByRole('group', { name: '미니 퀴즈 유형' }).getByRole('button', { name: label, exact: true }).click();
      await page.locator(`article.mini-card[data-kind="${type}"]`).waitFor();
      const front = await assertFront(page, subject.id);
      await button(page, '정답 보기').click();
      await waitSide(page, 'answer');
      assert.equal(normalize(await page.locator('.mini-answer').innerText()), normalize(rowFor(subject.id, front).answer));
      await button(page, '문제 보기').click();
      await waitSide(page, 'question');
      assert.equal((await cardState(page)).key, front.key, 'showing the question does not advance');
      assert.ok((await saved(page, subject.id, type)).order.every(key => key.startsWith(`${type}:`)));
    }
  }
  assert.deepEqual(await page.evaluate(readHistory), historyBefore, 'revealing mini answers leaves normal history and accuracy untouched');

  const source = banks.get('dongyangsa').questions.find(row => row.id === 'dongyangsa-short150-031');
  assert.ok(source && source.answer === '제민요술' && source.acceptedAnswers.includes('齊民要術'));
  const other = banks.get('dongyangsa').questions.find(row => row.type === 'blank' && row.id !== source.id);
  const clozes = banks.get('dongyangsa').blanks.filter(row => row.contextMode === 'source-excerpt').slice(0, 2);
  assert.equal(clozes.length, 2);
  const fixture = await freshPage();
  await fixture.route('**/data/subjects/dongyangsa/questions.json', route => route.fulfill({ json: [source, other] }));
  await fixture.route('**/data/subjects/dongyangsa/blanks.json', route => route.fulfill({ json: clozes }));
  await openMini(fixture, 'dongyangsa');
  const initial = await saved(fixture, 'dongyangsa');
  const natural = [`short:${source.id}`, `short:${other.id}`, ...clozes.map(row => `blank:${row.id}`)];
  assert.deepEqual([...initial.order].sort(), [...natural].sort());
  assert.notDeepEqual(initial.order, natural, 'a new session starts in random order');
  const visited = [];
  for (let index = 0; index < natural.length; index++) {
    const front = await assertFront(fixture, 'dongyangsa');
    visited.push(front.key);
    await scroll(fixture).focus();
    await fixture.keyboard.press('Enter');
    await waitSide(fixture, 'answer');
    assert.equal((await cardState(fixture)).key, front.key);
    await fixture.keyboard.press('Enter');
    await waitSide(fixture, 'question');
  }
  assert.deepEqual(visited, initial.order, 'every random card is visited exactly once per round');
  const secondRound = await saved(fixture, 'dongyangsa');
  assert.equal(secondRound.round, 2);
  assert.equal(new Set(secondRound.order).size, natural.length);

  await seed(fixture, 'dongyangsa', 'mixed', { order: natural, currentKey: natural[0] });
  await fixture.reload();
  await waitSide(fixture, 'question');
  assert.equal((await cardState(fixture)).id, source.id);
  const passage = await fixture.locator('.mini-passage').innerText();
  assert.ok(passage.includes('가사협') && passage.includes('총 92편, 10권의 책'), 'the authored source passage is present');
  assertHidden(passage, source, 'source passage');
  assert.ok(!passage.includes('［해당 용어］(齊民要術)'), 'the Chinese gloss is not leaked');
  const beforeVertical = await cardState(fixture);
  const needsScroll = await scroll(fixture).evaluate(element => element.scrollHeight > element.clientHeight + 4);
  await swipe(fixture, 'up');
  assert.deepEqual(await cardState(fixture), beforeVertical, 'vertical scrolling never reveals or changes a card');
  if (needsScroll) await fixture.waitForFunction(() => document.querySelector('.mini-card-scroll').scrollTop > 0);
  await swipe(fixture, 'left');
  await waitSide(fixture, 'answer');
  assert.equal((await cardState(fixture)).id, source.id);
  assert.equal(normalize(await fixture.locator('.mini-answer').innerText()), normalize(source.answer));
  assert.ok(normalize(await fixture.locator('.mini-explanation').innerText()).includes(normalize(source.explain)), 'the matching explanation accompanies the answer');
  const sourceLink = new URL(await fixture.getByRole('link', { name: '교재 원문 보기', exact: true }).getAttribute('href'), origin);
  assert.equal(sourceLink.searchParams.get('subject'), 'dongyangsa');
  assert.equal(sourceLink.searchParams.get('page'), source.page || source.evidence[0].page, 'source link points to the cited original page');
  await swipe(fixture, 'right');
  await waitSide(fixture, 'question');
  assert.equal((await cardState(fixture)).id, source.id, 'right swipe on the answer returns to its question');
  await swipe(fixture, 'left');
  await waitSide(fixture, 'answer');
  await swipe(fixture, 'left');
  await waitSide(fixture, 'question');
  assert.equal((await cardState(fixture)).key, natural[1], 'left swipe on the answer advances once');
  await swipe(fixture, 'right');
  await waitSide(fixture, 'question');
  assert.equal((await cardState(fixture)).key, natural[0], 'right swipe on the question returns to the previous card');
  await button(fixture, '정답 보기').click();
  await waitSide(fixture, 'answer');
  const persisted = await saved(fixture, 'dongyangsa');
  await fixture.reload();
  await waitSide(fixture, 'answer');
  const restored = await saved(fixture, 'dongyangsa');
  assert.equal(restored.currentKey, persisted.currentKey);
  assert.deepEqual(restored.order, persisted.order);
  assert.equal(restored.round, persisted.round);
  assert.equal(await fixture.evaluate(readHistory), null, 'mini-only browsing does not create the graded-history database');
  await button(fixture, '다시 섞기').click();
  await waitSide(fixture, 'question');
  const reshuffled = await saved(fixture, 'dongyangsa');
  assert.equal(reshuffled.round, restored.round + 1);
  assert.deepEqual([...reshuffled.order].sort(), [...restored.order].sort());
  assert.notDeepEqual(reshuffled.order, restored.order, 'manual shuffle changes the order without losing cards');

  // Expiration and corruption are tested through the public browser storage
  // contract; there is no import of production session implementation here.
  await seed(fixture, 'dongyangsa', 'mixed', { ...persisted, updatedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 });
  await fixture.reload();
  await waitSide(fixture, 'question');
  assert.equal((await saved(fixture, 'dongyangsa')).round, 1, 'expired progress starts a fresh round');
  await fixture.evaluate(key => localStorage.setItem(key, '{broken JSON'), storageKey('dongyangsa'));
  await fixture.reload();
  await waitSide(fixture, 'question');
  assert.equal((await saved(fixture, 'dongyangsa')).version, 1);

  // A long authentic passage must remain reachable in narrow and landscape
  // screens; scroll containment is checked rather than relying on screenshots.
  await button(fixture, '글씨 크기 변경').click();
  await button(fixture, '글씨 크기 변경').click();
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await fixture.setViewportSize(viewport);
    await seed(fixture, 'dongyangsa', 'mixed', { order: natural, currentKey: natural[0] });
    await fixture.reload();
    await waitSide(fixture, 'question');
    assert.ok(await fixture.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${viewport.width}: no horizontal overflow`);
    const layout = await scroll(fixture).evaluate(element => {
      const rect = element.getBoundingClientRect();
      const prompt = element.querySelector('.mini-prompt');
      element.scrollTop = element.scrollHeight;
      const passage = element.querySelector('.mini-passage').getBoundingClientRect();
      return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, height: rect.height,
        passageBottom: passage.bottom, fontSize: parseFloat(getComputedStyle(prompt).fontSize), align: getComputedStyle(prompt).textAlign };
    });
    assert.ok(layout.x >= -1 && layout.right <= viewport.width + 1 && layout.height > 40, `${viewport.width}: card stays usable`);
    assert.ok(layout.passageBottom <= layout.bottom + 2, `${viewport.width}: final source line can be scrolled into view`);
    assert.ok(layout.fontSize >= 24, 'mini question uses large type');
    assert.equal(layout.align, 'center', 'the question is centered');
    const revealRect = await button(fixture, '정답 보기').boundingBox();
    assert.ok(revealRect.y >= 0 && revealRect.y + revealRect.height <= viewport.height + 1, 'primary action remains visible');
  }
  await fixture.setViewportSize({ width: 390, height: 844 });
  const beforeFont = await fixture.locator('.mini-prompt').evaluate(element => getComputedStyle(element).fontSize);
  await button(fixture, '글씨 크기 변경').click();
  const afterFont = await fixture.locator('.mini-prompt').evaluate(element => getComputedStyle(element).fontSize);
  assert.notEqual(afterFont, beforeFont, 'font-size control changes the card text');

  await button(fixture, '정답 보기').click();
  await waitSide(fixture, 'answer');
  await fixture.getByLabel('미니 퀴즈 과목').selectOption('hanguksa');
  await card(fixture).waitFor();
  await fixture.waitForFunction(() => document.querySelector('article.mini-card')?.dataset.questionId?.startsWith('hanguksa-'));
  await assertFront(fixture, 'hanguksa');
  assert.equal(await fixture.locator('.mini-answer').count(), 0, 'subject change resets the previous answer face');
  assert.deepEqual(errors, [], 'no uncaught browser exceptions');
  console.log('Mini quiz passed: five subjects, filters, hidden answers/aliases, authentic sources, duplicate-free random rounds, touch directions, vertical-scroll isolation, Enter, 30-day independent resume, unchanged graded history, narrow/landscape layout and font size.');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
