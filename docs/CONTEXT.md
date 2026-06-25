# DnD Music Forge — Domain Context

## Purpose
A local music-library categorization tool purpose-built for tabletop RPG game masters. The GM runs this app on a local machine during D&D sessions to quickly find and play the right music for each scene without interrupting gameplay.

## Core Domain Concepts

### Track
An audio file discovered on disk. Identified by `"source|relPath"` (e.g. `"music|Combat/boss.mp3"`). Tracks carry:
- **mood** — the scene category this track fits (one of the predefined moods)
- **char** — an optional character OST assignment (links the track to a player character or NPC)
- **tags** — freeform labels (`Background Audio`, `Soundboard`, custom)
- **hash** — MD5 fingerprint used for duplicate detection across both music roots

### Mood
A scene-type category (Combat/Battle, Boss Fight, Ambient/Explore, etc.). Moods are the primary search axis — the DM finds music by scene type first. Colors distinguish moods visually in the sidebar.

### Character OST
A named player character or NPC. Tracks assigned to a character represent that character's personal score. Used to quickly pull up "Vireth's theme" or "Aegir's fight music" during a session.

### Duplicate
Two or more tracks sharing an identical MD5 hash. The dupe resolver lets the DM keep one canonical copy, delete the rest from disk, and transfer any labels from deleted copies to the kept one.

### Scan
A background process that recursively walks `../music` and `../Windows-sync`, hashes new/modified files, upserts the database, and removes entries for deleted files. Scan results are cached by `(size, mtime)` so unmodified files are skipped.

### Spotify Import
Integration with the `spotdl` CLI. A Spotify track or playlist URL is submitted; spotdl downloads MP3s to `../music/Spotify Downloads/`; the app auto-rescans after download completes.

## Data Model

```
tracks          — one row per audio file (id, source, rel_path, name, size, duration, hash, mood, char_name, mtime)
moods           — name PRIMARY KEY, color
characters      — name PRIMARY KEY, role, color_idx
tags            — name PRIMARY KEY
track_tags      — (track_id, tag_name) junction table
```

Track ID format: `"<source>|<rel_path>"` where source ∈ `{music, Windows-sync}`.

## Library State (as of last handoff — 2026-06-23)
- 750 tracks total across both roots
- 190 labeled (mood + character assigned), 560 unlabeled
- 0 confirmed duplicates at time of handoff
- Characters visible: Vireth, Aegir

## Workflow the GM Uses
1. Open `http://localhost:3000` before a session
2. Filter by mood in the left sidebar to find scene music
3. Click a track to preview; press Apply to confirm mood/char labels
4. During play: click a track row to stream it directly in the browser
5. Between sessions: use Spotify import or drag files into `../music/` then hit Rescan
