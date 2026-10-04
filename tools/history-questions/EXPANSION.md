# 과목별 추가 300문항 입력

`tools/history-questions/extended-inputs/<subject>.json`에 직접 작성한다.
과목 ID는 `seoyangsa`, `hanguksa`, `dongyangsa`, `gyoyukron`이다.

```json
{
  "schemaVersion": 1,
  "subject": "dongyangsa",
  "questions": []
}
```

문항 수는 **과목당 추가 300개**다. 권장 분포는 객관식 120, 단답 100,
원문 빈칸 50, 서술형 30이며, 네 유형을 모두 포함하면 분포는 조정할 수 있다.
기존 111문항은 유지된다. 사실·비교·인과·자료 분석을 서로 다른 질문으로
작성한다. 같은 설명에 유형만 바꾸어 세 번 묻는 방식으로 수를 채우지 않는다.
정확 인용은 역사적 정답 여부를 보장하지 않으므로 정답과 오답을 따로 검토한다.
원문 `source.knownIssues`의 오류 구절은 출제 근거로 쓰지 않는다.

## 공통 필드

| 필드 | 형식 |
| --- | --- |
| `id` | `<subject>-ext-<영문소문자·숫자·하이픈 고유 slug>` |
| `type` | `mc`, `short`, `blank`, `essay` |
| `skill` | `fact`, `comparison`, `causation`, `source-analysis` |
| `prompt` | 완성된 질문. 필요한 비교 대상·자료·답안 조건을 모두 포함한다. 빈칸형만 생략 가능 |
| `answer` | 객관식은 정답 인덱스 0–3, 나머지는 정답 문자열. 서술형은 모범답안 |
| `explain` | 정답의 이유를 설명하는 짧은 해설 |
| `evidence` | `[{"page":"<실제 notes.json id>","quote":"원문에서 그대로 복사한 구절"}]` |

`evidence`는 하나 이상이다. 첫 원문이 화면의 근거 링크가 된다. 질문에 필요한
모든 사실을 뒷받침하도록 여러 구절과 여러 쪽을 인용할 수 있다. 해당 과목의
`public/data/subjects/<subject>/notes.json`만 인용한다. 공백·개행·기호까지
그대로 유지한다. 정답이 원문에서 문자 그대로 나오지 않아도 되지만, 그 답을
도출하는 근거는 실제 원문에 있어야 한다.

## 유형별 추가 필드

- **mc**: `choices`는 서로 다른 선지 네 개, `answer`는 정답 하나의 인덱스.
  `choiceExplanations`에 같은 순서로 네 선지가 맞거나 틀린 이유를 작성한다.
  이름·순서만 바꾼 중복 선지와 복수정답 문항을 쓰지 않는다.
- **short**: `answer`는 한 용어 또는 명확한 짧은 답.
  `acceptedAnswers`는 허용할 다른 표기 배열이며 생략할 수 있다. 의미가 같은
  정답의 표기는 직접 명시한다. 임의의 부분 문자열은 정답으로 인정되지 않는다.
- **blank**: `passage`는 첫 원문에서 그대로 복사한 구절이며, `answer`가 정확히
  한 번 나와야 한다. `evidence`에도 전체 passage를 포함한다. `prompt`를 쓰면
  passage의 answer를 `_____`로 바꾼 문자열과 같아야 한다. 생략하면 도구가 만든다.
  기존 뷰어와의 호환을 위해 `**` 강조 표시가 없는 구절을 선택한다.
- **essay**: `title`, `answer`(모범답안), `rubric` 배열이 필수다. 기준 개수는
  자유지만 배점 합계는 10점이다. 각 기준에 `id`(예 `r1`), `label`, `max`,
  `ok`(만점의 핵심 의미·조건), `evidence`를 쓴다. 첫 원문이 최소 한 기준을
  뒷받침해야 한다. `scoring`을 생략하면 기본 의미 중심 채점 원칙을 넣는다.

서술형 기준의 선택 필드:

- `allowedScores`: 허용 점수 배열. 예 `[0, 1, 2]`, `[0, 3]`. 0과 `max`를 포함.
- `checkpoints`, `acceptedConcepts`, `rejectConditions`: 비어 있지 않은 문자열 배열.
- `requiredRelation`: 인과·비교 등 답안에 필요한 관계를 적은 문자열.
- `scoreLevels`: `[{"score": 0, "condition": "..."}, ...]`. allowedScores의 각 점수에 대응하는 조건을 빠짐없이 적는다.

선택 필드는 서버 채점 기준에 그대로 보존한다. 모순은 관련 기준에서 판단하도록
구체적인 `rejectConditions`를 쓰고, 같은 의미의 표현을 `acceptedConcepts`에 쓴다.
모범답안·해설·루브릭의 정식 원본은 서버 파일에 둔다. 공개 서술형 정적 JSON은
기존 계약대로 `id`, `title`, `prompt`, `page` 네 필드만 제공한다. 별도 공개 연습용
`/api/practice-bank`는 사용자의 답안 열람 요청에 따라 서버의 모범답안·기준을
읽기 전용으로 제공하며 `/questions`에서 펼쳐 볼 수 있다.

## 검증과 가져오기

작성 중인 파일은 아래처럼 검증한다. `--allow-partial`은 파일을 쓰지 않는다.

```sh
python3 tools/history-questions/expansion.py --subject dongyangsa --validate-only --allow-partial
```

300개를 완성한 뒤 검증하고 가져온다. `--subject`를 생략하면 네 과목 모두 처리한다.

```sh
python3 tools/history-questions/expansion.py --validate-only
python3 tools/history-questions/expansion.py
python3 tools/history-questions/expansion.py --check
python3 -m unittest discover -s tools/history-questions -p 'test_*.py'
```

`generate.py`도 입력 파일이 있는 과목은 추가 문항을 함께 생성하므로 기존
`generate.py --check`를 계속 사용할 수 있다. 입력이 없는 과목은 초기 은행만
생성한다. 작성 중인 파일이 존재하면 정식 생성은 300개를 요구하므로, 작성 중에는
위의 부분 검증 명령을 사용한다. 가져오기 후 `expansion.py`를 실행하면 과목
목록의 문항 수도 함께 갱신된다.

도구는 총수·ID·동일 질문·선지 중복·정답 인덱스·과목·정확 인용·빈칸 복원·
루브릭 배점·공개/서버 필드를 검증한다. 질문의 공백·문장부호만 바꾼 중복도
거부한다. 동일한 근거 구절과 정답을 세 가지 유형에 재사용한 묶음도 거부한다.
역사적 복수정답 여부, 의미상 같은 질문, 인용이 실제 추론을 충분히 뒷받침하는지는
집필자가 검토해야 한다. 결과에 유형별·사고 기능별·근거 쪽별 수가 출력된다.

`<subject>-ext-` ID 공간은 이 도구 전용이다. 다시 실행하면 이 공간의 문항을
현재 입력으로 교체하므로 중복 추가되지 않는다. 그 외 기존 문항과 손글씨 은행은
그대로 보존한다. 네 과목을 실행할 때는 모든 입력 검증이 끝난 후에만 쓴다.
현재 UI에 맞춰 단답은 `questions.json`의 `type: "blank"`와 `match: "aliases"`,
원문 빈칸은 `blanks.json`의 `before/after`, 서술형은 공개·서버 파일로 변환한다.
