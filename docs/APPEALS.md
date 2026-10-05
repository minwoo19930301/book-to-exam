# 이의제기 접수 운영

사이트 우측 상단 **이의제기**는 현재 화면 위에 팝업으로 열린다. 내용 한 칸(1~3000자)만 적고 전송하면 된다. 과목·유형 선택, 제안 정답 입력, 첨부 체크박스는 없다. 현재 문항·답안·채점 결과와 화면 주소를 자동 첨부하고, 이를 전송 버튼 위에 알린다. 팝업을 열 때의 화면 값을 고정하므로 다른 탭의 최근 답안이 대신 붙지 않는다. 문제은행의 문항별 버튼은 선택 문항만 첨부하며 과거 풀이를 임의로 불러오지 않는다.

뷰어에서는 보고 있는 쪽 ID도 자동 첨부한다. 화면 주소는 사이트 내부 경로와 `subject`, `page`, `q`, `view`, `facultyId`, `topic`, `mode`만 허용하며 다른 쿼리 값은 전송하지 않는다. 종합 화면의 일반 의견은 `subject:all`로 접수한다. 서버가 현재 문제은행의 정답·발문을 함께 보관하므로 고객 화면과 비교할 수 있다. 다른 풀이 히스토리, API 키, 이름, 연락처 입력란은 없다.

접수는 Cloudflare D1 `bookvideotoexam-appeals`의 `appeals` 테이블에 별도로 보관한다. 풀이 히스토리의 30일 브라우저 보존 정책과 별개이며, 고객의 브라우저 기록 삭제로 접수가 삭제되지 않는다. 접수 번호는 중복 제출 방지와 운영자 확인용이며 공개 조회 권한이 아니다. 고객에게는 접수 완료만 표시하고 처리 완료나 정답 변경을 약속하지 않는다.

## 운영자 확인

기존 Cloudflare 계정으로 로그인한 [D1 데이터베이스 화면](https://dash.cloudflare.com/f38417f3a58717523ae5c8a1744dd125/workers/d1/databases/ab4a8c5c-6434-4596-9b7f-65533149a419)에서 `appeals` 테이블을 확인한다. 웹사이트에 공개 목록 API나 관리자 비밀번호를 만들지 않는다. 또는 동일한 Wrangler 로그인으로 실행한다.

```sh
npm run appeals:list
npm run appeals:list -- all
npm run appeals:list -- open 100
node tools/appeals.mjs resolve <접수번호> resolved '확인 내용과 수정 내역'
```

상태는 `open`(검토 전), `resolved`(수정·확인 완료), `dismissed`(근거를 확인하여 반영하지 않음)이며 운영자 메모를 남긴다. 이 명령은 고객 제출 내용을 터미널에 표시하므로 공개 로그나 저장소에 출력물을 올리지 않는다. `context.observed`와 `submittedAnswer`, `result`는 고객 브라우저가 보낸 자료이므로 사실을 검증한 기록으로 취급하지 않는다. `context.question`은 제출 당시 서버 문제은행의 내용이며 `context.source`는 해당 화면의 경로다. 신규 단일 입력 접수의 분류는 `other`, 제안 정답은 빈 값이고 기존 상세 양식의 접수·API 요청도 호환한다.

## 배포 및 검증

`wrangler.jsonc`의 `APPEALS_DB` 바인딩과 `migrations/0001_appeals.sql`을 사용한다. 첫 배포 전 `npx wrangler d1 migrations apply bookvideotoexam-appeals --remote`를 실행한다. 이미 적용된 마이그레이션은 재적용하지 않는다. 로컬 검증에는 `--local`과 `wrangler pages dev dist`를 사용한다. 일반 Vite 개발 서버에는 D1이 없어 접수 요청에 503을 반환하며, 성공했다고 표시하지 않는다.

POST만 허용하고 출처·본문 크기·필드를 검사한다. 시간별 익명 접속 해시의 접수를 20건으로 제한하고 SQL 트랜잭션에서 제한 확인과 저장을 함께 처리한다. 원본 IP는 보관하지 않으며 제한용 해시는 만료 뒤 다음 요청에서 삭제한다. 바인딩 장애/저장 실패는 작성 내용을 유지하면서 사용자에게 표시한다.
