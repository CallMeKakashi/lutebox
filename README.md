# DnD Music Forge

A local web app for organising, tagging, and playing music for tabletop RPG sessions. Built with Node.js, SQLite, and vanilla JS — no cloud, no accounts, no dependencies beyond `npm install`.

![screenshot](docs/screenshot.png)

## Features

- **Library scanner** — indexes local folders, deduplicates by MD5 hash
- **Mood tagging** — tag tracks with moods (Combat, Stealth, Tavern…) and character OSTs
- **In-browser player** — queue, shuffle, loop, volume with persistent level
- **Audio trim** — drag start/end handles to cut audio via ffmpeg (GPU-accelerated when available)
- **Download queue** — paste a Spotify or YouTube URL, downloads in background with SSE live progress; survives server restarts
- **Organize library** — preview dry-run before copying/moving files into mood-based folders
- **Scan folder management** — add and remove scan roots at runtime

## Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 22.5 | `node:sqlite` built-in |
| ffmpeg | any | Audio trim |
| spotdl | any | Spotify downloads |
| yt-dlp | ≥ 2026.06 | YouTube downloads |

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/dnd-music-forge
cd dnd-music-forge
npm install
node --watch server.js
```

Open **http://localhost:3000** in your browser.

On first run the app creates `music_forge.db` and expects music under `../music/` relative to the project directory. Add extra scan folders from the sidebar at any time.

## Music Roots (default)

| Name | Path |
|------|------|
| music | `../music/` |
| Windows-sync | `../Windows-sync/` |

Change these at runtime via **Scan Folders → Add Folder** in the sidebar.

## Privacy

`music_forge.db` and `dnd_music_labels.json` are excluded from git — they contain your personal library metadata and are never committed.

## License

MIT
