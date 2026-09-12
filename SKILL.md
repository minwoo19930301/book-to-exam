---
name: smart-textbook-pipeline
description: >-
  Rebuild a photographed Korean textbook (book-flip video or scans) into a
  printed-page viewer without summarizing. Use when the user mentions 스마트 교재,
  동양사 뷰어, 책 넘김 영상, agy 병렬 복원, OCR 재구성, Apple Vision, or page-number
  mismatch. Distinguishes video capture (agy GUI), OCR hints (Apple Vision),
  body reconstruction (vision LLM), and orchestration (Cursor).
---

# Smart textbook pipeline

종이책을 1~2초 넘김 영상/스캔으로 찍은 뒤, **인쇄 쪽수 기준** 웹 뷰어를 만든다.
목표는 요약·임용 서브노트가 아니라 **그 페이지의 항목을 살리는 것**이다.

## 누가 무엇을 하나

| 일 | 담당 | 이유 |
|---|---|---|
| 영상 보고 쓸 프레임 고르기 | **agy desktop/GUI** | 긴 영상 탐색·중간 캡처에 강함 |
| 글자 좌표·깨진 OCR 힌트 | **Apple Vision** (로컬) | 빠르다. 본문이 아니다. `입힌`, `5개조 서운` 같은 오타는 정상 |
| 사진 보고 글자 유추·항목 복원 | **비전 LLM** (agy CLI `gemini-3.8-flash-*` 또는 Cursor) | 엔진이 달라도 계약이 같으면 된다 |
| 쪽수/넘김/뷰어/병렬 띄우기 | **Cursor 오케스트레이션** | 레이아웃·매핑·재시작은 사람 옆 에이전트가 맡는다 |

Apple Vision이 있다고 복원이 되는 게 아니다. Vision은 힌트다.
Cursor가 중간에 망가진 이유도 Vision 부재가 아니다. **하는 일이 요약으로 바뀌어서**다.

agy를 쓰는 이유:
- 영상 캡처는 GUI가 낫다
- 본문 대량은 CLI를 **여러 마리** 띄우는 게 이 창 한 줄보다 빠르다
- Gemini 멀티모달로 사진을 직접 연다

agy를 안 써도 되는 경우: 펼침 몇 장만 고치거나, 쪽수/사진 배치만 고칠 때. 그때는 Cursor가 사진을 직접 보면 된다.

## 절대 계약 (복원 워커)

- 요약하지 마라. 임용 포인트/서브노트/한 줄 정리를 쓰지 마라.
- 책에 없는 시대·항목을 채우지 마라.
- 다른 페이지 내용을 끌어오지 마라.
- 기존 `rebuild_*.json`, `_build_*.py`, 뷰어 HTML은 오염원이다. 복사하지 마라.
- 책 기호 유지: ① ② ③ ㉠ ㉡ ㉢, (1) (2), [사료탐구]
- 한 장을 끝내는 즉시 JSONL 한 줄 append. 59장을 한 응답에 넣지 마라.
- `image_index`가 이미 jsonl에 있으면 건너뛴다.

출력 한 줄:

```json
{"image_index":13,"filename":"...","printed_left":24,"printed_right":25,"flip_or_bad":false,"left_title":"...","right_title":"...","left":"...마크다운...","right":"...마크다운..."}
```

## 쪽수 매핑

세 숫자가 다르다. 섞지 마라.

1. **영상 초/파일명** (`part1_page_017_89s.jpg` = 89초)
2. **이미지 인덱스** (촬영 순서 1…N)
3. **인쇄 쪽** (바닥 쪽수). 뷰어 배지는 이것만.

실수 패턴:
- 표지를 1–2쪽으로 달기 (속표지·차례가 오른쪽로 밀림)
- 강의 슬롯 번호로 카드 만들기
- 같은 펼침의 중복/넘김 컷을 다른 쪽으로 취급

앞부분(이 책 기준 대략 인쇄 22–23까지)이 좋으면 그 카드는 유지하고, 이후만 새 파일로 받는다.

## 넘김/불량 컷

`flip_or_bad=true`로 비우고 끝내지 마라.

1. 같은 인쇄 쪽의 **정상 형제 컷**이 있으면 그걸 쓴다. (예: 28–29는 89초가 손 가림, 86초가 정상)
2. 없으면 `all_raw_frames/sec_XXXX.jpg`에서 전후 수 초를 다시 본다.
3. 선명도만 보고 고르면 **다음 장으로 샌다**. (89초 넘김 옆 94초는 30–31)
4. 뷰어에 넘김 카드를 따로 만들지 마라.

## agy CLI (실전에서 죽은 이유)

1. `--print --model` 순서면 `--print`가 `--model`을 프롬프트로 먹는다. `--print='...'`를 마지막에.
2. Codex처럼 JPG가 수천 장인 git 안에서 띄우면 언트래킹 패치 인덱싱으로 죽는다. **작은 전용 git**에서 돌리고, `--add-dir`로 큰 레포를 열지 마라.
3. Cursor 셸에서 `&`만 하면 SIGHUP으로 첫 툴 직후 죽는다. `start_new_session=True`로 detach.
4. 같은 cwd에 5마리를 동시에 띄우면 conversation이 한 프로젝트로 붙는다. `--new-project --project ...`로 분리.
5. 토큰은 약 1시간 뒤 401로 끊긴다. jsonl skip-existing으로 재개. 계정 교체는 오케스트레이터가 한다.
6. 워커마다 **자기 jsonl**만 쓴다. 같은 파일 append 경쟁 금지.

실행 뼈대:

```bash
agy --model gemini-3.8-flash-high --effort high \
  --new-project --project reconstruct-shard-N \
  --dangerously-skip-permissions --disable-slash-commands \
  --print-timeout 4h0s \
  --print="$PROMPT"
```

워커 범위는 7–12장이 안전하다. 50장을 한 마리에 주면 후반이 다시 얇아진다.

## 뷰어

이미 있는 스마트 교재 뷰어 UI를 쓴다. 미리보기 HTML을 새로 만들지 마라.

- 위: 펼침 사진 전체 폭
- 아래: 왼쪽 인쇄 쪽 HTML | 오른쪽 인쇄 쪽 HTML
- 배지 = 인쇄 쪽. 파일 인덱스 아님
- `file://` 또는 절대경로. HTTP로 Downloads에서 열면 로컬 JPG가 404

22쪽까지 좋은 카드는 덮지 말고, 그 이후 카드의 `raw-text-wrapper`만 갈아끼운다.

## Cursor가 하면 안 되는 것

- Apple OCR만으로 본문 확정
- OCR이 안 읽히면 임용 키워드로 다시 쓰기 (`_build_261_309.py`가 그 실패)
- 300장을 이 창에서 한 세션에 받기
- 오염된 rebuild JSON을 “복원본”으로 주입

## Cursor가 해야 하는 것

- 워커 범위 쪼개기, 죽은 워커 재개, 401 감지
- 인쇄 쪽 ↔ 사진 대조, 넘김은 영상에서 재탐색
- 기존 뷰어에만 주입
- 샘플 몇 장을 사진과 직접 대조 (요약인지 항목인지)

## 품질 판정

좋다: `① ㉠`와 `[사료탐구]`가 그 사진에 있고, 쪽수가 바닥 숫자와 같다.
나쁘다: “임용 포인트”, 키워드만, 쪽수는 맞는데 본문이 다른 시대.

상세 실패 사례는 [docs/lessons.md](docs/lessons.md).
