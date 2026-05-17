---
description: Run the sermon-audio extractor on a local service recording
priority: high
links:
  - plan
  - review
---

# Run

## Basic usage

```bash
python3 scripts/sermon_audio_extract.py /path/to/service.wav
```

## Recommended usage with transcription

```bash
python3 scripts/sermon_audio_extract.py /path/to/service.wav \
  --transcribe auto \
  --output-dir outputs/sermons
```

## Manual boundary override

```bash
python3 scripts/sermon_audio_extract.py /path/to/service.wav \
  --start 00:42:10 \
  --end 01:31:45 \
  --output-dir outputs/sermons
```

## MP3 export

```bash
python3 scripts/sermon_audio_extract.py /path/to/service.wav \
  --format mp3 \
  --bitrate 128k
```

## Useful flags
- `--transcribe auto|always|never`
- `--start HH:MM:SS`
- `--end HH:MM:SS`
- `--output-dir PATH`
- `--format wav|mp3`
- `--bitrate 128k`
- `--keep-temp`
- `--dry-run`

## What the script writes
- final sermon audio
- `.segments.json`
- `.decision.json`
- `.transcript.txt` when transcription runs

## Notes
- `auto` transcription runs only if a local `whisper` binary is available.
- If transcription is unavailable, the extractor falls back to audio-only heuristics.
- If auto-detection is ambiguous, use the decision JSON and override `--start`/`--end`.
