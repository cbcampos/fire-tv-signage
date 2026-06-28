# Sermon Transcripts

This directory holds text transcripts for Trinity Fellowship sermons in two batches.

## Source

### RSS feed (10 transcripts, Dec 2025 → present)
- Apple Podcasts auto-generates transcripts and exposes them as `<podcast:transcript>` tags in the RSS feed
- Format: text/plain (`.txt`) or SubRip (`.srt`)
- Files: `2025-12-21_*.srt` through `2026-02-16_*.srt` (8 SRTs) + `2026-06-07_*.txt` and `2026-06-14_*.txt` (2 text/plain)
- Apple GUIDs in filenames (e.g., `e958dccf`)
- The 8 SRTs were converted to paragraph `.txt` format using `scripts/srt_to_text.py` on 2026-06-28
- Markers: Apple uses `[scripture_reading]` for scripture readings and likely other `[lowercase_underscores]` markers for sermon sections — preserve these in the output

### Whisper transcription (68 transcripts, Sep 2024 → Dec 2025)
- Generated 2026-06-28 via faster-whisper 1.2.1 (small model, cpu_threads=4, int8, beam=1, no VAD)
- Source: 78 MP3s pulled from Transistor API `media_url` field
- Output: `.vtt` (timestamps) + `.txt` (paragraphs grouped 5/paragraph, no timestamps)
- Filenames match MP3 basenames (Transistor internal IDs like `2101490`)

## Naming convention

Two parallel naming schemes exist:
- RSS transcripts: `YYYY-MM-DD_Title_With_Underscores_<apple-guid>.txt`
- Whisper transcripts: `YYYY-MM-DD_title-with-dashes_<transistor-id>.txt`

These map to the same underlying episodes via `transcripts/manifest.json`. The mapping is `date + title` after punctuation normalization.

## Format

Each `.txt` file is paragraph-grouped text:
- 5 subtitle cues per paragraph (SRT) or 5 Whisper segments per paragraph
- Paragraphs separated by blank lines
- No timestamps in `.txt` files; timestamps in `.vtt`/`.srt` files

## For tagging

Both formats are equivalent in content. The tagging pipeline reads `.txt` files. Both batches can be processed identically.
