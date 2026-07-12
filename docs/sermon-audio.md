# Sermon Audio Workflow

**Chris's rule (2026-07-12):** Don't edit sermon audio other than normalizing if it's too quiet. **Over-amplification makes it sound bad.** Default export path = no extra processing. Normalize with `loudnorm` ONLY when the measured input LUFS is below -18 (Trinity's feed normally lands around -16 LUFS, so this is a no-op most weeks).

When editing church service recordings into sermon-only files, use this workflow:

1. Run `python3 scripts/sermon_audio_extract.py <service-audio> --transcribe auto --output-dir outputs/sermons`
2. Review the first-pass result before sharing anything.
3. If the cut is too broad, use transcript-assisted refinement to identify the actual sermon start/end.
4. Treat the sermon-only WAV as the master.
5. Measure loudness with `ffmpeg ... volumedetect`. If `mean_volume` is already >= -18 LUFS, export as-is. If it's quieter than -18 LUFS, apply the loudnorm pass below.
6. **Do NOT make a louder MP3 "just in case".** The 2026-06-14 louder-export workaround is last-resort only — when the soundboard feed is genuinely too quiet and the loudnorm pass didn't bring it up enough. Default = no extra processing.
7. Before uploading or sharing, verify duration so a partial/test render is not mistaken for the final sermon.

Loudness-driven normalization (only when measured LUFS is below -18):

```bash
ffmpeg -y -i outputs/sermons/<basename>.sermon-only.wav \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/<basename>.sermon-only.mp3
```

The historic "louder export" recipe (now last-resort only, 2026-06-14):

```bash
ffmpeg -y -i outputs/sermons/<basename>.sermon-only.wav \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/<basename>.sermon-only.full-louder.mp3
```

**Why this and not the older highpass+compressor+loudnorm stack:** Trinity's USB recording is a clean soundboard feed, not a room mic. Adding a highpass filter and a compressor (with makeup gain) on a clean signal squashes the natural dynamics and adds compression artifacts that sound "edgy" and harsh on small speakers. Just normalize the perceived loudness to the podcast standard (-16 LUFS, Apple Podcasts / Spotify-ish) and stop. Source WAV on 2026-06-14 measured -16.2 LUFS / 8.9 LU LRA natively, so the loudnorm pass barely has to do anything — that's the right outcome for a soundboard feed.

**If the source is ever a room mic** (e.g. someone speaking into a phone from the pews), THEN use the highpass + compressor stack to clean up the room noise and bring the speech level up. The current Trinity recordings are soundboard — stick with the bare loudnorm.

## Cut rules — what to include / exclude (2026-06-14)

The Trinity service structure varies week to week. These rules decide what belongs in the sermon-only audio and what gets cut, derived from the 2026-05-17, 2026-06-07, and 2026-06-14 runs.

### Always include

- **The Scripture Reading of the day's text** as read by the pastor. The cut starts at the pastor's line introducing the reading (e.g. "Well, let me read Psalm 15, and then we'll pray together.") and includes the actual reading ("O Lord, who shall sojourn in your tent...") plus the brief reading-of-the-word prayer that immediately follows ("This is the word of the Lord. Let's pray. Lord, thank you so much for the gift of your word..."). On 2026-06-14, this section runs 947.80s–1019.98s.
- **The sermon proper** (Brandon's exposition and application of the day's text). Cuts at the final application sentence — usually a prayer-imperative or benediction ("so may we look to Jesus and surrender our lives to him", "and pray this in his name", etc.).
- **The closing pastoral prayer** if it is the sermon's wrap-up prayer (short, 1–3 min, follows immediately after the last application sentence). Trinity's pattern is to close the sermon portion with this prayer, then transition to communion.

### Exclude everything before the Scripture Reading

On Trinity services, the following elements precede the Scripture Reading and must be EXCLUDED:
- **Opening Scripture** (call to worship) — a separate bulletin section at the start of the service (e.g. Hebrews 10:19-23 on 2026-06-14).
- **Post-Opening-Scripture prayer** — the closing prayer that follows it.
- **Opening hymn** — e.g. "Praise to the Lord the Almighty" on 2026-06-14.
- **Kids' dismissal** — e.g. "go ahead and go out to their classes as we come to God's Word together" on 2026-06-14. This is a pastoral transition, NOT the start of the sermon.
- **Series intro** — e.g. "so this summer we're returning to the book of Psalms..." on 2026-06-14. This is the pastor framing the new series, NOT the sermon proper. The sermon does not start until the Scripture Reading.

