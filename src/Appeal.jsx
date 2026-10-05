import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSubject, useSubjects } from './subjects.jsx';
import Chrome from './Chrome.jsx';
import { historyStore, HISTORY_TYPES, HISTORY_STATUS } from './history-store.js';
import { resolveAppealContext, appealOrigin } from './appeal-context.js';
import './appeal.css';

export default function Appeal() {
  const subject = useSubject();
  const { subjects } = useSubjects();
  const location = useLocation();
  const navigate = useNavigate();
  const validSubject = ['hand-memo', 'hanguksa', 'seoyangsa', 'dongyangsa', 'gyoyukron'].includes(subject.id);
  const [context, setContext] = useState(null);
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [contextSource, setContextSource] = useState('');
  const [attached, setAttached] = useState(true);
  const [category, setCategory] = useState('grading');
  const [message, setMessage] = useState('');
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const submission = useRef(null);
  const origin = appealOrigin(location.search, subject.id);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setContext(null); setQuestion(null); setNotice(''); setContextSource('');
    (async () => {
      try {
        const current = appealOrigin(location.search, subject.id);
        if (!current.type || !validSubject) return;
        let saved = { attempts: [], session: null };
        if (current.type !== 'research') try { saved = await historyStore.loadBank({ subject: subject.id, type: current.type }); }
        catch { if (!abort.signal.aborted) setNotice('이 브라우저의 답안 기록을 읽지 못했습니다. 아래 내용에 입력한 답과 상황을 적어 주세요.'); }
        const id = current.questionId || (!current.current && saved.session?.questionId);
        if (!id) return;
        const response = await fetch(`/api/practice-bank?${new URLSearchParams({ subject: subject.id, type: current.type, q: id, pageSize: '100' })}`, { signal: abort.signal });
        if (!response.ok) throw new Error('문항 정보를 불러오지 못했습니다. 내용에 문항 번호를 적어 주세요.');
        const found = (await response.json()).items.find(item => item.id === id);
        if (!found) throw new Error('문항을 찾지 못했습니다. 내용에 문항 번호를 적어 주세요.');
        const resolved = resolveAppealContext(found, current, saved, location.state?.appealSnapshot, subject.id);
        if (!abort.signal.aborted) {
          setQuestion(found); setContext(resolved.context); setContextSource(resolved.source);
          if (resolved.source === 'current-snapshot') setNotice('');
          else if (resolved.missingAttempt) setNotice('이 화면에서 지정한 풀이 시도는 저장 기록에서 찾지 못했습니다. 다른 시도의 답안은 첨부하지 않았습니다. 입력한 답과 상황을 아래에 적어 주세요.');
        }
      } catch (error) { if (!abort.signal.aborted) setNotice(error.message); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, [location.search, location.state, subject.id, validSubject]);

  async function submit(event) {
    event.preventDefault();
    if (busy || loading || !validSubject) return;
    setBusy(true); setError('');
    const payload = { subject: subject.id, category, message: message.trim(), expectedAnswer: expectedAnswer.trim(), context: attached ? context : null };
    const serialized = JSON.stringify(payload);
    if (submission.current?.serialized !== serialized) submission.current = { serialized, id: crypto.randomUUID() };
    try {
      const response = await fetch('/api/appeals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: submission.current.id, ...payload }) });
      let result;
      try { result = await response.json(); } catch { throw new Error('접수 결과를 확인하지 못했습니다. 내용을 유지한 채 다시 제출해 주세요.'); }
      if (!response.ok || !result.received) throw new Error(result.error || '접수하지 못했습니다. 잠시 후 다시 제출해 주세요.');
      setReceipt(result.id);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return <Chrome title="이의제기" subjectControls={false} navigationSubject={validSubject ? subject.id : 'hand-memo'}><main className="appeal-page">
    <div className="appeal-heading"><span>문항과 채점 개선</span><h1>이의제기</h1><p>정답·채점·원문에 이상이 있으면 알려 주세요. 접수 내용은 운영자가 확인합니다.</p></div>
    {receipt ? <section className="appeal-receipt" role="status">
      <h2>이의제기를 접수했습니다.</h2><p>접수 번호 <code>{receipt}</code></p><p>내용은 별도 저장소에 저장됐습니다. 브라우저의 풀이 히스토리를 삭제해도 접수는 유지됩니다.</p>
      <Link to={origin.back}>문제로 돌아가기</Link>
      <button onClick={() => { setReceipt(''); setMessage(''); setExpectedAnswer(''); submission.current = null; }}>새 이의제기</button>
    </section> : <form className="appeal-form" onSubmit={submit}>
      <label className="appeal-subject">과목<select aria-label="과목" required value={validSubject ? subject.id : ''} disabled={busy} onChange={event => {
        const params = new URLSearchParams({ subject: event.target.value, from: `/questions?subject=${event.target.value}` });
        navigate(`/appeal?${params}`, { replace: true });
      }}><option value="" disabled>관련 과목을 선택해 주세요</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {loading && <p role="status">현재 문항과 답안을 불러오는 중…</p>}
      {notice && <p className="appeal-notice" role="status">{notice}</p>}
      {context && <section className="appeal-context">
        <label className="appeal-check"><input type="checkbox" checked={attached} onChange={event => setAttached(event.target.checked)} disabled={busy} />현재 문항·내 답·채점 결과 함께 보내기</label>
        {contextSource === 'latest-for-bank-question' && <p className="muted">문제은행에서 선택한 문항의 최근 풀이 기록입니다. 현재 열려 있는 다른 화면의 답안과 다를 수 있습니다.</p>}
        <p>{HISTORY_TYPES[context.type] || '연구 예상문항'} · {context.questionId}</p>
        <details><summary>{question.title || '첨부 내용 확인'}</summary>
          <p className="appeal-passage">{context.observed.prompt}</p>
          <dl><dt>내 답</dt><dd>{context.submittedAnswer || '입력한 답 없음'}</dd><dt>채점 결과</dt><dd>{HISTORY_STATUS[context.result.status]}{context.result.score !== null && ` · ${context.result.score} / ${context.result.max ?? '?'}점`}</dd>
            <dt>표시된 정답</dt><dd>{context.observed.answer || '문제은행의 정답·해설을 함께 전달합니다.'}</dd></dl>
        </details>
      </section>}
      {!loading && !context && <p className="appeal-notice">첨부된 문항이 없습니다. 문제가 있는 화면의 이의제기 버튼을 누르거나 아래에 문항 정보를 적어 주세요.</p>}
      <label>이의제기 유형<select aria-label="이의제기 유형" value={category} onChange={event => setCategory(event.target.value)} disabled={busy}>
        <option value="grading">맞는 답이 오답 처리됨 / 채점</option><option value="answer">정답·해설 오류</option><option value="source">원문·사진·판독 오류</option><option value="question">문제 내용·선택지 오류</option><option value="other">기타 의견</option>
      </select></label>
      <label>이의제기 내용<textarea aria-label="이의제기 내용" required minLength={5} maxLength={3000} rows={7} value={message} onChange={event => setMessage(event.target.value)} disabled={busy} placeholder="어떤 부분이 잘못되었는지, 근거와 함께 적어 주세요." /></label>
      <label>제안하는 정답 / 인정해야 할 답 <small>(선택)</small><textarea aria-label="제안하는 정답 / 인정해야 할 답" maxLength={1000} rows={2} value={expectedAnswer} onChange={event => setExpectedAnswer(event.target.value)} disabled={busy} /></label>
      <p className="appeal-privacy">선택한 문항·답안과 작성 내용을 운영자에게 보냅니다. 다른 풀이 기록은 보내지 않습니다. 이름·전화번호 등 개인정보는 적지 마세요.</p>
      {error && <p className="appeal-error" role="alert">{error}</p>}
      <div className="appeal-actions"><Link to={origin.back}>돌아가기</Link><button type="submit" disabled={busy || loading || !validSubject || message.trim().length < 5}>{busy ? '접수 중…' : '이의제기 제출'}</button></div>
    </form>}
  </main></Chrome>;
}
