---
title: Owner can send a message to all users with /broadcast
date: 2026-11-18
state: in progress
branch: feat/owner-broadcast
pr: https://github.com/souhoc/nosugartrackingbot/pull/4
type: feature
---

## Why
No way to tell users about a release (e.g. "send /widget again to get the new widget"). The bot can message every user, it just has no command for it.

## What
- Owner-only `/broadcast <text>`: sends the text to every allowed user and to the owner too.
- Replies to the owner with how many got it and how many failed.
- Shown only in the owner's command menu, like `/allow`, `/remove`, `/users`.

## Notes
- Owner commands live in `src/index.js` (~line 70, next to `/users`).

## Log
- 2026-11-18 created (backlog)
- 2026-11-18 in progress — branch feat/owner-broadcast
