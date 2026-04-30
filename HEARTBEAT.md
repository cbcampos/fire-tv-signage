# HEARTBEAT.md

## Periodic Checks (rotate through these ~4x/day)

- **Email** — Run `python3 ~/.openclaw/workspace/scripts/email_monitor_formatter.py`. 
  - If output contains 🏥 MEDICAL or urgent categories → send to Discord channel 1470900732931735697
  - If output is "No priority emails found." → reply HEARTBEAT_OK
  - Otherwise reply with a brief summary to Discord 1470900732931735697

- **Calendar** — Run `python3 ~/.openclaw/workspace/scripts/calendar-heartbeat.py`
  - If events in next 4h → brief heads up to Discord
  - Otherwise HEARTBEAT_OK

- **Weather** — Only check if relevant (plans mentioned, outdoor activities)
  - If severe weather → alert Discord
  - Otherwise skip

- **Conversate** — If a meeting session is active:
  - Run `bash ~/.openclaw/workspace/scripts/conversate-check.sh` to process pending keywords
  - Run `python3 ~/.openclaw/workspace/skills/conversate/send-nudge.py` to deliver nudges
  - Reply HEARTBEAT_OK if nothing to deliver

- **Bee (every ~4th heartbeat)** — Run `bee changed --cursor <last_cursor>` to check what Chris captured in Bee since last check. Update cursor. Surface any new commitments, journal notes, or facts that need action.

## Notes
- Early morning (before 8am) and late night (after 10pm) → skip unless urgent
- Don't reply with HEARTBEAT_OK if there's actual info to share
