# Smart textbook pipeline

1~2초 간격으로 넘긴 책 영상/스캔을, 인쇄 쪽수 기준 단일 HTML 뷰어로 만든다.

에이전트는 루트의 [`SKILL.md`](SKILL.md)를 따른다. 이 README는 사람용 요약이다.

## 한 줄

Apple Vision은 힌트다. agy/Cursor는 사진을 보고 글자를 유추한다. 실패는 보통 엔진이 아니라 **요약을 시켜서**다.

## 역할

| 단계 | 누가 |
|---|---|
| 영상에서 프레임 고르기 | agy desktop |
| 좌표·깨진 OCR | Apple Vision |
| 본문 복원 (요약 금지) | agy CLI 여러 마리 또는 Cursor (소량) |
| 쪽수·넘김·뷰어 | Cursor |

## 하지 말 것

- 로컬 OCR 결과를 본문으로 쓰기
- OCR이 깨지면 임용 서브노트로 대체
- 표지를 1–2쪽으로 달기
- 넘김 컷을 빈 카드로 남기거나, 옆 초를  blindly 집어 다음 장으로 새기
- 기존 뷰어를 버리고 새 HTML 미리보기 만들기
- 큰 미디어 git 안에서 agy `--add-dir`

## 코드

`src/` 의 spine split / formatter / builder 는 레이아웃·조립용이다.
본문 전사는 `agy --print` 워커가 jsonl로 쌓고, 오케스트레이터가 기존 뷰어에 주입한다.

```text
agy --model gemini-3.8-flash-high --new-project --project shard-N \
  --dangerously-skip-permissions --print-timeout 4h0s \
  --print='...'
```

실전 교훈: [`docs/lessons.md`](docs/lessons.md)

## 라이선스

MIT
