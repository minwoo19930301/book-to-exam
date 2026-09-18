# 손노트

손글씨 메모를 보고, 객관식·서술형으로 스스로 채점하는 학습기.

- 뷰어: `viewer.html`
- 객관식: 키워드 문항 무작위 10문제
- 서술형: 채점 기준(하네스)을 먼저 고정. API 키로 채점하거나 `POST /api/mcp`로 문항·기준을 가져감.

이 저장소에는 손글씨 메모만 있습니다. 시판 교재·평가원 원문은 넣지 않았습니다.

## MCP

`GET /api/mcp` 도구 목록  
`POST /api/mcp` `{ "name": "get_essay", "arguments": { "id": "e5" } }`  
채점: `POST /api/grade` `{ "provider": "openai"|"gemini", "apiKey": "...", "essay": {...}, "answer": "..." }`
