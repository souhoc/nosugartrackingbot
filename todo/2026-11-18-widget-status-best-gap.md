---
title: Gap between "Clean today" and "Best N" on the widget
date: 2026-11-18
state: in progress
branch: fix/widget-status-best-gap
type: fix
---

## Why
On the widget, `clean today` and `Best N` need a horizontal gap. They look stuck together.

## What
- Visible space between the today status line and the `🏆 Best N` line. They stay on two lines, one under the other.

## Notes
- Code: Scriptable widget script in `src/index.js` (~line 801-807). The two `widget.addText` lines are stacked with no `widget.addSpacer` between them.
- Decided: keep the two lines stacked, just add space between them (not one row).

## Log
- 2026-11-18 created (backlog)
- 2026-11-18 in progress — branch fix/widget-status-best-gap
