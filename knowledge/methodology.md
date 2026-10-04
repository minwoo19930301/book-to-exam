# 출처 데이터와 압축 KB

`smart-textbooks`의 고정 커밋에서 HTML 전사를 가져온다. 4과목 원문 1,092카드와 평가원 310면은 근거 데이터이며, 지식 문서는 `compact/`에 선별한 짧은 Markdown만 둔다. 원문 복사본을 페이지마다 Markdown으로 만들지 않는다.

## 출처

`source-manifest.json`에 저장소·커밋·HTML SHA256·카드 수를 남긴다. 각 노트의 source는 원래 HTML 앵커·쪽 배지·이미지 경로·전사 해시를 보존한다. 파일 번호·영상 초·인쇄 쪽은 서로 다르다. `printedPages`도 원래 배지를 가져온 값이며 그림 대조로 따로 확인한 경우만 예외 검수 근거를 남긴다.

전사에는 오류가 남아 있다. 모든 원문은 `scanVerified: false`, `automaticExamEligible: false`이며, 짧은 글·OCR 표식 등의 자동 경고도 정확도 점수가 아니다. 알려진 루스벨트 당선 연도 혼선 등은 원문을 보존하고 출제 근거에서 제외한다. 압축 문서의 출제 보류 사유도 함께 읽는다.

## 그림

`tools/history-figures/manifest-*.json`에 직접 확인한 그림 영역을 원본 픽셀 좌표로 기록한다. 전체 펼침이 아니라 사진·지도·도표만 분리하며 원본 해시·크기를 검사한다. 같은 인쇄 쪽의 더 선명한 프레임을 쓸 때는 원본 대응·대체 이유·실제 인쇄 쪽을 명시한다.

평가원 HTML이 참조하는 기존 PNG도 육안 검수한다. 글자·검은 마스크·잘린 조각을 그림으로 표시하지 않는다. 가능한 조각은 원래 면 JPG에서 온전한 그림 영역을 다시 분리한다. 원본을 생성형 이미지로 대체하지 않는다. `figure-audit.json`, `kice-figure-audit.json`에 범위·제외·미해결 이유를 남긴다. 그림 검수가 전체 본문 검증을 뜻하지 않는다.

## 평가원

53개 문서 색인과 310개 면 단위 전사가 있다. 참조 PDF 파일은 저장소에 없으므로 다운로드 링크를 만들지 않는다. 원본 면 JPG와 HTML 출처를 사용한다. 다단 편집·면 연결 문제 때문에 `questionNumbers: []`, `questionNumbersStatus: not-segmented`를 유지한다. 자동 검색의 어휘 겹침을 확정된 문항 연관·정답·출제 빈도로 사용하지 않는다.

## 실행

```sh
python3 tools/history-kb/build.py --source /path/to/smart-textbooks
python3 tools/history-questions/generate.py
python3 tools/history-kb/compact.py
python3 tools/history-kb/validate.py --source /path/to/smart-textbooks
python3 tools/history-kb/search.py '관수관급' --subject hanguksa
```

원문 가져오기는 기존 문제 은행을 덮어쓰지 않는다. 압축 문서는 사람이 근거를 읽고 선별하며 원문 가져오기로 자동 덮어쓰지 않는다. 그림 수집·내보내기는 [별도 절차](../tools/history-figures/README.md)를 따른다. 원본 저장소가 비공개이므로 이 로컬 작업을 공개 push·배포 승인으로 간주하지 않는다.
