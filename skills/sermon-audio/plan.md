---
description: Plan and architecture for extracting sermon audio from full service recordings
priority: high
links:
  - run
  - review
---

# Plan

## Goal
Take a full church-service recording and produce a sermon-only audio file that is clearer and louder without clipping.

## Pipeline

### 1) Probe
Use `ffprobe` to read duration, channels, sample rate, and format.

### 2) Detect speech-heavy windows
Use ffmpeg analysis plus light Python heuristics to find long speech-dominant regions:
- silence gaps
- low spectral flux compared with music-heavy sections
- lower short-term energy variance than songs
- long contiguous spoken windows

This step does **not** try to perfectly identify the sermon. It narrows the search.

### 3) Optional transcript-assisted scoring
Transcribe the largest speech-heavy windows when transcription is enabled.

Score candidate windows up when transcript cues suggest a sermon:
- scripture references
- sustained exposition language
- repeated theme/title words
- long monologue by one speaker

Score windows down when cues suggest non-sermon speech:
- welcome / announcements
- offering / housekeeping
- prayer-only closing language
- short transitions between songs

### 4) Pick the sermon window
Choose the strongest candidate by combining:
- duration
- speech density
- transcript cue score
- position in service (sermons often follow worship and precede response/closing)

### 5) Export and loudness pass
Trim to sermon window, then normalize for spoken audio.

Default finishing chain:
- high-pass filter to tame rumble
- mild speech compression
- two-pass `loudnorm`
- true-peak ceiling for anti-clipping headroom

### 6) Review artifacts
Write:
- detected candidate windows
- chosen window + score explanation
- transcript if generated
- final output path

## Manual override philosophy
Auto-detect should save time, not force trust. Manual overrides always win:
- `--start HH:MM:SS`
- `--end HH:MM:SS`
- `--no-transcribe`
- `--format wav|mp3`

## Output defaults
- WAV for archival quality
- MP3 option for easy sharing
- sidecar JSON for reproducibility
