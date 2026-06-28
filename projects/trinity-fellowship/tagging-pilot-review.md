# Trinity Tagging Pilot — Codex Results
**Sample size:** 10 sermons (Sept 2024 – Jun 2026, 7 Whisper + 3 RSS transcripts)
**Taxonomy:** 60 topics across 6 buckets (God, Christ & Gospel, Holy Spirit & Church, Scripture & Christian Life, Mission & Witness, Last Things & Spiritual Warfare)

## Per-Sermon Tagging (after slug normalization)

| # | Date | Title | Series | Top 3 Topics | Total Tags |
|---|------|-------|--------|--------------|------------|
| 1 | 2024-09-23 | Why We're Here | - | `the-great-commission-and-evangelism, disciplemaking, the-work-of-christ` | 6 |
| 2 | 2024-10-21 | Knowing God | - | `the-character-of-god, prayer, the-person-and-work-of-the-holy-spirit` | 6 |
| 3 | 2024-11-04 | Saved by Grace | - | `repentance-and-saving-faith, justification, repentance-and-saving-faith` | 6 |
| 4 | 2025-01-27 | Walk in Love | - | `sanctification, good-works, anger-forgiveness-and-reconciliation` | 7 |
| 5 | 2025-06-23 | Beauty Through Brokenness | - | `suffering-trials-and-comfort, prayer, anxiety-fear-and-hope` | 6 |
| 6 | 2025-09-29 | Firm Foundation: What We Believe About God | Firm Foundation | `the-character-of-god, creation, providence-and-sovereignty` | 7 |
| 7 | 2025-10-20 | Firm Foundation: What We Believe about Sin | Firm Foundation | `temptation-and-sin, repentance-and-saving-faith, the-work-of-christ` | 6 |
| 8 | 2025-12-21 | Why Bethlehem? | - | `christmas, the-person-of-christ, repentance-and-saving-faith` | 7 |
| 9 | 2026-01-26 | The Burning Bush | - | `the-character-of-god, providence-and-sovereignty, repentance-and-saving-faith` | 7 |
| 10 | 2026-06-14 | Who Can Dwell with God? | - | `sanctification, the-work-of-christ, justification` | 7 |

## Slug Normalization — 29 corrections applied

Codex invented 29 slug variants that didn't match the canonical taxonomy. Fixed automatically:

- `work-of-christ` → `the-work-of-christ` (8 times)
- `doctrine-of-god` → `the-character-of-god` (6 times)
- `providence` → `providence-and-sovereignty` (4 times)
- `person-of-christ` → `the-person-of-christ` (3 times)
- `great-commission-and-evangelism` → `the-great-commission-and-evangelism` (1 time)
- `disciple-making` → `disciplemaking` (1 time)
- `suffering` → `suffering-trials-and-comfort` (2 times)
- `holy-spirit` → `the-person-and-work-of-the-holy-spirit` (2 times)
- `last-judgment` → `the-last-judgment` (1 time)
- `salvation` → `repentance-and-saving-faith` (5 times, semantically closest)

**This is exactly what the pilot was for.** The taxonomy doc lists topics as **bold titles** (e.g. "**The Work of Christ**"), not as slugs. Codex had to invent slugs from the titles and was inconsistent. Fix: include the slug map in the next prompt.

## Out-of-Vocabulary Tags

- **`gospel`** (3 uses) — not a discrete taxonomy topic. Codex flagged this implicitly through `salvation` and `the-work-of-christ`. Could add as a top-level topic if you want, but "gospel" is a meta-category that runs through most sermons.

## Pattern Observations (from Codex)

- **Salvation + Christ's work + sanctification** dominate — expected for a Reformed church plant
- **The Character of God** prominent in Firm Foundation and Exodus series — matches the titles literally
- **The Person & Work of the Holy Spirit** underrepresented relative to typical Reformed preaching — but Codex only tagged it where it appeared explicitly. May need to flag prayers/pentecostal-season sermons for re-review.
- **Christmas, Advent, Easter** correctly used where applicable (Why Bethlehem? = christmas)

## Stretch Notes (Codex flagged these for taxonomy review)

- **Psalm 15** (Who Can Dwell with God?) needed `sanctification` / `good-works` for integrity/truthfulness themes — could add a top-level **"Integrity, Truthfulness & Speech"** topic
- **Original sin vs. temptation** — `temptation-and-sin` is the closest fit for sin sermons, but Firm Foundation Sin was more about anthropology than temptation
- **Idolatry** — Acts 17 sermons about idolatry need `christian-witness-in-culture` and `doctrine-of-god` (no standalone idolatry topic)

## Next Steps

1. **Decision: do these stretch notes warrant adding new topics?** (Integrity/Truthfulness; Anthropology vs. Temptation; Idolatry)
2. **Decision: add `salvation` as a discrete topic** (currently mapped to `repentance-and-saving-faith`, but it's broader)
3. **Decision: include slug map** in next batch prompt so Codex doesn't reinvent slugs
4. Once approved, scale to remaining 68 sermons in batches of 10
