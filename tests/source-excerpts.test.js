import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {maskExcerpt, shortExcerpts, shortStudyMode, exactCloze, usesExactPassage} from '../src/source-excerpts.js';

test('source reading masks all exact approved answers, spacing variants and attached glosses', () => {
  const q={answer:'경당',acceptedAnswers:['扃堂','K. Y.']};
  assert.equal(maskExcerpt('경 당(扃堂)은 경당이며 扃堂이라고 한다. K. Y. (Latin).',q), '［해당 용어］은 ［해당 용어］이며 ［해당 용어］이라고 한다. ［해당 용어］.');
  assert.equal(q.answer,'경당');
  assert.equal(maskExcerpt('**NEP**<br>n e p와 500인회', {answer:'NEP'}),'［해당 용어］\n［해당 용어］와 500인회');
  assert.equal(maskExcerpt('1+1과 1.1은 다르다',{answer:'1+1'}),'［해당 용어］과 1.1은 다르다');
});

test('short source mode selects authored exact evidence spans without adding note context', () => {
  const quote='[사료탐구] 이 문장은 출처에 수록된 실제 발췌문을 예시로 작성한 테스트 문자열이다. '.repeat(2);
  const q={answer:'발췌문', evidence:[{page:'p1',quote},{page:'p2',quote:'짧은 제목'}]};
  assert.deepEqual(shortExcerpts(q),[{page:'p1',text:quote}]);
  assert.equal(shortStudyMode(q),'source');
  assert.equal(shortStudyMode({...q,evidence:[{page:'p2',quote:'짧은 제목'}]}),'concept');
  assert.equal(shortStudyMode({...q,evidence:[{page:'p1',quote:'일반 설명문이다. '.repeat(12)}]}),'concept');
});

test('four subjects supply real evidence-based short questions and the mask covers approved answers', () => {
  for(const subject of ['seoyangsa','hanguksa','dongyangsa','gyoyukron']) {
    const bank=JSON.parse(readFileSync(new URL(`../public/data/subjects/${subject}/questions.json`,import.meta.url)));
    const source=bank.filter(q=>q.type==='blank'&&shortStudyMode(q)==='source');
    assert.ok(source.length>=20,`${subject}: ${source.length}`);
    for(const q of source) for(const excerpt of shortExcerpts(q)) {
      const masked=maskExcerpt(excerpt.text,q).replace(/\s/g,'').toLowerCase();
      for(const answer of [q.answer,...(q.acceptedAnswers||[])].filter(a=>typeof a==='string'&&a.trim()))
        assert.ok(!masked.includes(answer.replace(/\s/g,'').toLowerCase()),`${q.id}: ${answer}`);
    }
  }
});

test('authored source cloze renders its complete exact span without neighboring note expansion', () => {
  const q={contextMode:'source-excerpt',before:'첫 문장\n',after:'\n마지막 문장',answer:'정답',passage:'첫 문장\n정답\n마지막 문장'};
  assert.equal(usesExactPassage(q),true);
  assert.equal(usesExactPassage({passageMode:'full'}),true);
  assert.equal(usesExactPassage({}),false);
  assert.deepEqual(exactCloze(q),{before:q.before,after:q.after});
});
