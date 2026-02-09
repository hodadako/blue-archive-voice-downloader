# Blue Archive Voice Downloader

A desktop app for searching Blue Archive students in Korean/English and downloading voice files from `bluearchive.wiki`.

Korean README: `README.md`

## User Guide

Download the installer for your OS from the Releases page.

- macOS: `.dmg`
- Windows: `.exe`

Typical usage flow:

1. Search a student name (Korean or English)
2. Select a student from the result list
3. Click `Resolve voices`
4. Select files and download

## Search Behavior (Detailed)

- Korean/English autocomplete: results update while you type.
- Korean query ranking: exact and prefix matches are prioritized.
- English query ranking: exact, prefix, and word-boundary matches are prioritized to reduce unrelated results.
- Fuzzy fallback: typo-tolerant fuzzy matching runs only when strict matching finds no result.
- Quick action: the top result is preselected so you can immediately continue to voice resolving.

## Build DMG (for local app version testing)

To build a testable macOS package on macOS:

```bash
npm install
npm run build:mac
```

The build output will be generated in `dist/`.

## License

This project source code is licensed under MIT.

- `LICENSE`
- `OPEN_SOURCE.md`

## Copyright and Non-Commercial Notice

- Blue Archive related IP and assets belong to Nexon Games and Yostar.
- This project is a non-commercial fan utility.
- Use voice/assets according to the rights holders' policies.
