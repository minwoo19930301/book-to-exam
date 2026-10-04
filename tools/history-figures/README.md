# 교재 그림 영역 가져오기

본문에 필요한 지도·사진·도식·표만 원본에서 분리합니다. `manifest-*.json`의 좌표는 원본 사진을 직접 보고 지정한 픽셀 영역입니다. 생성형 보정, 그림 재구성, 페이지 전체 이미지로의 대체는 하지 않습니다.

Python 3.10 이상과 Pillow가 필요합니다. 이 작업은 Pillow 12.3에서 검증했습니다. 저장소 루트에서 실행합니다.

```sh
python3 -m pip install -r tools/history-figures/requirements.txt
python3 tools/history-figures/fetch.py --source /path/to/smart-textbooks
python3 tools/history-figures/build.py
python3 tools/history-figures/import_kice.py --source /path/to/smart-textbooks
python3 tools/history-kb/build.py --source /path/to/smart-textbooks
```

비공개 저장소의 부분 복제 객체를 받아야 하면 `fetch.py`와 `import_kice.py`에 `--github-account chaeeun-kim-teacher`를 추가할 수 있습니다. 로그인은 기존 `gh` 계정을 사용하고 토큰은 하위 프로세스 환경으로만 전달합니다. 토큰을 출력하거나 파일에 저장하지 않습니다.

`fetch.py`는 매니페스트가 고정한 커밋의 실제 `source.imagePath`만 `git show`로 가져옵니다. 검수된 대체 프레임도 이 경로에 포함됩니다. 원래 가려진 프레임의 `originalImagePath`는 검수 이력이며 출력 crop의 픽셀 출처가 아닙니다. `.cache/history-figures`의 기존 파일도 SHA-256·크기를 확인하고, 새 파일은 임시 `.part`에서 검증한 뒤 원자적으로 교체합니다. 경로 이탈과 서로 다른 원본을 같은 캐시 경로에 저장하는 충돌을 거부합니다.

`build.py`는 좌표·출처·검수 상태를 다시 확인해 PNG와 `public/data/figure-assets.json`을 생성합니다. 동일 인쇄쪽의 다른 프레임은 명시적으로 대조한 `alternateFor` 기록이 있을 때만 사용합니다. 원래 배지 오류가 확인돼도 원문 배지를 덮어쓰지 않고 검수 근거를 별도로 보존합니다.

평가원 `import_kice.py`는 **기존 HTML 본문에서 직접 참조한** `inline-fig` 자산 중 `kice-review-*.json`에서 확인한 그림만 재사용합니다. 참조 자산 217개를 검토해 사진·지도·연표 57개를 채택하고, 제목 글자·가림 마스크·깨진 조각은 제외했습니다. 거꾸로 추출된 그림 6개는 픽셀을 180도 회전합니다. 이 자산은 새 crop과 구분하며 제외 근거는 `knowledge/kice-figure-audit.json`에 남깁니다. 평가원 단계와 마지막 KB 단계는 소스 checkout의 HEAD를 사용하므로, 매니페스트의 고정 커밋과 같은 소스로 실행해야 합니다.

그림 표식이 있는 카드와 명시적으로 확인한 추가 카드가 검수 범위입니다. 교재 전체 사진 검수 완료를 뜻하지 않습니다. 가림·불일치·미확인 항목은 `knowledge/figure-audit.json`에 남습니다. 매니페스트·고정 소스·Pillow 환경으로 자산을 다시 생성할 수 있습니다.

이 명령은 로컬 자산을 준비합니다. 비공개 원본을 공개할 권한이나 사이트 배포 승인을 뜻하지 않습니다. `.cache`의 원본 사진은 공개하거나 커밋하지 않습니다.
