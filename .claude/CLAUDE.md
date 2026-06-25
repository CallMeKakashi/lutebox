# DnD Music Forge — Claude Instructions

## Project
Single-file Node.js + SQLite music organizer for tabletop RPG sessions.
- **Entry point**: `server.js` (Express API) + `index.html` (single-page vanilla JS frontend)
- **Database**: `music_forge.db` (node:sqlite built-in — no external driver)
- **Port**: 3000

## Always Start in Watch Mode
```powershell
cd "D:\foundry-pi\Foundry\foundrydata\Data\dnd-music-forge"
node --watch server.js   # or: npm run dev
```
Never use plain `node server.js` — watch mode auto-restarts on `server.js` saves.

## Music Roots (relative to dnd-music-forge/)
- `../music/` — primary library
- `../Windows-sync/` — secondary sync root
- `../music/Spotify Downloads/` — spotdl output dir (auto-created)

## Active Security Findings (unfixed)
| Severity | Issue | Location |
|----------|-------|----------|
| 🔴 Critical | Path traversal: `resolveTrackPath()` result not validated against allowed roots before `res.sendFile` / `fs.unlinkSync` | `server.js:274` |
| 🔴 Critical | Shell injection: `exec()` called with raw Spotify URL string — switch to `execFile` with arg array | `server.js:336` |
| 🟡 Medium | `PRAGMA foreign_keys = OFF` toggled per-transaction instead of set once at startup | `server.js:503` |
| 🟡 Medium | `esc()` in `onclick` attributes breaks on names containing `'` (e.g. O'Malley) | `index.html` |
| 🟡 Medium | `keepThisDupe` uses array index in onclick string instead of track ID | `index.html` |

Fix the two 🔴 Critical issues before any other work.

## Code Conventions
- No bundler, no TypeScript — plain CommonJS on the server, vanilla ES5/ES6 on the frontend
- Prepared statements for all DB queries (already in place)
- MD5 hash used for dedup identity (`crypto.createHash('md5')`)
- Track IDs are `"source|relPath"` strings (e.g. `"music|Folder/track.mp3"`)

## Testing
No automated tests. Use the Chrome extension (deviceId `f4182faf-0d3b-4858-90ae-614dff0fde34`) at `http://localhost:3000` to verify changes manually. After each fix, open the app and confirm the feature works end-to-end.

**Never use the Claude preview panel for review.** Always use the browser extension (`mcp__Claude_in_Chrome__*` tools) to inspect and verify the live app.
