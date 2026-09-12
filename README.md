# 📖 AGY Smart Textbook Pipeline (Antigravity 멀티모달 스마트 교재 파이프라인)

> **"맥북 기본 OCR, 테서렉트, 제미나이 단순 API 래퍼를 쓰지 않는다."**  
> **1~2초마다 책을 멈춰 넘기는 촬영 영상으로부터, AGY(Google Antigravity)의 네이티브 멀티모달 시각 지능(`view_file`)과 서브에이전트 군단을 가동하여 한 글자의 왜곡이나 요약 없는 '인터랙티브 웹 교재'를 자동 생성하는 표준 교본(Master Blueprint) & 엔지니어링 노하우**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Engine: Google Antigravity](https://img.shields.io/badge/Engine-Google%20Antigravity%20(AGY)-4285F4.svg)]()
[![Multimodal: Native Vision](https://img.shields.io/badge/Vision-AGY%20view__file%20Multimodal-EA4335.svg)]()
[![Zero Dependency](https://img.shields.io/badge/Viewer-Zero%20Dependency%20HTML5-34A853.svg)]()

---

## 🌟 1. 왜 기존 도구(Apple/Tesseract/단순 LLM API)를 쓰면 실패하는가?

종이책 수험서나 전공 서적을 디지털화할 때 시중의 일반적인 도구들은 예외 없이 실패합니다.

```
[시중 도구들의 3대 실패 요인]
  1. 테서렉트(Tesseract)   ──> 한국어 복합어·한자 병기·기울어진 지면에서 인식률 처참
  2. 단순 로컬 OCR (Apple)  ──> '5숫자', '통판', '살색' 등 치명적인 외계어 오타 양산 & 표/사료 구조 파괴
  3. 클라우드 Chat API     ──> "원문 그대로 써라"고 해도 AI 마음대로 요약/누락/환각(Hallucination) 발생
```

| 접근 방식 | 실전 현장에서 드러난 치명적인 한계 |
| :--- | :--- |
| **로컬 OCR (Apple Vision / Tesseract)** | 기계적인 문자 좌표 인식에 불과하여 한자 혼용이나 복잡한 단락에서 **`5숫자`(순자), `통판`(동원), `살색`(순장), `주4과 보는...`(주왕과 달기는...)** 같은 읽을 수 없는 외계어 오타를 쏟아내며, 사료 원문이나 표 구조를 전혀 이해하지 못합니다. |
| **단순 LLM API 래퍼 (GPT-4o, Gemini Chat API)** | 텍스트 박스 단위가 아니라 지면 전체를 LLM에 던지면, **AI 특유의 게으름(Laziness)과 자의적 요약 본능** 때문에 필수 사료(史料) 원문이나 세부 도표 항목을 제멋대로 축약하거나 빼먹어 수험서로서의 가치를 상실합니다. |
| **✨ AGY Native Multimodal Pipeline (본 교본)** | **AGY의 네이티브 멀티모달 시각 인식(`view_file`) + 자율 서브에이전트 군단(`invoke_subagent`)**을 직결하여, 모델이 고화질 지면 원본을 인간 연구자처럼 직접 육안으로 보고 **한자의 맥락, 표, 도해, 사료 원문을 100% 정본 그대로 전사**합니다. |

---

## 📐 2. AGY 엔드투엔드 파이프라인 아키텍처

```
[ 1~2초 간격 책 넘김 촬영 영상 / 고화질 스캔본 ]
                      │
                      ▼
    [ Step 1. 프레임 추출 & 지면 시퀀스 정렬 ]
      - 1스프레드 = 1장의 양면 이미지 (part1_page_001.jpg ...)
                      │
                      ▼
    [ Step 2. AGY 동적 책등 분할 (Dynamic Spine Gutter Split) ]
      - 고정 50% 분할 폐기! 지면 곡률/여백에 따라 x=0.35~0.55 사이 최적 책등 자동 추적
      - 교차선(cuts)=0 극소화 & 여백(margin) 극대화로 좌우 페이지 컬럼 유출 100% 차단
                      │
                      ▼
    [ Step 3. AGY 서브에이전트 군단 병렬 투입 (`invoke_subagent`) ]
      - 10~20페이지 단위로 특화 전사 에이전트(Book Transcriber) 병렬 분동
      - AGY 네이티브 `view_file`로 고화질 스캔 이미지를 직접 육안 판독
      - 단순 OCR 오타(통판, 5숫자 등) 원천 박멸 & 한자(漢字)·도표·사료 원문 복원
                      │
                      ▼
    [ Step 4. 지면 노이즈 제거 & 시맨틱 태그 구조화 ]
      - 상단 시대 연표 브레드크럼(하, 상, 주, 진, 한...) & 하단 쪽수 번호 자동 박멸
      - [사료탐구] 전용 박스, 대/소제목, 불릿 리스트 시맨틱 HTML 자동 패키징
                      │
                      ▼
    [ Step 5. 영구 보존용 마스터 인터랙티브 뷰어 완성 (Master Blueprint) ]
      - 외부 의존성 0의 단일 HTML5 파일
      - 상단: 고화질 양면 스캔 (휠 줌 0.5x~5x, 드래그 패닝, 방향키 탐색)
      - 하단: 좌우 독립 텍스트 패널 (클립보드 원클릭 복사, 반응형)
      - 좌측: 타임스탬프 동기화 목차 사이드바 & 실시간 검색창
```

---

## 💡 3. 실전에서 건져 올린 핵심 엔지니어링 노하우 6선

### 노하우 1. "로컬 OCR의 뼈대"와 "AGY 시각 지능"의 황금 역할 분담
* **교훈**: 로컬 OCR(Apple/Tesseract)에 텍스트 전사를 맡기면 외계어가 되고, 일반 LLM에 전사를 맡기면 요약/환각을 일으킵니다.
* **AGY 해결책**:
  1. 지면의 기하학적 레이아웃과 책등 좌표는 알고리즘으로 빠르게 계산합니다.
  2. 실제 텍스트 내용 전사는 **AGY의 네이티브 멀티모달 뷰어(`view_file`)**를 통해 모델이 원본 이미지를 직접 보며 수행합니다.
  3. AGY는 문맥과 역사적 고유명사(예: 은주혁명, 목야의 전투, 상앙 변법, 성악설)를 이해하므로 기계 OCR의 오타를 원천 차단하고 100% 완전한 교재 문장을 복원합니다.

### 노하우 2. 고정 50% 분할의 치명적 함정과 '동적 책등 탐지'
* **문제점**: 책을 손으로 잡고 1~2초마다 넘기면 손가락 지지 위치, 카메라 앵글, 책 곡률에 따라 책등(Spine) 위치가 `x = 0.35 ~ 0.55` 사이로 요동칩니다. 중앙(`x = 0.5`)을 기준으로 자르면 **오른쪽 면 본문 전체가 왼쪽 면 안으로 엉켜 들어가는 대참사(164쪽 사례)**가 일어납니다.
* **해결 알고리즘 (`src/spine_splitter.py`)**:
  - `x = 0.32 ~ 0.58` 구간에서 글자 박스를 자르는 횟수(`cuts`)가 0이면서 좌우 텍스트 박스와의 여백(Gutter Margin)이 최대가 되는 최적의 x 좌표를 동적으로 산출합니다.
  - 바운딩 박스 중심점 `(x + w/2)`로 분류하여 경계면에 걸친 텍스트도 100% 자기 페이지로 안전하게 분리합니다.

### 노하우 3. AGY 서브에이전트 병렬 스웜 (`invoke_subagent`)
* **문제점**: 300~500페이지 분량의 책을 한 번의 세션에서 전부 처리하려 하면 컨텍스트 윈도우가 가득 차고 후반부로 갈수록 품질이 저하(게으름 현상)됩니다.
* **해결책 (`src/agy_pipeline.py`)**:
  - 교재를 10~20페이지 단위의 배치(Batch)로 분할합니다.
  - AGY의 `invoke_subagent`를 호출하여 독립된 `book_transcriber` 서브에이전트 군단을 병렬로 가동합니다.
  - 각 서브에이전트가 배정된 이미지들을 `view_file`로 정밀 판독하여 구조화된 JSON으로 저장하므로, 500페이지 전체가 첫 페이지와 동일한 극한의 정밀도를 유지합니다.

### 노하우 4. 상단 타임라인 브레드크럼 & 하단 러닝 헤더 노이즈 박멸
* **문제점**: 수험서 상단에 인쇄된 시대 연표("하 - 상 - 주 - 춘추전국 - 진 - 한 - 위진남북조...") 띠가 매 페이지 본문 맨 앞에 섞여 들어옵니다.
* **해결책 (`src/formatter.py`)**:
  - `y > 0.88` 상단 영역의 연표 키워드 및 부유 단어 조각을 본문 진입 전 사전 소거합니다.
  - `y < 0.05` 하단 영역의 챕터 표시 및 페이지 번호를 필터링하여 순수 학습 본문만 정갈하게 남깁니다.

### 노하우 5. Y축 Proximity Clustering & 자연스러운 읽기 순서 복원
* 흩어진 텍스트 조각들을 세로 오차 `1.2%` 이내로 묶어 하나의 시각적 행(Line)으로 묶고, 행 내부에서는 `x` 좌표 오름차순(좌측 → 우측)으로 정렬합니다.
* 제목(`1.`, `(1)`), 목록(`•`, `①`, `㉠`), 그리고 가장 중요한 `[사료탐구]` 원문 전용 박스를 자동으로 감지하여 시맨틱 HTML로 렌더링합니다.

### 노하우 6. 어떤 책이든 복제 가능한 마스터 교본(Master Blueprint) HTML
* **Zero Dependency**: React 빌드, 외부 CDN, 서버 통신이 전혀 필요 없는 순수 HTML5/CSS3/Vanilla JS 단일 파일.
* **스마트 인터랙션 내장**:
  - 상단 스캔본 클릭 시 전체화면 Pan & Zoom 모달(마우스 휠 줌, 드래그 이동, 방향키 탐색) 구동.
  - 모달 닫기(ESC) 시 방금 보던 해당 카드 위치로 부드럽게 복귀.
  - 실시간 목차 검색 및 원문 원클릭 클립보드 복사 버튼 기본 탑재.

---

## 🚀 4. AGY 환경에서 실행하는 방법

### 1) AGY 서브에이전트 배치 전사 가동
```python
from src.agy_pipeline import create_subagent_batch_tasks

# 스캔 폴더의 이미지를 10장 단위 서브에이전트 작업으로 자동 분할
tasks = create_subagent_batch_tasks("./scans", batch_size=10)

# AGY 대화창에서 서브에이전트를 호출하여 각 배치를 병렬 전사
# (AGY가 view_file로 이미지를 직접 보며 ai_transcriptions/*.json 파일 생성)
```

### 2) 마스터 인터랙티브 뷰어 HTML 조립
```bash
python3 src/builder.py \
  --cards metadata.json \
  --cache ./ai_transcriptions \
  --template template/smart_viewer_template.html \
  --output my_smart_textbook.html \
  --title "동양사 스마트 교재"
```

생성된 `my_smart_textbook.html`을 브라우저로 열면 완성입니다:
```bash
open my_smart_textbook.html
```

---

## 📂 5. 리포지토리 구성 (Repository Layout)

```
smart-textbook-pipeline/
├── README.md                      # AGY 엔지니어링 노하우 & 가이드 (본 문서)
├── LICENSE                        # MIT License
├── run_pipeline.py                # 엔드투엔드 파이프라인 CLI 실행기
├── src/
│   ├── agy_agent_spec.json        # AGY 네이티브 멀티모달 전사 서브에이전트 명세서
│   ├── agy_pipeline.py            # AGY 서브에이전트 군단 오케스트레이터
│   ├── spine_splitter.py          # 동적 책등 분할 & 좌우 분리 알고리즘
│   ├── formatter.py               # 행 클러스터링, 노이즈 필터링, HTML 렌더러
│   ├── builder.py                 # HTML 뷰어 조립 및 최종 빌더
│   └── ocr_tool.swift             # 로컬 기하학 레이아웃 보조용 Swift 소스
└── template/
    └── smart_viewer_template.html # 스마트 교재 뷰어 마스터 교본 HTML/CSS/JS 템플릿
```

---

## 📜 6. 라이선스

본 프로젝트는 **MIT License**를 따릅니다. 자신의 강의 교재, 공무원/임용 수험서, 논문집, 전공 서적 디지털화에 자유롭게 활용할 수 있습니다.
