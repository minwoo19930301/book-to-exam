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
const fit = page => page.locator('.mini-card-fit');
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function cardState(page) {
  return card(page).evaluate(element => ({
    id: element.dataset.questionId, kind: element.dataset.kind, side: element.dataset.side, tone: element.dataset.tone,
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
async function press(page, key = 'Enter') {
  await fit(page).focus();
  await page.keyboard.press(key);
}
async function assertCardOnly(page) {
  assert.equal(await page.locator('main.mini-quiz > section.mini-stage > article.mini-card').count(), 1);
  assert.equal(await page.locator('main.mini-quiz button, main.mini-quiz a, main.mini-quiz input, main.mini-quiz select, main.mini-quiz header, main.mini-quiz footer').count(), 0,
    'the mini screen contains only the card, without surrounding controls');
  assert.equal(await page.locator('.mini-header, .mini-filters, .mini-controls, .mini-card-meta, .mini-card-footer, .mini-card-scroll').count(), 0);
  assert.equal(await page.locator('button:visible, a:visible, input:visible, select:visible').count(), 0,
    'no outside navigation or controls remain visible around the card');
}
// Measure the actual text boxes as well as scroll sizes: overflow:hidden or a
// line clamp alone must not make a truncated long card pass this assertion.
async function assertFits(page, label) {
  const measure = ({ check = false } = {}) => {
    const fit = document.querySelector('.mini-card-fit');
    const content = document.querySelector('.mini-card-content');
    const card = document.querySelector('article.mini-card');
    if (!fit || !content || !card) return check ? false : { ok: false, reason: 'card not mounted' };
    const bounds = fit.getBoundingClientRect(), body = content.getBoundingClientRect(), outside = card.getBoundingClientRect();
    const issues = [];
    if (bounds.height < 40 || bounds.width < 100) issues.push('unusable fit area');
    if (parseFloat(getComputedStyle(content).fontSize) <= 8) issues.push('text shrank below a readable minimum');
    for (const text of content.querySelectorAll('.mini-prompt, .mini-passage, .mini-answer, .mini-explanation'))
      if (parseFloat(getComputedStyle(text).fontSize) <= 8) issues.push(`${text.className} shrank below a readable minimum`);
    if (outside.left < -1 || outside.top < -1 || outside.right > innerWidth + 1 || outside.bottom > innerHeight + 1) issues.push('card outside viewport');
    if (body.left < bounds.left - 1 || body.top < bounds.top - 1 || body.right > bounds.right + 1 || body.bottom > bounds.bottom + 1) issues.push('content outside fit area');
    for (const element of [fit, content]) {
      if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) issues.push(`${element.className} overflows`);
    }
    for (const element of [card, ...card.querySelectorAll('*')]) {
      const style = getComputedStyle(element);
      if (/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) issues.push(`${element.className} is a scroll container`);
      if (style.textOverflow === 'ellipsis' || (style.webkitLineClamp && !['none', '0'].includes(style.webkitLineClamp))) issues.push('content truncated');
    }
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let text; (text = walker.nextNode());) {
      // pre-wrap permits a trailing whitespace box to hang beyond its line;
      // measure visible words rather than mistaking that blank area for text.
      for (const word of text.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(text, word.index); range.setEnd(text, word.index + word[0].length);
        for (const line of range.getClientRects()) {
          if (line.width && line.height && (line.left < bounds.left - 2 || line.right > bounds.right + 2 || line.top < bounds.top - 2 || line.bottom > bounds.bottom + 2)) issues.push('text line clipped');
        }
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) issues.push('document scrolls');
    return check ? issues.length === 0 : { ok: issues.length === 0, issues, font: getComputedStyle(content).fontSize,
      content: { width: body.width, height: body.height }, fit: { width: bounds.width, height: bounds.height } };
  };
  try { await page.waitForFunction(measure, { check: true }, { timeout: 5000 }); }
  catch { /* The diagnostic assertion below gives the actual overflowing boxes. */ }
  const result = await page.evaluate(measure);
  assert.ok(result.ok, `${label}: ${JSON.stringify(result)}`);
  return result;
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
  const rect = await fit(page).boundingBox();
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
    await assertCardOnly(page);
    await assertFront(page, subject.id);
    const session = await saved(page, subject.id);
    assert.equal(new Set(session.order).size, session.order.length, `${subject.id}: no duplicate random IDs`);
    assert.ok(session.order.some(key => key.startsWith('short:')) && session.order.some(key => key.startsWith('blank:')));
    for (const key of session.order) {
      const [kind, ...rest] = key.split(':');
      assert.ok(rowFor(subject.id, { kind, id: rest.join(':') }), `${subject.id}: unknown saved question ${key}`);
    }
    for (const type of ['short', 'blank']) {
      await openMini(page, subject.id, type);
      await page.locator(`article.mini-card[data-kind="${type}"]`).waitFor();
      const front = await assertFront(page, subject.id);
      await press(page);
      await waitSide(page, 'answer');
      assert.equal(normalize(await page.locator('.mini-answer').innerText()), normalize(rowFor(subject.id, front).answer));
      await press(page, 'ArrowLeft');
      await waitSide(page, 'question');
      assert.equal((await cardState(page)).key, front.key, 'showing the question does not advance');
      assert.ok((await saved(page, subject.id, type)).order.every(key => key.startsWith(`${type}:`)));
    }
  }
  assert.deepEqual(await page.evaluate(readHistory), historyBefore, 'revealing mini answers leaves normal history and accuracy untouched');

  const source = banks.get('dongyangsa').questions.find(row => row.id === 'dongyangsa-short150-031');
  assert.ok(source && source.answer === '제민요술' && source.acceptedAnswers.includes('齊民要術'));
  const other = banks.get('dongyangsa').questions.find(row => row.type === 'blank' && row.id !== source.id);
  const clozes = banks.get('dongyangsa').blanks.filter(row => row.contextMode === 'source-excerpt').slice(0, 4);
  assert.equal(clozes.length, 4);
  const fixture = await freshPage();
  await fixture.route('**/data/subjects/dongyangsa/questions.json', route => route.fulfill({ json: [source, other] }));
  await fixture.route('**/data/subjects/dongyangsa/blanks.json', route => route.fulfill({ json: clozes }));
  await openMini(fixture, 'dongyangsa');
  const initial = await saved(fixture, 'dongyangsa');
  const natural = [`short:${source.id}`, `short:${other.id}`, ...clozes.map(row => `blank:${row.id}`)];
  assert.deepEqual([...initial.order].sort(), [...natural].sort());
  assert.notDeepEqual(initial.order, natural, 'a new session starts in random order');
  const visited = [], tones = new Set(), colors = new Set();
  for (let index = 0; index < natural.length; index++) {
    const front = await assertFront(fixture, 'dongyangsa');
    visited.push(front.key);
    assert.match(front.tone, /^[0-5]$/, 'each card uses one of six tones');
    tones.add(front.tone);
    colors.add(await card(fixture).evaluate(element => getComputedStyle(element).backgroundColor));
    await press(fixture);
    await waitSide(fixture, 'answer');
    assert.equal((await cardState(fixture)).key, front.key);
    await fixture.keyboard.press('Enter');
    await waitSide(fixture, 'question');
  }
  assert.deepEqual(visited, initial.order, 'every random card is visited exactly once per round');
  assert.equal(tones.size, 6, 'the six cards use all six tones');
  assert.equal(colors.size, 6, 'tone attributes correspond to six actual card backgrounds');
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
  await assertFits(fixture, 'authentic source question');
  await swipe(fixture, 'up');
  assert.deepEqual(await cardState(fixture), beforeVertical, 'vertical swipes never reveal or change a card');
  assert.ok(await fixture.evaluate(() => scrollX === 0 && scrollY === 0 && [...document.querySelectorAll('.mini-card, .mini-card-fit, .mini-card-content')].every(element => element.scrollTop === 0 && element.scrollLeft === 0)), 'vertical swipes do not scroll the page or card');
  await swipe(fixture, 'left');
  await waitSide(fixture, 'answer');
  assert.equal((await cardState(fixture)).id, source.id);
  assert.equal(normalize(await fixture.locator('.mini-answer').innerText()), normalize(source.answer));
  assert.ok(normalize(await fixture.locator('.mini-explanation').innerText()).includes(normalize(source.explain)), 'the matching explanation accompanies the answer');
  await assertCardOnly(fixture);
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
  await press(fixture);
  await waitSide(fixture, 'answer');
  const persisted = await saved(fixture, 'dongyangsa');
  await fixture.reload();
  await waitSide(fixture, 'answer');
  const restored = await saved(fixture, 'dongyangsa');
  assert.equal(restored.currentKey, persisted.currentKey);
  assert.deepEqual(restored.order, persisted.order);
  assert.equal(restored.round, persisted.round);
  assert.equal(await fixture.evaluate(readHistory), null, 'mini-only browsing does not create the graded-history database');

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

  // Use the actual longest full-source front and longest answer explanation,
  // not a shortened fake fixture, to test fitting both sides without clipping.
  const allCards = subjects.flatMap(subject => [
    ...banks.get(subject.id).questions.filter(row => row.type === 'blank').map(row => ({ subject: subject.id, kind: 'short', row })),
    ...banks.get(subject.id).blanks.map(row => ({ subject: subject.id, kind: 'blank', row })),
  ]);
  const longestFront = allCards.filter(item => item.kind === 'blank' && (item.row.contextMode === 'source-excerpt' || item.row.passageMode === 'full'))
    .sort((a, b) => `${b.row.before || ''}${b.row.after || ''}`.length - `${a.row.before || ''}${a.row.after || ''}`.length)[0];
  const longestAnswer = [...allCards].sort((a, b) => `${b.row.answer || ''}${b.row.explain || ''}`.length - `${a.row.answer || ''}${a.row.explain || ''}`.length)[0];
  const layoutPage = await freshPage();
  await openMini(layoutPage, longestFront.subject);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await layoutPage.setViewportSize(viewport);
    for (const item of [longestFront, longestAnswer]) {
      const key = `${item.kind}:${item.row.id}`;
      await seed(layoutPage, item.subject, 'mixed', { order: [key], currentKey: key });
      await openMini(layoutPage, item.subject);
      assert.equal((await cardState(layoutPage)).key, key);
      await assertCardOnly(layoutPage);
      await assertFits(layoutPage, `${viewport.width}x${viewport.height} ${key} question`);
      await press(layoutPage);
      await waitSide(layoutPage, 'answer');
      assert.equal(normalize(await layoutPage.locator('.mini-answer').innerText()), normalize(item.row.answer));
      assert.equal(normalize(await layoutPage.locator('.mini-explanation').innerText()), normalize(item.row.explain));
      await assertFits(layoutPage, `${viewport.width}x${viewport.height} ${key} answer`);
    }
  }
  await openMini(fixture, 'hanguksa');
  await assertFront(fixture, 'hanguksa');
  assert.equal(await fixture.locator('.mini-answer').count(), 0, 'subject change resets the previous answer face');
  assert.deepEqual(errors, [], 'no uncaught browser exceptions');
  console.log('Mini quiz passed: card-only UI, five URL-selected subjects/types, six actual colors, hidden answers/aliases, authentic sources, duplicate-free random rounds, touch/Enter, zero scrolling, unclipped longest content on narrow/landscape screens, 30-day independent resume and unchanged graded history.');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
