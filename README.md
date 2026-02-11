# Blue Archive Voice Downloader

한국어/영어 학생 이름으로 검색해서 `bluearchive.wiki` 음성 파일을 다운로드하는 데스크톱 앱입니다.

[English README](README.en.md)

## 사용자용 안내

릴리스 페이지에서 운영체제에 맞는 설치 파일을 받아 실행하세요.

- macOS: `.dmg`
- Windows: `.exe`
- Linux: `.AppImage`

## 아키텍처 선택 가이드

- `x64`: 일반적인 Intel/AMD 64비트 PC
- `arm64`: ARM 기반 기기 (예: Apple Silicon, Windows on ARM)
- 릴리스 파일명에 `-macOS-x64`, `-Windows-arm64`처럼 OS/아키텍처가 함께 표기됩니다.

## 설치 방법

### macOS (`.dmg`)

1. 릴리스에서 `.dmg` 파일 다운로드
2. 파일을 열고 앱을 `Applications` 폴더로 드래그
3. 앱 실행

### Windows (`.exe`)

1. 릴리스에서 자신의 아키텍처(`x64` 또는 `arm64`)에 맞는 `.exe` 다운로드
2. 파일 실행 (포터블 실행 파일)

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

## 데이터 기준 안내

- 음성 파일은 `bluearchive.wiki`에서 가져옵니다.
- 모든 학생 업데이트 기준 페이지는 `https://bluearchive.wiki/wiki/Characters#` 입니다.

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
