---
title: Earn cheat days by reaching targets
date: 2026-11-18
state: in progress
branch: feat/targets-cheat-days
type: feature
---

## Why
"Cumulate cheat days: when using them it doesn't kill the streak but doesn't count in it either. To get them you need to reach goals. Goal can be 7 days min."

## What
- Reaching a target ([[2026-11-18-streak-targets]]) earns cheat days. The balance adds up.
- Used by tapping a button. The day then acts like a gray day: the streak isn't broken, but the day doesn't count toward the streak or the target.
- Show the balance in the Mini App (and maybe the widget).

## Reward rule (proposed)
`cheat days = floor(target / 7) + floor(target / 30)`

| Target | Cheat days | 1 per |
| --- | --- | --- |
| 7 | 1 | 7 days |
| 14 | 2 | 7 days |
| 21 | 3 | 7 days |
| 30 | 5 | 6 days |
| 60 | 10 | 6 days |
| 90 | 15 | 6 days |

- Roughly 1 per week. Never more than about 1 in 6 days.
- A 30-day bonus makes one big target worth more than four 7-day ones (5 vs 4). It's also harder, because one sugar day resets it.

## Notes
- Button on a sugar day's card in the Mini App (today or a past day). Maybe a `/cheat` command for today too.
- Calendar: a cheat day is gray with an icon.
- Balance is capped at 15 to stop hoarding. Days earned above the cap are lost, and the message says so: "+3 cheat days (2 lost, max 15)".

## Log
- 2026-11-18 created (backlog)
- 2026-11-18 decisions: used by tapping a button; reward rule proposed
- 2026-11-18 decisions: button on the sugar day card, shown gray with an icon
- 2026-11-18 decision: balance capped at 15
- 2026-11-18 in progress — built with targets and cheat days together; no give-back for cheat days (exploit), counted streak pays only new days
