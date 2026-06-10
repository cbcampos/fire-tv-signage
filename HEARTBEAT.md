# HEARTBEAT.md

## Periodic Checks (~4x/day)

Run only one primary lane per heartbeat unless something urgent is already failing. Do not stack checks just to feel productive.

### Lane 0 — Bee Live Capture (run on every heartbeat)
The freshest signal. Pull the last 30 minutes of Bee activity and ask: is there anything actionable? Anything worth remembering? Anything worth pointing out? If yes, do something with it.

- Run: `python3 ~/.openclaw/workspace/scripts/bee-live-window.py --minutes 30`
- If output is `No active Bee conversations in the last 30 minutes.` → fall through to Lane 1, this lane had nothing.
- If output has a conversation (CAPTURING or recently completed):
  - **Anything actionable?** → create a Todoist task, draft a Discord nudge, or update a calendar event. Don't ask — do.
    - **Todoist dedupe (SCRIPT-ENFORCED 2026-06-10 16:16):** `bee-live-window.py` `scan_for_action_phrases()` now does the Todoist pre-check itself and tags each hit with `existing_task_id` / `existing_task_url` when a matching active task is found. The text output shows a `🔁 DUPLICATE` line per matched hit. **Action:** when the scan output shows `🔁 DUPLICATE`, record the existing id as a `todoist_existing` action in the audit (don't create). When no duplicate line is shown, run `python3 ~/.openclaw/workspace/scripts/todoist-task-dedupe.py --content "<noun>" --project-id 6Crfx7wRcx657GMp` to create, and record the new id as `todoist_shopping`. The 2026-06-10 lemonade × 2 incident: the agent skipped the HEARTBEAT.md-only dedupe rule when a second "we need to get lemonade" utterance arrived 32 min after the first, so the rule was promoted into the script.
  - **Anything worth remembering?** → append to `memory/YYYY-MM-DD.md` (durable within the day) or `MEMORY.md` (durable beyond).
  - **Anything worth pointing out?** → send a short Discord message to the main channel with the headline and a one-line suggestion.
  - If a finding is "actionable + point-worthy" (e.g. Franklin has a rash that's getting worse, 5K is next weekend), do the action AND send the Discord note.
  - If findings conflict with existing memory/calendar/todos, fix the conflict now.
- If the conversation is still CAPTURING and clearly has more to come (utterances streaming in), prefer to wait for a natural pause before surfacing — don't fire 4 partial updates in 30 minutes.
- This lane consumes the heartbeat slot when it has findings; only fall through to Lane 1 when it has nothing.

### Lane 1 — alerts only
- **Email** — Run `python3 ~/.openclaw/workspace/scripts/email_monitor_formatter.py`.
  - If output contains 🏥 MEDICAL or urgent categories → send to Discord channel `1470900732931735697`
  - If output is `No priority emails found.` → no alert
  - Otherwise send one brief summary to Discord channel `1470900732931735697`

- **Calendar** — Run `python3 ~/.openclaw/workspace/scripts/calendar-heartbeat.py`
  - If events in next 4h → send one brief heads up to Discord channel `1470900732931735697`
  - Otherwise no alert

- **Weather** — Only if relevant to known plans or outdoor activity
  - Severe weather only → alert Discord
  - Otherwise skip

### Lane 2 — meeting support only
- **Conversate** — Only if a meeting session is active:
  - Run `bash ~/.openclaw/workspace/scripts/conversate-check.sh`
  - Run `python3 ~/.openclaw/workspace/skills/conversate/send-nudge.py`
  - If nothing to deliver, stay quiet

### Lane 3 — maintenance, low frequency (rotate through)
- **Bee stale todos** — Every ~4th heartbeat. Check Bee for incomplete todos >5 days old with no due date. Surface as a batch reminder if 2+.
- **Bee new todos** — Every ~4th heartbeat. Run `bee changed --cursor <last_cursor>`. Surface new commitments or journal notes that imply action.
- **Active task nudge** — Only if an `IN PROGRESS` item in `memory/active-tasks.md` is stale and not already being advanced elsewhere.
- **Memory hygiene** — Only when there is no alerting work and no active repair already underway. Prefer dedupe/cleanup of existing memory work over inventing new maintenance.

## Standing Habits
- **Friday:** Draft next week's meal plan before weekend
- **Franklin summer coverage:** Flag gaps in `data/franklin-summer-2026.md` whenever Franklin is mentioned or relevant

## Guardrails against overlap / diffusion
- Do not duplicate work already covered by an existing cron, watcher, or in-progress task.
- Do not create a new recurring check when a script already exists for that lane.
- Do not advance more than one maintenance item in a single heartbeat.
- If email/calendar are erroring, treat that as the work item instead of adding more background tasks.
- Prefer resuming named work already in `memory/active-tasks.md` over starting something new.
- If nothing important changed, reply `HEARTBEAT_OK` / stay quiet.

## Notes
- Early morning (before 8am) and late night (after 10pm) → skip unless urgent
- Don't send an update unless there is actual user value
