import { Link } from "react-router-dom";
import { PROVIDERS } from "./text.js";
import { lastKey, sessionId } from "./settings.jsx";

export default function AiGate({
  provider, setProvider, keyVal, setKey, onGrade, onTemp, status, waiting,
}) {
  const used = lastKey().used || Boolean(lastKey().key);
  const mcp = `${window.location.origin}/api/mcp/${sessionId()}`;

  return (
    <div className="gate">
      <h2>채점에는 사용자의 AI 리소스가 필요합니다.</h2>
      <p className="muted">키는 이 브라우저 세션에만 잠깐 두고, 서버에 저장하지 않습니다.</p>
      <div className="row">
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <input
          type="password"
          autoComplete="off"
          value={keyVal}
          onChange={(e) => setKey(e.target.value)}
          placeholder="API 키"
        />
      </div>
      <div className="row">
        <button type="button" onClick={onGrade} disabled={waiting}>이 키로 채점</button>
        <button className="ghost" type="button" onClick={onTemp} disabled={waiting}>
          {used ? "임시 사용" : "임시 사용 (잠시 대기)"}
        </button>
      </div>
      <p>
        <Link to="/apikey">API 키가 없으신가요?</Link>
        {" "}Google AI Studio에서 가장 쉽게 받을 수 있습니다.
      </p>
      <div className="mcp">
        <code>{mcp}</code>
        <button className="ghost pill" type="button" onClick={() => navigator.clipboard.writeText(mcp)}>복사</button>
      </div>
      {status && <p className="status">{status}</p>}
    </div>
  );
}
