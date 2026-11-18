---
title: Command menu setup is written down in the README
date: 2026-11-19
state: in progress
branch: docs/command-menu
type: docs
---

## Why
The "/" command menu is stored on Telegram's side and was set by hand, so it drifted from the code (`/broadcast` was missing from the owner menu).

## What
- README setup step with the two `setMyCommands` calls: default menu for everyone, owner menu (chat scope) = user commands + owner commands.

## Notes
- Owner menu updated by hand on 2026-11-19 to add `/broadcast`; README snippet checked to match both live menus.

## Log
- 2026-11-19 created (in progress)
