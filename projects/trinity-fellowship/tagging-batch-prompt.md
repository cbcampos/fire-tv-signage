# Trinity Sermon Tagging — Batch Sub-agent Prompt Template

## Mission

You are tagging a batch of 10 Trinity Fellowship sermon transcripts against the **63-topic taxonomy** defined in `topics-proposed-2026-06-28.md`. Your job is to assign 1-7 doctrinal/topical tags per sermon using the **exact kebab-case slugs** in the canonical slug map below.

## Inputs

For each sermon in the batch, you receive:
1. The sermon's metadata (date, title, scripture reference if known)
2. The sermon's transcript text (paragraphs, no timestamps)
3. The taxonomy with descriptions (in the taxonomy doc)
4. The canonical slug map (below) — use slugs from THIS list, never invent your own

## Canonical Slug Map (63 topics)

Use these exact slug strings. If a sermon doesn't fit any of them, that's a finding — note it in `confidence_notes` and use `null` for `topics`.

```
  - `adoption` — Adoption
  - `advent` — Advent
  - `anger-forgiveness-and-reconciliation` — Anger, Forgiveness & Reconciliation
  - `anxiety-fear-and-hope` — Anxiety, Fear & Hope
  - `ascension` — Ascension
  - `assurance-of-salvation` — Assurance of Salvation
  - `baptism` — Baptism
  - `christian-liberty-and-conscience` — Christian Liberty & Conscience
  - `christian-witness-in-culture` — Christian Witness in Culture
  - `christmas` — Christmas
  - `church-discipline` — Church Discipline
  - `creation` — Creation
  - `disciplemaking` — Disciple-Making
  - `discipleship-and-spiritual-growth` — Discipleship & Spiritual Growth
  - `easter-resurrection-day` — Easter / Resurrection Day
  - `epiphany` — Epiphany
  - `god-the-father` — God the Father
  - `gods-decree-predestination-and-election` — God's Decree, Predestination & Election
  - `good-works` — Good Works
  - `heaven-and-hell` — Heaven & Hell
  - `home-groups-and-small-groups` — Home Groups & Small Groups
  - `how-to-read-and-interpret-the-bible` — How to Read & Interpret the Bible
  - `identity-in-christ` — Identity in Christ
  - `integrity-truthfulness-and-speech` — Integrity, Truthfulness & Speech
  - `justification` — Justification
  - `lent` — Lent
  - `life-after-death` — Life After Death
  - `marriage-sex-and-family` — Marriage, Sex & Family
  - `mercy-justice-and-caring-for-the-poor` — Mercy, Justice & Caring for the Poor
  - `missions-local-and-global` — Missions (Local & Global)
  - `money-possessions-and-generosity` — Money, Possessions & Generosity
  - `parenting-and-children` — Parenting & Children
  - `pentecost` — Pentecost
  - `perseverance-of-the-saints` — Perseverance of the Saints
  - `prayer` — Prayer
  - `providence-and-sovereignty` — Providence & Sovereignty
  - `repentance-and-saving-faith` — Repentance & Saving Faith
  - `salvation` — Salvation
  - `sanctification` — Sanctification
  - `singleness` — Singleness
  - `spiritual-warfare-angels-and-demons` — Spiritual Warfare, Angels & Demons
  - `suffering-trials-and-comfort` — Suffering, Trials & Comfort
  - `temptation-and-sin` — Temptation & Sin
  - `the-authority-and-inspiration-of-scripture` — The Authority & Inspiration of Scripture
  - `the-character-of-god` — The Character of God
  - `the-church` — The Church
  - `the-communion-of-saints` — The Communion of Saints
  - `the-covenant-of-grace` — The Covenant of Grace
  - `the-end-times-and-eschatology` — The End Times & Eschatology
  - `the-gifts-of-the-spirit` — The Gifts of the Spirit
  - `the-gospel` — The Gospel
  - `the-great-commission-and-evangelism` — The Great Commission & Evangelism
  - `the-last-judgment` — The Last Judgment
  - `the-law-and-the-gospel` — The Law & the Gospel
  - `the-lords-supper` — The Lord's Supper
  - `the-person-and-work-of-the-holy-spirit` — The Person & Work of the Holy Spirit
  - `the-person-of-christ` — The Person of Christ
  - `the-resurrection-of-the-body` — The Resurrection of the Body
  - `the-return-of-christ` — The Return of Christ
  - `the-trinity` — The Trinity
  - `the-work-of-christ` — The Work of Christ
  - `vocation-and-work` — Vocation & Work
  - `worship` — Worship
```

