import { useEffect, useState } from "react";
import { PROVIDERS, mcpPrompt } from "./text.js";
import { sessionId } from "./settings.jsx";
import ChromeAiGuide from "./ChromeAiGuide.jsx";

export default function AiGate({
  method, onPick, provider, setProvider, keyVal, setKey, model, setModel, onGrade, onChrome, onCancel, status, waiting, essay, answer,
}) {
  const sid = sessionId();
  const prompt = essay ? mcpPrompt({ origin: window.location.origin, sid, essay, answer }) : "";
  const [help, setHelp] = useState(false);
  const [models, setModels] = useState([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState("");
  const demo = keyVal.startsWith("AIza-demo");

  useEffect(() => {
    if (!demo) return;
    setModels([{ id: "gemini-2.0-flash", label: "gemini-2.0-flash" }]);
    setModel("gemini-2.0-flash");
  }, [demo, setModel]);

  useEffect(() => {
    if (method !== "key" || !keyVal.trim()) return;
    loadModels();
  }, [method, provider]);

  async function loadModels() {
    if (demo) {
      setModels([{ id: "gemini-2.0-flash", label: "gemini-2.0-flash" }]);
      setModel("gemini-2.0-flash");
      return;
    }
    setListing(true);
    setListError("");
    try {
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, apiKey: keyVal.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "모델 목록을 가져오지 못했습니다.");
      const list = data.models || [];
      setModels(list);
      setModel((current) => (current && list.some((m) => m.id === current) ? current : (list[0]?.id || "")));
    } catch (err) {
      setModels([]);
      setModel("");
      setListError(err.message || "모델 목록을 가져오지 못했습니다.");
    } finally {
      setListing(false);
    }
  }

  if (!method) {
    return (
      <div className="gate" data-guide="essay-pick">
        <h2>채점 방법</h2>
        <p>채점을 위해서 사용자의 AI가 필요해요. 원하는 방법을 고르세요.</p>
        <div className="exam-actions">
          <button type="button" onClick={() => onPick("key")}>AI API 키</button>
          <button className="ghost" type="button" onClick={() => onPick("mcp")}>AI 에이전트 (MCP)</button>
          <button className="ghost" type="button" onClick={() => onPick("chrome")}>Chrome Canary AI (실험)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gate" data-guide="gate">
      {method === "key" && (
        <section className="gate-opt first">
          <p className="kicker">AI API 키</p>
          <p className="muted">키를 넣은 뒤 모델 목록을 불러오고, 쓸 모델을 고른 다음 채점합니다.</p>
          <div className="row">
            <select value={provider} onChange={(e) => { setProvider(e.target.value); setModels([]); setModel(""); }}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input data-guide="key-input" type={demo ? "text" : "password"} autoComplete="off" value={keyVal} onChange={(e) => { setKey(e.target.value); setModels([]); setModel(""); }} placeholder="API 키" />
          </div>
          {models.length > 0 && (
            <div className="row">
              <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="모델">
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          )}
          <div className="row">
            {!models.length ? (
              <button type="button" data-guide="grade-key" onClick={loadModels} disabled={waiting || listing || !keyVal.trim()}>
                {listing ? "불러오는 중" : "모델 목록 불러오기"}
              </button>
            ) : (
              <button type="button" data-guide="grade-key" onClick={onGrade} disabled={waiting || !model}>이 모델로 채점</button>
            )}
          </div>
          <p><button className="text-btn" type="button" onClick={() => setHelp(true)}>API 키가 없으신가요?</button></p>
        </section>
      )}

      {method === "chrome" && (
        <section className="gate-opt first">
          <p className="kicker">Chrome Canary 내장 AI</p>
          <ChromeAiGuide />
          <p>채점 API가 기준과 교재 근거를 준비하고, Chrome의 내장 AI가 답안을 평가합니다. API가 결과의 점수와 인용을 검증해 돌려줍니다.</p>
          <p className="muted">API 키는 필요하지 않습니다. 답안과 평가 결과는 검증을 위해 이 사이트의 API로 전송됩니다. 모델 추론에는 내 기기의 자원을 사용합니다.</p>
          <p className="muted">처음에는 Chrome이 관리하는 모델을 내려받을 수 있습니다. 한국어 채점은 실험 단계이며 지원 여부와 속도는 Chrome 버전·기기에 따라 다릅니다.</p>
          {!globalThis.LanguageModel?.create && <p role="alert">이 브라우저에서 내장 AI API가 감지되지 않았습니다. Chrome Canary에서 이 페이지를 열고 내장 AI 지원 상태를 확인해 주세요.</p>}
          <div className="row">
            <button type="button" onClick={onChrome} disabled={waiting || !globalThis.LanguageModel?.create}>Chrome 내장 AI로 채점</button>
            {waiting && <button className="ghost" type="button" onClick={onCancel}>중단</button>}
          </div>
        </section>
      )}

      {method === "mcp" && (
        <section className="gate-opt first">
          <p className="kicker">AI 에이전트 (MCP)</p>
          <p>연결한 AI에 아래 요청을 보내세요. tools/list에 score가 있어야 합니다. 점수와 근거는 AI 채팅에서 확인합니다.</p>
          <textarea className="prompt-box" readOnly value={prompt} />
          <div className="row">
            <button className="ghost" type="button" data-guide="copy" onClick={() => navigator.clipboard.writeText(prompt)}>프롬프트 복사</button>
          </div>
        </section>
      )}

      <button className="text-btn" type="button" disabled={waiting} onClick={() => onPick("")}>다른 방법</button>
      {(status || listError) && <p className="status" role="status" aria-live="polite">{status || listError}</p>}

      {help && (
        <div className="settings-overlay" onClick={() => setHelp(false)}>
          <div className="settings-popup" role="dialog" aria-labelledby="key-help-title" onClick={(e) => e.stopPropagation()}>
            <div className="settings-heading">
              <h2 id="key-help-title">API 키 받기</h2>
              <button className="text-btn" type="button" onClick={() => setHelp(false)} aria-label="닫기">×</button>
            </div>
            <div className="help-body">
              <p className="muted">여러 키 중 제일 단순한 방법은 Google AI Studio입니다. 구글 계정만 있으면 됩니다.</p>
              <ol className="steps">
                <li>
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>
                  에 들어갑니다.
                </li>
                <li>구글 계정으로 로그인합니다.</li>
                <li><b>Create API key</b>를 누릅니다.</li>
                <li>나온 키를 복사해서 이 화면의 API 키 칸에 붙여 넣습니다.</li>
                <li>모델 목록을 불러온 뒤, 쓸 모델을 고르고 채점합니다.</li>
              </ol>
              <p className="muted">OpenAI, Claude, Groq, OpenRouter, DeepSeek 키도 됩니다. 키는 이 브라우저에서만 쓰고, 사이트에 저장하지 않습니다.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