**Trinity service flow (canonical pattern):**
1. Opening Scripture (call to worship) — EXCLUDE
2. Prayer after Opening Scripture — EXCLUDE
3. Opening hymn — EXCLUDE
4. Kids' dismissal (pastor's one-liner) — EXCLUDE
5. Series intro (pastor framing the new sermon series) — EXCLUDE
6. Scripture Reading of the day's text + reading-of-the-word prayer — INCLUDE (start cut here)
7. Sermon exposition + application + closing prayer — INCLUDE
8. Communion invitation ("we're going to come now to the Lord's table...") — EXCLUDE
9. Communion rite (consecration prayer, institution words, distribution) — EXCLUDE
10. Closing hymn + benediction — EXCLUDE

**Verified 2026-06-14:** the entire pre-sermon service (Opening Scripture at 9:00–9:52, post-Scripture prayer 9:57–11:11, opening hymn "Praise to the Lord the Almighty" 11:41–13:47, kids' dismissal at 13:48, and series intro 13:48–947.20) is NOT the sermon. The sermon begins at 947.80s with "Well, let me read Psalm 15, and then we'll pray together." Correct cut start: 947.80s.

### Always exclude

- **Communion.** The full communion rite is its own liturgical act: invitation ("we're going to come now to the Lord's table..."), exhortation, silence for personal prayer, the consecration prayer (often a separate prayer thanking God for Christ/Psalm 15/the cross), the words of institution ("In 1 Corinthians 11 we read these words..."), and the distribution ("the body of Christ broken for you" / "the blood of Christ shed for you"). **Cut at the breath BEFORE "we're going to come now to the Lord's table"** — that line is the unambiguous hand-off from sermon to communion.
- **Announcements, benedictions, and "membership class" type instructions** that come after the sermon's last prayer. (2026-06-14 had a 5-min tail of membership-class promo and a Hebrews 13 benediction after the post-sermon prayer ended — that is post-sermon content, not sermon content.)
- **Music that is clearly not part of the sermon frame** (opening praise, communion hymns, closing songs). On 2026-06-14: opening "Praise to the Lord the Almighty" + kids' dismissal = BEFORE the sermon; "Before the Throne of God Above" + "Thy Mercy My God" = communion music; "Yet Not I But Through Christ in Me" = post-communion closing song. None of these are in the cut.

### Cut-point detection algorithm

1. Auto-pick via `sermon_audio_extract.py --transcribe auto` will often grab the first speech burst only. The sermon can continue across 2–4 separate speech windows separated by hymn/transition music. **Never trust the auto-pick as final** when the auto-pick ends mid-sentence.
2. After auto-pick, transcribe the **post-cut region** (auto-pick end → end of service) and look for these keywords (case-insensitive, in order):
   - "surrender our lives" / "so may we look to Jesus" / "and pray this in his name" → sermon's final application sentence
   - "come now to the Lord's table" / "we're going to come now to the Lord's table" → CUT HERE (communion starts)
   - "in 1 Corinthians 11" / "I received from the Lord" → words of institution (already past the cut)
   - "the body of Christ" / "the blood of Christ" → distribution (already past the cut)
3. The clean end-cut is **at the breath BEFORE "come now to come now to the Lord's table"** — typically 1.5–2.5 seconds of silence. Apply a 1-second `afade=t=out` so the cut does not sound chopped. **The preacher's closing prayer ("We love you, Lord, amen" or similar) must be INCLUDED inside the cut** — do not cut at the communion invitation at the expense of the prayer. On 2026-07-12 the auto-cut stopped at 45:53, missing Sam's full closing prayer that ended at 47:08. Re-cut to 47:15 (just after Sam's "amen" + a 7-sec breath before the pastoral "Thank you, Sam" transition at 51:03).
4. The clean start-cut is **the first word of the Scripture Reading** — but **back off ~14 seconds before the auto-detected Scripture Reading start** to capture any opening prayer the preacher leads BEFORE reading the text. On 2026-07-12 the auto-detector picked up the sermon at 24:05, but Sam had led a brief prayer at 23:51 ("You love you Lord, amen"). Re-cut to 23:39 to safely capture the prayer's full lead-in. **The previous "first word of Scripture Reading" rule still holds** — just pad with ~14s of pre-buffer for guest preachers who open with prayer. Do NOT include the Opening Scripture, the post-Opening-Scripture prayer, the opening hymn, the kids' dismissal, or the series intro. Do NOT cut at the first detected speech burst — that often catches the post-Opening-Scripture prayer or the kids' dismissal instead of the sermon.

### Per-week verification checklist

After re-cutting, before uploading:

- [ ] Last 30 seconds of the MP3 is sermon content (application + closing prayer), NOT communion invitation, NOT "In 1 Corinthians 11", NOT a hymn intro. **Specifically: the preacher's "amen" should be in the cut, then a 5–10s tail of pastoral transition ("Thank you, [name]") before the communion invitation.**
- [ ] First 30 seconds is the pastor OR guest preacher leading a brief prayer and reading the day's text. NOT the kids' dismissal, NOT the series intro, NOT an opening hymn, NOT the Opening Scripture (call to worship). When the preacher is a guest who opens with prayer, pad the cut ~14s earlier than the auto-detected Scripture Reading start.
- [ ] Duration sanity: Trinity sermons run 25–45 min. A cut under 20 min usually means the auto-pick missed a later speech window.
- [ ] `ffprobe` the final MP3 and confirm duration matches the sermon length ±2 min.
- [ ] Worship guide is the source of truth for the day — verify scripture and speaker from `tmp/latest-trinity-bulletin.pdf`.

### Service pattern reference

| Date      | Opening hymn                          | Kids dismiss | Scripture reading | Sermon text | Communion                | Closing                            |
|-----------|---------------------------------------|--------------|-------------------|-------------|--------------------------|------------------------------------|
| 2026-05-17| Praise to the Lord the Almighty       | after hymn   | (none separately) | Numbers 13–14 | yes                  | Living Hope + benediction          |
| 2026-06-07| Praise to the Lord the Almighty       | after hymn   | (none separately) | Exodus 33–34 | yes                  | Doxology + benediction             |
| 2026-06-14| Praise to the Lord the Almighty       | after hymn   | Hebrews 10:19-23  | Psalm 15     | yes                  | Yet Not I But Through Christ in Me |

The "Closing pastoral prayer" is on the sermon side of the cut. The "Closing hymn + benediction" is on the post-cut side.


## Run journal

### 2026-06-14 — "Who Can Dwell with God?" / Psalm 15 / Brandon Nelson

**Source:** `/Volumes/TRINITY3/R_20260614-095804.wav` (754 MB, 65.5 min recorded 11:03)
**Final cut:** 947.80s → 2818.0s (35:55 final → 31:10 final after re-cuts)
**Transistor episode:** #3329376, share URL `https://share.transistor.fm/s/6ccab4c2`, status: published

**Three rounds of cuts before final:**

| Round | Cut | Duration | Why it was wrong | What I did |
|-------|-----|----------|------------------|------------|
| 1 (auto) | 11:03 → 28:13 | 17:10 | Sermon stopped at first natural pause mid-sentence; the actual sermon continued through 3 more speech windows | Transcribed post-cut region (28:00→65:30) to find the real end |
| 2 (after end fix) | 11:03 → 50:05 | 39:02 | Cut was too broad — included the consecration prayer and words of institution (communion content) | Re-transcribed boundary region 1640s→3040s; found exact communion hand-off at 2818.72s |
| 3 (after start fix) | 13:48 → 46:58 | 33:09 | Cut start was at kids' dismissal — Chris flagged "first 3 min sounds like a song" | Transcribed 828s→1020s; found Scripture Reading of Psalm 15 starts at 947.80s |
| 4 (final) | 947.80 → 2818.0 | **31:10** | ✅ Clean start at Scripture Reading, clean end before communion | Re-rendered with bare loudnorm, re-uploaded |

**Three rounds of audio processing fixes:**

| Round | Filter chain | Outcome | Problem |
|-------|--------------|---------|---------|
| 1 | `highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=20:release=200:makeup=3,loudnorm=I=-14:TP=-1.0:LRA=10` | -14.8 LUFS, LRA 7.4 LU | Harsh / over-amplified — compressor squashed dynamics on a clean soundboard feed |
| 2 | `loudnorm=I=-16:TP=-1.5:LRA=11` (no highpass, no compressor) | -16.0 LUFS, LRA 8.6 LU | ✅ Natural dynamics preserved |

**Worship guide metadata (from `tmp/latest-trinity-bulletin.pdf`):**
- Title: Who Can Dwell with God?
- Speaker: Brandon Nelson
- Series: Psalms (Summer 2026: Psalm 15–24)
- Scripture: Psalm 15
- Opening Scripture: Hebrews 10:19-23
- Communion: yes

**Files produced:**
- `outputs/sermons/R_20260614-095804.sermon.wav` (343 MB, 1870.2s, master WAV with afade applied)
- `outputs/sermons/R_20260614-095804.sermon-only.full-louder.mp3` (37 MB, 1870.2s, podcast MP3, -16 LUFS, -1.5 dBTP, 8.6 LU LRA)
- `outputs/sermons/R_20260614-095804.decision.json` (cut decisions + metadata)

**Lessons captured in this doc (see above):**
1. Cut start is at the Scripture Reading of the day's text, NOT the kids' dismissal, NOT the series intro, NOT the first detected speech burst.
2. Cut end is at the breath BEFORE "we're going to come now to the Lord's table."
3. Trinity's USB recording is a clean soundboard feed — use bare loudnorm, not the highpass+compressor stack.

### 2026-06-21 — "Life, Joy, and Pleasure" / Psalm 16 / Matt Tootle

**Source:** `/Volumes/TRINITY3/R_20260621-094845.wav` (906 MB, 78:42 recorded 11:07)
**Final cut:** 1791.0s → 3582.0s (**29:51**)
**Transistor episode:** #3349324, share URL `https://share.transistor.fm/s/d1aaa25b`, status: **draft** (awaiting Chris's approval before publish)

**Why re-cut was needed:**
- Auto-pick chose candidate1 as the sermon (correct), but cut at candidate1's start (1445s), which captured the opening hymn "Turn Your Eyes Upon Jesus" + kids' dismissal (a great Exodus joke) + Matt's "If you would turn in your Bible to Psalm 16" intro.
- Re-cut to start at 1791s, where Matt begins "If you would turn in your Bible to Psalm 16" (the Scripture Reading of the day's text). Closed at 3582s, right after the closing pastoral prayer's "in Jesus' name I pray. Amen." (whisper word timestamps confirmed at cand1 2136s + 1s buffer).
- Whisper word-level timestamps on candidate1.wav identified SEG 39 at 348.00s = "If you would turn in your Bible to Psalm 16". Adding candidate1's 1445s offset gives 1793s in original WAV, padded with 2s = 1791s.

**Audio chain (per 2026-06-14 lesson):** bare `loudnorm=I=-16:TP=-1.5:LRA=11`, no highpass, no compressor. Trinity soundboard feed.

**Files produced:**
- `outputs/sermons/R_20260621-094845.sermon.wav` (343 MB, 1791s, master WAV with 1s afade=t=out at end)
- `outputs/sermons/R_20260621-094845.sermon-only.full-louder.mp3` (35.8 MB, 1791s, podcast MP3)
- `outputs/sermons/R_20260621-094845.decision.json` (cut decisions + metadata)

**Worship guide metadata (from `tmp/latest-trinity-bulletin.pdf`):**
- Title: Life, Joy, and Pleasure
- Speaker: Matt Tootle
- Series: Psalms (Summer 2026)
- Scripture: Psalm 16
- Communion: yes (excluded)

**Lesson reinforced (now three weeks in a row):**
1. Auto-pick picks the sermon candidate but starts at candidate start, which captures opening hymn + kids' dismissal + pastoral intro. Re-cut to Scripture Reading of the day's text.
2. Word-level whisper timestamps (JSON output) make cut-point discovery deterministic — no listening-back-and-guessing.
3. Closing prayer's "in Jesus' name I pray. Amen." is the unambiguous sermon-end marker; the 1s afade at the very end produces a natural tail.
