# LuteBox — Claude Instructions

## Project
Single-file Node.js + SQLite music organizer for tabletop RPG sessions.
- **Entry point**: `server.js` (Express API) + `index.html` (single-page vanilla JS frontend)
- **Database**: `lutebox.db` (node:sqlite built-in — no external driver)
- **Port**: 3000
- **Repo**: https://github.com/CallMeKakashi/lutebox

## Always Start in Watch Mode
```powershell
cd "D:\Documents\Github\lutebox"
node --watch server.js   # or: npm run dev
```
Never use plain `node server.js` — watch mode auto-restarts on `server.js` saves.

## Music Roots
Scan roots are stored in the `scan_folders` DB table (seeded on first run).
Manage them at runtime via **Scan Folders → Add Folder** in the sidebar.
- Default: `../music/` (name: `music`) and `../Windows-sync/` (name: `Windows-sync`)
- Spotify/YouTube downloads go to `../music/Spotify Downloads/` (auto-created)

## Security Status
This is a **local-only** tool — no auth by design. Do not expose to the internet.

| Status | Issue | Location |
|--------|-------|----------|
| ✅ Fixed | Path traversal: `resolveTrackPath()` now validates against `scan_folders` DB roots | `server.js` |
| ✅ Fixed | Shell injection: `exec()` replaced with `spawn()` + arg arrays for spotdl/yt-dlp | `server.js` |
| ✅ Fixed | `PRAGMA foreign_keys` now set at startup | `server.js` |
| 🟡 Medium | `esc()` in `onclick` attributes breaks on names with `'` (e.g. O'Malley) | `index.html` |
| 🟡 Medium | `keepThisDupe` uses array index in onclick instead of track ID | `index.html` |
| ℹ️ By design | No auth/rate-limiting on destructive endpoints — local only | `server.js` |
| ℹ️ By design | `/api/browse` exposes filesystem structure — local only | `server.js` |

## Code Conventions
- No bundler, no TypeScript — plain CommonJS on the server, vanilla ES5/ES6 on the frontend
- Prepared statements for all DB queries (already in place)
- MD5 hash used for dedup identity (`crypto.createHash('md5')`)
- Track IDs are `"source|relPath"` strings (e.g. `"music|Folder/track.mp3"`)

## Testing
No automated tests. Use the Chrome extension (deviceId `f4182faf-0d3b-4858-90ae-614dff0fde34`) at `http://localhost:3000` to verify changes manually. After each fix, open the app and confirm the feature works end-to-end.

**Never use the Claude preview panel for review.** Always use the browser extension (`mcp__Claude_in_Chrome__*` tools) to inspect and verify the live app.
