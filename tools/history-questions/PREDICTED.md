# 임용 형식 예상 문항

`tools/history-questions/predicted-inputs/<subject>/<part>.json`에 작성한다.
과목 ID는 `seoyangsa`, `hanguksa`, `dongyangsa`, `gyoyukron`이다.
`expansion.py`의 추가 300문항(`<subject>-ext-`)과 별개로, 실제 1차 전공 시험과 같은
**단답형**과 **4점 서술형**만 다룬다. 평가원 공식 문항·학원 예상문제가 아니라 교재 근거로
직접 만든 연습 문항이다.

```json
{
  "schemaVersion": 1,
  "subject": "hanguksa",
  "questions": []
}
```

## 시험 형식

평가원 1차 전공은 전공A 단답형 4문항(8점)·서술형 8문항(32점), 전공B 단답형 2문항(4점)·서술형
9문항(36점)이다. 단답형은 2점, 서술형은 4점이다. 교과교육학(역사교육론) 25~35%, 교과내용학
65~75%다. [평가원 중등교사 임용시험 안내](https://kice.re.kr/sub/info.do?m=010602&s=kice)

문제지 표지 응시자 유의사항 9: 요구한 가짓수가 정해진 문항은 **첫 번째로 작성한 내용부터 요구한
가짓수까지만 순서대로 채점**한다. [2026학년도 문제지 표지 예시](https://www.dge.go.kr/upload/main/na/bbs_3913/ntt_2163672/doc_c9d7v732a=acv57=47vf4=bbvab=c18fv2b21vfb87_v6793.pdf)

평가원은 모범답안·채점기준을 공개하지 않는다. 아래 루브릭은 공개된 학원 해설의 표 형식을 참고한
자체 연습용이다. 실제 채점 결과를 예측하지 않는다.

## 공통 필드

| 필드 | 형식 |
| --- | --- |
| `id` | `<subject>-pred-<영문소문자·숫자·하이픈 slug>` |
| `type` | `short`(단답형) 또는 `essay`(서술형) |
| `skill` | `fact`, `comparison`, `causation`, `source-analysis` |
| `topic` | 단원·주제 이름 |
| `basis` | 출제를 예상한 근거. 교재의 `기출 YYYY` 표시, [기출 경향] 표, 출제경향 분석 문장 등 |
| `prompt` | 자료와 요구를 모두 담은 완성 문항. `[예상]` 표시는 도구가 붙인다 |
| `answer` | 단답형은 정답 용어, 서술형은 예시 답안 |
| `explain` | 정답 근거를 밝힌 짧은 해설 |
| `evidence` | `[{"page":"<notes.json id>","quote":"원문 그대로의 구절"}]`. 첫 항목이 화면의 근거 쪽 |

인용은 해당 과목의 `public/data/subjects/<subject>/notes.json` `text`에서 공백·기호까지 그대로
복사한다. 6자 이상이어야 한다. `source.knownIssues`가 지적한 오류 구절은 쓰지 않는다.

## 단답형

- 정답이 하나로 정해지는 용어·인물·제도·사건을 묻는다. `answer`는 40자 이내다.
- 원어·한자·약칭·다른 표기를 인정하려면 `acceptedAnswers`에 적는다. 상위 개념이나 관련
  사건은 넣지 않는다.
- 문항에 정답이나 인정 답안이 그대로 나오면 도구가 거부한다.
- 실제 단답형의 ㉠·㉡ 2칸은 칸마다 따로 채점되므로, 칸마다 한 문항으로 나눈다. 같은 자료를
  쓰면 id를 `-a`, `-b`로 끝낸다.

## 서술형

- `title`, `prompt`, `answer`(예시 답안), `rubric`이 필요하다. `prompt`에 〈작성 방법〉을 넣고
  요구 조건을 `•`로 나열한다. 예: `• 괄호 안의 ㉠에 해당하는 제도의 명칭을 쓸 것.`
  `• 밑줄 친 ㉡이 나타난 배경을 자료에 근거하여 서술할 것.`
- 루브릭 합계는 4점이다. 기준은 2~5개, 기준 하나는 2점 이하다. 요구 조건 하나에 기준
  하나를 대응시킨다. 명칭과 설명은 다른 기준으로 나눈다.
- 각 기준에 `id`(`r1`…), `label`, `max`, `ok`, `evidence`를 쓴다. 선택 필드:
  - `allowedScores`: 허용 점수. 생략하면 정수 단계(1점이면 `[0, 1]`)다. 0.5 단위는 직접 적는다.
  - `acceptedConcepts`: 같은 의미로 인정할 표현.
  - `rejectConditions`: 점수를 주지 않을 오답·혼동(예: 순서가 바뀐 경우, 다른 제도와 혼동).
  - `checkpoints`: 부분점수를 판단할 관찰 요소.
  - `requiredRelation`: 이유·비교·인과처럼 답안에 드러나야 할 관계.
- 가짓수를 정한 조건(예: `2가지 쓸 것`)은 `checkpoints`에 "앞에서부터 2가지만 채점"을 적는다.

## 출제 근거 고르기

1. 교재 본문에서 출제 가능성이 높은 주제를 고른다. `기출 YYYY-…` 표시가 있는 주제는 같은
   사실을 다른 각도로 묻고, 출제경향 분석에 "아직 출제되지 않았다"고 한 핵심 주제를 우선한다.
2. 자료는 교재의 사료를 짧게 인용하거나 직접 요약해 만든다. 평가원 기출 문장이나 학원 예상문제를
   옮기지 않는다.
3. 근거 인용이 정답·채점 요소를 실제로 뒷받침해야 한다. 인용이 있다는 사실만으로 역사적
   정확성이 보장되지는 않으므로, 확신할 수 없는 문항은 만들지 않는다.

## 검증과 반영

```sh
python3 tools/history-questions/predicted.py --subject hanguksa --validate-only --file tools/history-questions/predicted-inputs/hanguksa/p1.json
python3 tools/history-questions/predicted.py --validate-only
python3 tools/history-questions/predicted.py
python3 tools/history-questions/predicted.py --check
```

도구는 ID 공간·유형·정확 인용·오류 구절·정답 노출·중복 문항·루브릭 4점·공개/서버 필드를
검증한다. 다시 실행하면 `<subject>-pred-` 문항만 교체한다. 은행 순서는 기본 문항, 예상 문항,
`-ext-` 문항이다. 서술형의 예시 답안·루브릭은 서버 파일에만 들어간다.
# 현재 상태: 공개 은행에 미반영한 초안

2026-10-04 기준 `predicted-inputs/hanguksa/p1~p4.json`의 64개는 별도 작업 초안으로 보존한다. 현재 `generate.py`와 공개 문제은행에는 연결하지 않았으며 사이트의 1,477개 집계에도 포함하지 않는다. 아래 재생성 관련 설명은 향후 통합을 위한 설계다. 교재의 기출표에 없다는 사실만으로 실제 미출제라고 판단한 `basis` 등은 추가 검수가 필요하다. `--validate-only` 통과는 인용·형식 검사이며 출제 이력·정답 내용의 검증 완료가 아니다.
