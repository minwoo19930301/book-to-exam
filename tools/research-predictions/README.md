# 연구 예상문항 집필 원본

각 과목 Python 파일은 원논문 검토 기록에 맞춰 문항별로 작성한 24개 과제·답안 요소·선정 이유를 저장한다. `author.py`는 형식·배점·정확 인용·출처 메타데이터를 조립하며 논문 제목으로 내용을 생성하지 않는다. 기존 6개는 보존한다.

재생성: `python3 tools/research-predictions/<subject>.py`

검증·재현성: `python3 tools/research-predictions/validate.py --check-reproducibility`

`subject`는 seoyangsa, hanguksa, dongyangsa, gyoyukron이다. 출처·내용·과목·수량·배점 검사는 역사적 사실의 외부 전수 검증을 대신하지 않는다. 실제 검토 범위와 제한은 `knowledge/prediction-research/expansion-review.md`를 따른다. 수정할 때 JSON만 고치지 말고 저작 파일과 함께 반영한다.

2026-10-13 일반 역사학 전공 보강: `history-expansion-20261013.json`에 교수 12명·논문 12편·개별 집필 36문항을 보존한다. `history_expansion.py`가 기존 저작 스크립트의 저장 단계에서 이 날짜의 문항만 재생성한다. 현재 서양사·한국사·동양사는 각각 42개, 역사교육론은 30개다. 교수당 논문 전수 수집이 아닌 선정 1편의 공개 초록 전체 검토다.
