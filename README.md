# Blue Archive Voice Downloader

한국어/영어 학생 이름으로 검색해서 `bluearchive.wiki` 음성 파일을 다운로드하는 데스크톱 앱입니다.

[English README](README.en.md)

## 사용자용 안내

릴리스 페이지에서 운영체제에 맞는 설치 파일을 받아 실행하세요.

- macOS: `.dmg`
- Windows: `.exe`
- Linux: `.AppImage`

## 설치 방법

### macOS (`.dmg`)

1. 릴리스에서 `.dmg` 파일 다운로드
2. 파일을 열고 앱을 `Applications` 폴더로 드래그
3. 앱 실행

### Windows (`.exe`)

1. 릴리스에서 `Setup` 또는 `.exe` 파일 다운로드
2. 설치 파일 실행 후 안내에 따라 설치
3. 시작 메뉴에서 앱 실행

### Linux (`.AppImage`)

1. 릴리스에서 `.AppImage` 파일 다운로드
2. 실행 권한 부여:
   `chmod +x BlueArchiveVoiceDownloader-*.AppImage`
3. 실행:
   `./BlueArchiveVoiceDownloader-*.AppImage`

앱 실행 후 사용 순서:

1. 학생 이름(한국어/영어) 검색
2. 검색 결과에서 학생 선택
3. `음성 파일 조회` 클릭
4. 원하는 파일 선택 후 다운로드

## DMG 빌드(앱 버전 테스트용)

macOS에서 직접 테스트 빌드를 만들려면:

```bash
npm install
npm run build:mac
```

빌드 결과물은 `dist/` 폴더에 생성됩니다.

## 라이선스

이 프로젝트 소스코드는 MIT 라이선스를 따릅니다.

- `LICENSE`
- `OPEN_SOURCE.md`

## 저작권 및 비영리 고지

- Blue Archive 관련 원저작권 및 IP는 Nexon Games와 Yostar에 있습니다.
- 이 프로젝트는 비영리/비수익 목적의 팬 유틸리티입니다.
- 음성 및 관련 에셋의 사용은 각 권리자의 정책을 따르세요.

## 이슈 제보

- 버그/개선 제안은 GitHub Issues 템플릿을 사용해 제보해주세요.
