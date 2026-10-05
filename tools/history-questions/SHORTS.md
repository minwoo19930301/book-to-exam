# 과목별 새 단답형 150개

기존 300개 확장 입력과 분리한 수작업 집필 입력이다. 단답형만 추가하며 객관식·서술형·원문 빈칸·손글씨 은행은 증분 importer의 쓰기 대상이 아니다. 기출 원문을 복제한 공식 문항이나 적중률을 주장하는 자료가 아니다.

## 파일과 재생성

- `short-seeds/<subject>.json`: 사람이 작성한 발문·정답·해설과 원문 선택 위치.
- `author_short150.py`: 선택한 원문을 정확히 인용하여 `short-inputs/<subject>.json`을 재현한다. 질문을 자동 창작하지 않는다.
- `short-inputs/<subject>.json`: `schemaVersion: 1`, 과목 ID와 150개의 `questions` 배열.
- `shorts.py`: 입력을 검증하고 `subject-short150-*` 네임스페이스만 교체한다.
- `generate.py`: 기존 기초 은행 → 300개 확장 → 새 단답형 순서로 생성한다. 선택 입력이 없는 시험 fixture는 종전 동작을 유지한다.

```sh
python3 tools/history-questions/author_short150.py --subject hanguksa
python3 tools/history-questions/shorts.py --subject hanguksa --validate-only
python3 -m unittest discover -s tools/history-questions -p 'test_*.py'
```

작성 중에는 `--validate-only --allow-partial`로 1~150개를 검사할 수 있다. 부분 입력은 은행에 쓸 수 없다. 모든 과목의 집필·편집 검토가 끝난 뒤에만 다음 명령으로 일괄 반영한다.

```sh
python3 tools/history-questions/shorts.py --validate-only
python3 tools/history-questions/shorts.py
python3 tools/history-questions/shorts.py --check
python3 tools/history-questions/generate.py --check
```

`shorts.py`가 쓰는 파일은 선택 과목의 `questions.json`과 `subjects.json`의 질문 개수뿐이다. 재실행하면 이전 증분 문항을 교체하므로 중복 추가되지 않는다. 기존 확장 importer를 재실행해도 새 단답형 값과 마지막 배치 순서는 보존된다.

## 집필 입력

질문에는 `id`, `type: short`, `skill`, `era`, `topic`, `prompt`, `answer`, `explain`, `evidence`가 필요하다. `acceptedAnswers`에는 의미가 동등한 정답만 명시한다. 지시어·문장부호·공백을 바꾸어 기존 발문을 되풀이하거나 기존 선택지의 정답을 그대로 단답형으로 옮기는 방식으로 수를 채우지 않는다.

Seed의 `sources` 항목은 교재 페이지 번호와 `start`·`lines`를 지정한다. `start`는 해당 원문에서 정확히 한 줄에만 일치해야 한다. 인접한 오기·불필요한 내용까지 인용되는 경우 `{page, quote}`로 더 짧은 정확한 부분 인용을 지정할 수 있다. 두 지정 방식은 동시에 사용할 수 없다.

서비스의 단답형 화면은 저장된 `type: blank`를 실행 시 `short`로 전달한다. 따라서 정답 비교는 NFC 정규화와 공백·강조 표시 제거만 적용되는 `exact` 방식이다. 가운데점·하이픈·영문 대소문자는 자동 동의어 처리가 아니므로 허용할 표기를 `acceptedAnswers`에 적는다. 원문 빈칸 채우기의 `blankExact`와 혼동하지 않는다.

## 검토 범위

자동 검사는 정확 인용, 과목·ID 범위, 알려진 원문 오류, 발문 중복, 정답 노출, 별칭 중복, 150개 수량, 같은 정답·근거의 재활용을 확인한다. 이는 역사적 정확성이나 다른 문항과의 의미 중복을 증명하지 않는다. 별도의 편집 검토에서 질문의 모든 단서, 정답의 유일성, 별칭, 시대·분야 편중, 기존 문항과의 차이를 확인해야 한다. 출처의 OCR 또는 전사 상태는 `transcription-unverified`로 보존한다.
