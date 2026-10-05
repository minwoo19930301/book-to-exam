// Real public APIs and practice bank; no computer-use or external writes.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:4193';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:1000}});
const page=await context.newPage();const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const coverage=await fetch(`${origin}/data/page-practice-coverage.json`).then(r=>r.json());
try {
 for(const report of coverage.subjects) {
  const base=report.subject==='hand-memo'?'/data':`/data/subjects/${report.subject}`;
  const bank=await fetch(`${origin}${base}/questions.json`).then(r=>r.json());
  const q=bank.find(q=>q.provenance?.origin==='authored-page-practice'&&report.pages.some(p=>p.page===q.page&&p.count>=3&&p.count<=4));
  assert.ok(q,report.subject);
  const row=report.pages.find(p=>p.page===q.page);
  await page.goto(`${origin}/viewer?subject=${report.subject}&page=${q.page}`);
  const link=page.locator('.viewer-page-practice');await link.waitFor();
  assert.equal(await link.innerText(),`이 쪽 문제 ${row.count}개 보기 →`);
  await link.click();
  await page.locator('.bank-question').first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get('sourcePage'),q.page);
  assert.equal(await page.locator('.bank-question').count(),row.count);
  await page.getByRole('button',{name:/^단답형\d/}).click();
  const card=page.locator(`[id="${q.id}"]`);await card.waitFor();
  await card.getByRole('link',{name:'답안 작성 →'}).click();
  await page.getByLabel('단답형 답안').fill(q.acceptedAnswers[0] || q.answer);
  assert.equal(new URL(page.url()).searchParams.get('q'),q.id);
  await page.getByRole('button',{name:'채점',exact:true}).click();
  await page.locator('.typed .mark-ok').waitFor();
  await page.getByRole('button',{name:'히스토리',exact:true}).click();
  const history=page.getByRole('dialog',{name:'히스토리',exact:true});
  await history.locator('.history-entry').first().waitFor();
  assert.ok((await history.innerText()).includes(q.prompt.replace(/\*\*/g,'')));
  await page.keyboard.press('Escape');await history.waitFor({state:'detached'});
  await page.goto(`${origin}/questions?subject=${report.subject}&sourcePage=${q.page}`);
  await page.locator('.bank-question').first().waitFor();
  await page.getByRole('link',{name:'원문으로 돌아가기 ↗'}).click();
  await page.locator('.viewer-page-practice').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('page'),q.page);
 }
 // Changing subjects clears page scope; clearing an empty result must also do so.
 await page.goto(`${origin}/questions?subject=hanguksa&sourcePage=hanguksa-textbook-page-999999`);
 await page.getByRole('button',{name:'검색 조건 지우기'}).click();
 await page.locator('.bank-question').first().waitFor();
 assert.equal(new URL(page.url()).searchParams.get('sourcePage'),null);
 await page.goto(`${origin}/questions?subject=hand-memo&sourcePage=p2`);
 await page.getByLabel('과목',{exact:true}).selectOption('seoyangsa');
 await page.locator('.bank-question').first().waitFor();
 assert.equal(new URL(page.url()).searchParams.get('sourcePage'),null);
 assert.ok((await page.locator('.bank-question-meta').allTextContents()).every(t=>t.includes('서양사')));
 // A valid all-subject page filter also returns to that page's real subject.
 const koreanPage=coverage.subjects.find(s=>s.subject==='hanguksa').pages.find(p=>p.count>=3).page;
 await page.goto(`${origin}/questions?sourcePage=${koreanPage}`);
 await page.locator('.bank-question').first().waitFor();
 await page.getByRole('link',{name:'원문으로 돌아가기 ↗'}).click();
 await page.locator('.viewer-page-practice').waitFor();
 assert.equal(new URL(page.url()).searchParams.get('subject'),'hanguksa');
 assert.equal(new URL(page.url()).searchParams.get('page'),koreanPage);
 // New authored clozes render exactly their selected passage and grade aliases.
 const clozes=await fetch(`${origin}/data/subjects/seoyangsa/blanks.json`).then(r=>r.json());
 for(const q of clozes.filter(q=>q.provenance?.origin==='authored-page-practice')) {
  await page.goto(`${origin}/blank?subject=seoyangsa&q=${q.id}`);
  await page.getByLabel('빈칸 답안').waitFor();
  assert.equal(await page.locator('.cloze').innerText(),q.before+q.after);
  await page.getByLabel('빈칸 답안').fill(q.acceptedAnswers[0] || q.answer);
  await page.getByRole('button',{name:'채점',exact:true}).click();
  await page.locator('.cloze .mark-ok').waitFor();
 }
 // Mobile scoped bank and an explicitly excluded original page remain usable.
 await page.setViewportSize({width:390,height:844});
 await page.goto(`${origin}/questions?subject=hand-memo&sourcePage=p2`);
 await page.locator('.bank-question').first().waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const exception=coverage.subjects.find(s=>s.subject==='gyoyukron').pages.find(p=>p.count===0&&p.reason);
 await page.goto(`${origin}/viewer?subject=gyoyukron&page=${exception.page}`);
 await page.getByText(`문제 구성 안내: ${exception.reason}`,{exact:true}).waitFor();
 assert.equal(await page.locator('.viewer-page-practice').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Five subjects: viewer coverage → exact-page bank → answer/alias grading → history; page reset, source return, exclusions and mobile passed.');
} finally {await context.close();await browser.close();}
