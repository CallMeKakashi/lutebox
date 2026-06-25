# ADR 003 — MD5 hash as duplicate identity, (size, mtime) as cache key

**Status**: Accepted  
**Date**: 2026-06-23

## Context
The library spans two roots (`../music` and `../Windows-sync`) and files may be copied between them. We need to detect duplicates and avoid re-hashing unchanged files on every scan.

## Decision
- **Duplicate identity**: MD5 hash of file contents. Two tracks with the same hash are duplicates regardless of path or name.
- **Scan cache**: Skip rehashing when `size` and `mtime` (within 1 second) match the stored record.
- **Track ID**: `"source|relPath"` string — path-based, not hash-based — so a file rename is treated as a new track (labels must be re-applied or recovered via hash match from the missing-tracks map).

## Consequences
- **Good**: MD5 is fast enough for audio files; cryptographic strength is not needed here.
- **Good**: mtime cache avoids hashing 750 unchanged files on every scan.
- **Bad**: MD5 collisions are theoretically possible but practically irrelevant for this library size.
- **Bad**: Renaming a file breaks its track ID; labels are recovered only if the old record is still in the DB during the same scan.
