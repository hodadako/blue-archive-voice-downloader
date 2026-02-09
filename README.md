# Blue Archive Voice Downloader

한국어/영어 학생 이름으로 검색해서 `bluearchive.wiki`의 음성(`.ogg`) 파일을 내려받는 Electron 앱입니다.

## 기능

- 한국어/영어 학생 이름 검색
- `src/data/students.json` 학생 목록을 사용해 한국어 -> 영어 이름 매핑
- 위키 페이지 HTML 스크래핑으로 오디오 파일 목록 조회(`api.php` 미사용)
- `src/data/voice-links.json` 링크 DB를 기반으로 음성 목록 조회
- 다운로드 결과를 학생별 `.zip` 파일로 저장

## 빠른 시작

```bash
npm install
npm run students:sync
npm run students:images:sync
npm run voices:sync
npm run start
```

`students:sync`는 기존 `students.json`과 bluearchive.wiki 오디오 페이지를 참조해
학생 영문/한글 이름을 정규화한 뒤 `src/data/students.json` 파일로 저장합니다.
이때 이름/타입 변환 규칙은 `src/data/student-name-formulas.json`,
`src/data/student-type-formulas.json`을 사용합니다.
학생 목록 소스는 `https://bluearchive.wiki/wiki/Characters`입니다.

`students:images:sync`는 `https://bluearchive.wiki/wiki/Characters`의 `tbody`에서
학생별 이미지 링크를 수집해 `src/data/images/students`에 저장하고,
`src/data/students.json`의 `imageUrl`을 로컬 경로로 갱신합니다.

`voices:sync`는 학생별 음성 파일 목록과 static 다운로드 링크를 수집해
`src/data/voice-links.json` 파일로 저장합니다.

## 빌드

```bash
npm run build:mac   # .dmg
npm run build:win   # .exe (nsis)
```

## 배포(운영체제 무관)

GitHub Actions 워크플로우(`.github/workflows/release.yml`)를 포함했습니다.

1. GitHub 저장소에 푸시
2. 태그 생성: `git tag v0.1.0 && git push origin v0.1.0`
3. Actions에서 macOS/Windows 빌드 동시 실행
4. 산출물로 `.dmg`, `.exe` 획득

## 주의사항

- 사이트 구조가 바뀌면 파서가 동작하지 않을 수 있습니다.
- `src/data/students.json`이 비어있으면 앱에서 학생 목록 갱신 시 네트워크 요청이 발생합니다.
- 원본 음성 파일의 저작권/사용 정책을 확인 후 배포하세요.
