import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { listPredictions } from "../functions/_lib/research.js";

const [origin = "https://bookvideotoexam.pages.dev", expectedCommit] = process.argv.slice(2);
if (!expectedCommit || !/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error("Usage: node tools/verify-deployment.mjs <url> <full-commit-sha>");
const base = new URL(origin);
if (!["https:", "http:"].includes(base.protocol)) throw new Error("Use an HTTP(S) URL.");
const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), ...options });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response;
};
const get = async path => (await request(path)).json();
let release;
for (let attempt = 0; attempt < 7; attempt++) {
  try {
    release = await get(`/release.json?commit=${expectedCommit}`);
    assert.equal(release.commit, expectedCommit);
    assert.equal(release.dirty, false);
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
}
console.log(`Live release ${release.commit} (${release.sourceBranch})`);

const html = await (await request("/questions?subject=all&pageSize=50")).text();
assert.match(html, /<div id="root"/);
const script = html.match(/<script[^>]+src="([^"]+)"/)[1];
assert.match(await (await request(script)).text(), /practice-bank/);
const all = await get("/api/practice-bank?subject=all&pageSize=100");
const readData = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const expectedCounts = Object.fromEntries(["hand-memo", "seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"].map(subject => {
  const directory = subject === "hand-memo" ? "public/data" : `public/data/subjects/${subject}`;
  const total = ["questions", "blanks", "essays"].reduce((sum, name) => sum + readData(`${directory}/${name}.json`).length, 0)
    + listPredictions({ subject }).length;
  return [subject, total];
}));
const expectedTotal = Object.values(expectedCounts).reduce((a, b) => a + b, 0);
assert.equal(all.total, expectedTotal);
assert.equal(all.items.length, 100);
assert.equal(all.counts.research, 24);
for (const [subject, total] of Object.entries(expectedCounts)) {
  const result = await get(`/api/practice-bank?subject=${subject}&pageSize=20`);
  assert.equal(result.total, total, subject);
  assert.ok(result.items.every(item => item.subject === subject));
}
const research = await get("/api/practice-bank?type=research&pageSize=50");
assert.equal(research.items.length, 24);
for (const item of research.items) {
  assert.ok(item.modelAnswer);
  assert.equal(item.criteria.reduce((sum, criterion) => sum + criterion.max, 0), 10);
}
const searched = await get(`/api/practice-bank?subject=hanguksa&type=research&q=${encodeURIComponent("호적")}`);
assert.ok(searched.items.some(item => item.id === "hanguksa-pred-status-evidence"));
const invalid = await fetch(new URL("/api/practice-bank?pageSize=999", base), { signal: AbortSignal.timeout(20000) });
assert.equal(invalid.status, 400);
const figures = JSON.parse(readFileSync(new URL("../public/data/figure-assets.json", import.meta.url), "utf8")).figures;
const captures = readData("public/data/source-pages.json");
const liveCaptures = await get("/data/source-pages.json");
assert.equal(liveCaptures.notesWithCaptures, captures.notesWithCaptures);
assert.equal(liveCaptures.assetCount, captures.assetCount);
for (const subject of ["seoyangsa", "hanguksa", "dongyangsa", "gyoyukron"]) {
  const figure = figures.find(item => item.src.startsWith(`/figures/${subject}/`));
  assert.ok(figure, subject);
  const bytes = Buffer.from(await (await request(figure.src)).arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), figure.assetSha256, figure.id);
  const page = Object.values(captures.pages).find(item => item.subject === subject && item.captures.length);
  const capture = page.captures[0];
  const scan = Buffer.from(await (await request(capture.src)).arrayBuffer());
  assert.equal(createHash("sha256").update(scan).digest("hex"), capture.sha256, capture.sourcePath);
}
assert.match(await (await request("/history")).text(), /<div id="root"/);
const mcp = await (await request("/api/mcp/public", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_research_stats", arguments: {} } }) })).json();
assert.deepEqual(mcp.result.structuredContent.totals, { faculty: 27, papers: 87, predictions: 24, coreReviewed: 72 });
console.log(`Verified: ${expectedTotal.toLocaleString()} questions, five subjects, 24 research answers/rubrics, search, invalid-input handling, ${captures.notesWithCaptures} capture mappings with four original samples, four extracted figures, history route, MCP, release identity.`);
