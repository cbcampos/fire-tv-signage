# Sermon Processing Workflow

**Last updated:** 2026-07-12 (added "no editing other than normalize-if-quiet" rule)

## The rule (Chris, 2026-07-12)

> Don't edit sermon audio other than normalizing if it's too quiet. Over-amplification makes it sound bad.

Translation: **bare `loudnorm=I=-16:TP=-1.5:LRA=11` ONLY when measured source is quieter than -18 LUFS.** Trinity's USB feed normally lands around -16 LUFS — that's a no-op.

If the source is genuinely too quiet (rare), apply the loudnorm pass. Never apply it twice. Never stack loudnorm + highpass + compressor — that stack came from older "make it sound loud on phone speakers" recipes and Chris has flagged it as over-processed.

## The end-to-end flow

When the Sunday USB recording arrives (operator drops it into the workspace):

```bash
# 1. Run the determinist steps (cut, loudness, optional upload)
bash scripts/process-sermon.sh outputs/sermons/R_YYYYMMDD-HHMMSS.wav

# Read the script's transcript + Transistor dry-run preview.
# Decide whether to publish (--publish) or upload-as-draft.

# 2. When you're ready, re-run with --publish to actually upload to Transistor:
bash scripts/process-sermon.sh outputs/sermons/R_YYYYMMDD-HHMMSS.wav --publish

# 3. Tell Dobby to finish: "process this week's sermon."
#    Dobby will:
#      - Transcribe via whisper large-v3 MPS
#      - Generate styled summary (SUMMARY-PROMPT.md, 50-70 words, first-person plural)
#      - Tag against 63-topic taxonomy (tagging-batch-prompt.md)
#      - Append entry to sermon-tags.json + site/sermons.json + sermon-summary-manifest.json
#      - Write a one-off summary-batch-*.json entry
#      - Rebuild widget-v2/build-summaries.py → summaries.json + trinity-sermons-widget.html
#      - git commit + push to cbcampos/trinity-sermons-widget (auto-deploys Netlify)
#      - Persist state to state/sermon-pipeline/last-run.json

# The state file makes the workflow idempotent: re-running is a no-op.
```

## Step-by-step details

### Step 1: Cut

`scripts/sermon_audio_extract.py <wav> --transcribe auto --output-dir outputs/sermons`

