# Active Tasks

*Last updated: 2026-03-31*
*Read this file FIRST on every session/heartbeat*

## Rules for Maintenance

**When to add a task:**
- Multi-step work spanning >1 day
- Risk of forgetting without a reminder
- Someone asked for follow-up

**When to update:**
- Every time you make progress → update "Last Update" to today
- When task is complete → mark DONE or remove
- When blocked → mark BLOCKED and note why

**When to add (trigger points):**
1. **User gives a complex task** → Add immediately
2. **Start working** → Mark IN PROGRESS, Last Update = today
3. **Make progress** → Update Notes, keep Last Update = today
4. **Finish** → Mark DONE or remove
5. **Get stuck** → Mark BLOCKED + note why

**On EVERY heartbeat/session start:**
1. Read this file FIRST
2. If IN PROGRESS items exist and Last Update is NOT today → work on it
3. If BLOCKED → try to unblock or escalate

---

## In-Flight Work

| Task | Status | Last Update | Notes |
|------|--------|-------------|-------|
| Flaire Voice Setup | ✅ DONE | 2026-03-20 | `af_river` confirmed by Chris. Discord `ATTACH_FILES` permission granted. |
| Morning Digest Telegram routing fix | 🔴 PENDING | 2026-03-20 | Isolated session falls back to Telegram instead of Discord. Fix: change delivery to `announce` mode with explicit Discord channel. |
| Meal Planner error handling | 🔴 DEFER | 2026-03-20 | Meal Planner (Sunday) is working. Meal Planner Missing disabled. Low priority until next break. |
| Invoice Ninja PDF — logo + print broken | 🔴 URGENT | 2026-03-31 | Needs Docker host access to apply SNAPPDF_EXECUTABLE_PATH. Escalated to Chris. SNAPPDF_EXECUTABLE_PATH env var not picked up. Spawn subagent to investigate and fix. |
| Google Tasks verification process | 🔴 PENDING | 2026-03-20 | Stale — needs re-evaluation. Systematic fix needed: wrong due date pattern (Mar 17 morning reminder had wrong date, no cron set). |
| Cron Doctor dashboard (replace broken cron-health-check.sh) | ✅ DONE | 2026-03-31 | Built and tested — 4 error crons identified and fixed. `cron-health-check.sh` had bash `$(NF-x)` expansion bug — FIXED. Now build `cron-doctor.sh` as proper live diagnostic: shows all error/timeouts with last error details from `cron runs`. 8 crons currently in error state. |
| Investigate 8 error-state crons | ✅ DONE | 2026-03-31 | Found 4 actual error crons. All bumped to 300s timeout: Discord Daily Memory, Proactive Garmin Health, Proactive Intelligence, sermon-recap. Cron Health Daily, health-safety-watch, Morning Run Coach, Calendar Radar PM, Evening Wrap, Overnight Pain Scan, Sunday Content Planning, Weekly Slack Summary — all showing error. Need `openclaw cron runs <id>` on each to find root cause. |
| Proactive garmy + bee integration | 🔴 PENDING | 2026-03-25 | Both tools underused. garmy (4x/wk) could feed running recommendations into morning digest proactively. bee context could be pulled before sessions. No code yet — scope this out first. |
| Bee fact cleanup phase 2 | 🟡 IN PROGRESS | 2026-05-15 | Backup created at `tmp/bee-facts-export.jsonl`. First aggressive pass deleted 269 facts and reduced known count from ~7402 to ~7133. Phase-2 export at `tmp/bee-facts-export-phase2.jsonl`; earlier 3381 figure was a bad partial export. Next step: cluster remaining facts by theme (parenting, marriage, smart-home, running) and keep one canonical fact per theme before more deletions. |
| Sermon audio extraction skill | 🟡 IN PROGRESS | 2026-05-17 | Built initial `sermon-audio` skill and `scripts/sermon_audio_extract.py`. Next step: run it against a real church-service WAV, tune sermon-boundary heuristics, and validate normalization output. |

---

## How to Use This File

**On EVERY session start (including heartbeats):**
1. Read this file FIRST
2. Check if there are any IN PROGRESS tasks
3. If yes, work on them before doing anything else
4. Update the status/notes after progress

**Adding new tasks:**
- Only add when: multi-step, >1 day to complete, or risk forgetting
- Include: clear description, why it matters, next step

**Task Statuses:**
- `IN PROGRESS` — actively working on it
- `PENDING` — not started yet
- `BLOCKED` — waiting on something
- `DONE` — complete (can remove or keep for history)

---

## Progress Log

### 2026-05-17
- Created new `skills/sermon-audio/` skill graph with `SKILL.md`, `MOC.md`, `plan.md`, `run.md`, and `review.md`.
- Built `scripts/sermon_audio_extract.py` to probe service audio, detect speech-heavy candidate windows, optionally transcribe candidates with local `whisper`, score likely sermon sections, cut the chosen span, and normalize final output with ffmpeg loudness tools.
- Verified CLI help and Python syntax. Pending real-file validation and heuristic tuning once Chris drops the church WAV.

### 2026-03-25
- Fixed `cron-health-check.sh` bash expansion bug — `$(NF-x)` was being misparsed by bash before awk, corrupting all cron field extraction. Replaced with `awk '{n=NF; print $(n-4)}'` pattern. Also added NF<6 guard to skip box-drawing separator lines from `openclaw cron list`. Verified working.
- Added 3 new tasks to active-tasks.md: cron-doctor.sh build, 8-error-cron investigation, garmy+bee proactive integration.
- Identified: `bee` (36x/wk cron only, near-zero in sessions), `garmy` (4x/wk, could feed running/training intel proactively), `gogcli` (3x/wk, read-only — could write/modify tasks), `weather` (6x/wk, not feeding into planning decisions) as chronically underused.

### 2026-02-26
- Fixed cron errors: deleted broken crons, recreated 7 with proper configs
- Set default model to MiniMax-M2.5 across all agents
- Saved Amanda's deposit workflow to memory/personal/

## RSVP Monitor — Franklin Birthday Party (Apr 11)
- **Started:** Apr 7, 2026
- **Deadline:** Friday Apr 11 evening
- **Task:** Watch for new Formspree RSVPs in chris.campos@gmail.com
- **Last known RSVP:** Apr 7 — 6 RSVPs total (see RSVP summary)
- **Check:** During heartbeats, search gws for new formspree submissions
- **Action:** If new RSVPs found, notify Chris immediately
