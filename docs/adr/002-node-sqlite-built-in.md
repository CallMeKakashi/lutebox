# ADR 002 — Use node:sqlite built-in (no better-sqlite3)

**Status**: Accepted  
**Date**: 2026-06-23

## Context
A SQLite database fits the single-user local use case perfectly. The common choice is the `better-sqlite3` npm package, but Node.js 22+ ships `node:sqlite` as a built-in.

## Decision
Use `const { DatabaseSync } = require('node:sqlite')` with no additional npm dependency.

## Consequences
- **Good**: One fewer native dependency to compile; no `node-gyp` issues on Windows.
- **Good**: Synchronous API matches the single-threaded Express handler pattern cleanly.
- **Bad**: `node:sqlite` is newer and has a smaller community surface; some `better-sqlite3` patterns don't translate directly.
- **Constraint**: Requires Node.js ≥ 22.5. Do not downgrade the Node runtime.
