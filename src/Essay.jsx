import { useEffect, useState } from "react";
import Chrome from "./Chrome.jsx";

export default function Essay() {
  const [essays, setEssays] = useState([]);
  const [id, setId] = useState("");
  const [provider, setProvider] = useState("openai");
  const [key, setKey] = useState("");
  const [mcpOk, setMcpOk] = useState(false);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [out, setOut] = useState(null);
  const mcp = `${window.location.origin}/api/mcp`;
  const ready = key.trim().length > 8 || mcpOk;
  const essay = essays.find((e) => e.id === id) || essays[0];

  useEffect(() => {
    fetch("/data/essays.json").then((r) => r.json()).then((list) => {
      setEssays(list);
      setId(list[0]?.id || "");
    });
  }, []);

  async function grade() {
    if (!essay) return;
    if (!key.trim()) { setStatus("API 키를 넣거나, MCP로 채점하세요."); return; }
    if (answer.trim().length < 20) { setStatus("답을 더 쓰세요."); return; }
    setStatus("채점 중");
    setOut(null);
    try {
      const r = await fetch("/api/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key.trim(), essay, answer }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.statusText);
      setOut(data);
      setStatus(`총점 ${data.total} / ${data.max}`);
    } catch (err) {
      setStatus(String(err.message || err));
    }
  }

  return (
    <Chrome title="주관식 문제">
      <h1>채점에는 AI의 도움이 필요합니다.</h1>
      <div className="gate">
        <p>1. 본인의 AI API 키를 발급하고 여기서 제출하세요. 해당 API 키는 저장하지 않습니다.</p>
        <div className="row">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ width: 160 }}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="API 키" />
        </div>
        <p>혹은 AI agent에 해당 MCP 링크를 주세요.</p>
        <div className="mcp">
          <code>{mcp}</code>
          <button className="ghost" type="button" onClick={() => navigator.clipboard.writeText(mcp)}>복사</button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>연결이 되면 작성하세요.</p>
        <button className="ghost" type="button" onClick={() => setMcpOk(true)}>MCP로 연결함</button>
      </div>

      {ready && essay && (
        <>
          <label className="kicker">문항</label>
          <select value={essay.id} onChange={(e) => setId(e.target.value)} style={{ margin: "8px 0 12px" }}>
            {essays.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <p>{essay.prompt}</p>
          <div className="rubric">
            <p className="kicker">채점 기준</p>
            <ol>
              {essay.rubric.map((r) => (
                <li key={r.id}>{r.label} ({r.max}점) — {r.ok}</li>
              ))}
            </ol>
          </div>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="답을 작성하세요." />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" onClick={grade}>채점</button>
            <span className="muted">{status}</span>
          </div>
          {out && <pre className="out">{JSON.stringify(out, null, 2)}</pre>}
        </>
      )}
    </Chrome>
  );
}
