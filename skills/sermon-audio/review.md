---
description: Review extracted sermon boundaries and correct them when needed
priority: medium
links:
  - run
---

# Review

## What to inspect
After a run, inspect:
- `<basename>.segments.json` for all candidate windows
- `<basename>.decision.json` for the chosen sermon span and score breakdown
- `<basename>.transcript.txt` for sermon cue quality when transcription was enabled

## Signs the auto-cut is good
- Starts after announcements / final worship song
- Contains a long uninterrupted speaking section
- Ends before closing prayer, invitation, or post-sermon logistics

## Signs it needs override
- Starts during a prayer or scripture reading before the message
- Includes post-sermon altar call / announcements you do not want
- Picks a short announcement block because the main sermon audio was noisy

## Fast correction flow
1. Read `decision.json`
2. Listen near the proposed start and end
3. Re-run with `--start` and/or `--end`

## Practical recommendation
Use auto-detect + transcript first. For important sermon archives, do a 2-minute spot check near the boundaries before publishing.
