---
description: Run the sermon-audio extractor on a local service recording
priority: high
links:
  - plan
  - review
---

# Run

## Weekly end-to-end goal

Future-state workflow:

1. Chris plugs in the church USB drive.
2. Chris says some version of: `go process this week's sermon`.
3. Dobby finds the newest service recording on the USB drive.
4. Dobby extracts the sermon-only audio.
5. Dobby verifies the cut, exports a standardized sermon master, and renders a consistent delivery MP3.
6. Dobby pulls the latest worship guide from Google Drive.
7. Dobby extracts sermon title, speaker, scripture, and service date.
8. Dobby creates a Transistor draft with that metadata.
9. If everything looks good and approval is given, Dobby publishes it.
10. Dobby replies with a thumbs-up style confirmation and the live share URL.

That is now the intended weekly operating model.

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
6. Use the sermon-only WAV as the master and render the delivery MP3 from that master every time — never from a prior MP3.
7. Default to a consistent spoken-word normalization profile with lighter compression and a safer ceiling so week-to-week levels stay stable.
8. Pull bulletin metadata from Google Drive before creating the Transistor episode.
9. Create the Transistor draft from the confirmed delivery MP3.
10. Publish only after the audio and metadata are approved.

## End-to-end checklist for the weekly run

### A. Find the source audio

Usually the church USB appears under `/media/ccampos/<DRIVE_NAME>/`.

Find likely sermon recordings:

```bash
find /media/ccampos -maxdepth 2 -type f \( -iname '*.wav' -o -iname '*.mp3' -o -iname '*.m4a' \) | sort
```

Pick the newest likely service file. On the real run, that was:

```bash
/media/ccampos/TRINITY1/R_20260517-100404.wav
```

### B. Run first-pass sermon extraction

```bash
python3 scripts/sermon_audio_extract.py \
  /media/ccampos/TRINITY1/R_20260517-100404.wav \
  --transcribe auto \
  --output-dir outputs/sermons
```

### C. If the first cut is too broad, refine from transcript

If `whisper` CLI is missing, use the local Python fallback workflow and inspect transcript cues to find the actual sermon start.

Typical cues:
- `If you've got a Bible, turn with me to...`
- explicit scripture reading that begins the sermon proper
- shift from announcements/music/prayer into exposition

### D. Export the confirmed sermon-only WAV

Keep the sermon-only WAV as the master source-of-truth.

### E. Export the standardized delivery MP3

Default profile for future weeks:
- source: confirmed `*.sermon-only.wav` only
- high-pass filter at 80 Hz
- lighter compression for speech consistency, not hype
- louder normalized spoken-word target
- safer true-peak ceiling to avoid edge-case clipping from hot recordings

Recommended command:

```bash
ffmpeg -y -i outputs/sermons/R_20260517-100404.sermon-only.wav \
  -af "highpass=f=80,acompressor=threshold=-22dB:ratio=2.0:attack=20:release=220:makeup=1,loudnorm=I=-15:TP=-1.5:LRA=11" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3
```

If a specific week is unusually quiet, start here before making it hotter. The goal is consistency across weeks, not maximum loudness on a single sermon.

### F. Pull bulletin metadata

```bash
python3 scripts/transistor_bulletin_metadata.py
```

Expected output shape:
- `title`
- `speaker`
- `scripture`
- `service_date`
- `file_id`
- `file_name`

### G. Create the Transistor draft

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3
```

Defaults now come from the latest bulletin automatically:
- title = sermon title
- author = worship guide speaker
- description = `Scripture Passage: ...`

### H. Publish after approval

For an existing reviewed draft:

```bash
python3 scripts/transistor_sermon_upload.py \
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3 \
  --episode-id <draft_episode_id> \
  --publish
```

### I. Final response to Chris

The intended final user-facing response is short:
- confirm the episode is live
- provide the share URL
- mention anything unusual only if something actually needed manual intervention

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

## Standard delivery export

After the sermon-only WAV is confirmed, create the default delivery MP3 like this:

```bash
ffmpeg -y -i outputs/sermons/R_20260517-100404.sermon-only.wav \
  -af "highpass=f=80,acompressor=threshold=-22dB:ratio=2.0:attack=20:release=220:makeup=1,loudnorm=I=-15:TP=-1.5:LRA=11" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/R_20260517-100404.sermon-only.standard.mp3
```

This is now the preferred weekly baseline because it is more conservative and more likely to stay natural across different recordings.

## Optional louder fallback

If a given week still feels too quiet after review, create a separate louder comparison export from the same confirmed sermon-only WAV rather than replacing the standard delivery immediately.

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
- `.decision.json` with seconds plus `start_hms`, `end_hms`, and `duration_hms` for quick review
- `.transcript.txt` when transcription runs

## Notes
- `auto` transcription runs only if a local `whisper` binary is available.
- If transcription is unavailable, the extractor falls back to audio-only heuristics.
- If auto-detection is ambiguous, use the decision JSON and override `--start`/`--end`.
- Manual boundaries are checked before export so a reversed or out-of-range cut fails fast.
