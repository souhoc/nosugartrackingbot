---
title: The bot sets its own command menus from the code
date: 2026-11-19
state: in progress
branch: docs/command-menu
pr: https://github.com/souhoc/nosugartrackingbot/pull/6
type: feature
---

## Why
The "/" command menu is stored on Telegram's side and was set by hand, so it drifted from the code (`/broadcast` was missing from the owner menu).

## What
- Command lists live in `src/index.js` (`USER_COMMANDS`, `OWNER_COMMANDS`), next to the handlers.
- The owner's `/start` calls `setMyCommands`: default menu for everyone, owner menu (chat scope) = user + owner commands.
- Strangers (not allowed) still see the user menu: decided, no need to hide it.

## Notes
- First version was a README `curl` snippet; replaced by code after review (locality, no drift).
- Owner menu updated by hand on 2026-11-19 to add `/broadcast`; code lists checked to match both live menus.

## Log
- 2026-11-19 created (in progress)
- 2026-11-19 scope changed: menus set by the bot instead of a README step
