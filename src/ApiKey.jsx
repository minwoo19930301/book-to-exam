import Chrome from "./Chrome.jsx";

export default function ApiKey() {
  return (
    <Chrome title="API 키">
      <h1>Google AI Studio에서 API 키 받기</h1>
      <p className="muted">여러 키 중 제일 단순한 방법입니다. 구글 계정만 있으면 됩니다.</p>
      <ol className="steps">
        <li>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>
          에 들어갑니다.
        </li>
        <li>구글 계정으로 로그인합니다.</li>
        <li><b>Create API key</b>를 누릅니다.</li>
        <li>프로젝트를 고르거나 새 프로젝트를 만듭니다.</li>
        <li>나온 키를 복사해서 시험 화면의 API 키 칸에 붙여 넣습니다.</li>
      </ol>
      <p className="muted">키는 이 브라우저에만 잠깐 쓰이고, 사이트에 저장하지 않습니다.</p>
      <p>다른 키도 됩니다. OpenAI, Claude, Groq, OpenRouter, DeepSeek 중에서 고르면 됩니다.</p>
    </Chrome>
  );
}
