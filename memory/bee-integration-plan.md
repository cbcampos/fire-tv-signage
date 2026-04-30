# Bee Integration — Supplemental Use

## Purpose
Bee is Chris's personal memory layer — his journals, todos, facts, and conversation transcripts. I should use it to supplement my context at session startup and during heartbeats, NOT replace my own memory system.

## What to use, when

### Session Startup (per AGENTS.md)
After reading SOUL.md, USER.md, memory files — add:
- `bee journals list` — new notes Chris took that might need attention
- `bee todos list` — spoken/reminder tasks to surface
- `bee facts list --unconfirmed` — pending facts to confirm or act on

### Heartbeat Rotation
Keep existing checks (email, calendar, docker, conversate) — Chris is fixing GWS auth.
Add Bee as a rotation item:
- **Every ~4th heartbeat:** run `bee changed` to see what Bee captured since last check

### What Bee gives me
- **Journals** → Action items or discussion points Chris noted down
- **Todos** → Spoken/reminder tasks I might not have captured elsewhere
- **Facts** → Confirmed preferences and patterns to respect
- **Now** → Context from recent conversations I wasn't present for

## What stays the same
- Memory sync cron (bee-import.js every 30min) — keep it
- Email monitor — keep it, Chris is fixing auth
- Calendar monitor — keep it, Chris is fixing auth
- My memory files (MEMORY.md, memory/*.md) — my own curated memory, not replaced by Bee

## Implementation
Simple: add Bee commands to my session startup sequence and occasionally check `bee changed` on heartbeats. No deprecated systems, no big refactor.