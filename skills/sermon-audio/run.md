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

## Proven real-world workflow

For actual church service recordings, this is the safest flow:

1. Run the extractor once to get a first-pass sermon candidate plus review artifacts.
2. If the cut is too broad, generate a full transcript and use transcript cues to identify the true sermon start/end.
3. Export the sermon-only WAV first.
4. Listen to the start and end boundaries.
5. Only after the length is confirmed, make delivery MP3s.
6. If the MP3 still feels quiet, create a separate louder delivery version from the confirmed full-length sermon-only WAV — not from any intermediate or test export.

## Example from the May 17 church recording

Source:

```bash
/media/ccampos/TRINITY1/R_20260517-100404.wav
```

First pass:

```bash
python3 scripts/sermon_audio_extract.py \
  /media/ccampos/TRINITY1/R_20260517-100404.wav \
  --transcribe auto \
  --output-dir outputs/sermons
```

That pass over-selected badly, so the sermon was refined manually using transcript cues.

Final sermon boundaries used:

- start: `00:34:20`
- end: `01:06:43`
- final sermon length: about `32:23`

## Transcript-assisted fallback when `whisper` CLI is missing

If `--transcribe auto` does not run because the `whisper` CLI is unavailable, a practical fallback is:

1. Convert the source audio to mono 16 kHz WAV.
2. Run local Python `faster_whisper` on that file.
3. Use transcript phrases like “turn with me to…” or the opening scripture invitation to find the sermon start.
4. Re-cut using the confirmed timestamps.

## Louder delivery export

After the sermon-only WAV is confirmed, create a louder MP3 delivery version like this:

```bash
ffmpeg -y -i outputs/sermons/R_20260517-100404.sermon-only.wav \
  -af "highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=20:release=200:makeup=3,loudnorm=I=-14:TP=-1.0:LRA=10" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/R_20260517-100404.sermon-only.full-louder.mp3
```

## Critical pitfall

Do **not** make the louder version from a partial test export or the wrong source file. Always use the confirmed full-length `*.sermon-only.wav` as the source for final delivery renders.

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
