# Blue Archive Voice Downloader

A desktop app for searching Blue Archive students in Korean/English and downloading voice files from `bluearchive.wiki`.

[Korean README](README.md)

## User Guide

Download the installer for your OS from the Releases page.

- macOS: `.dmg`
- Windows: `.exe`
- Linux: `.AppImage`

## Installation

### macOS (`.dmg`)

1. Download the `.dmg` file from Releases
2. Open it and drag the app into `Applications`
3. Launch the app

### Windows (`.exe`)

1. Download the `Setup` or `.exe` installer from Releases
2. Run the installer and follow the setup steps
3. Launch from Start Menu

### Linux (`.AppImage`)

1. Download the `.AppImage` file from Releases
2. Make it executable:
   `chmod +x BlueArchiveVoiceDownloader-*.AppImage`
3. Run it:
   `./BlueArchiveVoiceDownloader-*.AppImage`

Typical usage flow:

1. Search a student name (Korean or English)
2. Select a student from the result list
3. Click `Resolve voices`
4. Select files and download

## Data Source Policy

- Voice files are fetched from `bluearchive.wiki`.
- All student update references are based on `https://bluearchive.wiki/wiki/Characters#`.

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

## Issue Reporting

- Please use the GitHub Issue template for bug reports and feature requests.
