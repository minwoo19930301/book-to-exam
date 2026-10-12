# 2026-10-13 단답형 100문항 추가

서양사 60문항(47쪽), 한국사 20문항(10쪽), 동양사 20문항(8쪽)을 새로 집필했다. 기존 문제의 정답·동의어 목록과 비교하여 아직 단답·빈칸 정답으로 다루지 않은 개념을 선택했다. 근거는 해당 교재 페이지의 명확한 문장 또는 명칭과 정의를 잇는 복수 발췌이다. 표지, 중복, 판독 불가 등으로 재검토했던 `capture-targets.json`의 290쪽에는 추가하지 않았다.

- 서양사: 그리스 공동체, 로마 관직, 교리 논쟁, 중세 왕권·교황권, 계몽사상, 시민혁명, 사회주의, 제국주의, 세계대전과 냉전 등.
- 한국사: 고려의 교육·과거와 원 간섭, 조선의 관직·교육·사상, 정조의 개혁, 대원군의 재정 정책 등.
- 동양사: 송의 과거와 신법, 성리학과 사학, 몽골의 통치, 원의 농서와 화폐, 명·청의 교화·군사·변경 정책 등.

## 입력과 재생성

명시적으로 집필한 발문·정답·해설·선택 인용을 `tools/history-questions/author_supplement_20261013.py`에 보관한다. 이 스크립트는 원문과 일치하는 발췌를 조립하여 `page-supplements/<subject>.json`을 만들 뿐, 질문을 자동 추출·증식하지 않는다. 새 ID는 `<subject>-page-practice-review20261013-NNN`으로 고정했다.

`page_practice.prepare_subject`가 별도 supplement를 병합하므로 기존 page-inputs 작성 스크립트와 전체 생성기를 다시 실행해도 추가분이 유지된다. 같은 정확 인용·알려진 원문 오류·정답 노출·중복 발문·동의어 검증을 통과해야 한다. 공개 은행을 갱신하는 명령은 기존과 같다.

```sh
python3 tools/history-questions/author_supplement_20261013.py
python3 tools/history-questions/page_practice.py --validate-only
python3 tools/history-questions/page_practice.py
python3 tools/history-questions/page_practice.py --check
python3 tools/history-questions/generate.py --check
node --test tests/page-supplements.test.js
python3 -m unittest discover -s tools/history-questions -p 'test_page*.py'
```

작성 단계의 메모리 내 컴파일 비교에서 세 과목의 기존 questions 항목 전체가 필드 단위로 동일함을 확인했다. 기존 notes·blanks·essays·capture 입력은 수정하지 않는다. 새 문항은 이미 내용이 있는 쪽에 더하는 것으로, 판독 불가 페이지가 해소되었다고 계산하지 않는다.

## 검토와 교차 확인

AI 저자가 발문과 정답, 원문 문장 및 기존 답안을 비교했다. 추가로 다른 AI 에이전트가 100문항의 발문·정답 유일성·별칭·근거 연결을 검토하였다. 다음을 수정했다.

- 기존 문항과 겹치는 ‘4월 테제’를 ‘영구혁명론’으로 교체했다. ‘문헌공도’도 기존에 있으므로 ‘좌주 문생 관계’로 교체했다.
- 특정 인물을 묻는 ‘펠라기우스’ 문항에서 추종자 일반을 뜻하는 ‘펠라기우스주의자’ 별칭을 제거했다.
- 루소의 인민주권 문항에서 엄밀한 개념 구분을 위해 ‘국민주권’ 별칭을 제거했다.
- 장용영·정동행성 근거는 문항에 불필요하고 전사 오류가 우려되는 창설·존속 연도를 제외하고 기능 및 조직에 한정했다.
- 등록법은 교재에서 명칭만 열거되어 기능을 외부 자료로 보강했다. 저장성 사회과학연합회의 [송대 과거제도 설명](https://www.zjskw.gov.cn/art/2023/6/11/art_1229501970_52717.html)에서 필체 식별을 막기 위한 답안 전사와 별도 교정 절차를 확인했다.
- 농상집요는 왕정농서와의 구분을 분명히 하도록 ‘대사농사에서 편찬’이라는 단서를 추가했다. 한국학중앙연구원의 [원조정본농상집요 해제](https://encykorea.aks.ac.kr/Article/E0080261)에서 1273년 원 대사농사의 편찬을 확인했다. 각 보충 출처는 문항의 `corroboration`에도 보존했다.
- 교재 발췌보다 구체적인 단서를 보강한 세 문항도 기관 자료로 교차 확인했다. [Royal Museums Greenwich 소장품 해설](https://www.rmg.co.uk/collections/objects/rmgc-object-12114)에서 나바리노 해전의 1827년과 오스만·이집트 함대의 패배, [미국 국립문서기록관리청 판결 원문](https://www.archives.gov/milestone-documents/dred-scott-v-sandford)에서 드레드 스콧 판결의 1857년과 시민권 문제, [NOW 공식 연혁](https://now.org/faq/when-and-how-was-now-founded/)에서 1960년대 창립 및 베티 프리던의 참여를 확인했다. 이 세 링크도 문항에 보존했다.

## 검증 범위와 한계

자동 검사로 100문항의 모든 인용이 저장된 교재 전사와 정확히 일치하는지, 모든 정답·동의어가 실제 단답형 채점기로 통과하는지, 빈 답·관련 없는 답·부정문·추가 문자열이 오답 처리되는지 확인한다. 별도 테스트가 공개 은행과 집필 입력의 동일성도 검사한다. supplement가 잘못된 과목·배치 ID·원문에 없는 근거·정답 노출·동등한 별칭 중복을 우회할 수 없는지 fixture로 검사한다.

이번 100문항은 **새로 모든 원본 캡처를 재검수한 문항이 아니다.** 명확한 교재 전사 발췌에 기반하므로 `transcription-unverified` 상태를 유지한다. 위의 외부 보강 다섯 문항도 전체 페이지 검수를 뜻하지 않는다. AI의 의미 검토와 자동 검사는 역사 전문가의 인증이나 실제 시험 출제 가능성·적중률을 입증하지 않는다.
