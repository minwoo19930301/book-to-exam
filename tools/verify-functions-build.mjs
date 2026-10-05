import assert from 'node:assert/strict';
import worker from '../dist/_worker.js';
import { onRequestGet as bank } from '../functions/api/practice-bank.js';
import { onRequestGet as research } from '../functions/api/research.js';
import { handleMcp } from '../functions/_lib/mcp.js';
const origin='https://build-verification.invalid';
let assetCalls=0;
const env={ASSETS:{fetch:async()=>{assetCalls++;return new Response('static-fallback');}}};
const ctx={waitUntil:()=>{}};
async function response(path,init) {
 return worker.fetch(new Request(origin+path,init),env,ctx);
}
async function compareBank(query) {
 const request=new Request(`${origin}/api/practice-bank?${query}`);
 const expected=bank({request});
 const actual=await response(`/api/practice-bank?${query}`);
 assert.equal(actual.status,expected.status);
 const a=await actual.json(),e=await expected.json();
 assert.deepEqual(a,e,'Compiled routing and Unicode data must match source exactly.');
 return a;
}
const first=await compareBank('pageSize=100');
for(let page=2;page<=first.pageCount;page++)await compareBank(`pageSize=100&page=${page}`);
await compareBank('subject=hanguksa&sourcePage=hanguksa-textbook-page-5');
await compareBank('sourcePage=../bad');
const researchRequest=new Request(`${origin}/api/research?subject=seoyangsa`);
assert.deepEqual(await (await response('/api/research?subject=seoyangsa')).json(),await research({request:researchRequest}).json());
const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})};
const expectedMcp=await handleMcp({request:new Request(`${origin}/api/mcp`,init),env:{},params:{id:'public'}},'public');
assert.deepEqual(await (await response('/api/mcp',init)).json(),await expectedMcp.json());
assert.equal((await response('/api/appeals')).status,405);
assert.equal(await (await response('/viewer?subject=seoyangsa')).text(),'static-fallback');
assert.equal(assetCalls,1);
console.log(`Built Worker passed: all ${first.total} bank entries byte-equivalent after JSON decoding, filtered/error routes, research, MCP, private appeals and static fallback.`);