## Output

For each sermon, output a JSON object in a single JSON array:

```json
[
  {
    "date": "2024-09-23",
    "title": "Why We're Here",
    "primary_passage": "Ephesians 1:3-14",
    "topics": [
      "the-great-commission-and-evangelism",
      "disciplemaking",
      "the-work-of-christ"
    ],
    "book": "Ephesians",
    "series": null,
    "seasonal": null,
    "confidence_notes": "Series opener laying out the church's vision; primary topics clear."
  }
]
```

**Field rules:**
- `topics` — primary 1-7 doctrinal/topical tags. Order by prominence. Use exact slugs from the map above.
- `book` — Bible book primarily exposited (e.g., "Genesis", "Romans"). Null if not expository.
- `series` — series name if part of a multi-week series (e.g., "Firm Foundation"). Null if standalone.
- `seasonal` — seasonal slug (`advent`, `christmas`, `epiphany`, `lent`, `easter-resurrection-day`, `ascension`, `pentecost`) if the sermon is for a Christian calendar season. Null otherwise.
- `confidence_notes` — brief reasoning, plus any taxonomy gaps you noticed.

## Rules

1. **Read the entire transcript before tagging.** Don't skim.
2. **Aim for 3-7 topics per sermon.** Fewer than 3 means you missed something; more than 7 means you're being too generous.
3. **Order topics by prominence** in the sermon. The first topic should be the dominant one.
4. **Use exact slug strings from the canonical map.** No invented topics, no abbreviations, no synonyms. If the sermon doesn't fit any topic, set `topics: []` and explain in `confidence_notes`.
5. **Be conservative on secondary topics** — only tag if the topic gets at least 2-3 minutes of airtime.
6. **Series detection**: if the title contains a series name prefix (e.g., "Firm Foundation: What We Believe About..."), populate `series`.

## Topic Disambiguation Cheat Sheet

These are the topics that overlapped or caused confusion in the pilot:

- **`salvation` vs `repentance-and-saving-faith` vs `justification`**: `salvation` is the whole arc (election → glorification); `repentance-and-saving-faith` is the human response; `justification` is imputed righteousness specifically.
- **`the-gospel`**: meta-topic — what the gospel is, why it matters, how it applies. Use when the sermon names or explains "the gospel" itself. Otherwise let the specific tags (`justification`, `sanctification`, `repentance-and-saving-faith`, `the-work-of-christ`) carry it.
- **`integrity-truthfulness-and-speech` vs `good-works`**: speech ethics (lying, faithfulness, the tongue) goes here, not good-works.
- **`temptation-and-sin` vs `sanctification`**: when a sermon is about original sin / humanity's fallen nature rather than personal temptation, also pull in `sanctification` to mark the contrast.
- **`sanctification` vs `discipleship-and-spiritual-growth`**: `sanctification` is the doctrinal concept; `discipleship-and-spiritual-growth` is the practical "follow Jesus day by day" angle.
- **`the-character-of-god` vs `the-trinity`**: character covers attributes (love, holiness, sovereignty); trinity covers the three persons.

## Verification (before submitting)

- Count topics per sermon — any with 0 or >7? Fix.
- Verify every topic slug appears in the canonical map exactly as written (no abbreviations, no word-order swaps, no singular/plural changes).
- Make sure every sermon in the batch has output.
- Check that `book`/`series`/`seasonal` fields use the right casing and slugs where applicable.

## Deliverable

Save your output as a single JSON array at `tagging-batch-NN-results.json` in the project directory, where `NN` is the batch number (e.g., `tagging-batch-02-results.json`). Then print a one-line summary per sermon (date, title, top 3 topics) as your final reply.
