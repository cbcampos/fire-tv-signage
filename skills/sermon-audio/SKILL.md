---
name: sermon-audio
description: Extract the sermon section from a full church-service audio recording, optionally transcribe it to improve boundary detection, and export a louder normalized file without clipping.
version: 0.1.0
openclaw:
  skillKey: sermon-audio
requirements:
  os: [linux, darwin]
  binaries: [ffmpeg, ffprobe, python3]
---

# Sermon Audio Skill Graph

📍 **Start here:** [[MOC]]

Use this skill when you have a full church-service recording and need just the sermon audio, cleaned up and normalized.

## When to use
- A raw WAV/MP3/M4A contains music, announcements, prayer, and sermon, and you want only the sermon.
- You want a sermon export that is louder and easier to hear without clipping.
- You want transcript-assisted boundary detection instead of guessing sermon start/end by ear.

## Skill graph overview
- [[plan]] — workflow, assumptions, and outputs for sermon extraction.
- [[run]] — how to run the extractor and which flags to use.
- [[review]] — how to inspect candidate timestamps and override them when the auto-cut is off.

## Workflow summary
1. Probe audio metadata.
2. Segment the service into speech-heavy candidate regions.
3. Optionally transcribe candidate speech blocks.
4. Score blocks for likely sermon content.
5. Merge the best window into a sermon cut.
6. Normalize/compress with headroom so the export is louder but does not clip.
7. Save metadata, timestamps, and optional transcript alongside the final audio.

## Design goals
- **Smart by default:** use transcription when available because sermon-vs-announcement separation is much better with text cues.
- **Not brittle:** always allow manual `--start` / `--end` overrides.
- **Safe loudness:** target spoken-word loudness with true-peak headroom.
- **Reviewable:** produce JSON metadata and plain text notes so boundary decisions are inspectable.

## Files created by the workflow
- `<basename>.sermon.wav` or `.mp3`
- `<basename>.transcript.txt` (optional)
- `<basename>.segments.json`
- `<basename>.decision.json`

## Implementation
- CLI script: `scripts/sermon_audio_extract.py`
- Audio engine: `ffmpeg` / `ffprobe`
- Heuristics: Python (`librosa`, `numpy`, `soundfile` when available; safe fallback if not)
- Optional transcription: local `whisper` CLI if present

See [[run]] to execute it.
