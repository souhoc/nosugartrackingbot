---
title: A stranger can ask the owner for access from the bot
date: 2026-11-19
state: in progress
branch: feat/ask-for-access
type: feature
---

## Why
Today a non-allowed user only gets "This bot is private. Your user id is X. Send it to the owner." They have to reach the owner some other way and copy their id. User asked: can they "candidate" or ask to be allowed, maybe with a command?

## What
- The "private" reply gets a button "🙋 Ask for access". Button only, no command.
- Tap → the owner gets "<name> (@username, id) asks for access" with buttons "✅ Allow" and "❌ Ignore".
- "✅ Allow" does what `/allow <id>` does (the user gets "You now have access. Send /start"). "❌ Ignore" just closes the request, the user is not told.
- The user gets "Request sent. You'll get a message if the owner says yes."

## Notes
- Decided: one request per person, stored in D1 (`access_requests`). A second tap says "Already asked, waiting for the owner." Ignored requests are kept, so an ignored person can't ask again. Allowing deletes the row (so after a later /remove they can ask again).
- Decided: button only, no `/request` command.
- Callback data must stay under 64 bytes, e.g. `access|allow|<id>`.

## Log
- 2026-11-19 created (backlog)
- 2026-11-19 in progress — branch feat/ask-for-access
