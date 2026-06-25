# ADR 004 — Spotify import via spotdl CLI subprocess

**Status**: Accepted (with known security debt)  
**Date**: 2026-06-23

## Context
GMs want to import Spotify playlists directly into their library. `spotdl` is a well-known Python CLI that handles Spotify URL parsing, YouTube matching, and MP3 download.

## Decision
Call `python -m spotdl "<url>" --output "<dir>"` as a child process from the Express route `POST /api/download/spotify`. The response is returned immediately; download runs in the background via a callback.

## Known Security Debt — Must Fix
The current implementation uses `exec()` with a template-literal command string containing the raw Spotify URL. This is **shell injection vulnerable**: a crafted URL could execute arbitrary commands.

**Required fix**: Switch to `execFile('python', ['-m', 'spotdl', url, '--output', spotifyDownloadDir])` with the URL passed as a separate argument, never interpolated into a shell string. Also validate that `url` matches `^https://open\.spotify\.com/` before passing it to the subprocess.

## Consequences
- **Good**: No Python-in-Node shim needed; spotdl handles auth and download transparently.
- **Bad**: Requires `spotdl` installed in the system Python environment — not bundled.
- **Bad**: Shell injection risk until the `execFile` fix is applied (see CLAUDE.md security findings).
