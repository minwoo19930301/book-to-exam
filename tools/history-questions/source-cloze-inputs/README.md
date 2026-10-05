# 사료탐구 지문 빈칸

과목별 `<subject>.json`에 아래 형식으로 직접 검토한 문항을 작성한다. 서양사·한국사·동양사는 각각 최소 80개, 역사교육론은 적합한 사료가 있는 만큼만 최대 40개이다. 개수 때문에 부정확한 OCR이나 단순 설명 문장을 채택하지 않는다.

```json
{
  "schemaVersion": 1,
  "subject": "hanguksa",
  "questions": [{
    "id": "hanguksa-source-cloze-001",
    "page": "hanguksa-textbook-page-10",
    "sectionHeading": "[사료탐구] 원문에 있는 제목",
    "passage": "표제와 해설을 제외한 실제 사료 지문. 원문과 완전히 일치하며 문단과 출처를 보존한다.",
    "answer": "정확한 개념어",
    "acceptedAnswers": ["근거 있는 동의 표기"],
    "era": "고대",
    "explain": "지문의 단서가 해당 개념을 가리키는 이유. 단순히 정답을 되풀이하지 않는다.",
    "reviewed": true
  }]
}
```

`passage`는 notes의 정확한 연속 부분문자열이어야 한다. 가장 가까운 앞 `[사료탐구]` 행을 `sectionHeading`에 그대로 적는다. 사료 본문은 온전히 유지하되 답을 알려 주는 표제·해설은 본문 경계 밖에 둔다. 원문 문장을 재작성하거나 여러 조각을 새 지문처럼 합치지 않는다. 정답은 지문에 정확히 1회 있어야 하며, 가린 뒤 지문에 정답이나 허용별칭이 남으면 안 된다. 한자·영어 괄호가 답을 노출하면 다른 개념을 선택한다. 같은 개념의 같은 문장을 범위만 넓혀 재출제하지 않는다.

`source_cloze.py --subject hanguksa --validate-only --allow-partial`로 작성 중 검증한다. 완성 후 `--allow-partial` 없이 검증한다. `--check`는 출력 일치만 확인하며, 모드 없이 실행하면 해당 과목의 새 ID 영역만 멱등 수입한다. 기존 빈칸과 다른 문제은행은 보존한다.

출력 `contextMode:'source-excerpt'`, `passage`, `before`, `after`는 명시된 지문 범위만 나타낸다. `before + answer + after === passage`이며 UI는 이 범위 밖 문맥을 자동으로 확장하지 않는다. 표제에는 답이 있을 수 있으므로 채점 전에는 `provenance.sectionHeading`을 표시하지 않는다.

## 이번 입력과 검증 범위

서양사·한국사·동양사 각각 80문항, 합계 240문항이다. 교재에 `[사료탐구]`로 표시된 구간을 직접 읽고, 답이 없는 제목·외부 해설을 제외한 연속 지문을 선택했다. 오류가 섞인 상자는 제외하거나, 오류 문장을 포함하지 않는 완결된 문단·조항만 발췌했다. 동일 상자에서 서로 다른 개념을 묻는 경우는 있으나 같은 개념의 같은 문장을 길이만 바꾸어 다시 출제하지 않는다.

역사교육론은 0문항이다. 확인한 두 표식은 가상의 수업 판단 사례와 재구성된 역사교육 논쟁 글로, 이번 역사 사료 빈칸의 수량을 맞추기 위해 채택하지 않았다. 한국사 근대 일부 전사 구간은 OCR 품질이 낮아 제외하여 시대별 문항 수가 균등하지 않다.

검증기는 원문과의 완전 일치, 과목·페이지·사료 표제, 빈칸 재구성, 정답의 단일 출현, 가린 뒤 남는 정답·별칭, 기존 문항과의 중복(허용별칭이 같은 개념인 경우 포함), 알려진 원문 오류 구절 사용 여부를 검사한다. 별도의 독립 검토자가 정답·발문 맥락·동의 표기·해설을 읽는다. `reviewed:true`는 이 편집 검토를 뜻하며, 모든 원본 스캔이나 모든 외부 원전을 교차 검증했다는 뜻은 아니다. 따라서 출력의 `sourceStatus`는 `transcription-unverified`를 유지한다.

```sh
python3 tools/history-questions/source_cloze.py --subject seoyangsa --subject hanguksa --subject dongyangsa --validate-only
python3 -m unittest discover -s tools/history-questions -p 'test_*.py'
```
