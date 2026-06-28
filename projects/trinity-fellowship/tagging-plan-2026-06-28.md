---
title: "Trinity Fellowship Sermon Tagging Plan"
date: 2026-06-28
status: Proposed for review
author: Dobby (for Chris)
companion_doc: "topics-proposed-2026-06-28.md"
corpus_source: Transistor show ID 57028
---

# Trinity Fellowship Sermon Tagging Plan

## Goal

Apply the topic taxonomy (see `topics-proposed-2026-06-28.md`) to Trinity Fellowship's sermon archive so a future topic index page can link sermons to doctrinal and life topics. Produce durable metadata, not just a one-off list.

## The Corpus (verified 2026-06-28)

Pulled from Transistor API for show ID 57028, and cross-checked against the public RSS feed at `https://feeds.transistor.fm/trinity-fellowship-of-alabama`.

- **78 published episodes** (no drafts).
- **Date range:** 2024-09-23 → 2026-06-21.
- **Span:** 21 months (≈ "nearly 2 years").
- **Transcripts available:** **10 of 78** — and not from Transistor. Apple Podcasts (via Transistor's auto-transcription pipeline) publishes `<podcast:transcript>` tags in the RSS feed as new episodes drop. Coverage so far:
  - **2 as `text/plain`** (most recent: *Who Can Dwell with God?* 2026-06-14 and *The Twelve Spies* 2026-06-07). These include opening songs + sermon.
  - **8 as `application/x-subrip` (SRT)** for episodes Dec 21 2025 – Feb 16 2026. Sermon-only, with timestamps.
- **Local cached transcripts** at `projects/trinity-fellowship/transcripts/` (10 files, ~428 KB total). Manifest at `transcripts/manifest.json`.
- **Series detected** (from title patterns):
  - **Firm Foundation: What We Believe about X** — 9 episodes (Sept–Nov 2025). Maps directly to Trinity's stated 9 beliefs.
  - **I Am the ...** — 6 episodes (Apr–May 2025 + 2026-03-02).
  - **One Voice: Glorifying God through X** — 3 episodes (Aug–Sept 2025).
  - **Christ at X** — 2 episodes (Feb 2025).
  - **Walk in X** — 2 episodes (Jan–Feb 2025).
  - **The New Self** — 1 episode (Jan 2025). Likely Ephesians.
  - Heavy Exodus preaching Jan–Jun 2026 — natural book axis.
- **Older service recordings** on disk: 4 transcripts at `outputs/sermons/R_*.transcript.txt` for May 17, June 7, June 14, June 21, 2026 (full service audio with songs + communion — would need a cut to sermon-only).

Full inventory: `projects/trinity-fellowship/sermon-inventory-2026-06-28.json` (Transistor side). Transistor-side transcript attachment: 0 of 78.

## Phase 1 — Get Transcripts

**Apple Podcasts auto-publishes transcripts in the RSS feed as new episodes drop, but only the most recent ~10 weeks are covered.** Older episodes need to be transcribed from audio.

**Two-track strategy:**

### Track A — Use what's already in the RSS feed (FREE, instant)

For the 10 episodes that already have `<podcast:transcript>` tags in the feed:

1. Pull the feed: `curl -s https://feeds.transistor.fm/trinity-fellowship-of-alabama`.
2. For each episode, find the `<podcast:transcript>` element and download from its URL (Transistor CDN serves these without auth).
3. Two formats appear:
   - **`text/plain`** (most recent 2 episodes) — includes opening song + sermon. Strip the song block if Chris wants sermon-only.
   - **`application/x-subrip`** (SRT, 8 episodes) — sermon-only with timestamps. Strip cue numbers and timestamps for clean text, or keep as-is for the public page.
4. Cache at `projects/trinity-fellowship/transcripts/<date>_<title>_<guid>.{txt,srt}`. Build a manifest at `transcripts/manifest.json`.

Already done on 2026-06-28: 10 transcripts downloaded to `projects/trinity-fellowship/transcripts/`, manifest saved.

### Track B — Generate transcripts for the remaining 68

For everything before Dec 21 2025, the RSS feed has no `<podcast:transcript>` tags. We have to generate them.

**Pipeline (reuses existing tooling):**

1. **Download audio from Transistor CDN** for each missing episode. Audio URLs are in the inventory JSON.
2. **Cut to sermon-only** using `scripts/sermon_audio_extract.py` (existing pipeline — strips communion, hymns, announcements). Save WAV per episode.
3. **Transcribe with Whisper** (existing `~/.openclaw/workspace/.venv-sermon` venv). Recommend `medium` or `large-v3` for sermon accuracy. Save `.transcript.txt` per episode.
4. **Upload transcript back to Transistor** using `scripts/transistor_sermon_upload.py --episode-id <id> --transcript-file <txt>`. This adds `transcript_text` to the episode. On the next feed refresh, the `<podcast:transcript>` tag will appear automatically.
5. **Cache locally** at `projects/trinity-fellowship/transcripts/`.

**Estimated effort for the remaining 68:**

- 68 episodes × ~35 min average = ~40 hours of audio.
- Whisper on a Mac M-series at `medium` model is roughly 5–10× realtime; full set should run overnight in a single batch (target: 1–2 unattended nights).
- Cutting to sermon-only needs per-episode start/end review (~2–3 min/sermon × 68 = ~3 hours of review cuts).

**Open question:** Do we batch the most recent year first (most of the Exodus + Psalms + Firm Foundation sermons are post-Dec 2025) and finish the older foundational sermons later? My recommendation: yes — the most recent year has the richest sermon data (book series + topical), and it's what the topic page will be visited for most. The older foundational sermons (Sept–Dec 2024) can wait.

## Phase 2 — Tagging

**Method: LLM-assisted tagging with human verification.**

**Why not pure manual skim:** 78 transcripts × ~5–10 min/sermon of careful reading = 6–13 hours of focused Chris time. The decisions are subjective but followable — exactly what an LLM is good at drafting, and exactly where Chris's judgment is needed for the verification pass.

**Why not pure LLM:** LLMs can drift on ambiguous sermons (e.g., a sermon that touches 5 topics lightly — does it get tagged with all 5 or just the dominant 2?). They also miss pastoral context (is this Brandon preaching through a difficult Psalms lament, or is it a stand-alone encouragement sermon?). Chris's review pass is the quality gate.

**Recommended workflow:**

1. **Batching.** Group sermons into batches of ~10 episodes per Codex sub-agent call. Each batch = the taxonomy (~3K tokens) + 10 transcripts (~70K tokens) + the tagging prompt (~2K tokens) = ~75K tokens per call. Well within gpt-5.4's context window.
2. **Sub-agent per batch.** Spawn one Codex sub-agent per batch. Task: for each sermon, return a structured suggestion with:
   - `topics`: list of taxonomy topic names (2–4)
   - `book`: primary Bible book (if identifiable from title/scripture/transcript)
   - `series`: series name (if identifiable; prefer existing series names from the inventory when applicable)
   - `seasonal`: optional — Advent / Christmas / Epiphany / Lent / Easter / Ascension / Pentecost
   - `confidence`: per-tag score (high / medium / low) so Chris knows where to focus review
   - `notes`: brief one-line rationale for the dominant topic
3. **Output schema:** JSON-per-sermon, written to `projects/trinity-fellowship/sermon-tags/suggested/<episode_id>.json`.
4. **Chris's verification pass.** For each batch, Chris reviews the suggested tags in a single session (~20–30 min per batch for 10 sermons at ~2 min/sermon review). Edits/corrects, then promotes to `projects/trinity-fellowship/sermon-tags/final/<episode_id>.yaml`.
5. **Spot-check gate.** Before promoting a batch from suggested → final, verify one or two of the LLM's "low confidence" tags against the actual transcript. If the LLM is consistently wrong on a topic, the taxonomy may need a clarification — flag and refine.

**Total Chris-time estimate:** ~3–4 hours across 8 batches of ~10 sermons. Plus ~30 min of taxonomy refinement if the LLM trips on edge cases.

## Phase 3 — Storage & Schema

**Location:** `projects/trinity-fellowship/sermon-tags/`

```
projects/trinity-fellowship/sermon-tags/
├── suggested/    # raw LLM output, per-episode JSON (review queue)
│   ├── 12345.json
│   ├── 12346.json
│   └── ...
├── final/        # Chris-approved tags, per-episode YAML (source of truth)
│   ├── 12345.yaml
│   ├── 12346.yaml
│   └── ...
└── index.yaml    # master roll-up: every episode + final topics (for the public page)
```

**Per-episode YAML schema** (`final/<episode_id>.yaml`):

```yaml
episode_id: 3265346              # Transistor episode id
title: "From Glory To Glory"
published_at: 2026-05-17
author: "Brandon Nelson"
duration_seconds: 2123
audio_url: "https://media.transistor.fm/..."
transistor_url: "https://share.transistor.fm/..."
transcript_path: "outputs/sermons/3265346-2026-05-17.transcript.txt"

# Parallel axes (see taxonomy doc)
book: "Exodus"                   # primary Bible book
series: "Exodus: God With Us"    # series name, or null
seasonal: null                   # Advent | Christmas | Epiphany | Lent | Easter | Ascension | Pentecost | null

# Doctrinal + life topics (flat list, 2-4 entries)
topics:
  - "The Work of Christ"
  - "The Character of God"
  - "Sanctification"

# Optional metadata
primary_topic: "The Work of Christ"
tagged_at: "2026-06-29"
tagged_by: "Chris Campos"
review_notes: ""
```

**Why YAML over SQLite:** 78 records is small enough that a flat YAML index is trivially searchable with grep/jq/yq. SQLite is overkill until we either (a) start handling non-Trinity content, or (b) build the public page server. If the public page goes server-side, migrate to SQLite then.

## Phase 4 — Public Topic Page (later, separate doc)

The taxonomy + tags are the prerequisite data layer. The actual public page (Netlify site, embedded section on Trinity's existing site, or a static HTML build) is a separate design decision. Holding for a future conversation once the data layer is solid.

## Quality Gates

Before declaring the tagging work "done":

1. **Coverage check.** Every sermon gets 2–4 doctrinal topics. None get zero. None get more than 5 (topical focus rule).
2. **Series consistency.** All sermons in the same series get the same `series` value (verify with a `yq` group-by).
3. **Distribution sanity.** Each doctrinal topic has at least one sermon tagged (unless the topic is rare-and-pastoral like "Last Judgment"). No topic should have 30+ sermons tagged (over-broad).
4. **Spot-check.** Chris personally re-reads 8–10 random transcripts and confirms the tags match his recollection of the sermon.
5. **Taxonomy drift log.** If the LLM consistently wants to use a topic that isn't in the taxonomy (or a topic that's clearly under-bucketed), add it to `topics-proposed-2026-06-28.md` as an amendment, not an ad-hoc tag.

## Effort Roll-up

| Phase | Effort | Mostly |
|---|---|---|
| 1A — pull RSS transcripts (10 episodes) | Done 2026-06-28 (instant) | Automated |
| 1B — transcribe remaining 68 | 1–2 nights of compute + ~3 hr review cuts | Automated + light human |
| 2 — tagging | ~3–4 hr Chris verification + ~30 min taxonomy polish | Human-led with LLM assist |
| 3 — storage | ~30 min setup | One-time |
| 4 — public page | (future session) | — |

## Risks & Open Questions

1. **Audio availability for older episodes.** Some older Transistor episodes may have audio that wasn't kept on the CDN indefinitely. We should check that all 78 episodes return a live audio URL before starting Phase 1B.
2. **Apple's transcript coverage gap.** Apple only auto-generates transcripts for new episodes. The 68 older sermons will all need Whisper. None of those have any reference transcript today, so the LLM tagging has nothing to ground against.
3. **Sermon-only cut quality.** Per the existing pipeline, the cut auto-pick "is rarely correct on the first try." Plan for ~10% of cuts needing manual re-cut. That's already factored into the 3 hour review estimate.
4. **Whisper model choice.** `tiny` (what the Telegram daemon uses) is too lossy for theological vocabulary. `medium` is the speed/accuracy sweet spot; `large-v3` is slower but more accurate on rare theological terms. Recommendation: start with `medium`, spot-check 5 sermons, escalate to `large-v3` if accuracy is unsatisfactory.
5. **Guest speakers.** Some "Firm Foundation" sermons may have had guest speakers from Redeemer. The tagging should be author-agnostic; series and topics matter, not the speaker.
6. **Oldest sermons.** The first few episodes (Sept–Oct 2024) appear to be foundational church-plant sermons ("Why We're Here", "Who We Are", "Blessed in Christ"). These may not fit cleanly into the doctrinal taxonomy — they're more about ecclesiology and church identity. Expect to lean on Bucket 3 (Church, Worship, Spiritual Growth) for these.
7. **RSS feed format drift.** The two recent text/plain transcripts include the opening hymn. If we want sermon-only from text/plain, we need to strip the hymn block. If we want sermon-only from SRT, just drop cue numbers and timestamps. Decision: keep raw + generate a cleaned `.clean.txt` per episode for tagging?

## Next Step

On your sign-off, the immediate work is:

1. **Already done:** 10 RSS transcripts cached at `projects/trinity-fellowship/transcripts/` with manifest.
2. **Strip SRT cue numbers and timestamps** if you want sermon-only text. Write `scripts/srt_to_text.py` if it's worth a tool (cheap, ~30 lines).
3. **Verify all 78 audio URLs are live on Transistor** (sanity check before Phase 1B).
4. **Build (or reuse) the batch cut-and-transcribe runner** for the remaining 68.
5. **Run pilot on the next 10 episodes** (oldest first if we go chronological, or newest-first if we prioritize recent preaching). Review cuts and transcripts.
6. **Once pilot transcripts look good, spawn the first Codex tagging sub-agent** on those 10 to validate the prompt before scaling to the full 78.