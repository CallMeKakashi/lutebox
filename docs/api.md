# DnD Music Forge — API Reference

Base URL: `http://localhost:3000`

---

## Status & Scan

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Scan progress, labeled/total/dupe counts |
| `POST` | `/api/scan` | Trigger background library rescan |

### GET /api/status
```json
{
  "scanning": false,
  "status": "Scan completed successfully",
  "counts": { "total": 750, "labeled": 190, "dupes": 0 }
}
```

---

## Tracks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tracks` | All tracks with dupe flags and tags |
| `GET` | `/api/tracks/stream?id=` | Stream audio file |
| `GET` | `/api/tracks/art?id=` | Embedded album art (PNG/JPEG) |
| `POST` | `/api/tracks/labels` | Set mood/char/tags for one track |
| `POST` | `/api/tracks/labels/bulk` | Set mood/char/tags for multiple tracks |
| `POST` | `/api/tracks/duration` | Persist duration after playback |
| `DELETE` | `/api/tracks/file` | Delete file from disk and DB |
| `POST` | `/api/tracks/rename` | Rename file on disk and update DB |
| `GET` | `/api/tracks/dupes` | All duplicate groups by MD5 hash |
| `POST` | `/api/tracks/dupes/resolve` | Keep one copy, delete rest, transfer labels |

### Track object shape (from GET /api/tracks)
```json
{
  "id": "music|Combat/boss.mp3",
  "name": "boss.mp3",
  "ext": "mp3",
  "path": "Combat/boss.mp3",
  "folderLabel": "music",
  "size": 8234567,
  "dur": 182.4,
  "dupe": false,
  "mood": "Combat / Battle",
  "char": "Vireth",
  "tags": ["Background Audio"]
}
```
When `dupe` is not `false`, it contains the `id` of the canonical (first) copy.

---

## Moods

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/moods` | List all moods |
| `POST` | `/api/moods` | Create mood `{ name, color }` |
| `DELETE` | `/api/moods/:name` | Delete mood |

---

## Characters

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/characters` | List all characters |
| `POST` | `/api/characters` | Create character `{ name, role }` |
| `DELETE` | `/api/characters/:name` | Delete character |

---

## Tags

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tags` | List all tags |
| `POST` | `/api/tags` | Create tag `{ name }` |
| `DELETE` | `/api/tags/:name` | Delete tag |

---

## Spotify Import

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/download/spotify` | Start spotdl download `{ url }` |

Downloads to `../music/Spotify Downloads/` and auto-rescans on completion.  
**Security note**: See [ADR 004](adr/004-spotify-spotdl-exec.md) — shell injection unfixed.

---

## Organize

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tracks/organize` | Copy labeled files into `Mood\` and `Characters\` subfolders |
