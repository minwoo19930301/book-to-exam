import React, { useRef, useState } from 'react';
import { useSubject } from './subjects.jsx';
import './appeal.css';

export function AppealForm({ subject, context = null, source = '', onClose }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const submission = useRef(null);
  const inFlight = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || !message.trim()) return;
    inFlight.current = true;
    setBusy(true); setError('');
    const payload = { subject, message: message.trim(), context, source };
    const serialized = JSON.stringify(payload);
    try {
      if (submission.current?.serialized !== serialized) submission.current = { serialized, id: crypto.randomUUID() };
      const response = await fetch('/api/appeals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: submission.current.id, ...payload }) });
      let result;
      try { result = await response.json(); } catch { throw new Error('접수 결과를 확인하지 못했습니다. 다시 전송해 주세요.'); }
      if (!response.ok || !result.received) throw new Error(result.error || '접수하지 못했습니다. 잠시 후 다시 전송해 주세요.');
      setReceipt(result.id);
    } catch (error) { setError(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  }

  if (receipt) return <div className="appeal-receipt" role="status">
    <p>이의제기를 접수했습니다.</p>
    <small>접수 번호 <code>{receipt}</code></small>
    {onClose && <button type="button" onClick={onClose}>닫기</button>}
  </div>;

  return <form className="appeal-form" onSubmit={submit}>
    <textarea aria-label="이의제기 내용" required minLength={1} maxLength={3000} rows={6} autoFocus
      value={message} onChange={event => setMessage(event.target.value)} disabled={busy}
      placeholder="어떤 부분을 확인하면 될까요?" />
    <p className="appeal-notice">{context ? '현재 문항·답안·채점 결과와 화면 정보를 함께 보냅니다.' : '현재 화면 정보를 함께 보냅니다.'}</p>
    {error && <p className="appeal-error" role="alert">{error}</p>}
    <button className="appeal-submit" type="submit" disabled={busy || !message.trim()}>{busy ? '전송 중…' : '전송'}</button>
  </form>;
}

// The route adapter is replaced by the shared popup infrastructure at integration.
export default function Appeal() {
  const { id } = useSubject();
  return <AppealForm subject={id || 'all'} />;
}
