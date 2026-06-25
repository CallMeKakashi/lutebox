# DnD Music Forge — Agent & Skill Guide

This document describes which Claude Code skills and agent strategies to use for common tasks in this project.

---

## When to Use Which Skill

### Fixing bugs / unexpected behavior
Use **`anthropic-skills:diagnose`**  
Reproduce → minimise → hypothesise → instrument → fix → confirm in browser.  
Good for: broken dupe resolver modal, track list not updating after scan, art not loading.

### Validating a security fix
Use **`security-review`** (or **`code-review`** with security focus)  
After applying the path-traversal or shell-injection fixes, run a review to confirm no bypass exists.  
Always follow up with **`verify`** to confirm the fix works in the live app.

### Reviewing a batch of changes
Use **`code-review`**  
Run after any multi-file change set. Catches regressions in the label flow, scan logic, or dupe resolver.

### Confirming a change works in the live app
Use **`verify`**  
Opens Chrome (extension deviceId `f4182faf-0d3b-4858-90ae-614dff0fde34`) at `http://localhost:3000` and exercises the changed feature. Use after every non-trivial edit.

### Adding backend validation or endpoint tests
Use **`anthropic-skills:tdd`**  
Write a failing test against the Express routes first, then implement. Good for the security fixes — a test that sends a `../` path traversal attempt and expects 403.

### Performance profiling (album art lazy loading)
Use **`anthropic-skills:diagnose`** then implement `IntersectionObserver`  
The known issue: album art fires one HTTP request per visible row at render time (`index.html:764`). Profile in DevTools first to confirm, then add lazy loading.

---

## Suggested Agent Workflows

### Fix the two critical security issues
1. `code-review --fix` targeting `server.js:274` (path traversal) and `server.js:336` (shell injection)
2. `verify` — confirm stream/delete still work, confirm a malformed track ID returns 403
3. `security-review` — adversarial pass on the fixes

### Label 560 unlabeled tracks
This is manual GM work in the UI, not a code task. No agent needed.  
Use the "Apply & Next →" button in the app to step through tracks efficiently.  
Filter by unlabeled in the sidebar to isolate the queue.

### Add IntersectionObserver lazy loading for album art
1. `anthropic-skills:diagnose` — confirm the N-requests-per-render issue is measurable
2. Implement: replace eager `<img src="/api/tracks/art?id=...">` with `data-src` + observer in `index.html:764`
3. `verify` — scroll through the track list, confirm art loads on scroll, confirm no console errors

### Spotify import test
1. Start the server (`npm run dev`)
2. Paste a Spotify track URL into the import field in the app
3. `verify` — watch the status bar, confirm the track appears in the library after rescan

---

## Key Files for Each Task

| Task | Files |
|------|-------|
| Security fixes | `server.js:274` (path traversal), `server.js:336` (shell injection) |
| Dupe resolver UI bugs | `index.html` — `keepThisDupe`, dupe modal rendering |
| onclick/esc() fix | `index.html` — `renderList`, `renderMoodSidebar`, `renderCharSidebar` |
| Album art lazy load | `index.html:764` |
| Scan / label logic | `server.js:150–270` (`performScan`), `server.js:437–552` (label endpoints) |
| Status polling | `index.html:~577` |

---

## Chrome Extension
- **Device ID**: `f4182faf-0d3b-4858-90ae-614dff0fde34`
- **Active tab**: `http://localhost:3000` (tab 610576817 at last handoff)
- Use `mcp__Claude_in_Chrome__*` tools via the extension to take screenshots, read the DOM, or fill forms when running `verify`.
