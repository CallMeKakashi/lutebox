# ADR 005 — No authentication; localhost-only

**Status**: Accepted  
**Date**: 2026-06-23

## Context
The app is a personal tool for one GM, running on a local machine. It is never exposed to the internet.

## Decision
No authentication, no session management, no HTTPS. The server binds to `localhost:3000`.

## Consequences
- **Good**: Zero setup friction — just `node --watch server.js` and open the browser.
- **Bad**: If the machine is on a shared LAN and another device can reach port 3000, there is no access control. Acceptable given the home/private network assumption.
- **Constraint**: The path-traversal vulnerability in `resolveTrackPath` (see ADR 006 + CLAUDE.md) is more dangerous if the server is ever exposed beyond localhost. Fix it regardless.
