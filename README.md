# 📖 Smart Textbook Pipeline (스마트 교재 디지털화 파이프라인)

> **1~2초 간격으로 책을 넘기는 스마트폰 촬영 영상이나 스캔본만 있으면,  
> 누구나 단 몇 분 만에 양면 고화질 스캔 + 좌우 정밀 분할 원문이 결합된 '인터랙티브 웹 교재'를 자동 생성하는 표준 파이프라인 & 실전 엔지니어링 노하우**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon%20Native)-black.svg)](https://apple.com)
[![Zero Dependency](https://img.shields.io/badge/Zero%20Dependency-Vanilla%20JS%20%2B%20CSS3-green.svg)]()

---

## 🌟 1. 왜 이 파이프라인인가?

종이책 수험서나 전공 서적을 디지털화할 때 기존 방식들은 모두 치명적인 한계에 부딪힙니다.

| 방식 | 치명적인 문제점 |
| :--- | :--- |
| **기존 Tesseract OCR** | 한국어 복합 어휘, 한자(漢字) 병기, 곡면 왜곡 환경에서 인식률이 급락하며 표·단락 구조가 완전히 무너집니다. |
| **Cloud LLM API 직결 (GPT-4o, Gemini API)** | 1. **AI의 자의적 요약 및 환각(Hallucination)**: "원문 그대로 전사하라"고 프롬프트를 주어도, LLM 특유의 습성 때문에 **사료(史料) 원문이나 세부 도표를 마음대로 요약하거나 일부를 누락**합니다.<br>2. **비용 및 지연(Rate Limit)**: 300~500페이지 분량의 이미지를 클라우드로 전송하면 수만 원 이상의 토큰 비용과 수십 분의 지연이 발생합니다. |
| **✨ Smart Textbook Pipeline (본 프로젝트)** | **macOS Native Apple Vision (Neural Engine) + 동적 책등 분할 알고리즘**을 결합하여, **비용 0원 / 오프라인 구동 / 스프레드당 0.15초 초고속 판독**으로 100% 날것의 정확한 텍스트 뼈대를 추출하고 완전한 인터랙티브 뷰어로 패키징합니다. |

---

## 📐 2. 전체 시스템 아키텍처

```
[ 종이책 1~2초 넘김 영상 / 스캔본 ]
                │
                ▼
  [ 1단계: 프레임 추출 & 이미지 정렬 ]
    - part1_page_001.jpg, part1_page_002.jpg ...
                │
                ▼
  [ 2단계: Apple Vision Native OCR 병렬 가속 (Swift CLI) ]
    - swiftc -O 컴파일된 네이티브 바이너리 활용
    - Multi-threading (ThreadPoolExecutor) -> 170개 스프레드를 1분 이내 캐싱
    - 바운딩 박스 [x, y, w, h] + 텍스트를 JSON으로 구조화
                │
                ▼
  [ 3단계: 동적 책등 분할 (Dynamic Spine Gutter Detection) ]
    - 고정 50% 분할 폐기! 지면 곡률/여백에 따라 x=0.35~0.55 사이 최적 책등 자동 추적
    - 교차선 수(cuts)=0 극소화 & 여백(margin) 극대화 지점으로 좌우 페이지 무결 분리
                │
                ▼
  [ 4단계: 지면 노이즈 필터링 & 행 클러스터링 ]
    - 상단 시대 연표 브레드크럼(하, 상, 주, 진, 한...) & 하단 페이지 번호 자동 박멸
    - Y축 근접도(1.2%) 클러스터링 -> X축 좌->우 정렬로 완벽한 읽기 순서 구성
    - [사료탐구], 대/소제목, 불릿 리스트 시맨틱 HTML 자동 구조화
                │
                ▼
  [ 5단계: 마스터 뷰어 템플릿 결합 (Master Blueprint) ]
    - 의존성 없는 독립 HTML5 파일 (동양사_스마트_교재뷰어.html)
    - 상단: 고화질 양면 스캔 (휠 줌, 드래그 이동, 전체화면)
    - 하단: 좌우 독립 텍스트 패널 (클립보드 복사, 반응형)
    - 좌측: 타임스탬프 동기화 목차 사이드바 & 실시간 검색
```

---

## 💡 3. 핵심 엔지니어링 노하우 6선 (The Hard-Won Know-Hows)

### 노하우 1. 고정 50% 분할의 치명적 함정과 '동적 책등 탐지'
* **문제점**: 책을 손으로 잡고 넘기며 촬영하면 카메라 앵글, 손가락 위치, 책의 두께와 곡률 때문에 책의 중앙 책등(Spine) 위치가 `x = 0.35 ~ 0.55` 사이로 끊임없이 이동합니다. 단순하게 중앙(`x = 0.5`)을 기준으로 자르면, **164–165쪽처럼 오른쪽 면 165쪽의 왼쪽 본문 전체가 왼쪽 164쪽 본문 안으로 통째로 빨려 들어가는 대참사**가 일어납니다.
* **해결 알고리즘 (`src/spine_splitter.py`)**:
  1. 본문 영역(`0.08 <= y <= 0.85`)의 텍스트 상자들을 수집합니다.
  2. `x = 0.32 ~ 0.58` 구간을 0.005 단위로 스캔하며, 선을 그었을 때 글자 상자를 자르는 횟수(`cuts`)를 계산합니다.
  3. `cuts == 0`이면서 좌우 텍스트 박스와의 여백(Gutter Margin)이 최대가 되는 최적의 x 좌표를 동적으로 찾아냅니다.
  4. 텍스트 박스의 중심점 `(x + w/2)`를 기준으로 좌/우 페이지를 분류하여, 경계면에 걸친 글자도 100% 온전히 자기 페이지로 배정됩니다.

### 노하우 2. 상단 타임라인 브레드크럼 & 하단 헤더 노이즈 제거
* **문제점**: 수험서 상단에는 거의 항상 "하 - 상 - 주 - 춘추전국 - 진 - 한 - 위진남북조 - 수&당 - 송 - 요 - 금 - 원 - 명&청 - 중화민국 - 중화인민공화국"과 같은 긴 왕조 연표 띠가 인쇄되어 있습니다. OCR이 이를 매 페이지 본문 첫머리에 글자 조각으로 인식하여 심각한 잡음이 됩니다.
* **해결책 (`src/formatter.py`)**:
  - `y > 0.88` 상단 영역에서 연표 키워드 및 단문 조각을 감별하여 본문 진입 전 사전 소거합니다.
  - `y < 0.05` 하단 영역의 챕터 표시 및 페이지 번호를 필터링하여 순수 학습 본문만 남깁니다.

### 노하우 3. Y축 Proximity Clustering & X축 좌우 결합
* **문제점**: OCR 엔진은 한 줄의 문장도 여러 개의 단어/구 단위 바운딩 박스로 쪼개서 반환합니다. 이를 단순 정렬하면 같은 줄의 단어들이 위아래로 뒤섞입니다.
* **해결책**:
  - 세로 높이 오차 `abs(y1 - y2) < 0.012` (지면 높이의 약 1.2%) 이내에 있는 조각들을 동일한 시각적 행(Line)으로 묶습니다.
  - 묶인 행 안에서 `x` 좌표 오름차순(좌측 → 우측)으로 정렬한 뒤 공백으로 연결하여 완벽한 원문 문장을 복원합니다.

### 노하우 4. AI 환각(Hallucination) vs 날것 OCR 오타의 딜레마 극복
* **경험적 교훈**:
  - 처음부터 LLM에 이미지를 맡기면: **임의 요약, 문장 축약, 도표 누락, 사료 누락 발생** (공부할 수 없는 텍스트가 됨).
  - Native OCR만 쓰면: **음성학적 오타 발생** (`통판` → `동원`, `살색` → `순장`, `5숫자` → `순자`).
* **정석 워크플로우 (Golden Standard)**:
  1. **골격과 좌표는 100% Native Apple Vision OCR**로 먼저 잡습니다 (누락/환각 원천 차단).
  2. 동적 책등 분할과 행 결합으로 지면 원형을 1:1로 맞춥니다.
  3. 사료명, 고유명사, 한자(漢字) 등 OCR 오인식 단어만 원전(사기, 한서, 십팔사략 등) 및 스캔 이미지를 대조하여 **정밀 교정(Precision Post-Correction)**합니다.

### 노하우 5. 마스터 교본(Master Blueprint) HTML 뷰어 설계
* **Zero Dependency**: 외부 서버, 리액트 빌드, CDN 의존성이 전혀 없습니다. 파일 하나를 더블클릭하면 오프라인 비행기 안에서도 즉시 작동합니다.
* **Pan & Zoom 모달 엔진**:
  - 고화질 스캔본 클릭 시 전체화면 확대.
  - 마우스 휠 부드러운 줌(0.5배 ~ 5배), 클릭 & 드래그 자유 패닝, 키보드 방향키(← / →) 이전/다음 쪽 탐색.
* **동기화 듀얼 컬럼**:
  - 펼친 책의 왼쪽 면과 오른쪽 면이 화면에 나란히 배치되며, 각 면 텍스트를 원클릭으로 복사할 수 있는 전용 버튼 내장.

---

## 🚀 4. 빠른 시작 가이드 (Quick Start)

### 1) 필수 요구사항
* macOS (Apple Silicon M1/M2/M3/M4 권장)
* Python 3.9+
* Xcode Command Line Tools (`swiftc` 컴파일러 필요: 터미널에서 `xcode-select --install`)

### 2) 설치 및 실행
```bash
# 리포지토리 클론
git clone https://github.com/minwoo19930301/smart-textbook-pipeline.git
cd smart-textbook-pipeline

# 파이프라인 원클릭 실행
# --images: 책 스캔본/캡처 이미지가 모인 폴더
# --output: 최종 생성될 독립 HTML 파일명
python3 run_pipeline.py \
  --images /path/to/scanned_images \
  --output my_smart_textbook.html \
  --title "동양사 스마트 교재"
```

실행이 끝나면 생성된 `my_smart_textbook.html` 파일을 브라우저로 열기만 하면 됩니다:
```bash
open my_smart_textbook.html
```

---

## 📂 5. 파일 구조 (Repository Layout)

```
smart-textbook-pipeline/
├── README.md                      # 엔지니어링 노하우 & 가이드 (본 문서)
├── LICENSE                        # MIT License
├── run_pipeline.py                # 엔드투엔드 원클릭 CLI 실행기
├── src/
│   ├── ocr_tool.swift             # Apple Vision API 네이티브 고속 Swift CLI 소스
│   ├── batch_ocr.py               # 멀티스레드 병렬 OCR 캐싱 엔진
│   ├── spine_splitter.py          # 동적 책등 분할 & 좌우 분리 알고리즘
│   ├── formatter.py               # 행 클러스터링, 노이즈 필터링, HTML 태그 렌더러
│   └── builder.py                 # HTML 뷰어 조립 및 최종 빌더
└── template/
    └── smart_viewer_template.html # 스마트 교재 뷰어 마스터 HTML/CSS/JS 교본 템플릿
```

---

## 📜 6. 라이선스

본 프로젝트는 **MIT License**를 따릅니다. 누구나 자유롭게 가져가서 자신의 강의 교재, 공무원/임용 수험서, 논문집, 전공 서적 디지털화에 응용할 수 있습니다.
