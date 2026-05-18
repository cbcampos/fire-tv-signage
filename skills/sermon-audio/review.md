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
- `<basename>.decision.json` for the chosen sermon span, human-readable `*_hms` times, and score breakdown
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
2. Listen near the proposed `start_hms` and `end_hms`
3. Re-run with `--start` and/or `--end`

Manual boundaries are validated before export. If `--start` is after `--end`, negative, or outside the input duration, the script exits without writing a cut.

## Practical recommendation
Use auto-detect + transcript first. For important sermon archives, do a 2-minute spot check near the boundaries before publishing.

## What this real run taught us
- Audio-only heuristics can wildly over-select and include much of the service.
- Transcript cues were the reliable way to find the real sermon opening.
- The approved sermon cut can still sound too quiet even after the base normalization pass.
- Keep two deliverables when needed:
  - the clean sermon-only master
  - a louder delivery MP3 for easier listening/share-out
- Before replacing a shared file, verify both:
  - the boundary length is still correct
  - the louder export was made from the correct full sermon master