- Cut rules: `docs/sermon-audio.md` (Trinity element #6 = Scripture Reading is start; "we're going to come now to the Lord's table" is end)
- The 2026-06-14 sermon is the canonical reference cut (see "Verified 2026-06-14" in `docs/sermon-audio.md`)

### Step 2: Loudness check + normalize-only-if-quiet

Measure:
```bash
ffmpeg -hide_banner -i outputs/sermons/<basename>.sermon-only.wav -af volumedetect -f null - 2>&1 | grep mean_volume
```

Decision:
- **mean_volume ≥ -18 dB** → export as-is. No loudnorm pass.
- **mean_volume < -18 dB** → apply bare `loudnorm=I=-16:TP=-1.5:LRA=11` (no highpass, no compressor).

```bash
ffmpeg -y -i outputs/sermons/<basename>.sermon-only.wav \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/<basename>.sermon-only.mp3
```

### Step 3: Transistor upload (optional, after cut + normalize)

```bash
python3 scripts/transistor_sermon_upload.py outputs/sermons/<basename>.sermon-only.mp3 \
  --service-date YYYY-MM-DD --dry-run

# ↑ review the JSON preview, then re-run WITHOUT --dry-run to upload-as-draft.
# Add --publish to publish in the same step.
```

### Step 4: Transcribe (MPS only)

```bash
python3 projects/trinity-fellowship/scripts/transcribe-sermon.py \
  --device mps --model large-v3 \
  outputs/sermons/<basename>.sermon-only.wav
```

- ~2-3 min for a 32-min sermon on M1
- **TRAP:** never run a second MPS job in parallel — M1 has one Metal device. Both stall at 10-15% CPU. Verify with `ps aux | grep whisper` if unsure.

### Step 5: Summary (LLM via Codex subagent)

Prompt source of truth: `projects/trinity-fellowship/SUMMARY-PROMPT.md` (verbatim)

Subagent spawn template (the subagent MUST use the prompt **verbatim**; do not normalize):

```python
sessions_spawn(
    runtime="subagent",
    task=f"""
Read the prompt at /Users/ccampos/.openclaw/workspace/projects/trinity-fellowship/SUMMARY-PROMPT.md VERBATIM.
Read the transcript at <transcript-path>.
Generate the styled summary following the prompt's rules exactly.
Output ONLY the summary text — no preamble, no labels, no word count.

VERIFICATION (do this yourself before outputting):
- Word count is 75 or under
- No preacher name appears
- Divine pronouns are capitalized (He/Him/His when referring to God/Jesus/Christ)
- "gospel" is lowercase unless in a title or referring to the four Gospels

Do NOT call any tools other than read. Do NOT write to any files.
""",
    agentId="codex",
    model="openai/gpt-5.4",
    taskName=f"sermon-summary-{YYYY-MM-DD}",
)
```

### Step 6: Verify summary

```bash
python3 projects/trinity-fellowship/verify-summaries.py \
  --file /tmp/<slug>.json --strict
```

- Pass: word count 50-70, no preacher name, starts with "We ...", divine pronouns capitalized, "gospel" lowercase, names the passage or topic.
- Fail: hard fail, do NOT proceed. Per Chris 2026-07-12: skip the verification round-trip — just accept the summary from the LLM if the prompt's self-verification check passed.

### Step 7: Tag (LLM via Codex subagent)

Prompt source of truth: `projects/trinity-fellowship/tagging-batch-prompt.md` (verbatim)

Subagent spawn template (the subagent MUST use the prompt **verbatim**):

```python
sessions_spawn(
    runtime="subagent",
    task=f"""
Read the prompt at /Users/ccampos/.openclaw/workspace/projects/trinity-fellowship/tagging-batch-prompt.md VERBATIM.
Read the transcript at <transcript-path>.
Read the sermon metadata (date, title, scripture reference) from the input.
Output a single JSON object (not an array — just one record for this one sermon):

{{
  "date": "YYYY-MM-DD",
  "title": "...",
  "primary_passage": "...",
  "book": "...",
  "series": null,
  "seasonal": null,
  "topics": ["...", "..."],
  "confidence_notes": "..."
}}

Use ONLY the 63 exact kebab-case slugs from the prompt's canonical map.
Order topics by prominence; aim for 3-7 per sermon.

Do NOT call any tools other than read. Do NOT write to any files.
""",
    agentId="codex",
    model="openai/gpt-5.4",
    taskName=f"sermon-tag-{YYYY-MM-DD}",
)
```

### Step 8: Update library

The summary text goes into a new `summary-batch-<N>-<M>.json` file (next batch number after the highest existing one). The tag JSON object goes into `sermon-tags.json`. The trimmed record goes into `site/sermons.json`. The metadata index entry goes into `sermon-summary-manifest.json`. The inventory in `sermon-inventory-<date>.json` gets the summary field populated on the new episode entry.

### Step 9: Rebuild widget

```bash
cd projects/trinity-fellowship/widget-v2
python3 build-summaries.py    # writes summaries.json + trinity-sermons-widget.html
git add -A
git commit -m "Add <Title> (<Passage>) summary + tags to widget"
git push origin main          # triggers Netlify deploy
```

Verified 2026-06-30: `git push origin main` after commit `eb706f4` → live site had the new placeholder within ~60s. Same is true for any repo-linked Netlify site.

### Step 10: Persist state

`state/sermon-pipeline/last-run.json` records:
- service_date
- source audio path + md5
- applied_loudnorm (true/false)
- transistor_episode_id (after step 3)
- widget_commit_sha (after step 9)
- processed_at timestamp

Re-running `process-sermon.sh` on the same source audio aborts at step 1 with "already processed on YYYY-MM-DD".

## Idempotency

The state file's `last_runs` is keyed by `(service_date, audio)`. If both already exist AND `widget_commit_sha` is set, the script aborts at step 1.

`--force` overrides this — useful when re-processing a sermon that needs summary regeneration.

## Backfill behavior

If a sermon is already in `sermon-tags.json` and `site/sermons.json` but missing a summary in the widget:
- Compute summary via step 5
- Append summary to the next available `summary-batch-N-M.json` file (or write a new one)
- Re-run step 9 to rebuild the widget

If a sermon is in neither file:
- Run steps 5-9 in full

If a sermon's source audio is corrupt (e.g., the 2026-07-05 case):
- Skip the sermon entirely. Note in `memory/sermons/<date>-sermon.md` that the sermon was skipped due to corrupt audio. DO NOT add empty placeholder entries to the library.

## What I do NOT change

- `scripts/sermon_audio_extract.py` — the cut logic is locked.
- `docs/sermon-audio.md` cut rules — locked per the 2026-06-14 verification.
- `SUMMARY-PROMPT.md` and `tagging-batch-prompt.md` — verbatim, never normalized.
- The 2026-06-14 louder-export recipe is last-resort only. When the loudness check says it's needed and the loudnorm pass didn't bring it up enough, THEN escalate. Document the override in `memory/sermons/<date>-sermon.md`.

## Traps

1. **Don't run two MPS jobs in parallel.** M1 has one Metal device. Verify with `ps aux | grep -i whisper` before starting another MPS job.
2. **Don't normalize twice.** If loudnorm brought the source up to -16 LUFS, that's the final state. Re-running loudnorm on top of loudnorm output will create artifacts.
3. **Don't apply highpass or compressor.** Trinity's USB is a clean soundboard feed — it's already shaped. Adding a highpass on a clean signal squashes the natural register of speech.
4. **Don't run the widget rebuild script unless the new summaries + tags are committed/pushed.** The script embeds an inline JSON into the widget HTML. If you rebuild with partial state, the deployed widget will reflect only what was in the source files at build time.
5. **The inventory snapshot file (`sermon-inventory-<date>.json`) is a snapshot, not a live list.** Don't overwrite — append-only. New inventory snapshots are dated.
6. **Bulletin PDF metadata is best-effort.** If `transistor_bulletin_metadata.py` can't find a PDF for today's date, the upload defaults to MP3-basename title. Manually pass `--title "..."` if needed.
7. **Publishing vs drafting.** Default upload = draft. Use `--publish` only after you've reviewed the metadata. Once an episode is published on Transistor, listeners are subscribed — going back to draft is irreversible for the listener base.
