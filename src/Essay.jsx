import { useEffect, useState } from "react";
import Chrome from "./Chrome.jsx";
import AiGate from "./AiGate.jsx";
import { lastKey, rememberKey, sessionId } from "./settings.jsx";

export default function Essay() {
  const prev = lastKey();
  const [essays, setEssays] = useState([]);
  const [id, setId] = useState("");
  const [provider, setProvider] = useState(prev.provider || "gemini");
  const [keyVal, setKey] = useState(prev.key || "");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [out, setOut] = useState(null);
  const essay = essays.find((e) => e.id === id) || essays[0];

  useEffect(() => {
    fetch("/data/essays.json").then((r) => r.json()).then((list) => {
      setEssays(list);
      setId(list[0]?.id || "");
    });
  }, []);

  async function run({ mode }) {
    if (!essay) return;
    if (mode === "key" && !keyVal.trim()) {
      setStatus("API 키를 넣거나 임시 사용을 눌러 주세요.");
      return;
    }
    if (answer.trim().length < 12) {
      setStatus("답을 더 쓰세요.");
      return;
    }
    setWaiting(true);
    setOut(null);
    setStatus(mode === "temp" ? "잠시 기다려 채점합니다…" : "채점 중");
    try {
      const url = mode === "temp" && !keyVal.trim() ? "/api/grade-temp" : "/api/grade";
      const body = {
        sessionId: sessionId(),
        provider,
        apiKey: keyVal.trim() || lastKey().key,
        essay,
        answer,
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.statusText);
      if (mode === "key" || keyVal.trim()) rememberKey(provider, keyVal.trim() || lastKey().key);
      setOut(data);
      setStatus(`총점 ${data.total} / ${data.max}`);
    } catch (err) {
      setStatus(String(err.message || err));
    } finally {
      setWaiting(false);
    }
  }

  function onTemp() {
    const saved = lastKey();
    if (saved.key) {
      setKey(saved.key);
      setProvider(saved.provider);
      return run({ mode: "key" });
    }
    return run({ mode: "temp" });
  }

  return (
    <Chrome title="서술형">
      <h1>서술형 한 문항을 골라 쓰고 채점합니다.</h1>
      {essay && (
        <>
          <label className="kicker">문항</label>
          <select value={essay.id} onChange={(e) => setId(e.target.value)}>
            {essays.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <p className="lead">{essay.prompt}</p>
          <div className="rubric">
            <p className="kicker">채점 기준</p>
            <ol>
              {essay.rubric.map((r) => (
                <li key={r.id}>{r.label} ({r.max}점) — {r.ok}</li>
              ))}
            </ol>
          </div>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="답을 작성하세요." />
        </>
      )}
      <AiGate
        provider={provider}
        setProvider={setProvider}
        keyVal={keyVal}
        setKey={setKey}
        onGrade={() => run({ mode: "key" })}
        onTemp={onTemp}
        status={status}
        waiting={waiting}
      />
      {out && (
        <div className="card explain">
          <p className="kicker">결과 {out.total} / {out.max}</p>
          {out.feedback && <p>{out.feedback}</p>}
          {Array.isArray(out.items) && (
            <ol>
              {out.items.map((it) => (
                <li key={it.id}>{it.comment || it.explain} ({it.score} / {it.max})</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Chrome>
  );
}
