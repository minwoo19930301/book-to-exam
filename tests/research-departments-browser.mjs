import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.UI_TEST_BASE_URL || "http://127.0.0.1:4193";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  const read = async department => {
    const response = await fetch(`${origin}/api/research?department=${department}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  const history = await read("history");
  const education = await read("education");
  assert.ok(history.faculty.length && education.faculty.length);
  await page.goto(`${origin}/prediction-analysis?subject=all&view=faculty&department=history`);
  await page.locator(".research-faculty").first().waitFor();
  assert.equal(await page.getByLabel("교수 소속 구분").inputValue(), "history");
  assert.equal(await page.locator(".research-faculty").count(), history.faculty.length);
  assert.ok((await page.locator(".research-faculty .research-card-meta").allTextContents()).every(text => text.includes("일반 역사학과·사학과")));
  const linked = history.faculty.find(person => person.predictionIds.length);
  const card = page.locator(".research-faculty").filter({ has: page.getByRole("heading", { name: new RegExp(linked.name) }) });
  await card.locator("summary").first().click();
  const paper = card.locator(".research-paper").first();
  assert.match(await paper.innerText(), /확인 범위/);
  assert.ok((await paper.locator("a").first().getAttribute("href")).startsWith("https://"));
  await card.getByRole("button", { name: /연결 예상문항/ }).click();
  await page.locator(".bank-question").first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get("facultyId"), linked.id);
  await page.getByLabel("교수 소속 구분").selectOption("education");
  await page.waitForFunction(count => document.querySelector(".research-counts strong")?.textContent === String(count), education.faculty.length);
  assert.equal(new URL(page.url()).searchParams.has("facultyId"), false);
  await page.getByRole("button", { name: "교수·논문", exact: true }).click();
  await page.locator(".research-faculty").first().waitFor();
  assert.equal(await page.locator(".research-faculty").count(), education.faculty.length);
  assert.ok((await page.locator(".research-faculty .research-card-meta").allTextContents()).every(text => text.includes("역사교육과·사범대")));
  await page.reload();
  await page.locator(".research-faculty").first().waitFor();
  assert.equal(await page.getByLabel("교수 소속 구분").inputValue(), "education");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile department filter overflow");
  await page.getByRole("button", { name: "조건 지우기", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="교수 소속 구분"]')?.value === "all");
  assert.deepEqual(errors, []);
  console.log("Research department filters: history/education scope, paper links, linked questions, URL persistence and mobile passed.");
} finally {
  await browser.close();
}
