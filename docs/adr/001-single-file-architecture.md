# ADR 001 — Single-file architecture (server.js + index.html)

**Status**: Accepted  
**Date**: 2026-06-23

## Context
This is a local tool used by one person (the GM) on a LAN. It needs to be trivially runnable (`node server.js`) with no build step.

## Decision
All server logic lives in `server.js`. All frontend logic lives in `index.html` (inline `<script>` and `<style>`). No bundler, no TypeScript, no separate JS modules.

## Consequences
- **Good**: Zero build tooling, instant startup, easy to edit and hot-reload with `--watch`.
- **Good**: The entire app is auditable in two files.
- **Bad**: `index.html` will grow large. Refactor to separate `.js`/`.css` files only if it becomes unmanageable (>3000 lines).
- **Bad**: No tree-shaking — all frontend code is always loaded.
