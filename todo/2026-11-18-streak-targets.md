---
title: Set a streak target and see days left to reach it
date: 2026-11-18
state: in progress
branch: feat/targets-cheat-days
type: feature
---

## Why
"I want to be able to set targets, so I can see how many days until meeting it (also on the widget)."

## What
- User sets a target in clean days, minimum 7. When setting it, they choose whether the current streak counts toward it or they start from 0.
- Progress works like the streak: gray days are skipped, a sugar day resets it (unless a cheat day covers it).
- The Mini App and widget show days left until the target.
- When a target is reached, the user earns cheat days ([[2026-11-18-cheat-days]]) and the target ends. No auto-repeat: the user sets a new target if they want one.

## Notes
- One active target at a time (simplest; open question if more wanted).
- When a target is reached, the bot sends a message: "🎯 Target reached, +N cheat days".

## Log
- 2026-11-18 created (backlog)
- 2026-11-18 decisions: choose to count the current streak or not, new target set by hand
- 2026-11-18 decision: bot message when a target is reached
- 2026-11-18 in progress — built with targets and cheat days together; no give-back for cheat days (exploit), counted streak pays only new days
