# ADR 006 — Path traversal debt in resolveTrackPath

**Status**: Debt — must fix  
**Date**: 2026-06-23

## Context
`resolveTrackPath(trackId)` looks up `(source, rel_path)` from the DB and joins them with the appropriate root. The result is passed directly to `res.sendFile()` (stream endpoint) and `fs.unlinkSync()` (delete endpoint) without validating that the resolved path actually starts with `musicRoot` or `windowsSyncRoot`.

## Risk
If the DB is compromised or a track ID is manipulated to store a malicious `rel_path` (e.g. `../../sensitive-file`), the server would serve or delete arbitrary files on disk.

## Required Fix
After resolving, assert:
```js
const resolved = path.resolve(root, track.rel_path);
const allowedRoots = [musicRoot, windowsSyncRoot];
if (!allowedRoots.some(r => resolved.startsWith(r + path.sep) || resolved === r)) {
  return res.status(403).send('Forbidden');
}
```
Apply this guard in every handler that calls `resolveTrackPath`: stream, art, delete, rename.

## Decision
Document as accepted debt until fixed. This ADR tracks the issue so it is not lost between sessions.
