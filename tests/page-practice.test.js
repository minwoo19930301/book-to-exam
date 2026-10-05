import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreLocal } from '../shared/scoring.js';
import { shortExcerpts, maskExcerpt, usesExactPassage } from '../src/source-excerpts.js';
import { onRequestGet } from '../functions/api/practice-bank.js';
const read=path=>JSON.parse(readFileSync(new URL(`../${path}`,import.meta.url)));
const coverage=read('public/data/page-practice-coverage.json');

test('each reviewed viewer page has three primary questions or an explicit exception matching the live bank', async()=>{
  assert.equal(coverage.counting,'primary-page');
  assert.equal(coverage.subjects.length,5);
  for(const report of coverage.subjects) {
    const folder=report.subject==='hand-memo'?'public/data':`public/data/subjects/${report.subject}`;
    const notes=read(`${folder}/notes.json`);
    assert.equal(report.totalPages,notes.length);
    assert.deepEqual(new Set(report.pages.map(r=>r.page)),new Set(notes.map(n=>n.id)));
    for(const row of report.pages) {
      assert.ok(row.count>=3||row.reason?.trim().length>0,`${row.page}: uncovered without review`);
      const result=await onRequestGet({request:new Request(`https://example.test/api/practice-bank?subject=${report.subject}&sourcePage=${row.page}`)}).json();
      assert.equal(result.total,row.count,row.page);
      assert.ok(result.items.every(q=>q.page===row.page));
    }
    assert.equal(report.coveredPages,report.pages.filter(p=>p.count>=3).length);
    assert.equal(report.exceptionPages,report.pages.filter(p=>p.count<3).length);
  }
});

test('every new problem has exact local evidence and all approved answers pass the actual grader without substring matching',()=>{
  for(const report of coverage.subjects) {
    const folder=report.subject==='hand-memo'?'public/data':`public/data/subjects/${report.subject}`;
    const notes=new Map(read(`${folder}/notes.json`).map(n=>[n.id,n]));
    const additions=[];
    for(const [bank,type] of [['questions','short'],['blanks','blank']]) {
      for(const q of read(`${folder}/${bank}.json`).filter(q=>q.provenance?.origin==='authored-page-practice')) {
        additions.push(q);
        assert.equal(q.provenance.sourceStatus,'transcription-unverified');
        assert.ok(q.evidence.length>0);
        assert.ok(q.evidence.every(e=>e.page===q.page&&notes.get(e.page).text.includes(e.quote)),q.id);
        for(const answer of [q.answer,...q.acceptedAnswers]) {
          assert.equal(scoreLocal({...q,type},answer).good,true,`${q.id} ${answer}`);
          assert.equal(scoreLocal({...q,type},answer.normalize('NFD')).good,true,`${q.id}: unicode`);
        }
        for(const bad of ['', '확인되지 않은 엉뚱한 답변',`${q.answer}이 아니다`,`${q.answer}xyz`])
          assert.equal(scoreLocal({...q,type},bad).good,false,`${q.id}: ${bad}`);
        if(type==='blank') {
          assert.equal(q.before+q.answer+q.after,q.passage);
          assert.equal(q.prompt,q.before+'_____'+q.after);
          assert.equal(usesExactPassage(q),true);
        } else for(const excerpt of shortExcerpts(q)) {
          const masked=maskExcerpt(excerpt.text,q).replace(/\s/gu,'').toLowerCase();
          for(const answer of [q.answer,...q.acceptedAnswers])assert.ok(!masked.includes(answer.replace(/\s/gu,'').toLowerCase()),q.id);
        }
      }
    }
    assert.equal(additions.length,Object.values(report.added).reduce((a,b)=>a+b,0));
    assert.ok(additions.length>0);
    // Explicitly inferred exam-book transcriptions must not become fresh questions.
    assert.ok(additions.every(q=>!q.page.includes('-gichul-')));
  }
});
