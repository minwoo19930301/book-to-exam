import { useState } from "react";

function CopyAddress({ value }) {
  const [notice, setNotice] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(value); setNotice("복사했어요"); }
    catch { setNotice("주소를 직접 선택해서 복사해 주세요"); }
  }
  return <div className="chrome-guide-address"><code>{value}</code><button className="text-btn" type="button" onClick={copy}>주소 복사</button><small role="status">{notice}</small></div>;
}

export default function ChromeAiGuide() {
  const [state, setState] = useState("");
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try {
      if (!globalThis.LanguageModel?.availability) {
        setState("내장 AI API가 감지되지 않습니다. Canary에서 설정 후 재시작하고 이 페이지를 다시 열어 주세요.");
        return;
      }
      const value = await globalThis.LanguageModel.availability();
      setState({
        available: "준비됐어요. 아래 ‘Chrome 내장 AI로 채점’을 누르세요.",
        downloadable: "모델 다운로드가 필요해요. 아래 채점 버튼을 누르면 Chrome이 다운로드를 시작합니다.",
        downloading: "모델 다운로드 중이에요. 완료 후 채점해 주세요.",
        unavailable: "현재 기기에서 사용할 수 없어요. 아래 문제 해결 안내에서 모델·기기 상태를 확인해 주세요.",
      }[value] || `현재 상태: ${value}`);
    } catch { setState("상태를 확인하지 못했어요. Canary를 재시작한 뒤 다시 확인해 주세요."); }
    finally { setChecking(false); }
  }
  return <details className="chrome-ai-guide" open>
    <summary>처음이라면 · Chrome Canary 설정 가이드</summary>
    <p className="muted">아래 설정은 Chrome Canary 창에서 진행하세요. 설정 주소는 복사해서 주소창에 붙여 넣습니다.</p>
    <ol className="steps">
      <li><strong>Chrome Canary 설치·실행</strong><p><a href="https://www.google.com/chrome/canary/" target="_blank" rel="noreferrer">공식 설치 페이지 ↗</a>에서 설치한 뒤, Canary에서 이 페이지를 여세요.</p><CopyAddress value={window.location.href} /></li>
      <li><strong>Prompt API 켜기</strong><CopyAddress value="chrome://flags/#prompt-api-for-gemini-nano" /><p><b>Prompt API for Gemini Nano</b> 항목이 보이면 <b>Enabled</b>로 바꾸세요. 버전에 따라 이미 기본 제공되어 이 항목이 없을 수 있습니다.</p></li>
      <li><strong>기기 내 AI 모델 설정 확인</strong><CopyAddress value="chrome://flags/#optimization-guide-on-device-model" /><p><b>Optimization Guide On Device Model</b> 관련 항목이 있으면 활성화하세요. 구버전 안내에는 <b>Enabled BypassPrefRequirement</b>라는 선택지가 나옵니다. 현재 버전에 표시되는 설명을 확인하고, 항목이 없으면 다음 단계로 진행하세요.</p></li>
      <li><strong>Relaunch로 재시작</strong><p>설정 화면의 <b>Relaunch</b>를 눌러 Canary를 재시작한 뒤, 이 페이지로 돌아오세요.</p></li>
      <li><strong>모델 준비 확인 후 채점</strong><p>아래 버튼으로 상태를 확인하세요. 다운로드가 필요하면 채점 버튼을 누르고 진행률이 끝날 때까지 기다리면 됩니다.</p><button className="ghost" type="button" onClick={check} disabled={checking}>{checking ? "확인 중…" : "내장 AI 준비 상태 확인"}</button>{state && <p role="status" aria-live="polite">{state}</p>}</li>
    </ol>
    <details><summary>모델이 준비되지 않거나 설정 항목이 없나요?</summary>
      <p>현재 버전에서는 아래 페이지에서 모델과 기기 지원 상태를 확인할 수 있습니다.</p><CopyAddress value="chrome://on-device-internals" />
      <p>구버전에서는 아래 페이지에 <b>Optimization Guide On Device Model</b>이 보이면 <b>Check for update</b>로 업데이트를 확인하세요. 항목이 안 보인다고 반드시 오류인 것은 아닙니다.</p><CopyAddress value="chrome://components" />
      <p>다운로드에는 인터넷 연결과 여유 저장 공간이 필요합니다. 설정만으로 모든 기기에서 실행되지는 않으며, 최신 Chrome의 기기 지원 조건을 확인해 주세요.</p>
      <a href="https://developer.chrome.com/docs/ai/debug-built-in-model" target="_blank" rel="noreferrer">Chrome 공식 문제 해결 안내 ↗</a>
    </details>
    <p className="muted"><a href="https://www.youtube.com/watch?v=FLJ2JTSPV1Y" target="_blank" rel="noreferrer">참고 영상 ↗</a> · 설정 이름은 Canary 버전에 따라 바뀔 수 있습니다. 모델은 Chrome이 관리하므로 별도 Gemma 설치는 필요하지 않습니다.</p>
  </details>;
}
